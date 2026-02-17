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

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
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
  const response = await apiFetch("/health");
  if (!response.ok) {
    throw new Error("Unable to reach API.");
  }
  return response.json();
}

export async function listProofs() {
  const headers = await authHeaders();
  const response = await apiFetch("/proofs", { headers });
  if (!response.ok) {
    throw new Error("Failed to load integrity proofs.");
  }
  return response.json();
}

export async function verifyProof(verificationId, file) {
  const headers = await authHeaders();
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }

  const response = await apiFetch(`/proofs/${verificationId}/verify`, {
    method: "POST",
    headers,
    body: formData
  });
  const payload = await parseJson(response);
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
  const headers = await authHeaders();
  const response = await apiFetch("/profile/me", { headers });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to load profile.");
  }
  return payload;
}

export async function updateMyProfile(updates) {
  const headers = await authHeaders();
  headers["Content-Type"] = "application/json";
  const response = await apiFetch("/profile/me", {
    method: "PUT",
    headers,
    body: JSON.stringify(updates)
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to update profile.");
  }
  return payload;
}

export async function createShareLink(verificationId) {
  const headers = await authHeaders();
  const response = await apiFetch(`/proofs/${verificationId}/share`, {
    method: "POST",
    headers
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to create share link.");
  }
  return payload;
}

export async function getSharedProof(shareToken) {
  const response = await apiFetch(`/shared/${encodeURIComponent(shareToken)}`);
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(payload.detail || "Shared proof not found.");
  }
  return payload;
}

export async function verifySharedUpload(shareToken, file) {
  const headers = await authHeaders();
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch(`/shared/${encodeURIComponent(shareToken)}/verify-upload`, {
    method: "POST",
    headers,
    body: formData
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(payload.detail || "Shared verification failed.");
  }
  return payload;
}

export async function listNotifications() {
  const headers = await authHeaders();
  const response = await apiFetch("/notifications", { headers });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to load notifications.");
  }
  return payload;
}

export async function markNotificationRead(notificationId) {
  const headers = await authHeaders();
  const response = await apiFetch(`/notifications/${notificationId}/read`, {
    method: "POST",
    headers
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to update notification.");
  }
  return payload;
}

export async function deleteProof(verificationId) {
  const headers = await authHeaders();
  const response = await apiFetch(`/proofs/${verificationId}`, {
    method: "DELETE",
    headers
  });
  const payload = await parseJson(response);
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
