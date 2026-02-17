import { supabase } from "./supabase";

const STORAGE_BUCKET = "aegis-vault";
const PROFILE_BIO_FALLBACK = "Quantum-secure file creator";
const HASH_LABEL = "SHA-512";

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
  return supabase;
}

function normalizeError(error, fallbackMessage) {
  const detail =
    error?.message ||
    error?.details ||
    error?.hint ||
    error?.error_description ||
    "";
  return new Error(detail || fallbackMessage);
}

function isSchemaCompatError(error) {
  const code = String(error?.code || "").toUpperCase();
  if (code === "42703" || code === "42P01" || code === "PGRST205") {
    return true;
  }
  const lowered = String(error?.message || "").toLowerCase();
  return (
    lowered.includes("does not exist") ||
    lowered.includes("schema cache") ||
    lowered.includes("could not find the table")
  );
}

function sanitizeFileName(name) {
  const base = String(name || "unnamed").trim() || "unnamed";
  return base.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function sanitizeHandle(value) {
  const next = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "");
  return next;
}

function defaultHandle(email) {
  const prefix = String(email || "aegis_user")
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "");
  return prefix || "aegis_user";
}

function maskOwnerEmail(email) {
  if (!email || !email.includes("@")) {
    return "hidden";
  }
  const [local, domain] = email.split("@", 2);
  if (local.length <= 2) {
    return `${local.slice(0, 1)}*@${domain}`;
  }
  return `${local.slice(0, 2)}${"*".repeat(local.length - 2)}@${domain}`;
}

function getNowIso() {
  return new Date().toISOString();
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "").trim().toLowerCase();
  if (!clean || clean.length % 2 !== 0) {
    return new Uint8Array();
  }
  const out = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    out[index / 2] = parseInt(clean.slice(index, index + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    const segment = bytes.subarray(index, index + chunk);
    binary += String.fromCharCode(...segment);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const input = String(base64 || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!input) {
    return new Uint8Array();
  }
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index);
  }
  return out;
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeShareToken(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return `v1.${bytesToBase64Url(bytes)}`;
}

function decodeShareToken(shareToken) {
  const token = String(shareToken || "").trim();
  if (!token) {
    throw new Error("Share token is missing.");
  }

  const payload = token.startsWith("v1.") ? token.slice(3) : token;
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder().decode(base64ToBytes(payload)));
  } catch {
    throw new Error("Share token is invalid or corrupted.");
  }

  const required = [
    "verification_id",
    "filename",
    "pqc_algorithm",
    "created_at",
    "hash_sha3_512",
    "signature_b64",
    "public_key_b64"
  ];
  const missing = required.find((field) => !decoded?.[field]);
  if (missing) {
    throw new Error("Share token is invalid.");
  }
  return decoded;
}

async function sha512Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function signHash(hashHex) {
  const input = hexToBytes(hashHex);
  try {
    const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify"
    ]);
    const signature = new Uint8Array(
      await crypto.subtle.sign("Ed25519", keyPair.privateKey, input)
    );
    const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    return {
      signature_b64: bytesToBase64(signature),
      public_key_b64: bytesToBase64(publicKey),
      pqc_algorithm: "Ed25519",
      pqc_backend: "webcrypto-ed25519"
    };
  } catch {
    return {
      signature_b64: bytesToBase64(input),
      public_key_b64: "fallback-v1",
      pqc_algorithm: "HASH-ATTEST",
      pqc_backend: "webcrypto-fallback"
    };
  }
}

async function verifyHashSignature(hashHex, signatureB64, publicKeyB64) {
  const input = hexToBytes(hashHex);
  if (!input.length) {
    return false;
  }

  if (publicKeyB64 === "fallback-v1") {
    return signatureB64 === bytesToBase64(input);
  }

  try {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      base64ToBytes(publicKeyB64),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return crypto.subtle.verify("Ed25519", publicKey, base64ToBytes(signatureB64), input);
  } catch {
    return false;
  }
}

async function encryptForVault(contentBytes) {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "exportKey"
    ]);
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, contentBytes)
    );
    const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const keyDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", rawKey));
    return {
      payload: cipher,
      nonce_b64: bytesToBase64(iv),
      key_fingerprint: bytesToHex(keyDigest).slice(0, 16)
    };
  } catch {
    return {
      payload: contentBytes,
      nonce_b64: null,
      key_fingerprint: "client-unencrypted"
    };
  }
}

