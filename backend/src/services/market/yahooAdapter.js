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
  
  // Strict limits for intraday data to avoid Yahoo defaulting to daily
  // 1m: max 7 days
  // 5m, 15m, 30m: max 60 days
  // 1h: max 730 days
  
  // Intraday Data Logic with Zoom Buffer
  // We want to load slightly MORE data than requested to allow zooming out,
  // but we must strictly respect Yahoo's limits to avoid daily data fallback.
  
  const isIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h'].includes(yahooInterval);
  
  if (isIntraday) {
      // Step 1: Determine requested range
      let requestedDays = 1;
      if (range === '1d') requestedDays = 1;
      else if (range === '5d') requestedDays = 5;
      else if (range === '1mo') requestedDays = 30;
      else if (range === '3mo') requestedDays = 90;
      
      // Step 2: Add 20% Zoom Buffer
      let bufferedDays = Math.ceil(requestedDays * 1.2);
      
      // Step 3: Apply Strict Safety Limits (Hard Caps)
      // 1m: Max 7 days (Safe: 5)
      // 5m-30m: Max 60 days (Safe: 55)
      // 60m-1h: Max 730 days (Safe: 700)
      
      if (yahooInterval === '1m') {
          // 1-minute data is very limited
          bufferedDays = Math.min(bufferedDays, 5); 
      } else if (['2m', '5m', '15m', '30m', '90m'].includes(yahooInterval)) {
          // Standard intraday limit
          bufferedDays = Math.min(bufferedDays, 55); 
      } else if (['1h', '60m'].includes(yahooInterval)) {
          // Hourly limit
          bufferedDays = Math.min(bufferedDays, 700); 
      }
      
      startDate.setDate(startDate.getDate() - bufferedDays);
      
  } else {
      // Daily/Weekly/Monthly logic
      // Add standard buffer for zooming
      if (range === '1d') startDate.setDate(startDate.getDate() - 35); // 1mo + buffer
      else if (range === '5d') startDate.setDate(startDate.getDate() - 70); // 2mo + buffer
      else if (range === '1wk') startDate.setMonth(startDate.getMonth() - 2);
      else if (range === '1mo') startDate.setFullYear(startDate.getFullYear() - 1); // 1y default
      else if (range === '3mo') startDate.setFullYear(startDate.getFullYear() - 1);
      else if (range === '1y') startDate.setFullYear(startDate.getFullYear() - 2);
      else if (range === '5y') startDate.setFullYear(startDate.getFullYear() - 6);
      else startDate.setFullYear(startDate.getFullYear() - 2);
  }

  try {
    const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    console.log(`Yahoo Request: ${symbol} ${yahooInterval} ${startDate.toISOString()} -> ${endDate.toISOString()} (${diffDays} days)`);
    
    // For intraday, we MUST use query options that force the new chart API
    // yahoo-finance2 chart() uses query2.finance.yahoo.com by default which is what we want
    
    // If we request too much data or invalid range, Yahoo silently falls back to 1d
    // So we must be precise.
    
    const queryOptions = {
      period1: startDate,
      period2: endDate,
      interval: yahooInterval,
      includePrePost: false // Pre-market data can sometimes mess up the intervals
    };

    const result = await yahooFinance.chart(symbol.toUpperCase(), queryOptions);

    // Validate result
    if (!result || !result.quotes || result.quotes.length === 0) {
        return { symbol: symbol.toUpperCase(), interval, data: [] };
    }
    
    const data = result.quotes.map(q => {
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
      data: data,
      debug: {
        yahooInterval,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        requestedInterval: interval,
        requestedRange: range,
        diffDays
      }
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
