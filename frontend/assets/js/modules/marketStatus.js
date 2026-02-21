import { API_URL, get } from "../api.js";

let tvChart = null;
let candleSeries = null;

export const marketModule = {
  marketStatus: null,
  selectedCommodity: "OIL",
  orderbook: null,
  news: [],
  candleInterval: "1h",
  candles: [],

  async fetchMarketStatus() {
    try {
      this.marketStatus = await get(`${API_URL}/market/status`);
    } catch (err) {
      console.error("Failed to fetch market status:", err);
    }
  },

  async fetchOrderbook(symbol) {
    try {
      this.orderbook = await get(`${API_URL}/market/orderbook/${symbol}`);
    } catch (err) {
      console.error("Failed to fetch orderbook:", err);
    }
  },

  async fetchNews() {
    try {
      this.news = await get(`${API_URL}/news?limit=20`);
    } catch (err) {
      console.error("Failed to fetch news:", err);
    }
  },

  async fetchCandles(interval) {
    if (interval) this.candleInterval = interval;

    // Map interval to appropriate number of candles (time window)
    const limitMap = {
      '1m': 168,    // ~3 hours of 1-min candles
      '5m': 288,    // ~1 day of 5-min candles
      '15m': 672,   // ~1 week of 15-min candles
      '30m': 336,   // ~1 week of 30-min candles
      '1h': 168,    // ~1 week of hourly candles
      '1d': 365,    // ~1 year of daily candles
    };
    const limit = limitMap[this.candleInterval] || 500;

    try {
      const data = await get(
        `${API_URL}/market/candles/${this.selectedCommodity}?interval=${this.candleInterval}&limit=${limit}`,
      );
      // data is expected to be an array of {time, open, high, low, close, volume}
      this.candles = Array.isArray(data) ? data : data.candles || [];
      this.renderChart();
    } catch (err) {
      console.error("Failed to fetch candles:", err);
    }
  },

  renderChart() {
    const container = document.getElementById("tradingview-chart");
    if (!container || typeof LightweightCharts === "undefined") return;

    // Destroy old chart
    if (tvChart) {
      tvChart.remove();
      tvChart = null;
      candleSeries = null;
    }

    tvChart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 400,
      layout: {
        background: { color: "#0a0f1a" },
        textColor: "#8892a0",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.1)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.1)",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: (price) => {
          if (price === 0) return "0";
          if (Math.abs(price) < 0.001) return price.toExponential(4);
          if (Math.abs(price) < 1) return price.toFixed(6);
          return price.toFixed(2);
        },
      },
    });

    candleSeries = tvChart.addCandlestickSeries({
      upColor: "#00e676",
      downColor: "#ff5252",
      borderDownColor: "#ff5252",
      borderUpColor: "#00e676",
      wickDownColor: "#ff5252",
      wickUpColor: "#00e676",
    });

    if (this.candles.length > 0) {
      // TradingView expects {time, open, high, low, close}
      // Sim returns time in milliseconds, TradingView needs seconds
      const chartData = this.candles.map((c) => ({
        time:
          typeof c.time === "number"
            ? Math.floor(c.time / 1000)
            : Math.floor(new Date(c.time).getTime() / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeries.setData(chartData);
      tvChart.timeScale().fitContent();
    }

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (tvChart && container) {
        tvChart.applyOptions({ width: container.clientWidth });
      }
    });
    resizeObserver.observe(container);
  },

  async selectCommodity(symbol) {
    this.selectedCommodity = symbol;
    await Promise.all([this.fetchOrderbook(symbol), this.fetchCandles()]);
  },
};
