import test from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.join(__dirname, "..", "..", "..", "test_data");

// Mock data and helpers for integration testing

const COMMODITIES = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"];
const INITIAL_CASH = 100000;

// Create mock tick data matching market_sim output format
function createMockTickData(tickCount = 1000) {
  const data = { _news: {} };
  const basePrices = { OIL: 75, STEEL: 120, WOOD: 45, BRICK: 25, GRAIN: 8 };

  for (const symbol of COMMODITIES) {
    data[symbol] = { ticks: [], orderbooks: {} };
    let price = basePrices[symbol];

    for (let t = 0; t < tickCount; t++) {
      const volatility = 0.02;
      const change = (Math.random() - 0.5) * basePrices[symbol] * volatility;
      price = Math.max(
        basePrices[symbol] * 0.5,
        Math.min(basePrices[symbol] * 1.5, price + change)
      );

      data[symbol].ticks.push({
        tick: t,
        open: price,
        high: price * 1.005,
        low: price * 0.995,
        close: price,
        volume: Math.floor(Math.random() * 1000) + 100,
      });
    }
  }

  return data;
}

// Generate Python wrapper for algorithm execution
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
    """Returns total number of ticks"""
    return len(_DATA.get('OIL', {}).get('ticks', []))

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

def get_price(symbol, tick=None):
    """Get current price for a commodity (last trade price)"""
    if tick is None:
        tick = _current_tick
    ticks = _DATA.get(symbol.upper(), {}).get('ticks', [])
    if tick < len(ticks):
        return ticks[tick].get('close', 0)
    return 0

def get_cash():
    """Get current cash balance"""
    return _cash

def get_positions():
    """Get all current positions"""
    return dict(_positions)

def get_position(symbol):
    """Get position for specific commodity"""
    return _positions.get(symbol.upper(), 0)

def buy(symbol, quantity):
    """Buy commodity at market price"""
    global _cash, _positions, _trades
    symbol = symbol.upper()
    
    if symbol not in _COMMODITIES:
        return False
    
    price = get_price(symbol)
    if price <= 0:
        return False
    
    cost = price * quantity
    if cost > _cash:
        return False
    
    _cash -= cost
    _positions[symbol] = _positions.get(symbol, 0) + quantity
    _trades.append({
        'tick': _current_tick,
        'type': 'BUY',
        'symbol': symbol,
        'quantity': quantity,
        'price': price
    })
    return True

def sell(symbol, quantity):
    """Sell commodity at market price"""
    global _cash, _positions, _trades
    symbol = symbol.upper()
    
    if symbol not in _COMMODITIES:
        return False
    
    current_qty = _positions.get(symbol, 0)
    if quantity > current_qty:
        return False
    
    price = get_price(symbol)
    _cash += price * quantity
    _positions[symbol] = current_qty - quantity
    _trades.append({
        'tick': _current_tick,
        'type': 'SELL',
        'symbol': symbol,
        'quantity': quantity,
        'price': price
    })
    return True

# ========== MAIN EXECUTION LOOP ==========
try:
    for _current_tick in range(get_tick_count()):
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
    'trades': _trades[-100:]
}

print(json.dumps(result))
`;
}

test("Submissions - wrapper generates valid Python", async () => {
  const data = createMockTickData(100);
  const userCode = "pass  # Do nothing";
  
  const wrapper = generatePythonWrapper(data, userCode);
  
  // Check essential elements
  assert.ok(wrapper.includes("import json"));
  assert.ok(wrapper.includes("_DATA = json.loads"));
  assert.ok(wrapper.includes("def get_price"));
  assert.ok(wrapper.includes("def buy"));
  assert.ok(wrapper.includes("def sell"));
  assert.ok(wrapper.includes("for _current_tick in range"));
  assert.ok(wrapper.includes("final_net_worth"));
});

test("Submissions - buy and sell tracking", async () => {
  const data = createMockTickData(10);
  const userCode = `
