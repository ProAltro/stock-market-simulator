import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { submitCode, waitForSubmission, LANGUAGES } from "../judge0/judge0.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../../data");

const INITIAL_CASH = 100000;
const COMMODITIES = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"];

function generatePythonWrapper(dataBundle, userCode) {
  return `
import json
import sys

# ========== AUTO-INJECTED DATA ==========
_DATA = json.loads('''${JSON.stringify(dataBundle)}''')
_COMMODITIES = json.loads('''${JSON.stringify(COMMODITIES)}''')

# Trading state
_trades = []
_cash = ${INITIAL_CASH}.0
_positions = {c: 0 for c in _COMMODITIES}
_current_tick = 0

# ========== DATA ACCESS FUNCTIONS ==========

def get_commodities():
    """Returns list of commodity symbols"""
    return _COMMODITIES

def get_tick_count():
    """Returns total number of ticks (1,000,000)"""
    return len(_DATA)

def get_current_tick():
    """Returns current tick being processed"""
    return _current_tick

def get_ohlcv(symbol, start_tick=None, end_tick=None):
    """Get OHLCV data for a symbol (tick-level)"""
    data = _DATA.get(symbol.upper(), {}).get('ticks', [])
    if start_tick is not None:
        data = data[start_tick:]
    if end_tick is not None:
        data = data[:end_tick]
    return data

def get_orderbook(symbol, tick):
    """Get anonymized orderbook at a specific tick"""
    return _DATA.get(symbol.upper(), {}).get('orderbooks', {}).get(str(tick), {'bids': [], 'asks': []})

def get_news(tick):
    """Get news events at a specific tick"""
    return _DATA.get('_news', {}).get(str(tick), [])

def get_cash():
    """Get current cash balance"""
    return _cash

def get_positions():
    """Get all current positions"""
    return dict(_positions)

def get_position(symbol):
    """Get position for specific commodity"""
    return _positions.get(symbol.upper(), 0)

def get_price(symbol, tick=None):
    """Get current price for a commodity (last trade price)"""
    if tick is None:
        tick = _current_tick
    ticks = _DATA.get(symbol.upper(), {}).get('ticks', [])
    if tick < len(ticks):
        return ticks[tick].get('close', 0)
    return 0

def buy(symbol, quantity):
    """Buy commodity at market price"""
    global _cash, _positions, _trades
    symbol = symbol.upper()
    
    if symbol not in _COMMODITIES:
        print(f"Error: Unknown commodity {symbol}", file=sys.stderr)
        return False
    
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
        'tick': _current_tick,
        'type': 'BUY',
        'symbol': symbol,
        'quantity': quantity,
        'price': price,
        'cost': cost
    })
    return True

def sell(symbol, quantity):
    """Sell commodity at market price"""
    global _cash, _positions, _trades
    symbol = symbol.upper()
    
    if symbol not in _COMMODITIES:
        print(f"Error: Unknown commodity {symbol}", file=sys.stderr)
        return False
    
    current_qty = _positions.get(symbol, 0)
    if quantity > current_qty:
        print(f"Error: Insufficient {symbol} to sell", file=sys.stderr)
        return False
    
    price = get_price(symbol)
    proceeds = price * quantity
    _cash += proceeds
    _positions[symbol] = current_qty - quantity
    
    _trades.append({
        'tick': _current_tick,
        'type': 'SELL',
        'symbol': symbol,
        'quantity': quantity,
        'price': price,
        'proceeds': proceeds
    })
    return True

# ========== MAIN EXECUTION LOOP ==========
try:
    for _current_tick in range(len(_DATA)):
        # User's strategy runs for each tick
${userCode.split('\n').map(line => '        ' + line).join('\n')}
        
except Exception as e:
    print(f"Strategy Error: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)

# ========== CALCULATE FINAL NET WORTH ==========
final_prices = {}
for c in _COMMODITIES:
    ticks = _DATA.get(c, {}).get('ticks', [])
    if ticks:
        final_prices[c] = ticks[-1].get('close', 0)

positions_value = sum(_positions.get(c, 0) * final_prices.get(c, 0) for c in _COMMODITIES)
final_net_worth = _cash + positions_value

result = {
    'success': True,
    'finalNetWorth': round(final_net_worth, 2),
    'cash': round(_cash, 2),
    'positions': {k: v for k, v in _positions.items() if v != 0},
    'totalTrades': len(_trades),
    'trades': _trades[-100:]  # Last 100 trades
}

print(json.dumps(result))
`;
}

