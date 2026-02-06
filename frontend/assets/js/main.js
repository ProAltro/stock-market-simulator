import { authModule } from "./modules/auth.js";
import { portfolioModule } from "./modules/portfolio.js";
import { ordersModule } from "./modules/orders.js";
import { marketModule } from "./modules/market.js";
import { backtestModule } from "./modules/backtest.js";
import { routerModule } from "./modules/router.js";
import { formatCurrency, formatPercent } from "./utils.js";

// Make it available globally for Alpine
window.app = function () {
  return {
    // State
    loading: true,
    currentPage: "dashboard",
    sidebarOpen: false,
    displayCurrency: "base", // 'base' = user's currency, 'native' = instrument's currency

    // Mixins
    ...authModule,
    ...portfolioModule,
    ...ordersModule,
    ...marketModule,
    ...backtestModule,
    ...routerModule,

    // Shared Utils
    formatCurrency,
    formatPercent,

    // Currency display helpers
    toggleDisplayCurrency() {
      this.displayCurrency =
        this.displayCurrency === "base" ? "native" : "base";
    },

    // Format a value with the appropriate currency based on display mode
    // For account-level values (cash, total value) always use base currency
    fmtBase(value) {
      return formatCurrency(value, this.profile?.currency || "USD");
    },

    // For position-level values, respect the toggle
    fmtPos(nativeVal, baseVal, nativeCurrency) {
      if (this.displayCurrency === "native" && nativeCurrency) {
        return formatCurrency(nativeVal, nativeCurrency);
      }
      return formatCurrency(baseVal, this.profile?.currency || "USD");
    },

    async init() {
      // Auth Init
      await this.initAuth();

      // Router Init
      this.initRouter();

      // Backtest Init (sets up watchers)
      if (this.initBacktest) {
        this.initBacktest();
      }

      this.loading = false;

      // Load initial data if logged in
      if (this.user) {
        await this.loadDashboardData();
      }
    },

    async loadDashboardData() {
      await this.fetchProfile();
      await Promise.all([
        this.fetchPortfolio(),
        this.fetchOrders(),
        this.fetchWatchlist(),
        this.fetchLeaderboard(),
      ]);

      // Load quote + chart for default symbol so trade page shows data immediately
      if (this.selectedSymbol) {
        await this.selectSymbol(this.selectedSymbol);
      }
    },
  };
};