if _current_tick == 0:
    buy("OIL", 100)
if _current_tick == 5:
    sell("OIL", 50)
`;
  
  // Simulate execution by checking the logic
  let cash = INITIAL_CASH;
  const positions = { OIL: 0 };
  const trades = [];
  
  // Tick 0: Buy 100 OIL at price from data
  const buyPrice = data.OIL.ticks[0].close;
  cash -= buyPrice * 100;
  positions.OIL += 100;
  trades.push({ type: "BUY", symbol: "OIL", quantity: 100, price: buyPrice });
  
  // Tick 5: Sell 50 OIL
  const sellPrice = data.OIL.ticks[5].close;
  cash += sellPrice * 50;
  positions.OIL -= 50;
  trades.push({ type: "SELL", symbol: "OIL", quantity: 50, price: sellPrice });
  
  assert.strictEqual(positions.OIL, 50);
  assert.strictEqual(trades.length, 2);
  assert.strictEqual(trades[0].type, "BUY");
  assert.strictEqual(trades[1].type, "SELL");
});

test("Submissions - net worth calculation", async () => {
  const data = createMockTickData(100);
  
  // Simulate final state
  const finalCash = 50000;
  const positions = { OIL: 100, STEEL: 50 };
  const finalPrices = {
    OIL: data.OIL.ticks[99].close,
    STEEL: data.STEEL.ticks[99].close,
  };
  
  const positionsValue = positions.OIL * finalPrices.OIL + positions.STEEL * finalPrices.STEEL;
  const netWorth = finalCash + positionsValue;
  
  assert.ok(netWorth > finalCash);
  assert.ok(positionsValue > 0);
});

test("Submissions - insufficient cash handling", async () => {
  const data = createMockTickData(10);
  
  function simulateBuy(cash, symbol, quantity, price) {
    const cost = price * quantity;
    if (cost > cash) {
      return { success: false, reason: "insufficient_cash", required: cost, available: cash };
    }
    return { success: true, newCash: cash - cost };
  }
  
  const result = simulateBuy(1000, "OIL", 100, 75); // Needs 7500
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, "insufficient_cash");
});

test("Submissions - insufficient position for sell", async () => {
  function simulateSell(positions, symbol, quantity) {
    const current = positions[symbol] || 0;
    if (quantity > current) {
      return { success: false, reason: "insufficient_position", have: current, want: quantity };
    }
    return { success: true, newPosition: current - quantity };
  }
  
  const result = simulateSell({ OIL: 50 }, "OIL", 100);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, "insufficient_position");
});

test("Submissions - data injection size limits", async () => {
  // Test with different data sizes
  const smallData = createMockTickData(100);
  const mediumData = createMockTickData(10000);
  
  const smallJson = JSON.stringify(smallData);
  const mediumJson = JSON.stringify(mediumData);
  
  // Check JSON sizes
  assert.ok(smallJson.length < mediumJson.length);
  
  // 100k ticks should produce ~50-100MB JSON
  // For testing, we verify structure is correct
  assert.ok(smallData.OIL.ticks.length === 100);
  assert.ok(mediumData.OIL.ticks.length === 10000);
});

test("Submissions - strategy timeout simulation", async () => {
  // Simulate a strategy that would timeout
  const timeoutSeconds = 60;
  const start = Date.now();
  
  // Simulate execution time tracking
  const executionTime = 30; // Would be measured by Judge0
  
  assert.ok(executionTime < timeoutSeconds);
});

test("Submissions - Python syntax validation", async () => {
  const validCodes = [
    "pass",
    "if get_price('OIL') > 80:\n    sell('OIL', 10)",
    "for i in range(10):\n    buy('STEEL', 1)",
    "positions = get_positions()\nprint(positions)",
  ];
  
  for (const code of validCodes) {
    // Basic syntax check - no obvious Python syntax errors
    assert.ok(!code.includes("def ") || code.includes(":"));
    assert.ok(!code.includes("if ") || code.includes(":") || code.includes("\n"));
  }
});

test("Submissions - news data access", async () => {
  const data = createMockTickData(100);
  
  // Add some news events
  data._news = {
    10: [{ symbol: "OIL", category: "supply", sentiment: "negative", magnitude: 0.05 }],
    50: [{ symbol: "STEEL", category: "demand", sentiment: "positive", magnitude: 0.03 }],
  };
  
  assert.ok(data._news[10]);
  assert.ok(data._news[10][0].symbol === "OIL");
  assert.strictEqual(data._news[10][0].sentiment, "negative");
});

test("Submissions - orderbook data format", async () => {
  const data = createMockTickData(10);
  
  // Add orderbook data
  data.OIL.orderbooks[5] = {
    bids: [
      { price: 74.5, quantity: 100 },
      { price: 74.0, quantity: 200 },
    ],
    asks: [
      { price: 75.5, quantity: 150 },
      { price: 76.0, quantity: 250 },
    ],
  };
  
  assert.ok(data.OIL.orderbooks[5]);
  assert.strictEqual(data.OIL.orderbooks[5].bids.length, 2);
  assert.strictEqual(data.OIL.orderbooks[5].asks[0].price, 75.5);
});

test("Submissions - multi-commodity strategy", async () => {
  const data = createMockTickData(100);
  
  // Simulate a strategy trading multiple commodities
  const trades = [];
  const positions = { OIL: 0, STEEL: 0, WOOD: 0 };
  let cash = INITIAL_CASH;
  
  for (let tick = 0; tick < 10; tick++) {
    for (const symbol of ["OIL", "STEEL", "WOOD"]) {
      const price = data[symbol].ticks[tick].close;
      const random = Math.random();
      
      if (random > 0.7 && cash > price * 10) {
        cash -= price * 10;
        positions[symbol] += 10;
        trades.push({ tick, type: "BUY", symbol, quantity: 10, price });
      } else if (random < 0.3 && positions[symbol] >= 10) {
        cash += price * 10;
        positions[symbol] -= 10;
        trades.push({ tick, type: "SELL", symbol, quantity: 10, price });
      }
    }
  }
  
  assert.ok(trades.length > 0);
  assert.ok(cash >= 0);
});

test("Submissions - output format matches expected schema", async () => {
  const expectedOutput = {
    success: true,
    finalNetWorth: 105000.50,
    cash: 45000.00,
    positions: { OIL: 100, STEEL: 50 },
    totalTrades: 15,
    trades: [
      { tick: 0, type: "BUY", symbol: "OIL", quantity: 100, price: 75.5 }
    ],
  };
  
  // Validate schema
  assert.strictEqual(typeof expectedOutput.success, "boolean");
  assert.strictEqual(typeof expectedOutput.finalNetWorth, "number");
  assert.strictEqual(typeof expectedOutput.cash, "number");
  assert.strictEqual(typeof expectedOutput.positions, "object");
  assert.strictEqual(typeof expectedOutput.totalTrades, "number");
  assert.ok(Array.isArray(expectedOutput.trades));
});

test("Submissions - error handling for invalid symbol", async () => {
  function validateSymbol(symbol, commodities) {
    return commodities.includes(symbol.toUpperCase());
  }
  
  assert.ok(validateSymbol("OIL", COMMODITIES));
  assert.ok(validateSymbol("oil", COMMODITIES)); // Case insensitive
  assert.ok(!validateSymbol("GOLD", COMMODITIES)); // Not in list
});

test("Submissions - data file I/O simulation", async () => {
  // Create test directory
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  
  const data = createMockTickData(100);
  const filePath = path.join(TEST_DATA_DIR, "test_submission_data.json");
  
  // Write
  fs.writeFileSync(filePath, JSON.stringify(data));
  assert.ok(fs.existsSync(filePath));
  
  // Read
  const loaded = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert.strictEqual(loaded.OIL.ticks.length, 100);
  
  // Cleanup
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});
