/**
 * Mock adapter for market data
 * Used for development and testing without external API calls
 */

// Base prices for known symbols
const BASE_PRICES = {
  AAPL: 185,
  GOOGL: 142,
  MSFT: 410,
  AMZN: 178,
  META: 485,
  NVDA: 680,
  TSLA: 185,
  JPM: 195,
  V: 280,
  JNJ: 160,
  WMT: 165,
  PG: 165,
  DIS: 95,
  NFLX: 480,
  AMD: 175,
  INTC: 45,
  // Non-USD mock symbols
  "RELIANCE.NS": 2450,
  "TCS.NS": 3800,
  "INFY.NS": 1600,
  "VOD.L": 72,
  "BP.L": 490,
  "HSBA.L": 650,
};

// Currency mapping for mock symbols
const SYMBOL_CURRENCIES = {
  "RELIANCE.NS": "INR",
  "TCS.NS": "INR",
  "INFY.NS": "INR",
  "VOD.L": "GBP",
  "BP.L": "GBP",
  "HSBA.L": "GBP",
};

/**
 * Get base price for a symbol (deterministic)
 */
function getBasePrice(symbol) {
  return BASE_PRICES[symbol.toUpperCase()] || 100 + (hashCode(symbol) % 100);
}

/**
 * Simple hash for consistent random values
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Get mock quote for a symbol
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} Mock quote data
 */
export async function getQuote(symbol) {
  const basePrice = getBasePrice(symbol);
  const change = (Math.random() - 0.5) * 5;

  return {
    symbol: symbol.toUpperCase(),
    name: `${symbol.toUpperCase()} Inc.`,
    price: basePrice,
    change: change,
    changePercent: (change / basePrice) * 100,
    high: basePrice * 1.02,
    low: basePrice * 0.98,
    open: basePrice - change,
    previousClose: basePrice - change,
    volume: Math.floor(Math.random() * 10000000),
    timestamp: new Date().toISOString(),
    currency: SYMBOL_CURRENCIES[symbol.toUpperCase()] || "USD",
    exchange: symbol.toUpperCase().endsWith(".NS")
      ? "NSE"
      : symbol.toUpperCase().endsWith(".L")
        ? "LSE"
        : "NASDAQ",
    isMock: true,
  };
}

/**
 * Get mock historical data for a symbol
 * @param {string} symbol - Stock symbol
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Mock historical data
 */
export async function getHistory(symbol, options = {}) {
  const { outputsize = 30 } = options;
  const basePrice = getBasePrice(symbol);
  const data = [];
  const now = new Date();

  for (let i = outputsize; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const volatility = 0.02;
    const change = (Math.random() - 0.5) * 2 * volatility;
    const open = basePrice * (1 + (Math.random() - 0.5) * 0.1);
    const close = open * (1 + change);

    data.push({
      time: date.toISOString().split("T")[0],
      open: open,
      high: Math.max(open, close) * (1 + Math.random() * 0.01),
      low: Math.min(open, close) * (1 - Math.random() * 0.01),
      close: close,
      volume: Math.floor(Math.random() * 10000000),
    });
  }

  return {
    symbol: symbol.toUpperCase(),
    interval: "1day",
    data,
    isMock: true,
  };
}
