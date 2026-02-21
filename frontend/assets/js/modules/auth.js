import { API_URL, post, get } from "../api.js";

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
      const res = await post(`${API_URL}/auth/register`, this.authForm);
      this.token = res.token;
      this.user = res.user;
      localStorage.setItem("decrypt_token", res.token);

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
      const res = await post(`${API_URL}/auth/login`, this.authForm);
      this.token = res.token;
      this.user = res.user;
      localStorage.setItem("decrypt_token", res.token);

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
    const res = await get(`${API_URL}/auth/me`);
    this.user = res;
  },

  logout() {
    this.user = null;
    this.token = null;
    localStorage.removeItem("decrypt_token");
  },
};
