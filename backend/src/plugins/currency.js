import fp from "fastify-plugin";
import { getQuote } from "../services/market/index.js";

/**
 * Currency Conversion Plugin
 *
 * Decorates `fastify.currency` with methods to convert between currencies.
 * Uses Redis for caching FX rates (5-min TTL) with in-memory fallback.
 * All rates expressed as: 1 unit of `from` = X units of `to`.
 */

// Hardcoded fallback rates (FROM -> USD) for when APIs are down
const FALLBACK_RATES_TO_USD = {
  USD: 1.0,
  INR: 0.012,
  EUR: 1.08,
  GBP: 1.26,
  JPY: 0.0067,
  CAD: 0.74,
  AUD: 0.65,
  CHF: 1.12,
  CNY: 0.14,
  HKD: 0.13,
  SGD: 0.74,
  KRW: 0.00075,
};

// In-memory fallback cache when Redis is unavailable
const memoryCache = {};
const REDIS_TTL = 300; // 5 minutes
const MEMORY_TTL_MS = 300000; // 5 minutes

async function currencyPlugin(fastify, options) {
  const currency = {
    /**
     * Get exchange rate: 1 unit of `from` = ? units of `to`
     * @param {string} from - Source currency code
     * @param {string} to - Target currency code
     * @returns {Promise<number>} Exchange rate
     */
    async getRate(from, to) {
      const fromCode = (from || "USD").toUpperCase();
      const toCode = (to || "USD").toUpperCase();

      if (fromCode === toCode) return 1.0;

      const cacheKey = `fx:${fromCode}:${toCode}`;

      // 1. Check Redis cache
      try {
        const cached = await fastify.redis.get(cacheKey);
        if (cached) return parseFloat(cached);
      } catch (e) {
        /* Redis unavailable */
      }

      // 2. Check memory cache
      const memEntry = memoryCache[cacheKey];
      if (memEntry && Date.now() - memEntry.ts < MEMORY_TTL_MS) {
        return memEntry.rate;
      }

      // 3. Fetch from Yahoo Finance
      let rate = null;

      // Strategy A: Try direct pair {FROM}{TO}=X (e.g. EURUSD=X)
      try {
        const symbol = `${fromCode}${toCode}=X`;
        const quote = await getQuote(symbol);
        if (quote && quote.price && quote.price > 0) {
          rate = quote.price;
        }
      } catch (e) {
        /* not found */
      }

      // Strategy B: Try inverse pair {TO}{FROM}=X
      if (rate === null) {
        try {
          const symbol = `${toCode}${fromCode}=X`;
          const quote = await getQuote(symbol);
          if (quote && quote.price && quote.price > 0) {
            rate = 1 / quote.price;
          }
        } catch (e) {
          /* not found */
        }
      }

      // Strategy C: Go through USD as intermediate
      if (rate === null && fromCode !== "USD" && toCode !== "USD") {
        try {
          const fromToUSD = await currency.getRate(fromCode, "USD");
          const usdToTarget = await currency.getRate("USD", toCode);
          rate = fromToUSD * usdToTarget;
        } catch (e) {
          /* fallback below */
        }
      }

      // Strategy D: Hardcoded fallback
      if (rate === null) {
        const fromUSD = FALLBACK_RATES_TO_USD[fromCode] || 1.0;
        const toUSD = FALLBACK_RATES_TO_USD[toCode] || 1.0;
        rate = fromUSD / toUSD;
        fastify.log.warn(
          `Using fallback FX rate for ${fromCode}->${toCode}: ${rate}`,
        );
      }

      // Cache the rate
      try {
        await fastify.redis.setex(cacheKey, REDIS_TTL, rate.toString());
      } catch (e) {
        /* Redis unavailable */
      }
      memoryCache[cacheKey] = { rate, ts: Date.now() };

      return rate;
    },

    /**
     * Convert an amount from one currency to another
     * @param {number} amount - Amount in source currency
     * @param {string} from - Source currency code
     * @param {string} to - Target currency code
     * @returns {Promise<number>} Converted amount
     */
    async convert(amount, from, to) {
      if (!amount || amount === 0) return 0;
      const rate = await currency.getRate(from, to);
      return amount * rate;
    },

    /**
     * Enrich a quote object with base-currency-converted prices
     * @param {Object} quote - Raw quote from market adapter
     * @param {string} baseCurrency - User's base currency
     * @returns {Promise<Object>} Quote with added base currency fields
     */
    async convertQuoteToBase(quote, baseCurrency) {
      const native = (quote.currency || "USD").toUpperCase();
      const base = (baseCurrency || "USD").toUpperCase();

      if (native === base) {
        return {
          ...quote,
          nativeCurrency: native,
          baseCurrency: base,
          exchangeRate: 1,
          priceBase: quote.price,
          changeBase: quote.change,
        };
      }

      const rate = await currency.getRate(native, base);
      return {
        ...quote,
        nativeCurrency: native,
        baseCurrency: base,
        exchangeRate: rate,
        priceBase: quote.price * rate,
        changeBase: (quote.change || 0) * rate,
      };
    },

    /**
     * Batch convert an array of items from various currencies to a target currency.
     * Groups by source currency to minimize FX lookups.
     * @param {Array} items - Array of objects
     * @param {string} currencyField - Field name containing source currency (e.g. 'currency')
     * @param {string[]} amountFields - Field names to convert (e.g. ['avgPrice', 'marketValue'])
     * @param {string} targetCurrency - Target currency code
     * @returns {Promise<Array>} Items with added `{field}Base` fields for each amount field
     */
    async batchConvert(items, currencyField, amountFields, targetCurrency) {
      const target = (targetCurrency || "USD").toUpperCase();

      // Collect unique source currencies
      const currencies = [
        ...new Set(items.map((i) => (i[currencyField] || "USD").toUpperCase())),
      ];

      // Fetch rates for all unique pairs
      const rates = {};
      await Promise.all(
        currencies.map(async (cur) => {
          rates[cur] = await currency.getRate(cur, target);
        }),
      );

      // Apply conversion
      return items.map((item) => {
        const src = (item[currencyField] || "USD").toUpperCase();
        const rate = rates[src] || 1;
        const converted = {};
        for (const field of amountFields) {
          const val = Number(item[field]) || 0;
          converted[`${field}Base`] = val * rate;
        }
        return {
          ...item,
          ...converted,
          exchangeRate: rate,
          baseCurrency: target,
        };
      });
    },
  };

  fastify.decorate("currency", currency);
}

export default fp(currencyPlugin, {
  name: "currency",
  dependencies: ["redis"],
});
