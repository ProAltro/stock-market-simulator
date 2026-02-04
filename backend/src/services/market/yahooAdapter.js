import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

/**
 * Yahoo Finance adapter for market data
 * Uses yahoo-finance2 package - no API key required
 */

/**
 * Get real-time quote for a symbol
 * @param {string} symbol - Stock symbol (e.g., 'AAPL')
 * @returns {Promise<Object>} Quote data
 */
export async function getQuote(symbol) {
  const quote = await yahooFinance.quote(symbol.toUpperCase());
  
  return {
    symbol: quote.symbol,
    name: quote.shortName || quote.longName || `${quote.symbol} Inc.`,
    price: quote.regularMarketPrice,
    change: quote.regularMarketChange,
    changePercent: quote.regularMarketChangePercent,
    high: quote.regularMarketDayHigh,
    low: quote.regularMarketDayLow,
    open: quote.regularMarketOpen,
    previousClose: quote.regularMarketPreviousClose,
    volume: quote.regularMarketVolume,
    timestamp: quote.regularMarketTime ? new Date(quote.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
    marketCap: quote.marketCap,
    exchange: quote.exchange,
    currency: quote.currency
  };
}

/**
 * Get historical OHLC data for a symbol
 * @param {string} symbol - Stock symbol
 * @param {Object} options - Query options
 * @param {string} options.interval - Data interval (1d, 1wk, 1mo)
 * @param {number} options.outputsize - Number of data points
 * @returns {Promise<Object>} Historical data
 */
export async function getHistory(symbol, options = {}) {
  const { interval = '1day', range = '1mo', outputsize = 30 } = options;
  
  // Map interval and range to Yahoo format
  const yahooInterval = mapInterval(interval);
  
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  
  // Set lookback based on range
  // Set lookback based on range (Buffered for Zoom Out)
  if (range === '1d') {
    startDate.setDate(startDate.getDate() - 30); // Valid buffer for 5m interval (max ~60d)
  } else if (range === '5d') {
    startDate.setDate(startDate.getDate() - 60); // Valid buffer for 15m interval (max ~60d)
  } else if (range === '1wk') {
    startDate.setMonth(startDate.getMonth() - 1); // 1mo buffer
  } else if (range === '1mo') {
    startDate.setFullYear(startDate.getFullYear() - 1); // 1y buffer
  } else if (range === '3mo') {
    startDate.setFullYear(startDate.getFullYear() - 1); // 1y buffer
  } else if (range === '6mo') {
    startDate.setFullYear(startDate.getFullYear() - 2); // 2y buffer
  } else if (range === '1y') {
    startDate.setFullYear(startDate.getFullYear() - 5); // 5y buffer
  } else if (range === '2y') {
    startDate.setFullYear(startDate.getFullYear() - 10); // 10y buffer
  } else if (range === '5y') {
    startDate.setFullYear(startDate.getFullYear() - 20); // 20y buffer
  } else if (range === 'ytd') {
    startDate.setFullYear(startDate.getFullYear() - 1); // 1y buffer
  } else {
    // Fallback logic
    // Fallback logic
    if (['1m', '5m', '15m', '30m', '1h', '60m'].includes(yahooInterval)) {
       let daysBack = 730; 
       if (yahooInterval === '1m') daysBack = 7;
       else if (['5m', '15m', '30m'].includes(yahooInterval)) daysBack = 60;
       startDate.setDate(startDate.getDate() - daysBack);
    } else {
       const bufferMultiplier = 5.0; // Significant buffer
       startDate.setDate(startDate.getDate() - (outputsize * getIntervalDays(interval) * bufferMultiplier));
    }
  }

  // Clamp start date for intraday limits to avoid API errors
  // Yahoo has strict limits on how far back you can request intraday data
  const now = new Date();
  const diffTime = Math.abs(now - startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Limits: 1m=7d; 5m/15m/30m=60d; 1h=730d (2y)
  if (yahooInterval === '1m' && diffDays > 7) {
      startDate.setTime(now.getTime() - (6 * 24 * 60 * 60 * 1000)); // Limit to 6 days to be safe
  } else if (['5m', '15m', '30m', '90m'].includes(yahooInterval) && diffDays > 55) {
      startDate.setTime(now.getTime() - (58 * 24 * 60 * 60 * 1000)); // Limit to 58 days
  } else if (['1h', '60m'].includes(yahooInterval) && diffDays > 720) {
       startDate.setTime(now.getTime() - (720 * 24 * 60 * 60 * 1000)); // Limit to ~2 years
  }

  try {
    const result = await yahooFinance.chart(symbol.toUpperCase(), {
      period1: startDate,
      period2: endDate,
      interval: yahooInterval
    });

    // Validating result
    if (!result || !result.quotes || result.quotes.length === 0) {
        return { symbol: symbol.toUpperCase(), interval, data: [] };
    }

    const isIntraday = ['1m', '5m', '15m', '30m', '1h', '60m'].includes(yahooInterval);
    
    const data = result.quotes.map(q => {
        // q.date is a Date object (usually)
        let time;
        if (isIntraday) {
            time = Math.floor(new Date(q.date).getTime() / 1000); // Unix timestamp
        } else {
            time = new Date(q.date).toISOString().split('T')[0];
        }
        
        return {
            time,
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume || 0
        };
    }).filter(candle => candle.open !== null && candle.close !== null);

    return {
      symbol: symbol.toUpperCase(),
      interval,
      data: data // Return FULL buffered data (no slicing) to enable frontend zoom-out
    };

  } catch (err) {
    console.error('Yahoo chart error:', err.message);
    throw err;
  }
}

/**
 * Map our interval format to Yahoo Finance format
 */
/**
 * Map our interval format to Yahoo Finance format
 */
function mapInterval(interval) {
  const mapping = {
    '1min': '1m', '1m': '1m',
    '5min': '5m', '5m': '5m',
    '15min': '15m', '15m': '15m',
    '30min': '30m', '30m': '30m',
    '1hour': '1h', '1h': '1h', '60m': '1h',
    '1day': '1d', '1d': '1d',
    '1week': '1wk', '1wk': '1wk', '1w': '1wk',
    '1month': '1mo', '1mo': '1mo'
  };
  return mapping[interval] || '1d';
}



/**
 * Get multiplier for date range calculation
 */
function getIntervalDays(interval) {
  // Normalize via mapInterval to handle aliases
  const yahooStr = mapInterval(interval);
  
  const mapping = {
    '1m': 0.0007, // ~1 min
    '5m': 0.0035,
    '15m': 0.01,
    '30m': 0.02,
    '1h': 0.04,
    '1d': 1,
    '1wk': 7,
    '1mo': 30
  };
  return mapping[yahooStr] || 1;
}

/**
 * Search for symbols matching a query
 * @param {string} query - Search query (company name or symbol)
 * @param {string} exchange - Optional exchange filter (e.g., 'NSE', 'NASDAQ')
 * @returns {Promise<Array>} Array of matching symbols
 */
export async function searchSymbols(query, exchange = null) {
  try {
    const results = await yahooFinance.search(query, { quotesCount: 20 });
    
    let quotes = results.quotes || [];
    
    // Filter to only equity types
    quotes = quotes.filter(q => q.quoteType === 'EQUITY');
    
    // Filter by exchange if specified
    if (exchange) {
      const exchangeUpper = exchange.toUpperCase();
      quotes = quotes.filter(q => {
        const qExchange = (q.exchange || '').toUpperCase();
        // Handle common exchange name variations
        if (exchangeUpper === 'NSE') {
          return qExchange === 'NSI' || qExchange === 'NSE';
        }
        if (exchangeUpper === 'BSE') {
          return qExchange === 'BSE' || qExchange === 'BOM';
        }
        if (exchangeUpper === 'NASDAQ') {
          return qExchange === 'NMS' || qExchange === 'NGM' || qExchange === 'NASDAQ';
        }
        if (exchangeUpper === 'NYSE') {
          return qExchange === 'NYQ' || qExchange === 'NYSE';
        }
        return qExchange.includes(exchangeUpper);
      });
    }
    
    return quotes.map(q => ({
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol,
      exchange: q.exchange || 'Unknown',
      type: q.quoteType || 'EQUITY'
    }));
  } catch (err) {
    console.error('Yahoo search error:', err.message);
    return [];
  }
}
