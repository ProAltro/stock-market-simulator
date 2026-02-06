/**
 * Technical Indicators Service
 * Calculates common trading indicators from OHLCV data
 */

/**
 * Simple Moving Average
 * @param {number[]} data - Array of closing prices
 * @param {number} period - Number of periods
 * @returns {number[]} SMA values (null-padded for initial periods)
 */
export function calculateSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * Exponential Moving Average
 * @param {number[]} data - Array of closing prices
 * @param {number} period - Number of periods
 * @returns {number[]} EMA values
 */
export function calculateEMA(data, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      result.push(ema);
    } else {
      ema = (data[i] - ema) * multiplier + ema;
      result.push(ema);
    }
  }
  return result;
}

/**
 * Relative Strength Index
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - RSI period (typically 14)
 * @returns {number[]} RSI values (0-100)
 */
export function calculateRSI(closes, period = 14) {
  const result = [];
  const gains = [];
  const losses = [];
  
  // Calculate price changes
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // First RSI uses simple average
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  result.push(null); // First price has no change
  for (let i = 0; i < period; i++) {
    result.push(null);
  }
  
  // First RSI value
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - (100 / (1 + rs)));
  
  // Smoothed RSI
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - (100 / (1 + rs)));
  }
  
  return result;
}

/**
 * MACD (Moving Average Convergence Divergence)
 * @param {number[]} closes - Array of closing prices
 * @param {number} fastPeriod - Fast EMA period (default 12)
 * @param {number} slowPeriod - Slow EMA period (default 26)
 * @param {number} signalPeriod - Signal line period (default 9)
 * @returns {Object} { macd, signal, histogram }
 */
export function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);
  
  // MACD line = Fast EMA - Slow EMA
  const macdLine = fastEMA.map((fast, i) => {
    if (fast === null || slowEMA[i] === null) return null;
    return fast - slowEMA[i];
  });
  
  // Signal line = EMA of MACD line
  const validMacd = macdLine.filter(v => v !== null);
  const signalEMA = calculateEMA(validMacd, signalPeriod);
  
  // Pad signal line to match original length
  const signal = [];
  let signalIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) {
      signal.push(null);
    } else {
      signal.push(signalEMA[signalIdx] || null);
      signalIdx++;
    }
  }
  
  // Histogram = MACD - Signal
  const histogram = macdLine.map((macd, i) => {
    if (macd === null || signal[i] === null) return null;
    return macd - signal[i];
  });
  
  return { macd: macdLine, signal, histogram };
}

/**
 * Bollinger Bands
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - SMA period (default 20)
 * @param {number} stdDev - Standard deviation multiplier (default 2)
 * @returns {Object} { upper, middle, lower, percentB, bandwidth }
 */
export function calculateBollingerBands(closes, period = 20, stdDev = 2) {
  const middle = calculateSMA(closes, period);
  const upper = [];
  const lower = [];
  const percentB = [];
  const bandwidth = [];
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
      percentB.push(null);
      bandwidth.push(null);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      
      const upperBand = mean + stdDev * std;
      const lowerBand = mean - stdDev * std;
      
      upper.push(upperBand);
      lower.push(lowerBand);
      percentB.push((closes[i] - lowerBand) / (upperBand - lowerBand));
      bandwidth.push((upperBand - lowerBand) / mean);
    }
  }
  
  return { upper, middle, lower, percentB, bandwidth };
}

/**
 * Average True Range (ATR)
 * @param {Object[]} candles - Array of { high, low, close }
 * @param {number} period - ATR period (default 14)
 * @returns {number[]} ATR values
 */
export function calculateATR(candles, period = 14) {
  const trueRanges = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }
  }
  
  // ATR is smoothed average of TR
  const result = [];
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      result.push(atr);
    } else {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      result.push(atr);
    }
  }
  
  return result;
}

/**
 * On-Balance Volume (OBV)
 * @param {number[]} closes - Array of closing prices
 * @param {number[]} volumes - Array of volumes
 * @returns {number[]} OBV values
 */
