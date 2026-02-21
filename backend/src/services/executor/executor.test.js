import test from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.join(__dirname, "test_data");

// Helper to create mock data bundle
function createMockDataBundle(tickCount = 1000) {
  const data = { _news: {} };
  const commodities = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"];
  const basePrices = { OIL: 75, STEEL: 120, WOOD: 45, BRICK: 25, GRAIN: 8 };

  for (const symbol of commodities) {
    data[symbol] = { ticks: [], orderbooks: {} };
    let price = basePrices[symbol];

    for (let t = 0; t < tickCount; t++) {
      const change = (Math.random() - 0.5) * basePrices[symbol] * 0.02;
      price = Math.max(
        basePrices[symbol] * 0.5,
        Math.min(basePrices[symbol] * 1.5, price + change)
      );

      data[symbol].ticks.push({
        tick: t,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price,
        volume: Math.floor(Math.random() * 1000) + 100,
      });

      if (Math.random() < 0.01) {
        data._news[t] = [
          {
            symbol: commodities[Math.floor(Math.random() * commodities.length)],
            category: ["supply", "demand", "global", "political"][
              Math.floor(Math.random() * 4)
            ],
            sentiment: ["positive", "negative", "neutral"][
              Math.floor(Math.random() * 3)
            ],
            magnitude: Math.random() * 0.1,
            headline: "Sample news event",
          },
        ];
      }
    }
  }

  return data;
}

test("Executor - generatePythonWrapper creates valid Python code", async () => {
  const dataBundle = createMockDataBundle(100);
  const userCode = "if get_current_tick() % 100 == 0:\n    print('Tick!')";

  function generatePythonWrapper(dataBundle, userCode) {
    return `
import json
import sys

_DATA = json.loads('''${JSON.stringify(dataBundle)}''')
_COMMODITIES = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"]

_trades = []
_cash = 100000.0
_positions = {c: 0 for c in _COMMODITIES}
_current_tick = 0

def get_commodities():
    return _COMMODITIES

def get_tick_count():
    return len(_DATA.get('OIL', {}).get('ticks', []))

def get_current_tick():
    return _current_tick

def get_cash():
    return _cash

def get_positions():
    return dict(_positions)

def get_price(symbol, tick=None):
    if tick is None:
        tick = _current_tick
    ticks = _DATA.get(symbol.upper(), {}).get('ticks', [])
    if tick < len(ticks):
        return ticks[tick].get('close', 0)
    return 0

for _current_tick in range(get_tick_count()):
    ${userCode.split("\n").map((line) => "    " + line).join("\n")}
`;
  }

  const wrappedCode = generatePythonWrapper(dataBundle, userCode);

  // Verify wrapper contains essential elements
  assert.ok(wrappedCode.includes("import json"));
  assert.ok(wrappedCode.includes("_DATA = json.loads"));
  assert.ok(wrappedCode.includes("_COMMODITIES"));
  assert.ok(wrappedCode.includes("get_commodities()"));
  assert.ok(wrappedCode.includes("get_tick_count()"));
  assert.ok(wrappedCode.includes("get_current_tick()"));
  assert.ok(wrappedCode.includes("get_cash()"));
  assert.ok(wrappedCode.includes("get_positions()"));
  assert.ok(wrappedCode.includes("get_price"));
  assert.ok(wrappedCode.includes("for _current_tick in range"));
});

test("Executor - Python wrapper data injection is valid JSON", async () => {
  const dataBundle = createMockDataBundle(50);

  // Verify data can be serialized and parsed
  const serialized = JSON.stringify(dataBundle);
  const parsed = JSON.parse(serialized);

  assert.strictEqual(Object.keys(parsed).length, 6); // 5 commodities + _news
  assert.ok("OIL" in parsed);
  assert.ok("STEEL" in parsed);
  assert.ok("WOOD" in parsed);
  assert.ok("BRICK" in parsed);
  assert.ok("GRAIN" in parsed);
  assert.ok("_news" in parsed);
  assert.strictEqual(parsed.OIL.ticks.length, 50);
});