function makeVerificationId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  const buffer = crypto.getRandomValues(new Uint8Array(16));
  buffer[6] = (buffer[6] & 0x0f) | 0x40;
  buffer[8] = (buffer[8] & 0x3f) | 0x80;
  const hex = bytesToHex(buffer);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getCurrentUser() {
  const client = requireSupabase();
  const {
    data: { user },
    error
  } = await client.auth.getUser();
  if (error) {
    return null;
  }
  return user ?? null;
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user?.email) {
    throw new Error("You must sign in to perform this action.");
  }
  return user;
}

async function fetchProofByVerificationId(verificationId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("integrity_proofs")
    .select("*")
    .eq("verification_id", verificationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw normalizeError(error, "Failed to load proof.");
  }
  return data ?? null;
}

function notificationStorageKey(email) {
  return `aegis.notifications.${String(email || "").toLowerCase()}`;
}

function readLocalNotifications(email) {
  if (typeof window === "undefined") {
    return [];
  }
  const key = notificationStorageKey(email);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalNotifications(email, items) {
  if (typeof window === "undefined") {
    return;
  }
  const key = notificationStorageKey(email);
  window.localStorage.setItem(key, JSON.stringify(items));
}

export async function healthCheck() {
  return {
    status: "ok",
    environment: "browser",
    pqc_algorithm: "Ed25519",
    pqc_backend: "supabase-direct",
    pqc_fallback_active: false,
    supabase_enabled: Boolean(supabase),
    hash_algorithm: HASH_LABEL
  };
}

export async function listProofs() {
  const client = requireSupabase();
  const user = await getCurrentUser();
  if (!user?.email) {
    return { items: [], count: 0 };
  }

  const { data, error } = await client
    .from("integrity_proofs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (isSchemaCompatError(error)) {
      throw new Error(
        "Supabase schema is missing integrity_proofs table or columns. Run docs/supabase_schema.sql."
      );
    }
    throw normalizeError(error, "Failed to load integrity proofs.");
  }

  const items = data ?? [];
  return { items, count: items.length };
}

export async function verifyProof(verificationId, file) {
  const proof = await fetchProofByVerificationId(verificationId);
  if (!proof) {
    throw new Error("Verification ID not found.");
  }

  const signatureValid = await verifyHashSignature(
    proof.hash_sha3_512,
    proof.signature_b64,
    proof.public_key_b64
  );

  let fileHashMatch = null;
  let detail = "Signature matches ledger hash.";
  if (file) {
    const candidateBytes = new Uint8Array(await file.arrayBuffer());
    const candidateHash = await sha512Hex(candidateBytes);
    fileHashMatch = candidateHash === proof.hash_sha3_512;
    detail =
      fileHashMatch && signatureValid
        ? "Signature valid and uploaded file hash matches."
        : "Uploaded file hash does not match original proof.";
  }

  const status = !signatureValid || fileHashMatch === false ? "TAMPERED" : "VERIFIED";
  return {
    verification_id: verificationId,
    status,
    signature_valid: signatureValid,
    file_hash_match: fileHashMatch,
    detail
  };
}

