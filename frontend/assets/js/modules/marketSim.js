import { API_URL } from "../api.js";

export const marketSimModule = {
  // State
  simConnected: false,
  simState: null,
  simAssets: [],
  simOrderBook: null,
  simNews: [],
  selectedSimSymbol: null,
  simPollingInterval: null,

  // Chart state
  simChart: null,
  simSeries: null,
  simChartType: "candle",
  simTimeframe: "1M",
  simInterval: "auto", // Default to auto (matches Yahoo behavior)
  simCandleData: [],

  // Order form
  simOrderForm: {
    side: "BUY",
    quantity: 10,
    orderType: "MARKET",
    limitPrice: null,
  },
  simOrderLoading: false,
  simOrderError: null,
  simOrderSuccess: null,

  // Admin state
  simAdminAuth: false,
  simAdminPassword: "",
  simAdminError: null,
  adminLoading: false,
  adminMessage: null,
  adminError: null,
  adminStats: null,
  adminInstruments: [],
  adminNewsForm: {
    category: "COMPANY",
    symbol: "",
    sentiment: "negative",
    headline: "",
    magnitude: 0.05,
  },
  _pendingDeleteConfirm: false,
  _adminActionLabel: null,
  _populatePollingInterval: null,

  // Initialize
  initMarketSim() {
    this.startSimPolling();
  },

  startSimPolling() {
    if (this.simPollingInterval) {
      clearInterval(this.simPollingInterval);
    }
    this.fetchSimState();
    this.simPollingInterval = setInterval(() => {
      this.fetchSimState();
    }, 1000);
    this.simConnected = true;
  },

  stopSimPolling() {
    if (this.simPollingInterval) {
      clearInterval(this.simPollingInterval);
      this.simPollingInterval = null;
    }
    this.simConnected = false;
  },

  async fetchSimState() {
    try {
      const [stateRes, assetsRes] = await Promise.all([
        fetch(`${API_URL}/market-sim/state`),
        fetch(`${API_URL}/market-sim/assets`),
      ]);

      if (stateRes.ok) {
        const data = await stateRes.json();
        this.simState = data;
        this.simConnected = true;
      }

      if (assetsRes.ok) {
        const assets = await assetsRes.json();
        this.simAssets = assets || [];

        if (!this.selectedSimSymbol && assets.length > 0) {
          this.selectSimAsset(assets[0].symbol);
        }
      }

      if (this.selectedSimSymbol) {
        this.fetchSimOrderBook(this.selectedSimSymbol);
      }

      // Fetch news less frequently (every 5th poll = ~5 seconds)
      if (!this._newsCounter) this._newsCounter = 0;
      this._newsCounter++;
      if (this._newsCounter >= 5) {
        this._newsCounter = 0;
        this.fetchSimNews();
      }
    } catch (e) {
      console.error("Failed to fetch sim state:", e);
      this.simConnected = false;
    }
  },

  // Fetch news from backend
  async fetchSimNews() {
    try {
      const res = await fetch(`${API_URL}/market-sim/news?limit=20`);
      if (res.ok) {
        this.simNews = await res.json();
      }
    } catch (e) {
      console.error("Failed to fetch sim news:", e);
    }
  },

  // Select asset and load candles
  selectSimAsset(symbol) {
    this.selectedSimSymbol = symbol;
    this.fetchSimOrderBook(symbol);
    this.loadSimCandles().then(() => this.initSimChart());
  },

  getSimAssetPrice(symbol) {
    if (!symbol || !this.simAssets) return 0;
    const asset = this.simAssets.find((a) => a.symbol === symbol);
    return asset?.price || 0;
  },

  getSelectedAsset() {
    if (!this.selectedSimSymbol || !this.simAssets) return null;
    return this.simAssets.find((a) => a.symbol === this.selectedSimSymbol);
  },

  // Timeframe → limit mapping (24h/day, 7 days/week sim market)
  // Returns base limit for the timeframe, getTimeframeLimitWithBuffer adds extra for zoom-out
  getTimeframeLimit() {
    const interval = this.getEffectiveInterval();
    const map = {
      "1D": { M1: 1440, M5: 288, M15: 96, M30: 48, H1: 24, D1: 1 },
      "1W": { M1: 10000, M5: 2016, M15: 672, M30: 336, H1: 168, D1: 7 },
      "1M": { M1: 10000, M5: 8640, M15: 2880, M30: 1440, H1: 720, D1: 30 },
      "3M": { M1: 10000, M5: 10000, M15: 8640, M30: 4320, H1: 2160, D1: 90 },
      "6M": { M1: 10000, M5: 10000, M15: 10000, M30: 8640, H1: 4320, D1: 180 },
    };
    return map[this.simTimeframe]?.[interval] || 500;
  },

  /**
   * Get limit with 1.5x buffer for zoom-out support
   * Loads more data than visible so zooming out still has candles
   */
  getTimeframeLimitWithBuffer() {
    const baseLimit = this.getTimeframeLimit();
    const ZOOM_BUFFER_MULTIPLIER = 1.5;
    return Math.min(Math.ceil(baseLimit * ZOOM_BUFFER_MULTIPLIER), 10000);
  },

  /**
   * Get the effective interval (resolves 'auto' to actual interval)
   */
  getEffectiveInterval() {
    if (this.simInterval === "auto") {
      return this.getAutoInterval();
    }
    return this.simInterval;
  },

  /**
   * Get auto-selected interval for current timeframe
   */
  getAutoInterval() {
    const autoMap = {
      "1D": "M5", // 1 day → 5-minute candles
      "1W": "M15", // 1 week → 15-minute candles
      "1M": "D1", // 1 month → daily candles
      "3M": "D1", // 3 months → daily candles
      "6M": "D1", // 6 months → daily candles
    };
    return autoMap[this.simTimeframe] || "D1";
  },

  /**
   * Get available intervals for current timeframe (respecting Yahoo-like data limits)
   * - M1: only for 1D/1W (7 day limit)
   * - M5/M15/M30: for 1D/1W/1M/3M (60 day limit)
   * - H1/D1: all timeframes
   */
  getAvailableIntervals() {
    const availabilityMap = {
      "1D": ["M1", "M5", "M15", "M30", "H1"], // No D1 for 1 day
      "1W": ["M1", "M5", "M15", "M30", "H1", "D1"], // All intervals
      "1M": ["M5", "M15", "M30", "H1", "D1"], // No M1 (exceeds 7 days)
      "3M": ["H1", "D1"], // Only H1/D1 for 3 months
      "6M": ["H1", "D1"], // Only H1/D1
    };
    return availabilityMap[this.simTimeframe] || ["H1", "D1"];
  },

  /**
   * Check if an interval is available for current timeframe
   */
  isIntervalAvailable(interval) {
    if (interval === "auto") return true;
    return this.getAvailableIntervals().includes(interval);
  },

  setSimTimeframe(tf) {
    this.simTimeframe = tf;

    // If current interval is not available for new timeframe, reset to auto
    if (
      this.simInterval !== "auto" &&
      !this.isIntervalAvailable(this.simInterval)
    ) {
      this.simInterval = "auto";
    }

    this.loadSimCandles().then(() => this.initSimChart());
  },

  setSimChartType(type) {
    this.simChartType = type;
    this.initSimChart();
  },

  // Load candles from backend (DB-backed)
  // Uses buffered limit (1.5x) for zoom-out support
  async loadSimCandles() {
    if (!this.selectedSimSymbol) return;

    const interval = this.getEffectiveInterval();
    const limit = this.getTimeframeLimitWithBuffer(); // Extra data for zoom-out
    try {
      const res = await fetch(
        `${API_URL}/market-sim/candles/${this.selectedSimSymbol}?interval=${interval}&limit=${limit}`,
      );
      if (res.ok) {
        const data = await res.json();
        this.simCandleData = data.candles || data || [];
      } else {
        this.simCandleData = [];
      }
    } catch (e) {
      console.error("Failed to load candles:", e);
      this.simCandleData = [];
    }
  },

  // Initialize the TradingView chart
  initSimChart() {
    const container = document.getElementById("sim-chart-container");
    if (!container) return;

    if (this.simChart) {
      try {
        this.simChart.remove();
      } catch (e) {}
      this.simChart = null;
      this.simSeries = null;
    }

    const bgDark = "#131722";
    const textColor = "#d1d4dc";
    const colorGreen = "#26a69a";
    const colorRed = "#ef5350";

    this.simChart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 520,
      layout: {
        background: { type: "solid", color: bgDark },
        textColor: textColor,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#2B2B43", style: 1 },
        horzLines: { color: "#2B2B43", style: 1 },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: "#758696", width: 1, style: 3 },
        horzLine: { color: "#758696", width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: "#2B2B43",
        visible: true,
        borderVisible: false,
      },
      timeScale: {
        borderColor: "#2B2B43",
        timeVisible: this.simInterval !== "D1",
        visible: true,
        borderVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    if (this.simChartType === "candle") {
      this.simSeries = this.simChart.addSeries(
        LightweightCharts.CandlestickSeries,
        {
          upColor: colorGreen,
          downColor: colorRed,
          borderUpColor: colorGreen,
          borderDownColor: colorRed,
          wickUpColor: colorGreen,
          wickDownColor: colorRed,
        },
      );
    } else {
      this.simSeries = this.simChart.addSeries(LightweightCharts.LineSeries, {
        color: colorGreen,
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      });
    }

    this.updateSimChart();

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !this.simChart) return;
      const { width } = entries[0].contentRect;
      if (width > 0) {
        this.simChart.applyOptions({ width });
      }
    });
    resizeObserver.observe(container);
  },

  // Update chart from candle data
  updateSimChart() {
    if (!this.simSeries) return;

    const candles = this.simCandleData;
    if (!candles || candles.length === 0) {
      this._updateFromPriceHistory();
      return;
    }

    if (this.simChartType === "candle") {
      const chartData = candles.map((c) => {
        let t = c.timestamp || c.time;
        // Backend already returns Unix seconds for intraday, "YYYY-MM-DD" for daily.
        // Fallback: if we still get epoch ms (from live source), convert to seconds.
        if (typeof t === "number" && t > 1e12) {
          t = Math.floor(t / 1000);
        }
        return {
          time: t,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        };
      });
      if (chartData.length > 0) {
        this.simSeries.setData(chartData);
        this.simChart.timeScale().fitContent();
      }
    } else {
      const chartData = candles.map((c) => {
        let t = c.timestamp || c.time;
        if (typeof t === "number" && t > 1e12) {
          t = Math.floor(t / 1000);
        }
        return {
          time: t,
          value: c.close,
        };
      });
      if (chartData.length > 0) {
        this.simSeries.setData(chartData);
        this.simChart.timeScale().fitContent();
      }
    }
  },

  // Fallback: group live priceHistory into synthetic candles
  _updateFromPriceHistory() {
    const asset = this.getSelectedAsset();
    if (!asset || !asset.priceHistory || asset.priceHistory.length === 0)
      return;

    const history = asset.priceHistory;
    const now = Math.floor(Date.now() / 1000);

    if (this.simChartType === "candle") {
      const candleSize = 10;
      const candles = [];
      for (let i = 0; i < history.length; i += candleSize) {
        const slice = history.slice(i, i + candleSize);
        if (slice.length > 0) {
          candles.push({
            time: now - (history.length - i) * 60,
            open: slice[0],
            high: Math.max(...slice),
            low: Math.min(...slice),
            close: slice[slice.length - 1],
          });
        }
      }
      if (candles.length > 0) {
        this.simSeries.setData(candles);
        this.simChart.timeScale().fitContent();
      }
    } else {
      const chartData = history.map((price, index) => ({
        time: now - (history.length - index) * 60,
        value: price,
      }));
      if (chartData.length > 0) {
        this.simSeries.setData(chartData);
        this.simChart.timeScale().fitContent();
      }
    }
  },

  // Fetch order book
  async fetchSimOrderBook(symbol) {
    try {
      const res = await fetch(`${API_URL}/market-sim/orderbook/${symbol}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("decrypt_token")}`,
        },
      });
      if (res.ok) {
        this.simOrderBook = await res.json();
      }
    } catch (e) {
      console.error("Failed to fetch order book:", e);
    }
  },

  // Place order
  async placeSimOrder() {
    if (!this.selectedSimSymbol) return;

    this.simOrderLoading = true;
    this.simOrderError = null;
    this.simOrderSuccess = null;

    try {
      const res = await fetch(`${API_URL}/market-sim/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("decrypt_token")}`,
        },
        body: JSON.stringify({
          symbol: this.selectedSimSymbol,
          side: this.simOrderForm.side,
          quantity: Number(this.simOrderForm.quantity),
          orderType: this.simOrderForm.orderType,
          limitPrice: this.simOrderForm.limitPrice
            ? Number(this.simOrderForm.limitPrice)
            : null,
        }),
      });

      const result = await res.json();

      if (
        res.ok &&
        (result.status === "filled" || result.status === "partial")
      ) {
        this.simOrderSuccess = `Order ${result.status}: ${result.filledQuantity} @ $${result.avgFillPrice?.toFixed(2)}`;
      } else if (result.error) {
        this.simOrderError = result.error;
      } else {
        this.simOrderSuccess = result.message || `Order ${result.status}`;
      }
    } catch (e) {
      this.simOrderError = "Order failed: " + e.message;
    } finally {
      this.simOrderLoading = false;
    }
  },

  // ─── Admin Methods ───

  async authenticateSimAdmin() {
    this.simAdminError = null;
    try {
      const res = await fetch(`${API_URL}/market-sim/admin/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: this.simAdminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.authenticated) {
        this.simAdminAuth = true;
        this.fetchAdminStats();
        this.fetchAdminInstruments();
        this.checkPopulateStatus(); // Resume progress display if populate in progress
      } else {
        this.simAdminError = data.error || "Authentication failed";
      }
    } catch (e) {
      this.simAdminError = "Connection failed";
    }
  },

  _adminHeaders() {
    return {
      "x-admin-password": this.simAdminPassword,
    };
  },

  _adminJsonHeaders() {
    return {
      "Content-Type": "application/json",
      "x-admin-password": this.simAdminPassword,
    };
  },

  async fetchAdminStats() {
    try {
      const res = await fetch(`${API_URL}/market-sim/admin/stats`, {
        headers: this._adminHeaders(),
      });
      if (res.ok) {
        this.adminStats = await res.json();
      }
    } catch (e) {
      console.error("Failed to fetch admin stats:", e);
    }
  },

  async fetchAdminInstruments() {
    try {
      const res = await fetch(`${API_URL}/market-sim/admin/instruments`, {
        headers: this._adminHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        this.adminInstruments = data.instruments || data || [];
      }
    } catch (e) {
      console.error("Failed to fetch admin instruments:", e);
    }
  },

  async adminPopulate() {
    this.adminLoading = true;
    this._adminActionLabel = "Starting population...";
    this.adminMessage = null;
    this.adminError = null;
    try {
      const res = await fetch(`${API_URL}/market-sim/admin/populate`, {
        method: "POST",
        headers: this._adminJsonHeaders(),
        body: JSON.stringify({ days: 180 }),
      });
      const data = await res.json();
      if (res.ok) {
        // Start polling for progress
        this._startPopulatePolling();
      } else {
        this.adminError = data.error || "Failed";
        this.adminLoading = false;
        this._adminActionLabel = null;
      }
    } catch (e) {
      this.adminError = "Request failed: " + e.message;
      this.adminLoading = false;
      this._adminActionLabel = null;
    }
  },

  _startPopulatePolling() {
    if (this._populatePollingInterval) {
      clearInterval(this._populatePollingInterval);
    }
    this._populatePollingInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/market-sim/admin/status`);
        if (res.ok) {
          const state = await res.json();

          // Check backend phase first (covers syncing phase after C++ completes)
          if (state.backendPhase === "syncing") {
            this._adminActionLabel =
              state.backendMessage || "Syncing to database...";
          } else if (state.populating) {
            // C++ is still populating
            const day = state.populateCurrentDay || 0;
            const total = state.populateTargetDays || 180;
            const date = state.simDate || "";
            this._adminActionLabel = `Populating day ${day}/${total} (${date})`;
          } else if (state.backendPhase === "idle") {
            // Fully complete
            this._stopPopulatePolling();
            this.adminLoading = false;
            this._adminActionLabel = null;
            if (state.backendError) {
              this.adminError = state.backendError;
            } else {
              this.adminMessage = "Population complete!";
            }
            this.fetchAdminStats();
          }
        }
      } catch (e) {
        console.error("Error polling populate status:", e);
      }
    }, 500);
  },

  _stopPopulatePolling() {
    if (this._populatePollingInterval) {
      clearInterval(this._populatePollingInterval);
      this._populatePollingInterval = null;
    }
  },

  // Check if populate is in progress on page load
  async checkPopulateStatus() {
    try {
      const res = await fetch(`${API_URL}/market-sim/admin/status`);
      if (res.ok) {
        const state = await res.json();
        // Resume polling if C++ is populating or backend is syncing
        if (
          state.populating ||
          state.backendPhase === "populating" ||
          state.backendPhase === "syncing"
        ) {
          this.adminLoading = true;
          this._startPopulatePolling();
        }
      }
    } catch (e) {
      console.error("Error checking populate status:", e);
    }
  },

  async adminDeleteAll() {
    this._pendingDeleteConfirm = true;
    return;
  },

  async adminDeleteAllConfirmed() {
    this._pendingDeleteConfirm = false;
    this.adminLoading = true;
    this._adminActionLabel = "Deleting all data...";
    this.adminMessage = null;
    this.adminError = null;
    try {
      const res = await fetch(`${API_URL}/market-sim/admin/delete`, {
        method: "POST",
        headers: this._adminJsonHeaders(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        this.adminMessage = data.message || "All data deleted";
        this.fetchAdminStats();
      } else {
        this.adminError = data.error || "Failed";
      }
    } catch (e) {
      this.adminError = "Request failed: " + e.message;
    } finally {
      this.adminLoading = false;
      this._adminActionLabel = null;
    }
  },

  adminDeleteAllCancel() {
    this._pendingDeleteConfirm = false;
  },

  async adminControl(action) {
    this.adminLoading = true;
    const labels = {
      start: "Starting simulation...",
      stop: "Stopping simulation...",
      "start-sync": "Starting DB sync...",
      "stop-sync": "Stopping DB sync...",
    };
    this._adminActionLabel = labels[action] || "Processing...";
    this.adminMessage = null;
    this.adminError = null;
    try {
      const res = await fetch(`${API_URL}/market-sim/admin/control`, {
        method: "POST",
        headers: this._adminJsonHeaders(),
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        this.adminMessage = data.message || `Action '${action}' executed`;
        this.fetchAdminStats();
      } else {
        this.adminError = data.error || "Failed";
      }
    } catch (e) {
      this.adminError = "Request failed: " + e.message;
    } finally {
      this.adminLoading = false;
      this._adminActionLabel = null;
    }
  },

  async adminInjectNews() {
    this.adminLoading = true;
    this._adminActionLabel = "Injecting news event...";
    this.adminMessage = null;
    this.adminError = null;
    try {
      const body = {
        category: this.adminNewsForm.category,
        sentiment: this.adminNewsForm.sentiment,
        magnitude: this.adminNewsForm.magnitude,
      };
      if (
        this.adminNewsForm.category === "COMPANY" &&
        this.adminNewsForm.symbol
      ) {
        body.symbol = this.adminNewsForm.symbol;
      }
      if (this.adminNewsForm.headline) {
        body.headline = this.adminNewsForm.headline;
      }
      const res = await fetch(`${API_URL}/market-sim/admin/news`, {
        method: "POST",
        headers: this._adminJsonHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        this.adminMessage = data.message || "News injected";
      } else {
        this.adminError = data.error || "Failed";
      }
    } catch (e) {
      this.adminError = "Request failed: " + e.message;
    } finally {
      this.adminLoading = false;
      this._adminActionLabel = null;
    }
  },

  // Helper for large numbers
  formatLargeNumber(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toString();
  },

  // Format news timestamp
  formatNewsDate(timestamp) {
    if (!timestamp) return "";
    const date = new Date(Number(timestamp));
    const now = new Date();
    const diffMs = now - date;

    // If less than 24 hours, show relative time
    if (diffMs < 24 * 60 * 60 * 1000) {
      if (diffMs < 60 * 1000) return "Just now";
      if (diffMs < 60 * 60 * 1000)
        return Math.floor(diffMs / (60 * 1000)) + "m ago";
      return Math.floor(diffMs / (60 * 60 * 1000)) + "h ago";
    }

    // Otherwise show date
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  },
};
