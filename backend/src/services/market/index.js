/**
 * Market Data Service Layer
 * 
 * Provides a unified interface for market data with pluggable adapters.
 * Configure provider via MARKET_DATA_PROVIDER environment variable.
 * 
 * Supported providers:
 *   - 'yahoo' (default) - Yahoo Finance via yahoo-finance2
 *   - 'mock' - Mock data for development
 */

import * as yahooAdapter from './yahooAdapter.js';
// import * as twelveDataAdapter from './twelveDataAdapter.js'; // Removed

/**
 * Get real-time quote for a symbol
 * @param {string} symbol - Stock symbol (e.g., 'AAPL')
 * @returns {Promise<Object>} Quote data with normalized fields
 */
export async function getQuote(symbol) {
  // Always use Yahoo for quotes to save Twelve Data credits (free tier limit 8/min)
  return await yahooAdapter.getQuote(symbol);
}

/**
 * Get historical OHLC data for a symbol
 * @param {string} symbol - Stock symbol
 * @param {Object} options - Query options (interval, outputsize)
 * @returns {Promise<Object>} Historical data
 */
export async function getHistory(symbol, options = {}) {
  // Always use Yahoo for history
  return await yahooAdapter.getHistory(symbol, options);
}

/**
 * Get the current provider name
 * @returns {string} Provider name
 */
export function getProviderName() {
  return process.env.MARKET_DATA_PROVIDER || 'yahoo';
}