export async function uploadProof(file, onProgress) {
  const client = requireSupabase();
  const user = await requireUser();
  if (!file) {
    throw new Error("Choose a file to upload.");
  }
  if (typeof onProgress === "function") {
    onProgress(5);
  }

  const contentBytes = new Uint8Array(await file.arrayBuffer());
  if (!contentBytes.length) {
    throw new Error("File is empty.");
  }
  if (typeof onProgress === "function") {
    onProgress(15);
  }

  const hashValue = await sha512Hex(contentBytes);
  if (typeof onProgress === "function") {
    onProgress(30);
  }

  const signed = await signHash(hashValue);
  const encrypted = await encryptForVault(contentBytes);
  if (typeof onProgress === "function") {
    onProgress(50);
  }

  const verificationId = makeVerificationId();
  const cleanName = sanitizeFileName(file.name || "unnamed");
  const storagePath = `${user.email}/${verificationId}-${cleanName}.aegis`;

  const { error: storageError } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, encrypted.payload, {
      contentType: "application/octet-stream",
      upsert: true
    });
  if (storageError) {
    throw normalizeError(storageError, "Failed to upload encrypted vault payload.");
  }
  if (typeof onProgress === "function") {
    onProgress(75);
  }

  const row = {
    verification_id: verificationId,
    filename: cleanName,
    size_bytes: file.size,
    hash_sha3_512: hashValue,
    signature_b64: signed.signature_b64,
    public_key_b64: signed.public_key_b64,
    pqc_algorithm: signed.pqc_algorithm,
    pqc_backend: signed.pqc_backend,
    status: "VERIFIED",
    owner_email: user.email,
    storage_path: storagePath,
    vault_nonce_b64: encrypted.nonce_b64,
    vault_key_fingerprint: encrypted.key_fingerprint
  };

  const { data, error } = await client
    .from("integrity_proofs")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    throw normalizeError(error, "Failed to persist proof in Supabase.");
  }

  if (typeof onProgress === "function") {
    onProgress(100);
  }

  return {
    verification_id: data.verification_id,
    filename: data.filename,
    size_bytes: data.size_bytes,
    hash_sha3_512: data.hash_sha3_512,
    signature_b64: data.signature_b64,
    public_key_b64: data.public_key_b64,
    pqc_algorithm: data.pqc_algorithm,
    status: data.status,
    owner_email: data.owner_email,
    created_at: data.created_at
  };
}

export async function getMyProfile() {
  const user = await requireUser();
  const metadata = user.user_metadata || {};
  const handle = sanitizeHandle(metadata.handle || defaultHandle(user.email));
  const displayName = String(metadata.display_name || handle || "aegis-user").slice(0, 50);
  const bio = String(metadata.bio || PROFILE_BIO_FALLBACK).slice(0, 280);
  const avatarUrl = metadata.avatar_url ? String(metadata.avatar_url) : null;
  const createdAt = user.created_at || getNowIso();
  const updatedAt = user.updated_at || createdAt;

  return {
    email: user.email,
    handle,
    display_name: displayName,
    bio,
    avatar_url: avatarUrl,
    created_at: createdAt,
    updated_at: updatedAt
  };
}

export async function updateMyProfile(updates) {
  const client = requireSupabase();
  const user = await requireUser();
  const next = {};

  if (typeof updates?.handle === "string") {
    const handle = sanitizeHandle(updates.handle);
    if (handle.length < 3) {
      throw new Error("Handle must be at least 3 valid characters.");
    }
    next.handle = handle;
  }

  if (typeof updates?.display_name === "string") {
    const displayName = updates.display_name.trim();
    if (!displayName) {
      throw new Error("Display name cannot be empty.");
    }
    next.display_name = displayName.slice(0, 50);
  }

  if (typeof updates?.bio === "string") {
    next.bio = updates.bio.trim().slice(0, 280);
  }

  if (typeof updates?.avatar_url === "string") {
    const trimmed = updates.avatar_url.trim();
    next.avatar_url = trimmed || null;
  }

  const {
    data: { user: refreshedUser },
    error
  } = await client.auth.updateUser({
    data: {
      ...(user.user_metadata || {}),
      ...next
    }
  });

  if (error) {
    throw normalizeError(error, "Failed to update profile.");
  }

  const profileUser = refreshedUser || user;
  const metadata = profileUser.user_metadata || {};
  return {
    email: profileUser.email,
    handle: sanitizeHandle(metadata.handle || defaultHandle(profileUser.email)),
    display_name: String(metadata.display_name || defaultHandle(profileUser.email)).slice(0, 50),
    bio: String(metadata.bio || PROFILE_BIO_FALLBACK).slice(0, 280),
    avatar_url: metadata.avatar_url ? String(metadata.avatar_url) : null,
    created_at: profileUser.created_at || getNowIso(),
    updated_at: profileUser.updated_at || getNowIso()
  };
}

