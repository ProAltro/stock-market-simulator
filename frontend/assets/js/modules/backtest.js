import { API_URL } from "../api.js";

export const backtestModule = {
  // State
  backtestSymbols: "AAPL",
  backtestTimeframe: "3mo",
  backtestInterval: "1d",
  backtestCode: `# Simple SMA Crossover Strategy
# Symbol is automatically set to the first in your list
symbol = _SYMBOLS[0]
data = get_ohlcv(symbol)
sma_20 = get_sma(symbol, 20)
sma_50 = get_sma(symbol, 50)

for i in range(51, len(data)):
    if sma_20[i] is not None and sma_50[i] is not None:
        # Buy signal: short SMA crosses above long SMA
        if sma_20[i] > sma_50[i] and sma_20[i-1] <= sma_50[i-1]:
            if get_position(symbol) == 0:
                buy(symbol, 10, data[i]['close'])
        
        # Sell signal: short SMA crosses below long SMA
        elif sma_20[i] < sma_50[i] and sma_20[i-1] >= sma_50[i-1]:
            if get_position(symbol) > 0:
                sell(symbol, get_position(symbol), data[i]['close'])
`,
  backtestRunning: false,
  backtestResult: null,
  strategyTemplates: [],
  selectedTemplate: "",
  showApiDocs: false,

  async initBacktest() {
    this.backtestSymbols = "AAPL";
    this.backtestTimeframe = "1y";
    this.backtestInterval = "1d";
    this.backtestResult = null;
    this.backtestRunning = false;
    this.selectedTemplate = "";
    
    await this.loadStrategyTemplates();
    
    // Watch for timeframe changes to update interval options
    this.$watch('backtestTimeframe', () => this.updateIntervalOptions());
    
    // Watch for template changes to load code
    this.$watch('selectedTemplate', (val) => this.loadTemplate(val));
  },

  updateIntervalOptions() {
    // Enforce limits based on Yahoo API constraints
    // If timeframe is large (e.g. 1y), prevent small intervals (e.g. 5m)
    // because they will just return daily data anyway (backend clamp).
    
    const tf = this.backtestTimeframe;
    const interval = this.backtestInterval;
    
    // Logic: warn or auto-switch
    if (['1y', '2y', '5y'].includes(tf)) {
       // Long timeframes -> Force 1d/1wk or warn
       if (['5m', '15m', '30m', '1h'].includes(interval)) {
           // Auto-switch to 1d to avoid "daily data disguised as intraday"
           this.backtestInterval = '1d';
       }
    } else if (['3mo', '6mo'].includes(tf)) {
       // Medium timeframes -> 1h is okay, but 5m/15m are too granular for full range
       if (['5m', '15m'].includes(interval)) {
           this.backtestInterval = '1h';
       }
    }
  },

  async loadStrategyTemplates() {
    try {
      // Try unauthenticated first (if public endpoint) or authenticated if token exists
      const token = localStorage.getItem("decrypt_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const res = await fetch(`${API_URL}/backtest/templates?t=${Date.now()}`, { headers });
      if (res.ok) {
        this.strategyTemplates = await res.json();
        // Auto-select first template if available and none selected
        if (this.strategyTemplates.length > 0 && !this.selectedTemplate) {
            this.selectedTemplate = this.strategyTemplates[0].name;
        }
      }
    } catch (err) {
      console.error("Failed to load strategy templates:", err);
    }
  },

  loadTemplate(templateName) {
    if (!templateName) return;
    const template = this.strategyTemplates.find((t) => t.name === templateName);
    if (template) {
      this.backtestCode = template.code;
    }
  },

  async runBacktest() {
    if (this.backtestRunning) return;

    this.backtestRunning = true;
    this.backtestResult = null;

    try {
      // Parse symbols
      const symbols = this.backtestSymbols
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);

      if (symbols.length === 0) {
        this.backtestResult = { error: "Please enter at least one symbol" };
        return;
      }

      const token = localStorage.getItem("decrypt_token");
      if (!token) {
        this.backtestResult = { error: "Please login to run backtests" };
        return;
      }

      const res = await fetch(`${API_URL}/backtest/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          symbols,
          timeframe: this.backtestTimeframe,
          interval: this.backtestInterval,
          code: this.backtestCode,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        this.backtestResult = {
          error: result.error || result.message || "Backtest failed",
        };
      } else {
        this.backtestResult = result;
      }
    } catch (err) {
      console.error("Backtest error:", err);
      this.backtestResult = { error: err.message || "Failed to run backtest" };
    } finally {
      this.backtestRunning = false;
    }
  },

  async loadBacktestHistory() {
    try {
      const token = localStorage.getItem("decrypt_token");
      if (!token) return [];

      const res = await fetch(`${API_URL}/backtest/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        return data.submissions || [];
      }
    } catch (err) {
      console.error("Failed to load backtest history:", err);
    }
    return [];
  },

  async checkJudge0Health() {
    try {
      const res = await fetch(`${API_URL}/backtest/health`);
      if (res.ok) {
        const data = await res.json();
        return data.status === "healthy";
      }
    } catch (err) {
      console.error("Judge0 health check failed:", err);
    }
    return false;
  },
};
