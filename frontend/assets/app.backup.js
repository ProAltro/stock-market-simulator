// Decrypt - Paper Trading Platform
// Alpine.js Application

const API_URL = "http://localhost:3000/api";

function app() {
  return {
    // State
    loading: true,
    user: null,
    token: null,
    currentPage: "dashboard",

    // Auth
    authMode: "login",
    authForm: { email: "", password: "", displayName: "" },
    authError: "",
    authLoading: false,

    // Portfolio
    portfolio: null,
    orders: [],

    // Trading
    selectedSymbol: "AAPL",
    currentQuote: null,
    searchQuery: "",
    searchResults: [],
    selectedExchange: "",
    orderForm: {
      side: "BUY",
      quantity: 1,
      orderType: "MARKET",
      limitPrice: null,
    },
    orderError: "",
    orderSuccess: "",
    orderLoading: false,
    chart: null,
    chartTimeframe: "1m",
    chartType: "candle",

    // Watchlist & Leaderboard
    watchlist: [],
    leaderboard: [],
    myRank: null,

    // Profile Settings
    profile: null,
    addFundsAmount: 10000,
    settingsMessage: "",

    // Initialize
    async init() {
      // Check for saved token
      const savedToken = localStorage.getItem("decrypt_token");
      if (savedToken) {
        this.token = savedToken;
        try {
          await this.fetchUser();
        } catch (err) {
          localStorage.removeItem("decrypt_token");
        }
      }
      this.loading = false;

      // Load initial data if logged in
      if (this.user) {
        await this.loadDashboardData();
      }
    },

    // Auth methods
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

        await this.loadDashboardData();
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

        await this.loadDashboardData();
      } catch (err) {
        this.authError = err.message;
      } finally {
        this.authLoading = false;
      }
    },

    async fetchUser() {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

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

    // Profile methods
    async fetchProfile() {
      try {
        const res = await fetch(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.profile = await res.json();
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      }
    },

    async updateSettings(settings) {
      this.settingsMessage = "";
      try {
        const res = await fetch(`${API_URL}/profile`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify(settings),
        });
        const data = await res.json();
        if (res.ok) {
          this.settingsMessage = "Settings saved";
          await this.fetchProfile();
        } else {
          this.settingsMessage = data.error || "Failed to save";
        }
      } catch (err) {
        this.settingsMessage = "Error saving settings";
      }
    },

    async addFunds() {
      this.settingsMessage = "";
      try {
        const res = await fetch(`${API_URL}/profile/add-funds`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({ amount: Number(this.addFundsAmount) }),
        });
        const data = await res.json();
        if (res.ok) {
          this.settingsMessage = `Added ${this.formatCurrency(this.addFundsAmount)}`;
          await this.fetchPortfolio();
          await this.fetchProfile();
        } else {
          this.settingsMessage = data.error || "Failed to add funds";
        }
      } catch (err) {
        this.settingsMessage = "Error adding funds";
      }
    },

    async resetAccount() {
      if (!confirm("Are you sure? This will delete all positions and orders.")) return;
      this.settingsMessage = "";
      try {
        const res = await fetch(`${API_URL}/profile/reset-account`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}` },
        });
        const data = await res.json();
        if (res.ok) {
          this.settingsMessage = "Account reset successfully";
          await this.fetchPortfolio();
          await this.fetchProfile();
        } else {
          this.settingsMessage = data.error || "Failed to reset";
        }
      } catch (err) {
        this.settingsMessage = "Error resetting account";
      }
    },

    async switchMode(mode) {
      if (!confirm(`Switch to ${mode} mode? This will reset your account.`)) return;
      this.settingsMessage = "";
      try {
        const res = await fetch(`${API_URL}/profile/switch-mode`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({ mode }),
        });
        const data = await res.json();
        if (res.ok) {
          this.settingsMessage = data.message;
          await this.fetchPortfolio();
          await this.fetchProfile();
        } else {
          this.settingsMessage = data.error || "Failed to switch mode";
        }
      } catch (err) {
        this.settingsMessage = "Error switching mode";
      }
    },

    // Data loading
    async loadDashboardData() {
      await Promise.all([
        this.fetchPortfolio(),
        this.fetchOrders(),
        this.fetchWatchlist(),
        this.fetchLeaderboard(),
      ]);

      // Load chart for default symbol
      if (this.selectedSymbol) {
        await this.loadChart();
      }
    },

    async fetchPortfolio() {
      try {
        const res = await fetch(`${API_URL}/portfolio`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.portfolio = await res.json();
      } catch (err) {
        console.error("Failed to fetch portfolio:", err);
      }
    },

    async fetchOrders() {
      try {
        const res = await fetch(`${API_URL}/orders/history`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.orders = await res.json();
      } catch (err) {
        console.error("Failed to fetch orders:", err);
      }
    },

    async fetchWatchlist() {
      // Load some default symbols
      const symbols = ["AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA"];
      this.watchlist = [];

      for (const symbol of symbols) {
        try {
          const res = await fetch(`${API_URL}/market/quote/${symbol}`);
          const quote = await res.json();
          this.watchlist.push(quote);
        } catch (err) {
          console.error(`Failed to fetch quote for ${symbol}:`, err);
        }
      }
    },

    async fetchLeaderboard() {
      try {
        const res = await fetch(`${API_URL}/leaderboard`);
        this.leaderboard = await res.json();

        // Get user's rank
        if (this.token) {
          const rankRes = await fetch(`${API_URL}/leaderboard/me`, {
            headers: { Authorization: `Bearer ${this.token}` },
          });
          if (rankRes.ok) {
            this.myRank = await rankRes.json();
          }
        }
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
      }
    },

    // Trading
    async selectSymbol(symbol) {
      this.selectedSymbol = symbol;
      this.searchResults = [];
      this.searchQuery = "";

      // Fetch current quote
      try {
        const res = await fetch(`${API_URL}/market/quote/${symbol}`);
        this.currentQuote = await res.json();
      } catch (err) {
        console.error("Failed to fetch quote:", err);
      }

      // Load chart
      await this.loadChart();
    },

    async searchInstruments() {
      if (this.searchQuery.length < 1) {
        this.searchResults = [];
        return;
      }

      try {
        let url = `${API_URL}/instruments/search?q=${encodeURIComponent(this.searchQuery)}`;
        if (this.selectedExchange) {
          url += `&exchange=${encodeURIComponent(this.selectedExchange)}`;
        }
        const res = await fetch(url);
        this.searchResults = await res.json();
      } catch (err) {
        console.error("Search failed:", err);
      }
    },

    async loadChart() {
      const container = document.getElementById("chart-container");
      if (!container) return;

      // Show loading state
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#666;">Loading chart...</div>';

      // Clean up previous chart if exists
      if (this.chart) {
        try {
          this.chart.remove();
        } catch (e) {
          // Chart already removed
        }
        this.chart = null;
      }

      // Map timeframe to API params
      // Map timeframe to API params
      // Using granular intervals for better trend visibility
      // 1d: 5min candles (approx 78-300 points)
      // 1w: 30min candles (approx 300-400 points)
      // 1m: 1hour candles (approx 175-500 points)
      // 3m: 1day candles (approx 65 points) - Daily is sufficient for 3m
      // 1y: 1day candles (approx 252 points)
      const timeframeMap = {
        "1d": { interval: "5min", outputsize: 300 },
        "1w": { interval: "30min", outputsize: 400 },
        "1m": { interval: "1hour", outputsize: 500 },
        "3m": { interval: "1day", outputsize: 100 },
        "1y": { interval: "1day", outputsize: 300 },
      };
      const params = timeframeMap[this.chartTimeframe] || timeframeMap["1m"];

      // Fetch historical data first
      let chartData = [];
      try {
        const url = `${API_URL}/market/history/${this.selectedSymbol}?interval=${params.interval}&outputsize=${params.outputsize}&_t=${Date.now()}`;
        
        // DEBUG: Show what we are fetching
        const debugInfo = document.getElementById('chart-debug') || document.createElement('div');
        debugInfo.id = 'chart-debug';
        debugInfo.style.position = 'absolute';
        debugInfo.style.top = '5px';
        debugInfo.style.left = '5px';
        debugInfo.style.color = '#00ff00';
        debugInfo.style.fontSize = '10px';
        debugInfo.style.zIndex = '100';
        debugInfo.style.background = 'rgba(0,0,0,0.7)';
        debugInfo.style.padding = '2px';
        container.appendChild(debugInfo);
        
        debugInfo.innerHTML = `Fetching: ${params.interval} (${params.outputsize})<br>URL: ${url}`;

        const res = await fetch(url);
        const data = await res.json();
        
        debugInfo.innerHTML += `<br>Got ${data.data?.length || 0} candles`;

        if (data.data && data.data.length > 0) {
          chartData = data.data
            .map((candle) => ({
              time: candle.time,
              open: parseFloat(candle.open),
              high: parseFloat(candle.high),
              low: parseFloat(candle.low),
              close: parseFloat(candle.close),
              value: parseFloat(candle.close),
              volume: candle.volume || 0,
            }))
            .filter(c => !isNaN(c.open) && !isNaN(c.close) && c.time)
            .sort((a, b) => {
              // Handle both Unix timestamps (numbers) and date strings
              if (typeof a.time === 'number' && typeof b.time === 'number') {
                return a.time - b.time;
              }
              return String(a.time).localeCompare(String(b.time));
            });
        }
      } catch (err) {
        console.error("Failed to load chart data:", err);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#ff5252;">Failed to load chart data</div>';
        return;
      }

      if (chartData.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#666;">No data available</div>';
        return;
      }

      // Clear container for chart
      container.innerHTML = "";

      // Determine if price went up or down overall
      const firstPrice = chartData[0].close;
      const lastPrice = chartData[chartData.length - 1].close;
      const isPositive = lastPrice >= firstPrice;
      const mainColor = isPositive ? "#00C853" : "#FF5252";

      // Create chart - TradingView inspired professional style
      this.chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 400,
        layout: {
          background: { type: "solid", color: "#0d0d0d" },
          textColor: "#787b86",
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#1e222d", style: 1 },
          horzLines: { color: "#1e222d", style: 1 },
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: {
            color: "#758696",
            width: 1,
            style: 2,
            labelVisible: true,
            labelBackgroundColor: "#2a2e39",
          },
          horzLine: {
            color: "#758696",
            width: 1,
            style: 2,
            labelVisible: true,
            labelBackgroundColor: "#2a2e39",
          },
        },
        rightPriceScale: {
          borderColor: "#2a2e39",
          scaleMargins: { top: 0.1, bottom: 0.2 },
          textColor: "#787b86",
          visible: true,
        },
        timeScale: {
          borderColor: "#2a2e39",
          timeVisible: ["1d", "1w", "1m"].includes(this.chartTimeframe),
          secondsVisible: false,
          rightOffset: 5,
          barSpacing: this.chartTimeframe === '1d' ? 6 : 12,
          minBarSpacing: 4,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });

      // Add main price series
      let mainSeries;
      if (this.chartType === "line") {
        // Area chart with gradient
        mainSeries = this.chart.addSeries(LightweightCharts.AreaSeries, {
          lineColor: mainColor,
          lineWidth: 2,
          topColor: isPositive ? "rgba(0, 200, 83, 0.3)" : "rgba(255, 82, 82, 0.3)",
          bottomColor: isPositive ? "rgba(0, 200, 83, 0.0)" : "rgba(255, 82, 82, 0.0)",
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBackgroundColor: mainColor,
          crosshairMarkerBorderColor: "#ffffff",
          crosshairMarkerBorderWidth: 2,
          priceLineVisible: true,
          priceLineWidth: 1,
          priceLineColor: mainColor,
          priceLineStyle: 2,
          lastValueVisible: true,
        });

        // Set line data (uses 'value' or 'close')
        const lineData = chartData.map((c) => ({
          time: c.time,
          value: c.close,
        }));
        mainSeries.setData(lineData);
      } else {
        // Candlestick chart
        mainSeries = this.chart.addSeries(LightweightCharts.CandlestickSeries, {
          upColor: "#26a69a",
          downColor: "#ef5350",
          borderUpColor: "#26a69a",
          borderDownColor: "#ef5350",
          wickUpColor: "#26a69a",
          wickDownColor: "#ef5350",
          priceLineVisible: true,
          lastValueVisible: true,
        });

        mainSeries.setData(chartData);
      }

      // Add volume histogram
      const volumeSeries = this.chart.addSeries(LightweightCharts.HistogramSeries, {
        color: "#26a69a",
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });

      this.chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        visible: false,
      });

      const volumeData = chartData.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)",
      }));
      volumeSeries.setData(volumeData);

      // Fit content
      this.chart.timeScale().fitContent();

      // Handle resize
      const resizeObserver = new ResizeObserver((entries) => {
        if (entries.length === 0 || !this.chart) return;
        const { width } = entries[0].contentRect;
        if (width > 0) {
          this.chart.applyOptions({ width });
        }
      });
      resizeObserver.observe(container);
    },

    async placeOrder() {
      this.orderError = "";
      this.orderSuccess = "";
      this.orderLoading = true;

      try {
        const res = await fetch(`${API_URL}/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            symbol: this.selectedSymbol,
            side: this.orderForm.side,
            quantity: Number(this.orderForm.quantity),
            orderType: this.orderForm.orderType,
            limitPrice:
              this.orderForm.orderType === "LIMIT"
                ? Number(this.orderForm.limitPrice)
                : undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Order failed");
        }

        this.orderSuccess = `Order executed at $${data.executionPrice.toFixed(2)}`;

        // Refresh data
        await Promise.all([this.fetchPortfolio(), this.fetchOrders()]);

        // Clear success message after 3 seconds
        setTimeout(() => {
          this.orderSuccess = "";
        }, 3000);
      } catch (err) {
        this.orderError = err.message;
      } finally {
        this.orderLoading = false;
      }
    },

    // Formatters
    formatCurrency(value) {
      if (value === null || value === undefined) return "$0.00";
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      }).format(value);
    },

    formatPercent(value) {
      if (value === null || value === undefined) return "0.00%";
      const sign = value >= 0 ? "+" : "";
      return `${sign}${value.toFixed(2)}%`;
    },
  };
}
