let baseUrl = window.location.origin;
if (baseUrl.includes("file://") || window.location.port === "5500" || window.location.port === "3000") {
  baseUrl = "http://localhost";
}

export const API_URL = baseUrl + "/api";
export async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem("decrypt_token");
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  return res;
}

export async function post(url, body) {
  const res = await fetchWithAuth(url, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return res.json();
}

export async function get(url) {
  const res = await fetchWithAuth(url);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return res.json();
}

export async function del(url) {
  const res = await fetchWithAuth(url, {
    method: "DELETE",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return res.json();
}
