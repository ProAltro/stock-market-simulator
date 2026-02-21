import { authModule } from "./modules/auth.js";
import { submissionsModule } from "./modules/submissions.js";
import { marketModule } from "./modules/marketStatus.js";
import { routerModule } from "./modules/router.js";
import { formatCurrency, formatPercent, formatNumber } from "./utils.js";
import { API_URL } from "./api.js";

window.app = function () {
  return {
    loading: true,
    currentPage: "dashboard",
    sidebarOpen: false,
    showAuthModal: false,

    ...authModule,
    ...submissionsModule,
    ...marketModule,
    ...routerModule,

    formatCurrency,
    formatPercent,
    formatNumber,

    async init() {
      await this.initAuth();
      this.initRouter();
      this.loading = false;

      if (this.user) {
        await this.loadDashboardData();
      }
    },

    async loadDashboardData() {
      await Promise.all([
        this.fetchLeaderboard(),
        this.fetchDataInfo(),
        this.fetchMarketStatus(),
      ]);
    },
  };
};
