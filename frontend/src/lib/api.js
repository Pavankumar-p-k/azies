import { getAccessToken } from "./supabase";

const LOCAL_API_BASE_URL = "http://127.0.0.1:8000/api/v1";

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function inferApiBaseUrl() {
  if (typeof window === "undefined") {
    return LOCAL_API_BASE_URL;
  }

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return LOCAL_API_BASE_URL;
  }

  return `${window.location.origin}/api/v1`;
}

const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL || inferApiBaseUrl()
);

function networkError() {
  return new Error(
    `Unable to reach API at ${API_BASE_URL}. Check backend status, CORS origins, and VITE_API_BASE_URL.`
  );
}

async function apiFetch(path, options = {}) {
  try {
    return await fetch(`${API_BASE_URL}${path}`, options);
  } catch {
    throw networkError();
  }
}

function apiHtmlResponseError(path) {
  return new Error(
    `API route ${path} returned HTML instead of JSON. Set VITE_API_BASE_URL to your backend URL ending in /api/v1 and ensure frontend rewrites do not capture /api routes.`
  );
}

async function parseJson(response, path) {
  const raw = await response.text();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const probe = raw.trim().slice(0, 24).toLowerCase();
    if (probe.startsWith("<!doctype") || probe.startsWith("<html")) {
      throw apiHtmlResponseError(path);
    }
    throw new Error(`Invalid JSON response from API route ${path}.`);
  }
}

async function authHeaders() {
  const token = await getAccessToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function healthCheck() {
  const path = "/health";
  const response = await apiFetch(path);
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Unable to reach API.");
  }
  return payload;
}

export async function listProofs() {
  const path = "/proofs";
  const headers = await authHeaders();
  const response = await apiFetch(path, { headers });
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to load integrity proofs.");
  }
  return payload;
}

export async function verifyProof(verificationId, file) {
  const path = `/proofs/${verificationId}/verify`;
  const headers = await authHeaders();
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }

  const response = await apiFetch(path, {
    method: "POST",
    headers,
    body: formData
  });
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Verification request failed.");
  }
  return payload;
}

export async function uploadProof(file, onProgress) {
  const headers = await authHeaders();
  const formData = new FormData();
  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/proofs/upload`, true);
    xhr.timeout = 45_000;

    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onerror = () => reject(networkError());
    xhr.ontimeout = () =>
      reject(new Error(`Upload timed out while connecting to ${API_BASE_URL}.`));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));
    xhr.onload = () => {
      let parsed = {};
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch (error) {
        reject(new Error("Invalid response from server."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed);
      } else {
        reject(new Error(parsed.detail || "Upload request failed."));
      }
    };

    xhr.send(formData);
  });
}

export async function getMyProfile() {
  const path = "/profile/me";
  const headers = await authHeaders();
  const response = await apiFetch(path, { headers });
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to load profile.");
  }
  return payload;
}

export async function updateMyProfile(updates) {
  const path = "/profile/me";
  const headers = await authHeaders();
  headers["Content-Type"] = "application/json";
  const response = await apiFetch(path, {
    method: "PUT",
    headers,
    body: JSON.stringify(updates)
  });
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to update profile.");
  }
  return payload;
}

export async function createShareLink(verificationId) {
  const path = `/proofs/${verificationId}/share`;
  const headers = await authHeaders();
  const response = await apiFetch(path, {
    method: "POST",
    headers
  });
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to create share link.");
  }
  return payload;
}

export async function getSharedProof(shareToken) {
  const path = `/shared/${encodeURIComponent(shareToken)}`;
  const response = await apiFetch(path);
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Shared proof not found.");
  }
  return payload;
}

export async function verifySharedUpload(shareToken, file) {
  const path = `/shared/${encodeURIComponent(shareToken)}/verify-upload`;
  const headers = await authHeaders();
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch(path, {
    method: "POST",
    headers,
    body: formData
  });
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Shared verification failed.");
  }
  return payload;
}

export async function listNotifications() {
  const path = "/notifications";
  const headers = await authHeaders();
  const response = await apiFetch(path, { headers });
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to load notifications.");
  }
  return payload;
}

export async function markNotificationRead(notificationId) {
  const path = `/notifications/${notificationId}/read`;
  const headers = await authHeaders();
  const response = await apiFetch(path, {
    method: "POST",
    headers
  });
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to update notification.");
  }
  return payload;
}

export async function deleteProof(verificationId) {
  const path = `/proofs/${verificationId}`;
  const headers = await authHeaders();
  const response = await apiFetch(path, {
    method: "DELETE",
    headers
  });
  const payload = await parseJson(response, path);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to delete proof.");
  }
  return payload;
}

export function deriveWsUrl() {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) {
    return explicit;
  }
  const normalized = API_BASE_URL.replace(/\/api\/v1$/, "");
  if (normalized.startsWith("https://")) {
    return normalized.replace("https://", "wss://") + "/ws/proofs";
  }
  return normalized.replace("http://", "ws://") + "/ws/proofs";
}
