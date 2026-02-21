export const routerModule = {
  initRouter() {
    this.handleRoute();
    window.addEventListener("popstate", () => {
      this.handleRoute();
    });
  },

  handleRoute() {
    const path = window.location.pathname.substring(1) || "dashboard";

    const validRoutes = [
      "dashboard",
      "compete",
      "leaderboard",
      "market",
      "api",
    ];

    if (validRoutes.includes(path)) {
      this.currentPage = path;
      this.onPageLoad(path);
    } else {
      this.navigateTo("dashboard", true);
    }
  },

  navigateTo(page, replace = false) {
    if (this.currentPage === page) return;

    this.currentPage = page;

    const url = `/${page}`;
    if (replace) {
      history.replaceState(null, "", url);
    } else {
      history.pushState(null, "", url);
    }

    this.onPageLoad(page);
  },

  onPageLoad(page) {
    if (page === "compete" && this.fetchSubmissions) {
      this.fetchSubmissions();
      if (!this.code) {
        this.code = this.codeTemplates?.python || "";
      }
      // Initialize Monaco editor after a tick so DOM is visible
      setTimeout(() => {
        if (this.initMonacoEditor) this.initMonacoEditor();
      }, 100);
    }
    if (page === "leaderboard" && this.fetchLeaderboard) {
      this.fetchLeaderboard();
    }
    if (page === "market" && this.fetchMarketStatus) {
      this.fetchMarketStatus();
      this.fetchOrderbook?.(this.selectedCommodity || "OIL");
      // Fetch candle data and render chart
      setTimeout(() => {
        if (this.fetchCandles) this.fetchCandles();
      }, 100);
    }
  },
};
