import { authModule } from "./modules/auth.js";
import { portfolioModule } from "./modules/portfolio.js";
import { ordersModule } from "./modules/orders.js";
import { marketModule } from "./modules/market.js";
import { formatCurrency, formatPercent } from "./utils.js";

// Make it available globally for Alpine
window.app = function () {
    return {
        // State
        loading: true,
        currentPage: "dashboard",

        // Mixins
        ...authModule,
        ...portfolioModule,
        ...ordersModule,
        ...marketModule,

        // Shared Utils
        formatCurrency,
        formatPercent,

        async init() {
            // Auth Init
            await this.initAuth();
            
            this.loading = false;

            // Load initial data if logged in
            if (this.user) {
                await this.loadDashboardData();
            }
        },

        async loadDashboardData() {
            await Promise.all([
                this.fetchPortfolio(),
                this.fetchOrders(),
                this.fetchWatchlist(),
                this.fetchLeaderboard(),
            ]);

            // Load chart for default symbol
            if (this.selectedSymbol) {
                // Determine which chart to load. 
                // Defaulting to new TradingView chart.
                // Call loadLegacyChart() if you want the old one.
                await this.loadChart();
            }
        },
    };
};