export function calculateOBV(closes, volumes) {
  const result = [volumes[0]];
  
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      result.push(result[i - 1] + volumes[i]);
    } else if (closes[i] < closes[i - 1]) {
      result.push(result[i - 1] - volumes[i]);
    } else {
      result.push(result[i - 1]);
    }
  }
  
  return result;
}

/**
 * Volume Weighted Average Price (VWAP)
 * @param {Object[]} candles - Array of { high, low, close, volume }
 * @returns {number[]} VWAP values
 */
export function calculateVWAP(candles) {
  const result = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    result.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null);
  }
  
  return result;
}

/**
 * Stochastic Oscillator
 * @param {Object[]} candles - Array of { high, low, close }
 * @param {number} kPeriod - %K period (default 14)
 * @param {number} dPeriod - %D smoothing period (default 3)
 * @returns {Object} { k, d }
 */
export function calculateStochastic(candles, kPeriod = 14, dPeriod = 3) {
  const kValues = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      kValues.push(null);
    } else {
      const slice = candles.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      const currentClose = candles[i].close;
      
      const k = highestHigh === lowestLow ? 50 : 
        ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
      kValues.push(k);
    }
  }
  
  // %D is SMA of %K
  const dValues = calculateSMA(kValues.filter(v => v !== null), dPeriod);
  
  // Pad D values
  const d = [];
  let dIdx = 0;
  for (let i = 0; i < kValues.length; i++) {
    if (kValues[i] === null) {
      d.push(null);
    } else {
      d.push(dValues[dIdx] || null);
      dIdx++;
    }
  }
  
  return { k: kValues, d };
}

/**
 * Average Directional Index (ADX)
 * @param {Object[]} candles - Array of { high, low, close }
 * @param {number} period - ADX period (default 14)
 * @returns {Object} { adx, plusDI, minusDI }
 */
export function calculateADX(candles, period = 14) {
  const plusDM = [];
  const minusDM = [];
  const tr = [];
  
  // Calculate +DM, -DM, and TR
  for (let i = 1; i < candles.length; i++) {
    const highDiff = candles[i].high - candles[i - 1].high;
    const lowDiff = candles[i - 1].low - candles[i].low;
    
    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
    
    const trValue = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    tr.push(trValue);
  }
  
  // Smooth with Wilder's method
  const smoothedPlusDM = [];
  const smoothedMinusDM = [];
  const smoothedTR = [];
  
  let sumPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let sumMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let sumTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  
  for (let i = 0; i < plusDM.length; i++) {
    if (i < period - 1) {
      smoothedPlusDM.push(null);
      smoothedMinusDM.push(null);
      smoothedTR.push(null);
    } else if (i === period - 1) {
      smoothedPlusDM.push(sumPlusDM);
      smoothedMinusDM.push(sumMinusDM);
      smoothedTR.push(sumTR);
    } else {
      sumPlusDM = sumPlusDM - sumPlusDM / period + plusDM[i];
      sumMinusDM = sumMinusDM - sumMinusDM / period + minusDM[i];
      sumTR = sumTR - sumTR / period + tr[i];
      smoothedPlusDM.push(sumPlusDM);
      smoothedMinusDM.push(sumMinusDM);
      smoothedTR.push(sumTR);
    }
  }
  
  // Calculate +DI and -DI
  const plusDI = smoothedPlusDM.map((dm, i) => {
    if (dm === null || smoothedTR[i] === null || smoothedTR[i] === 0) return null;
    return (dm / smoothedTR[i]) * 100;
  });
  
  const minusDI = smoothedMinusDM.map((dm, i) => {
    if (dm === null || smoothedTR[i] === null || smoothedTR[i] === 0) return null;
    return (dm / smoothedTR[i]) * 100;
  });
  
  // Calculate DX and ADX
  const dx = plusDI.map((plus, i) => {
    if (plus === null || minusDI[i] === null) return null;
    const sum = plus + minusDI[i];
    return sum === 0 ? 0 : (Math.abs(plus - minusDI[i]) / sum) * 100;
  });
  
  // ADX is smoothed DX
  const validDx = dx.filter(v => v !== null);
  const adxValues = calculateSMA(validDx, period);
  
  // Pad ADX values
  const adx = [null]; // First candle has no data
  let adxIdx = 0;
  for (let i = 0; i < dx.length; i++) {
    if (dx[i] === null) {
      adx.push(null);
    } else {
      adx.push(adxValues[adxIdx] || null);
      adxIdx++;
    }
  }
  
  return { 
    adx, 
    plusDI: [null, ...plusDI], 
    minusDI: [null, ...minusDI] 
  };
}