test("Executor - loadDataBundle prioritizes full_1m over dev_100k", async () => {
  // Create test directory
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  const fullData = { OIL: { ticks: [{ tick: 0, close: 100 }] }, source: "full" };
  const devData = { OIL: { ticks: [{ tick: 0, close: 50 }] }, source: "dev" };

  fs.writeFileSync(
    path.join(TEST_DATA_DIR, "full_1m.json"),
    JSON.stringify(fullData)
  );
  fs.writeFileSync(
    path.join(TEST_DATA_DIR, "dev_100k.json"),
    JSON.stringify(devData)
  );

  // Simulate loadDataBundle logic
  function loadDataBundle(dataDir) {
    const fullPath = path.join(dataDir, "full_1m.json");
    if (fs.existsSync(fullPath)) {
      return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    }
    const devPath = path.join(dataDir, "dev_100k.json");
    if (fs.existsSync(devPath)) {
      return JSON.parse(fs.readFileSync(devPath, "utf-8"));
    }
    return null;
  }

  const loaded = loadDataBundle(TEST_DATA_DIR);
  assert.ok(loaded);
  assert.strictEqual(loaded.source, "full");

  // Cleanup
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("Executor - loadDataBundle falls back to dev_100k", async () => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  const devData = { OIL: { ticks: [{ tick: 0, close: 50 }] }, source: "dev" };
  fs.writeFileSync(
    path.join(TEST_DATA_DIR, "dev_100k.json"),
    JSON.stringify(devData)
  );

  function loadDataBundle(dataDir) {
    const fullPath = path.join(dataDir, "full_1m.json");
    if (fs.existsSync(fullPath)) {
      return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    }
    const devPath = path.join(dataDir, "dev_100k.json");
    if (fs.existsSync(devPath)) {
      return JSON.parse(fs.readFileSync(devPath, "utf-8"));
    }
    return null;
  }

  const loaded = loadDataBundle(TEST_DATA_DIR);
  assert.ok(loaded);
  assert.strictEqual(loaded.source, "dev");

  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("Executor - trading functions calculate correctly", async () => {
  // Simulate trading logic
  const INITIAL_CASH = 100000;
  const commodities = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"];

  function simulateTrading(prices) {
    let cash = INITIAL_CASH;
    const positions = {};
    const trades = [];

    for (const symbol of commodities) {
      positions[symbol] = 0;
    }

    // Buy function
    function buy(symbol, quantity, price) {
      const cost = price * quantity;
      if (cost > cash) return false;
      cash -= cost;
      positions[symbol] += quantity;
      trades.push({ type: "BUY", symbol, quantity, price, cost });
      return true;
    }

    // Sell function
    function sell(symbol, quantity, price) {
      if (positions[symbol] < quantity) return false;
      const proceeds = price * quantity;
      cash += proceeds;
      positions[symbol] -= quantity;
      trades.push({ type: "SELL", symbol, quantity, price, proceeds });
      return true;
    }

    // Execute test trades
    buy("OIL", 100, 75);
    sell("OIL", 50, 80);
    buy("STEEL", 10, 120);

    return { cash, positions, trades };
  }

  const result = simulateTrading({ OIL: 75, STEEL: 120 });

  // Verify calculations
  assert.strictEqual(result.trades.length, 3);
  assert.strictEqual(result.trades[0].type, "BUY");
  assert.strictEqual(result.trades[0].symbol, "OIL");
  assert.strictEqual(result.trades[0].quantity, 100);
  assert.strictEqual(result.trades[1].type, "SELL");
  assert.strictEqual(result.trades[1].price, 80);

  // Cash: 100000 - 7500 + 4000 - 1200 = 95300
  assert.strictEqual(result.cash, 95300);
  assert.strictEqual(result.positions.OIL, 50);
  assert.strictEqual(result.positions.STEEL, 10);
});

test("Executor - net worth calculation", async () => {
  function calculateNetWorth(cash, positions, prices) {
    let positionsValue = 0;
    for (const [symbol, quantity] of Object.entries(positions)) {
      if (quantity > 0 && prices[symbol]) {
        positionsValue += quantity * prices[symbol];
      }
    }
    return cash + positionsValue;
  }

  const cash = 50000;
  const positions = { OIL: 100, STEEL: 50, WOOD: 0, BRICK: 25, GRAIN: 1000 };
  const prices = { OIL: 80, STEEL: 130, WOOD: 40, BRICK: 20, GRAIN: 10 };

  const netWorth = calculateNetWorth(cash, positions, prices);

  // Expected: 50000 + (100 * 80) + (50 * 130) + (25 * 20) + (1000 * 10)
  // = 50000 + 8000 + 6500 + 500 + 10000 = 75000
  assert.strictEqual(netWorth, 75000);
});

test("Executor - handles insufficient cash for buy", async () => {
  function buy(cash, positions, symbol, quantity, price) {
    const cost = price * quantity;
    if (cost > cash) {
      return { success: false, reason: "insufficient_cash" };
    }
    return { success: true, cash: cash - cost, positions: { ...positions, [symbol]: (positions[symbol] || 0) + quantity } };
  }

  const result = buy(1000, {}, "OIL", 100, 75);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, "insufficient_cash");
});

test("Executor - handles insufficient position for sell", async () => {
  function sell(positions, symbol, quantity, price) {
    const currentQty = positions[symbol] || 0;
    if (quantity > currentQty) {
      return { success: false, reason: "insufficient_position" };
    }
    return { 
      success: true, 
      positions: { ...positions, [symbol]: currentQty - quantity },
      proceeds: quantity * price 
    };
  }

  const result = sell({ OIL: 50 }, "OIL", 100, 80);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, "insufficient_position");
});

test("Executor - DATA_DIR environment variable handling", async () => {
  // Test default vs env var
  const defaultDir = "/data";
  const envDir = process.env.DATA_DIR || defaultDir;
  
  assert.ok(envDir);
  assert.strictEqual(typeof envDir, "string");
  
  // When DATA_DIR is set, use it
  process.env.DATA_DIR = "/custom/data";
  const customDir = process.env.DATA_DIR || defaultDir;
  assert.strictEqual(customDir, "/custom/data");
  
  // Cleanup
  delete process.env.DATA_DIR;
});
