/**
 * Backtest Runner Service
 * Orchestrates backtesting by fetching data, computing indicators,
 * wrapping user code, and executing via Judge0
 */

import { getHistory, getQuote } from "../market/index.js";
import {
  calculateAllIndicators,
  calculateCorrelation,
} from "../indicators/indicators.js";
import { submitCode, waitForSubmission, LANGUAGES } from "../judge0/judge0.js";
import { getRateToUSD } from "../currency/index.js";

/**
 * Generate the Python template that wraps user code
 * @param {Object} dataBundle - Pre-fetched OHLCV and indicator data
 * @param {string} userCode - User's Python code
 * @param {string[]} symbols - List of symbols used in backtest
 * @returns {string} Complete Python code to execute
 */
function generatePythonWrapper(dataBundle, userCode, symbols) {
  return `
import json
import sys

# ========== AUTO-INJECTED DATA ==========
_DATA = json.loads('''${JSON.stringify(dataBundle)}''')
_SYMBOLS = json.loads('''${JSON.stringify(symbols)}''')

# Trading state
_trades = []
_cash = 100000.0
_initial_cash = 100000.0
_positions = {}
_current_prices = {}

# Initialize current prices from latest candle
for symbol, data in _DATA.items():
    if data.get('ohlcv') and len(data['ohlcv']) > 0:
        _current_prices[symbol] = data['ohlcv'][-1]['close']

# ========== DATA ACCESS FUNCTIONS ==========

def get_ohlcv(symbol, timeframe=None, start_date=None, end_date=None):
    """Get OHLCV data for a symbol"""
    data = _DATA.get(symbol.upper(), {}).get('ohlcv', [])
    return data

def get_sma(symbol, period):
    """Get Simple Moving Average"""
    key = f'sma_{period}'
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get(key, [])

def get_ema(symbol, period):
    """Get Exponential Moving Average"""
    key = f'ema_{period}'
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get(key, [])

def get_rsi(symbol, period=14):
    """Get Relative Strength Index"""
    key = f'rsi_{period}'
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get(key, [])

def get_macd(symbol):
    """Get MACD (returns dict with macd, signal, histogram)"""
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get('macd', {})

def get_bollinger(symbol, period=20, std=2):
    """Get Bollinger Bands (returns dict with upper, middle, lower, percentB, bandwidth)"""
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get('bollinger', {})

def get_atr(symbol, period=14):
    """Get Average True Range"""
    key = f'atr_{period}'
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get(key, [])

def get_stochastic(symbol, k_period=14, d_period=3):
    """Get Stochastic Oscillator (returns dict with k, d)"""
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get('stochastic', {})

def get_adx(symbol, period=14):
    """Get ADX (returns dict with adx, plusDI, minusDI)"""
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get('adx', {})

def get_obv(symbol):
    """Get On-Balance Volume"""
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get('obv', [])

def get_vwap(symbol):
    """Get Volume Weighted Average Price"""
    return _DATA.get(symbol.upper(), {}).get('indicators', {}).get('vwap', [])

def get_correlation(symbol1, symbol2, period=20):
    """Get correlation between two symbols"""
    key = f'corr_{symbol1.upper()}_{symbol2.upper()}'
    return _DATA.get('_correlations', {}).get(key, [])

# ========== TRADING FUNCTIONS ==========

def get_price(symbol):
    """Get current price for a symbol"""
    return _current_prices.get(symbol.upper(), 0)

def get_cash():
    """Get available cash"""
    return _cash

def get_positions():
    """Get current positions"""
    return dict(_positions)

def get_position(symbol):
    """Get position for a specific symbol"""
    return _positions.get(symbol.upper(), 0)

def buy(symbol, quantity, price=None):
    """Buy shares of a symbol"""
    global _cash, _positions
    symbol = symbol.upper()
    
    if price is None:
        price = get_price(symbol)
    
    if price <= 0:
        print(f"Error: Invalid price for {symbol}", file=sys.stderr)
        return False
    
    cost = price * quantity
    if cost > _cash:
        print(f"Error: Insufficient cash for {symbol} purchase", file=sys.stderr)
        return False
    
    _cash -= cost
    _positions[symbol] = _positions.get(symbol, 0) + quantity
    _trades.append({
        'type': 'BUY',
        'symbol': symbol,
        'quantity': quantity,
        'price': price,
        'cost': cost
    })
    return True

def sell(symbol, quantity, price=None):
    """Sell shares of a symbol"""
    global _cash, _positions
    symbol = symbol.upper()
    
    if price is None:
        price = get_price(symbol)
    
    current_qty = _positions.get(symbol, 0)
    if quantity > current_qty:
        print(f"Error: Insufficient shares of {symbol}", file=sys.stderr)
        return False
    
    proceeds = price * quantity
    _cash += proceeds
    _positions[symbol] = current_qty - quantity
    
    if _positions[symbol] == 0:
        del _positions[symbol]
    
    _trades.append({
        'type': 'SELL',
        'symbol': symbol,
        'quantity': quantity,
        'price': price,
        'proceeds': proceeds
    })
    return True

# ========== USER CODE ==========
try:
${
  userCode.includes("_SYMBOLS")
    ? ""
    : `
    if _SYMBOLS:
        # Convenience: if user didn't define symbol, use first one
        symbol = _SYMBOLS[0]
`
}
${userCode
  .split("\n")
  .map((line) => "    " + line)
  .join("\n")}
except Exception as e:
    print(f"Strategy Error: {e}", file=sys.stderr)

# ========== CALCULATE RESULTS ==========
portfolio_value = _cash
for symbol, qty in _positions.items():
    portfolio_value += qty * get_price(symbol)

# ========== CALCULATE RESULTS ==========
import math

portfolio_value = _cash
positions_value = 0
for symbol, qty in _positions.items():
    price = get_price(symbol)
    value = qty * price
    positions_value += value
    portfolio_value += value

total_return = portfolio_value - _initial_cash
if _initial_cash != 0:
    return_percent = (total_return / _initial_cash) * 100
else:
    return_percent = 0

# --- Advanced Metrics ---

# 1. Trade Analysis
winning_trades = 0
losing_trades = 0
gross_profit = 0
gross_loss = 0
total_closed_trades = 0

for trade in _trades:
    if trade['type'] == 'SELL':
        total_closed_trades += 1
        # Simple P&L estimate (FIFO matching is complex, approximating with trade proceeds vs avg cost)
        # Note: accurate P&L per trade requires a trade matching engine (FIFO/LIFO). 
        # For this simplified runner, we'll verify profitability if proceeds > cost (if available) or track gross P&L.
        
        # Since we don't strictly track cost per specific sell trade in this simple wrapper,
        # we calculate profit factor from the final Gross Profit / Gross Loss of the portfolio? 
        # Or better: We can infer trade P&L if we stored cost basis.
        # Let's rely on global portfolio performance statistics for robust metrics.
        pass

# Determine Win Rate and Profit Factor via trade matching (simplified)
# We will iterate trades and try to match buys/sells to estimate performance
# This is a basic estimator.
trade_pnl = []
temp_inventory = {} # symbol -> [prices]

for trade in _trades:
    sym = trade['symbol']
    if trade['type'] == 'BUY':
        if sym not in temp_inventory: temp_inventory[sym] = []
        for _ in range(trade['quantity']):
            temp_inventory[sym].append(trade['cost'] / trade['quantity'])
    elif trade['type'] == 'SELL':
        if sym in temp_inventory and temp_inventory[sym]:
            # FIFO
            buy_price = temp_inventory[sym].pop(0)
            sell_price = trade['proceeds'] / trade['quantity']
            pnl = (sell_price - buy_price) * trade['quantity']
            trade_pnl.append(pnl)
            if pnl > 0:
                winning_trades += 1
                gross_profit += pnl
            else:
                losing_trades += 1
                gross_loss += abs(pnl)

win_rate = (winning_trades / len(trade_pnl) * 100) if len(trade_pnl) > 0 else 0
profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else 999.0 if gross_profit > 0 else 0

# 2. Risk & Exposure
# Calculate Max Invested Capital (Exposure) and Drawdown
# utilizing the same FIFO matching as above for accuracy.

current_invested = 0
max_invested_capital = 0
temp_inventory_risk = {} # separate inventory for risk calc

cumulative_pnl = 0
peak_cumulative_pnl = 0
max_dd_dollar = 0

for trade in _trades:
    sym = trade['symbol']
    
    if trade['type'] == 'BUY':
        # Exposure
        current_invested += trade['cost']
        max_invested_capital = max(max_invested_capital, current_invested)
        
        # Risk Inventory
        if sym not in temp_inventory_risk: temp_inventory_risk[sym] = []
        for _ in range(trade['quantity']):
            temp_inventory_risk[sym].append(trade['cost'] / trade['quantity'])
            
    elif trade['type'] == 'SELL':
        # Exposure Reduction
        if sym in temp_inventory_risk and temp_inventory_risk[sym]:
            cost_basis_removed = 0
            qty = trade['quantity']
            # Remove cost basis for sold shares
            for _ in range(min(qty, len(temp_inventory_risk[sym]))):
                cost_basis_removed += temp_inventory_risk[sym].pop(0)
            
            current_invested -= cost_basis_removed
        
        # Drawdown Calculation (realized P&L basis)
        # We can reuse the trade_pnl list logic or calc here. 
        # For simplicity, let's use the trade_pnl list we already built in step 1.
        pass

# Calculate Drawdown from the trade_pnl list (created in Step 1)
cum_pnl = 0
peak_pnl = 0
max_dd_dollar = 0

for pnl in trade_pnl:
    cum_pnl += pnl
    peak_pnl = max(peak_pnl, cum_pnl)
    dd = peak_pnl - cum_pnl
    max_dd_dollar = max(max_dd_dollar, dd)

    
    # Update running equity after every closed trade (realized)
    # Ideally should be daily mark-to-market.
    
# Better Approach for Volatility/Sharpe in this constraint:
# We only have Start and End values reliably without re-simulation.
# We will return placeholders for daily-dependent metrics (Sharpe, Volatility) 
# or calculate them based on realized trade returns.

max_drawdown_percent = (max_dd_dollar / _initial_cash) * 100 if _initial_cash > 0 else 0

# Return on Max Exposure (ROI on capital actually used)
return_on_exposure = (total_return / max_invested_capital * 100) if max_invested_capital > 0 else 0

# Output results as JSON
result = {
    'success': True,
    'portfolio_value': round(portfolio_value, 2),
    'cash': round(_cash, 2),
    'positions': {k: v for k, v in _positions.items()},
    'total_return': round(total_return, 2),
    'return_percent': round(return_percent, 2),
    'total_trades': len(_trades),
    'trades': _trades[-50:], # limit size
    
    # Quant Metrics
    'metrics': {
        'win_rate': round(win_rate, 2),
        'profit_factor': round(profit_factor, 2),
        'max_drawdown': round(max_drawdown_percent, 2),
        'max_exposure': round(max_invested_capital, 2),
        'return_on_exposure': round(return_on_exposure, 2),
        'sharpe_ratio': 0.0, 
        'volatility': 0.0 
    },
    'debug': {
        'analyzed_symbols': _SYMBOLS,
        'data_counts': {s: len(get_ohlcv(s)) for s in _SYMBOLS}
    }
}
print(json.dumps(result))
`;
}