function generateCppWrapper(dataBundle, userCode) {
  const SYMBOLS = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"];

  // Sample every 10th tick so source stays a reasonable size
  const SAMPLE = 10;

  // Build price arrays per symbol
  const priceArrays = {};
  let tickCount = 0;
  for (const sym of SYMBOLS) {
    const ticks = dataBundle[sym]?.ticks || [];
    const sampled = [];
    for (let i = 0; i < ticks.length; i += SAMPLE) {
      sampled.push(Number(ticks[i]?.close || 0).toFixed(6));
    }
    priceArrays[sym] = sampled;
    if (sampled.length > tickCount) tickCount = sampled.length;
  }

  const toArray = (sym) => priceArrays[sym].join(',');

  // Strip #include lines and any outer int main() { ... } wrapper
  function sanitizeCppUserCode(code) {
    // Remove all #include lines
    code = code.replace(/^[ \t]*#include\s*[<"][^">\n]*[">]\s*$/gm, '');

    // If the entire code is wrapped in `int main() { ... return 0; }`, extract the body
    const mainMatch = code.match(/int\s+main\s*\(\s*\)\s*\{([\s\S]*?)(?:return\s+0\s*;)?\s*\}\s*$/);
    if (mainMatch) {
      code = mainMatch[1];
    }

    // If there's a for loop that iterates over ticks (old per-tick template), extract its body
    // e.g.: for (int tick = 0; tick < get_tick_count(); tick++) { ... }
    const forMatch = code.match(/for\s*\([^)]*get_tick_count[^)]*\)\s*\{([\s\S]*)\}\s*$/);
    if (forMatch) {
      code = forMatch[1];
    }

    return code.trim();
  }

  const sanitizedCode = sanitizeCppUserCode(userCode);

  return `#include <iostream>
#include <string>
#include <map>
#include <algorithm>

// ========== AUTO-INJECTED MARKET DATA (sampled) ==========
const int TICK_COUNT = ${tickCount};
static const double PRICES_OIL[${tickCount}]   = {${toArray("OIL")}};
static const double PRICES_STEEL[${tickCount}] = {${toArray("STEEL")}};
static const double PRICES_WOOD[${tickCount}]  = {${toArray("WOOD")}};
static const double PRICES_BRICK[${tickCount}] = {${toArray("BRICK")}};
static const double PRICES_GRAIN[${tickCount}] = {${toArray("GRAIN")}};

// ========== TRADING STATE ==========
static double   _cash          = ${INITIAL_CASH}.0;
static int      _positions_OIL   = 0;
static int      _positions_STEEL = 0;
static int      _positions_WOOD  = 0;
static int      _positions_BRICK = 0;
static int      _positions_GRAIN = 0;
static int      _trade_count   = 0;
static int      _current_tick  = 0;

// ========== API ==========
inline int    get_tick_count()    { return TICK_COUNT; }
inline int    get_current_tick()  { return _current_tick; }
inline double get_cash()          { return _cash; }

inline const double* _price_array(const std::string& s) {
    if (s=="OIL")   return PRICES_OIL;
    if (s=="STEEL") return PRICES_STEEL;
    if (s=="WOOD")  return PRICES_WOOD;
    if (s=="BRICK") return PRICES_BRICK;
    return PRICES_GRAIN; // Default to GRAIN if not found
}

inline int& _pos(const std::string& s) {
    if (s=="OIL")   return _positions_OIL;
    if (s=="STEEL") return _positions_STEEL;
    if (s=="WOOD")  return _positions_WOOD;
    if (s=="BRICK") return _positions_BRICK;
    return _positions_GRAIN;
}

inline double get_price(const std::string& symbol, int tick = -1) {
    if (tick < 0) tick = _current_tick;
    const double* arr = _price_array(symbol);
    if (!arr || tick >= TICK_COUNT) return 0.0;
    return arr[tick];
}

inline int get_position(const std::string& symbol) { return _pos(symbol); }

inline bool buy(const std::string& symbol, int quantity) {
    double price = get_price(symbol);
    double cost  = price * quantity;
    if (price <= 0 || cost > _cash) return false;
    _cash -= cost;
    _pos(symbol) += quantity;
    _trade_count++;
    return true;
}

inline bool sell(const std::string& symbol, int quantity) {
    if (get_position(symbol) < quantity) return false;
    double price = get_price(symbol);
    _cash += price * quantity;
    _pos(symbol) -= quantity;
    _trade_count++;
    return true;
}

// ========== USER STRATEGY ==========
void strategy() {
${sanitizedCode.split('\n').map(l => '    ' + l).join('\n')}
}

// ========== MAIN ==========
int main() {
    for (_current_tick = 0; _current_tick < TICK_COUNT; _current_tick++) {
        strategy();
    }

    // Final net worth
    double pv = 0;
    const char* syms[] = {"OIL","STEEL","WOOD","BRICK","GRAIN"};
    double finals[]    = {
        PRICES_OIL[TICK_COUNT-1],   PRICES_STEEL[TICK_COUNT-1],
        PRICES_WOOD[TICK_COUNT-1],  PRICES_BRICK[TICK_COUNT-1],
        PRICES_GRAIN[TICK_COUNT-1]
    };
    int* pos_arr[] = {
        &_positions_OIL, &_positions_STEEL, &_positions_WOOD,
        &_positions_BRICK, &_positions_GRAIN
    };
    for (int i=0;i<5;i++) pv += *pos_arr[i] * finals[i];

    std::cout << "{\\"success\\":true,\\"finalNetWorth\\":" << (_cash+pv)
              << ",\\"cash\\":" << _cash
              << ",\\"totalTrades\\":" << _trade_count << "}" << std::endl;
    return 0;
}
`;
}

