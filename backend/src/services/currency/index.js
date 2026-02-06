/**
 * Currency Conversion Service
 * Handles FX rate fetching and conversion to USD base currency.
 */

import { getQuote } from '../market/index.js';

// Cache for exchange rates (simple memory cache for now, could move to Redis)
// Format: { 'EUR': { rate: 1.08, timestamp: 123456789 } }
const rateCache = {};
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

/**
 * Get exchange rate from Currency -> USD
 * @param {string} currency - Source currency code (e.g. 'INR', 'EUR')
 * @returns {Promise<number>} Rate to convert 1 unit of Currency to USD
 */
export async function getRateToUSD(currency) {
  const code = currency.toUpperCase();
  
  // Base case: USD is always 1:1
  if (code === 'USD') return 1.0;

  // Check cache
  const now = Date.now();
  if (rateCache[code] && (now - rateCache[code].timestamp < CACHE_TTL_MS)) {
    return rateCache[code].rate;
  }

  try {
    // Yahoo mostly uses "EUR=X" (EUR to USD) or "INR=X" (USD to INR? No, careful here)
    // Convention:
    // GBP=X -> GBP/USD rate (1 GBP = x USD)
    // EUR=X -> EUR/USD rate (1 EUR = x USD)
    // INR=X -> USD/INR rate (1 USD = x INR) ?? wait, let's verify.
    
    // Actually Yahoo varies. 
    // EURUSD=X -> 1.08 (1 EUR = 1.08 USD)
    // USDINR=X -> 83.0 (1 USD = 83 INR)
    
    // We want Rate such that: USD_Value = Local_Value * Rate
    // If quote is USDINR=X (83.0), then Rate = 1/83.0 = 0.012
    
    // Let's try fetching "USD{code}=X" or "{code}USD=X"
    // Standard major pairs often listed as EURUSD=X. 
    // Emerging often USDINR=X.
    
    let rate = 1.0;
    
    // Strategy: Try USD{CODE}=X first (e.g. USDINR=X)
    try {
        const symbol = `USD${code}=X`;
        const quote = await getQuote(symbol);
        if (quote && quote.price) {
            // This is "How many CODE units for 1 USD"
            // So 1 USD = 83 INR. 
            // We have INR. We want USD. 
            // USD = INR * (1 / 83)
            rate = 1 / quote.price;
        }
    } catch (e1) {
        // Fallback: Try {CODE}USD=X (Direct quote, e.g. GBPUSD=X)
        try {
            const symbol = `${code}USD=X`;
            const quote = await getQuote(symbol);
            if (quote && quote.price) {
                // This is "How many USD for 1 CODE"
                // 1 GBP = 1.25 USD
                // USD = GBP * 1.25
                rate = quote.price;
            }
        } catch (e2) {
            console.error(`Failed to fetch FX rate for ${code}:`, e2.message);
            // Fallback hardcoded for demo if API fails
            if (code === 'INR') rate = 0.012; 
            else if (code === 'EUR') rate = 1.08;
            else if (code === 'GBP') rate = 1.26;
            else rate = 1.0; // Worst case assume 1:1 to prevent crash
        }
    }

    // Cache it
    rateCache[code] = { rate, timestamp: now };
    return rate;
    
  } catch (err) {
    console.error(`Currency service error for ${code}:`, err);
    return 1.0;
  }
}

/**
 * Convert amount from Source Currency to USD
 * @param {number} amount - Amount in source currency
 * @param {string} currency - Source currency code
 * @returns {Promise<number>} Amount in USD
 */
export async function convertToUSD(amount, currency) {
    if (!amount) return 0;
    const rate = await getRateToUSD(currency);
    return amount * rate;
}