/**
 * Run a backtest
 * @param {Object} params - Backtest parameters
 * @param {string[]} params.symbols - Symbols to include
 * @param {string} params.timeframe - Timeframe (1d, 5d, 1mo, 3mo, 1y, etc.)
 * @param {string} params.interval - Candle interval (5m, 15m, 1h, 1d, 1wk)
 * @param {string} params.code - User's Python code
 * @returns {Promise<Object>} Backtest results
 */
export async function runBacktest({
  symbols,
  timeframe = "3mo",
  interval = "1d",
  code,
}) {
  // Map timeframe to range for Yahoo API
  const rangeMap = {
    "1d": "1d",
    "5d": "5d",
    "1w": "5d",
    "1mo": "1mo",
    "3mo": "3mo",
    "6mo": "6mo",
    "1y": "1y",
    "2y": "2y",
    "5y": "5y",
  };
  const range = rangeMap[timeframe] || "3mo";

  // Fetch data for all symbols
  const dataBundle = {};

  for (const symbol of symbols) {
    try {
      // Fetch OHLCV
      const history = await getHistory(symbol, { interval, range });
      const candles = history.data || [];

      // Calculate indicators
      const indicators = calculateAllIndicators(candles);

      // Get current quote for latest price
      let currentPrice = null;
      let quoteCurrency = "USD";
      try {
        const quote = await getQuote(symbol);
        currentPrice = quote.price;
        quoteCurrency = (quote.currency || "USD").toUpperCase();
      } catch (e) {
        // Use last candle close if quote fails
        if (candles.length > 0) {
          currentPrice = candles[candles.length - 1].close;
        }
      }

      dataBundle[symbol.toUpperCase()] = {
        ohlcv: candles,
        indicators,
        currentPrice,
        currency: quoteCurrency,
      };
    } catch (error) {
      console.error(`Failed to fetch data for ${symbol}:`, error.message);
      dataBundle[symbol.toUpperCase()] = {
        ohlcv: [],
        indicators: {},
        currentPrice: null,
        currency: "USD",
      };
    }
  }

  // Calculate cross-symbol correlations for common pairs
  if (symbols.length >= 2) {
    dataBundle._correlations = {};
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const sym1 = symbols[i].toUpperCase();
        const sym2 = symbols[j].toUpperCase();
        const closes1 = (dataBundle[sym1]?.ohlcv || []).map((c) => c.close);
        const closes2 = (dataBundle[sym2]?.ohlcv || []).map((c) => c.close);

        if (closes1.length > 0 && closes2.length > 0) {
          const corr = calculateCorrelation(closes1, closes2, 20);
          dataBundle._correlations[`corr_${sym1}_${sym2}`] = corr;
        }
      }
    }
  }

  // Generate Python code with injected data
  const wrappedCode = generatePythonWrapper(dataBundle, code, symbols);

  // Submit to Judge0
  const submission = await submitCode(wrappedCode, LANGUAGES.python3);

  // Wait for execution
  const result = await waitForSubmission(submission.token);

  // Parse result
  if (result.status.id === 3) {
    // Accepted - execution successful
    try {
      const output = JSON.parse(result.stdout || "{}");

      // Determine the primary currency of the backtest (from first symbol)
      const primarySymbol = symbols[0]?.toUpperCase();
      const backtestCurrency = dataBundle[primarySymbol]?.currency || "USD";

      return {
        success: true,
        ...output,
        currency: backtestCurrency,
        currencyNote:
          backtestCurrency !== "USD"
            ? `All monetary values are in ${backtestCurrency}. Starting cash: 100,000 ${backtestCurrency}.`
            : undefined,
        executionTime: result.time,
        memoryUsed: result.memory,
      };
    } catch (e) {
      return {
        success: false,
        error: "Failed to parse output",
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
  } else {
    // Execution failed
    return {
      success: false,
      status: result.status.description,
      error: result.stderr || result.compile_output || result.message,
      stdout: result.stdout,
    };
  }
}

/**
 * Get example strategy templates
 */
export function getStrategyTemplates() {
  return [
    {
      name: "Simple SMA Crossover",
      description:
        "Buy when short SMA crosses above long SMA, sell when it crosses below",
      code: `# Simple SMA Crossover Strategy
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
    },
    {
      name: "RSI Mean Reversion",
      description: "Buy when RSI is oversold (<30), sell when overbought (>70)",
      code: `# RSI Mean Reversion Strategy
symbol = _SYMBOLS[0]
data = get_ohlcv(symbol)
rsi = get_rsi(symbol, 14)

for i in range(14, len(data)):
    if rsi[i] is not None:
        price = data[i]['close']
        
        # Buy when oversold
        if rsi[i] < 30 and get_position(symbol) == 0:
            qty = int(get_cash() * 0.5 / price)  # Use 50% of cash
            if qty > 0:
                buy(symbol, qty, price)
        
        # Sell when overbought
        elif rsi[i] > 70 and get_position(symbol) > 0:
            sell(symbol, get_position(symbol), price)
`,
    },
    {
      name: "MACD Momentum",
      description: "Trade based on MACD histogram direction",
      code: `# MACD Momentum Strategy
symbol = _SYMBOLS[0]
data = get_ohlcv(symbol)
macd = get_macd(symbol)
macd_line = macd.get('macd', [])
signal_line = macd.get('signal', [])

for i in range(30, len(data)):
    if macd_line[i] is not None and signal_line[i] is not None:
        price = data[i]['close']
        
        # Buy when MACD crosses above signal
        if macd_line[i] > signal_line[i] and macd_line[i-1] <= signal_line[i-1]:
            if get_position(symbol) == 0:
                qty = int(get_cash() * 0.8 / price)
                if qty > 0:
                    buy(symbol, qty, price)
        
        # Sell when MACD crosses below signal
        elif macd_line[i] < signal_line[i] and macd_line[i-1] >= signal_line[i-1]:
            if get_position(symbol) > 0:
                sell(symbol, get_position(symbol), price)
`,
    },
    {
      name: "Bollinger Breakout",
      description: "Buy when price closes above upper band",
      code: `# Bollinger Band Breakout Strategy
symbol = _SYMBOLS[0]
data = get_ohlcv(symbol)
bb = get_bollinger(symbol, 20, 2)
upper = bb.get('upper', [])
lower = bb.get('lower', [])

for i in range(20, len(data)):
    if upper[i] is not None:
        price = data[i]['close']
        
        # Buy breakout above upper band
        if price > upper[i] and data[i-1]['close'] <= upper[i-1]:
            if get_position(symbol) == 0:
                buy(symbol, 10, price)
        
        # Sell breakdown below middle (mean reversion) or lower band
        elif price < lower[i]:
            if get_position(symbol) > 0:
                sell(symbol, get_position(symbol), price)
`,
    },
    {
      name: "Stochastic Oscillator",
      description: "Enter on oversold/overbought crosses",
      code: `# Stochastic Oscillator Strategy
symbol = _SYMBOLS[0]
data = get_ohlcv(symbol)
stoch = get_stochastic(symbol, 14, 3)
k_line = stoch.get('k', [])
d_line = stoch.get('d', [])

for i in range(14, len(data)):
    if k_line[i] is not None:
        price = data[i]['close']
        
        # Buy when K crosses above 20 (oversold)
        if k_line[i] > 20 and k_line[i-1] <= 20:
             if get_position(symbol) == 0:
                 buy(symbol, 10, price)

        # Sell when K crosses below 80 (overbought)
        elif k_line[i] < 80 and k_line[i-1] >= 80:
             if get_position(symbol) > 0:
                 sell(symbol, get_position(symbol), price)
`,
    },
    {
      name: "VWAP Trend",
      description: "Buy when price is above VWAP",
      code: `# VWAP Trend Following Strategy
symbol = _SYMBOLS[0]
data = get_ohlcv(symbol)
vwap = get_vwap(symbol)

for i in range(1, len(data)):
    if vwap[i] is not None:
        price = data[i]['close']
        
        # Buy when price crosses above VWAP
        if price > vwap[i] and data[i-1]['close'] <= vwap[i-1]:
             if get_position(symbol) == 0:
                 buy(symbol, 10, price)

        # Sell when price crosses below VWAP
        elif price < vwap[i] and data[i-1]['close'] >= vwap[i-1]:
             if get_position(symbol) > 0:
                 sell(symbol, get_position(symbol), price)
`,
    },
  ];
}