function getJSONParserCpp() {
  return `
// Simplified JSON value type
struct JSONValue {
    std::map<std::string, JSONValue> object;
    std::vector<JSONValue> array;
    std::string string_val;
    double number_val = 0;
    bool is_array = false, is_object = false, is_string = false, is_number = false;
    
    JSONValue operator[](const std::string& key) { return object.count(key) ? object[key] : JSONValue(); }
    JSONValue operator[](size_t idx) { return idx < array.size() ? array[idx] : JSONValue(); }
    size_t size() { return array.size(); }
};
// Parser omitted for brevity - would be full implementation
`;
}

async function loadDataBundle() {
  const filePath = path.join(DATA_DIR, "full_1m.json");
  
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return data;
  }
  
  const devPath = path.join(DATA_DIR, "dev_100k.json");
  if (fs.existsSync(devPath)) {
    const data = JSON.parse(fs.readFileSync(devPath, "utf-8"));
    return data;
  }
  
  return generateMockData();
}

function generateMockData() {
  const ticks = 1000;
  const data = { _news: {} };
  
  const basePrices = { OIL: 75, STEEL: 120, WOOD: 45, BRICK: 25, GRAIN: 8 };
  
  for (const symbol of COMMODITIES) {
    data[symbol] = { ticks: [], orderbooks: {} };
    let price = basePrices[symbol];
    
    for (let t = 0; t < ticks; t++) {
      const change = (Math.random() - 0.5) * basePrices[symbol] * 0.02;
      price = Math.max(basePrices[symbol] * 0.5, Math.min(basePrices[symbol] * 1.5, price + change));
      
      data[symbol].ticks.push({
        tick: t,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price,
        volume: Math.floor(Math.random() * 1000) + 100,
      });
      
      data[symbol].orderbooks[t] = {
        bids: [
          { price: price * 0.999, quantity: Math.floor(Math.random() * 100) + 50 },
          { price: price * 0.998, quantity: Math.floor(Math.random() * 100) + 50 },
          { price: price * 0.997, quantity: Math.floor(Math.random() * 100) + 50 },
        ],
        asks: [
          { price: price * 1.001, quantity: Math.floor(Math.random() * 100) + 50 },
          { price: price * 1.002, quantity: Math.floor(Math.random() * 100) + 50 },
          { price: price * 1.003, quantity: Math.floor(Math.random() * 100) + 50 },
        ],
      };
      
      if (Math.random() < 0.01) {
        data._news[t] = [{
          symbol: COMMODITIES[Math.floor(Math.random() * COMMODITIES.length)],
          category: ["supply", "demand", "global", "political"][Math.floor(Math.random() * 4)],
          sentiment: ["positive", "negative", "neutral"][Math.floor(Math.random() * 3)],
          magnitude: Math.random() * 0.1,
          headline: "Sample news event",
        }];
      }
    }
  }
  
  return data;
}

export async function runAlgorithm(submissionId, code, language, prisma) {
  const startTime = Date.now();
  
  try {
    await prisma.algorithmSubmission.update({
      where: { id: submissionId },
      data: { status: "running" },
    });
    
    const dataBundle = await loadDataBundle();
    
    const wrappedCode = language === "python"
      ? generatePythonWrapper(dataBundle, code)
      : generateCppWrapper(dataBundle, code);
    
    const langId = language === "python" ? LANGUAGES.python3 : LANGUAGES.cpp;
    
    const submission = await submitCode(wrappedCode, langId, null, {
      cpu_time_limit: 60,
      memory_limit: 256000,
    });
    
    const result = await waitForSubmission(submission.token, 120, 1000);
    
    const executionTimeMs = Date.now() - startTime;
    
    if (result.status.id === 3) {
      try {
        const output = JSON.parse(result.stdout || "{}");
        
        await prisma.algorithmSubmission.update({
          where: { id: submissionId },
          data: {
            status: "completed",
            finalNetWorth: output.finalNetWorth || output.final_net_worth,
            cashBalance: output.cash,
            positions: output.positions || {},
            totalTrades: output.totalTrades || output.total_trades,
            executionTimeMs,
            stdout: result.stdout?.substring(0, 10000),
            completedAt: new Date(),
          },
        });
      } catch (parseError) {
        await prisma.algorithmSubmission.update({
          where: { id: submissionId },
          data: {
            status: "failed",
            error: `Failed to parse output: ${parseError.message}`,
            stdout: result.stdout?.substring(0, 10000),
            executionTimeMs,
            completedAt: new Date(),
          },
        });
      }
    } else {
      await prisma.algorithmSubmission.update({
        where: { id: submissionId },
        data: {
          status: "failed",
          error: result.stderr || result.compile_output || result.message || "Execution failed",
          stdout: result.stdout?.substring(0, 10000),
          executionTimeMs,
          completedAt: new Date(),
        },
      });
    }
  } catch (error) {
    await prisma.algorithmSubmission.update({
      where: { id: submissionId },
      data: {
        status: "failed",
        error: error.message,
        executionTimeMs: Date.now() - startTime,
        completedAt: new Date(),
      },
    });
  }
}
