import { API_URL, fetchWithAuth } from "../api.js";

export const authModule = {
    authMode: "login",
    authForm: { email: "", password: "", displayName: "" },
    authError: "",
    authLoading: false,
    user: null,
    token: null,

    async initAuth() {
        const savedToken = localStorage.getItem("decrypt_token");
        if (savedToken) {
            this.token = savedToken;
            try {
                await this.fetchUser();
            } catch (err) {
                localStorage.removeItem("decrypt_token");
                this.token = null;
                this.user = null;
            }
        }
    },

    async register() {
        this.authError = "";
        this.authLoading = true;

        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(this.authForm),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Registration failed");
            }

            this.token = data.token;
            this.user = data.user;
            localStorage.setItem("decrypt_token", data.token);

            if (this.loadDashboardData) {
                await this.loadDashboardData();
            }
        } catch (err) {
            this.authError = err.message;
        } finally {
            this.authLoading = false;
        }
    },

    async login() {
        this.authError = "";
        this.authLoading = true;

        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(this.authForm),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Login failed");
            }

            this.token = data.token;
            this.user = data.user;
            localStorage.setItem("decrypt_token", data.token);

            if (this.loadDashboardData) {
                await this.loadDashboardData();
            }
        } catch (err) {
            this.authError = err.message;
        } finally {
            this.authLoading = false;
        }
    },

    async fetchUser() {
        const res = await fetchWithAuth(`${API_URL}/auth/me`);

        if (!res.ok) throw new Error("Session expired");

        const data = await res.json();
        this.user = data;
    },

    logout() {
        this.user = null;
        this.token = null;
        this.portfolio = null;
        this.profile = null;
        localStorage.removeItem("decrypt_token");
    },
};