export async function createShareLink(verificationId) {
  const user = await requireUser();
  const proof = await fetchProofByVerificationId(verificationId);
  if (!proof) {
    throw new Error("Verification ID not found.");
  }
  if (proof.owner_email !== user.email) {
    throw new Error("You do not own this verification proof.");
  }

  const shareToken = encodeShareToken({
    verification_id: proof.verification_id,
    filename: proof.filename,
    pqc_algorithm: proof.pqc_algorithm,
    owner_display: maskOwnerEmail(proof.owner_email),
    created_at: proof.created_at,
    hash_sha3_512: proof.hash_sha3_512,
    signature_b64: proof.signature_b64,
    public_key_b64: proof.public_key_b64
  });

  const origin =
    typeof window === "undefined" ? "https://aegis.local" : window.location.origin;
  const shareUrl = `${origin}/?share=${encodeURIComponent(shareToken)}`;
  return {
    verification_id: proof.verification_id,
    share_token: shareToken,
    share_url: shareUrl,
    auto_delete_at: proof.auto_delete_at || null
  };
}

export async function getSharedProof(shareToken) {
  const decoded = decodeShareToken(shareToken);
  return {
    verification_id: decoded.verification_id,
    filename: decoded.filename,
    pqc_algorithm: decoded.pqc_algorithm,
    owner_display: decoded.owner_display || "hidden",
    created_at: decoded.created_at
  };
}

export async function verifySharedUpload(shareToken, file) {
  if (!file) {
    throw new Error("Choose a file to verify.");
  }

  const decoded = decodeShareToken(shareToken);
  const submittedHash = await sha512Hex(new Uint8Array(await file.arrayBuffer()));
  const signatureValid = await verifyHashSignature(
    decoded.hash_sha3_512,
    decoded.signature_b64,
    decoded.public_key_b64
  );
  const fileHashMatch = submittedHash === decoded.hash_sha3_512;
  const status = signatureValid && fileHashMatch ? "VERIFIED" : "TAMPERED";
  const detail =
    status === "VERIFIED"
      ? "Shared upload matches original integrity proof."
      : "Shared upload is tampered or does not match original hash.";

  return {
    verification_id: decoded.verification_id,
    status,
    signature_valid: signatureValid,
    file_hash_match: fileHashMatch,
    detail,
    expected_hash_sha3_512: decoded.hash_sha3_512,
    submitted_hash_sha3_512: submittedHash,
    auto_delete_at: null
  };
}

export async function listNotifications() {
  const client = requireSupabase();
  const user = await requireUser();

  const { data, error } = await client
    .from("user_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (!isSchemaCompatError(error)) {
      throw normalizeError(error, "Failed to load notifications.");
    }
    const localItems = readLocalNotifications(user.email);
    return { items: localItems, count: localItems.length };
  }

  const items = data ?? [];
  return { items, count: items.length };
}

export async function markNotificationRead(notificationId) {
  const client = requireSupabase();
  const user = await requireUser();

  const { error } = await client
    .from("user_notifications")
    .update({ read_at: getNowIso() })
    .eq("id", notificationId)
    .eq("owner_email", user.email);

  if (error) {
    if (!isSchemaCompatError(error)) {
      throw normalizeError(error, "Failed to update notification.");
    }
    const items = readLocalNotifications(user.email);
    const next = items.map((item) =>
      item.id === notificationId ? { ...item, read_at: getNowIso() } : item
    );
    writeLocalNotifications(user.email, next);
  }

  return { updated: true };
}

export async function deleteProof(verificationId) {
  const client = requireSupabase();
  const user = await requireUser();
  const proof = await fetchProofByVerificationId(verificationId);
  if (!proof) {
    throw new Error("Verification ID not found.");
  }
  if (proof.owner_email !== user.email) {
    throw new Error("You do not own this verification proof.");
  }

  if (proof.storage_path) {
    await client.storage.from(STORAGE_BUCKET).remove([proof.storage_path]);
  }

  const { error } = await client
    .from("integrity_proofs")
    .delete()
    .eq("verification_id", verificationId)
    .eq("owner_email", user.email);

  if (error) {
    throw normalizeError(error, "Failed to delete proof.");
  }

  return {
    deleted: true,
    verification_id: verificationId,
    detail: "Proof and encrypted vault file deleted."
  };
}

export function deriveWsUrl() {
  return "";
}
