export const API_URL = "http://localhost:3000/api";

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
    return fetchWithAuth(url, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function get(url) {
    return fetchWithAuth(url);
}
