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
  return `
#include <iostream>
#include <vector>
#include <map>
#include <string>
#include <sstream>
#include <cmath>

// JSON parsing (simple embedded parser)
${getJSONParserCpp()}

// ========== AUTO-INJECTED DATA ==========
std::string _RAW_DATA = R"(${JSON.stringify(dataBundle)})";
auto _DATA = parseJSON(_RAW_DATA);
std::vector<std::string> _COMMODITIES = {"OIL", "STEEL", "WOOD", "BRICK", "GRAIN"};

// Trading state
double _cash = ${INITIAL_CASH}.0;
std::map<std::string, int> _positions;
std::vector<Trade> _trades;
int _current_tick = 0;

// ========== DATA ACCESS FUNCTIONS ==========

std::vector<std::string> get_commodities() { return _COMMODITIES; }
int get_tick_count() { return _DATA["OIL"]["ticks"].size(); }
int get_current_tick() { return _current_tick; }

double get_cash() { return _cash; }
std::map<std::string, int> get_positions() { return _positions; }
int get_position(const std::string& symbol) { 
    auto it = _positions.find(symbol);
    return it != _positions.end() ? it->second : 0;
}

double get_price(const std::string& symbol, int tick = -1) {
    if (tick < 0) tick = _current_tick;
    auto ticks = _DATA[symbol]["ticks"];
    if (tick < ticks.size()) return ticks[tick]["close"];
    return 0;
}

bool buy(const std::string& symbol, int quantity) {
    double price = get_price(symbol);
    if (price <= 0) return false;
    double cost = price * quantity;
    if (cost > _cash) return false;
    
    _cash -= cost;
    _positions[symbol] += quantity;
    _trades.push_back({_current_tick, "BUY", symbol, quantity, price});
    return true;
}

bool sell(const std::string& symbol, int quantity) {
    if (_positions[symbol] < quantity) return false;
    double price = get_price(symbol);
    _cash += price * quantity;
    _positions[symbol] -= quantity;
    _trades.push_back({_current_tick, "SELL", symbol, quantity, price});
    return true;
}

// ========== USER CODE ==========
int main() {
    try {
        for (_current_tick = 0; _current_tick < get_tick_count(); _current_tick++) {
            ${userCode.split('\n').map(l => '            ' + l).join('\n')}
        }
    } catch (...) {
        std::cerr << "Strategy error" << std::endl;
    }
    
    // Calculate final net worth
    double positions_value = 0;
    for (auto& c : _COMMODITIES) {
        positions_value += _positions[c] * get_price(c);
    }
    
    std::cout << "{\\"success\\":true,\\"finalNetWorth\\":" << (_cash + positions_value) 
              << ",\\"cash\\":" << _cash << ",\\"totalTrades\\":" << _trades.size() << "}" << std::endl;
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