/**
 * Williams %R
 * @param {Object[]} candles - Array of { high, low, close }
 * @param {number} period - Lookback period (default 14)
 * @returns {number[]} Williams %R values (-100 to 0)
 */
export function calculateWilliamsR(candles, period = 14) {
  const result = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      const currentClose = candles[i].close;
      
      const wr = highestHigh === lowestLow ? -50 :
        ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
      result.push(wr);
    }
  }
  
  return result;
}

/**
 * Commodity Channel Index (CCI)
 * @param {Object[]} candles - Array of { high, low, close }
 * @param {number} period - CCI period (default 20)
 * @returns {number[]} CCI values
 */
export function calculateCCI(candles, period = 20) {
  const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
  const sma = calculateSMA(typicalPrices, period);
  const result = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = typicalPrices.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const meanDeviation = slice.reduce((sum, tp) => sum + Math.abs(tp - mean), 0) / period;
      
      const cci = meanDeviation === 0 ? 0 : (typicalPrices[i] - mean) / (0.015 * meanDeviation);
      result.push(cci);
    }
  }
  
  return result;
}

/**
 * Calculate all indicators for a given OHLCV dataset
 * @param {Object[]} candles - Array of { time, open, high, low, close, volume }
 * @returns {Object} All calculated indicators
 */
export function calculateAllIndicators(candles) {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume || 0);
  
  return {
    sma_10: calculateSMA(closes, 10),
    sma_20: calculateSMA(closes, 20),
    sma_50: calculateSMA(closes, 50),
    sma_200: calculateSMA(closes, 200),
    ema_12: calculateEMA(closes, 12),
    ema_26: calculateEMA(closes, 26),
    rsi_14: calculateRSI(closes, 14),
    macd: calculateMACD(closes),
    bollinger: calculateBollingerBands(closes),
    atr_14: calculateATR(candles, 14),
    obv: calculateOBV(closes, volumes),
    vwap: calculateVWAP(candles),
    stochastic: calculateStochastic(candles),
    adx: calculateADX(candles),
    williamsR: calculateWilliamsR(candles),
    cci: calculateCCI(candles),
  };
}

/**
 * Calculate rolling correlation between two price series
 * @param {number[]} series1 - First price series
 * @param {number[]} series2 - Second price series
 * @param {number} period - Correlation window (default 20)
 * @returns {number[]} Correlation values (-1 to 1)
 */
export function calculateCorrelation(series1, series2, period = 20) {
  const result = [];
  const minLen = Math.min(series1.length, series2.length);
  
  for (let i = 0; i < minLen; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice1 = series1.slice(i - period + 1, i + 1);
      const slice2 = series2.slice(i - period + 1, i + 1);
      
      const mean1 = slice1.reduce((a, b) => a + b, 0) / period;
      const mean2 = slice2.reduce((a, b) => a + b, 0) / period;
      
      let numerator = 0;
      let denom1 = 0;
      let denom2 = 0;
      
      for (let j = 0; j < period; j++) {
        const diff1 = slice1[j] - mean1;
        const diff2 = slice2[j] - mean2;
        numerator += diff1 * diff2;
        denom1 += diff1 * diff1;
        denom2 += diff2 * diff2;
      }
      
      const denom = Math.sqrt(denom1 * denom2);
      result.push(denom === 0 ? 0 : numerator / denom);
    }
  }
  
  return result;
}
