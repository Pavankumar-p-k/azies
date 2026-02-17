import { getAccessToken } from "./supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

async function authHeaders() {
  const token = await getAccessToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function healthCheck() {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error("Unable to reach API.");
  }
  return response.json();
}

export async function listProofs() {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/proofs`, { headers });
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

  const response = await fetch(
    `${API_BASE_URL}/proofs/${verificationId}/verify`,
    {
      method: "POST",
      headers,
      body: formData
    }
  );
  const payload = await response.json();
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

    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed due to network error."));
    xhr.onload = () => {
      let parsed = {};
      try {
        parsed = JSON.parse(xhr.responseText || "{}");
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
