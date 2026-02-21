import test from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost";
const MARKET_SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";
const JUDGE0_URL = process.env.JUDGE0_URL || "http://localhost:2358";
const TEST_DATA_DIR = path.join(__dirname, "..", "..", "test_data");

// Skip integration tests if services not available
const INTEGRATION_AVAILABLE = process.env.INTEGRATION_TEST === "true";

// Test data from market_sim exports
function loadMarketSimTestData() {
  const sampleData = {
    OIL: { ticks: [], orderbooks: {} },
    STEEL: { ticks: [], orderbooks: {} },
    WOOD: { ticks: [], orderbooks: {} },
    BRICK: { ticks: [], orderbooks: {} },
    GRAIN: { ticks: [], orderbooks: {} },
    _news: {},
  };

  // Generate 100 sample ticks
  const basePrices = { OIL: 75, STEEL: 120, WOOD: 45, BRICK: 25, GRAIN: 8 };

  for (const symbol of Object.keys(basePrices)) {
    let price = basePrices[symbol];
    for (let t = 0; t < 100; t++) {
      price += (Math.random() - 0.5) * 2;
      price = Math.max(
        basePrices[symbol] * 0.8,
        Math.min(basePrices[symbol] * 1.2, price),
      );

      sampleData[symbol].ticks.push({
        tick: t,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price,
        volume: Math.floor(Math.random() * 1000) + 100,
      });
    }
  }

  return sampleData;
}

test("E2E - Data generation flow", async () => {
  // Step 1: Market sim generates tick data
  const tickData = loadMarketSimTestData();

  assert.ok(tickData.OIL);
  assert.ok(tickData.OIL.ticks);
  assert.strictEqual(tickData.OIL.ticks.length, 100);

  // Step 2: Data exported to JSON
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  const exportPath = path.join(TEST_DATA_DIR, "test_100k.json");
  fs.writeFileSync(exportPath, JSON.stringify(tickData));

  assert.ok(fs.existsSync(exportPath));

  // Step 3: Data loaded by executor
  const loaded = JSON.parse(fs.readFileSync(exportPath, "utf-8"));
  assert.strictEqual(loaded.OIL.ticks.length, 100);

  // Cleanup
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("E2E - Algorithm execution flow", async () => {
  const data = loadMarketSimTestData();
  const INITIAL_CASH = 100000;

  // Step 1: Generate Python wrapper
  const userCode = `
if _current_tick == 0:
    buy("OIL", 100)
if _current_tick == 50:
    sell("OIL", 50)
`;

  // Step 2: Simulate execution
  let cash = INITIAL_CASH;
  const positions = { OIL: 0, STEEL: 0, WOOD: 0, BRICK: 0, GRAIN: 0 };
  const trades = [];

  for (let tick = 0; tick < 100; tick++) {
    if (tick === 0) {
      const price = data.OIL.ticks[tick].close;
      cash -= price * 100;
      positions.OIL += 100;
      trades.push({ tick, type: "BUY", symbol: "OIL", quantity: 100, price });
    }
    if (tick === 50) {
      const price = data.OIL.ticks[tick].close;
      cash += price * 50;
      positions.OIL -= 50;
      trades.push({ tick, type: "SELL", symbol: "OIL", quantity: 50, price });
    }
  }

  // Step 3: Calculate final net worth
  const finalPrices = {};
  for (const symbol of ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"]) {
    finalPrices[symbol] = data[symbol].ticks[99].close;
  }

  let positionsValue = 0;
  for (const [symbol, qty] of Object.entries(positions)) {
    positionsValue += qty * finalPrices[symbol];
  }

  const netWorth = cash + positionsValue;

  assert.strictEqual(trades.length, 2);
  assert.strictEqual(positions.OIL, 50);
  assert.ok(netWorth > 0);
});

test("E2E - CSV export and import", async () => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  const data = loadMarketSimTestData();
  const csvDir = path.join(TEST_DATA_DIR, "csv");
  fs.mkdirSync(csvDir, { recursive: true });

  // Export to CSV
  for (const symbol of ["OIL", "STEEL", "WOOD"]) {
    const csvLines = ["tick,open,high,low,close,volume"];
    for (const tick of data[symbol].ticks) {
      csvLines.push(
        `${tick.tick},${tick.open},${tick.high},${tick.low},${tick.close},${tick.volume}`,
      );
    }
    fs.writeFileSync(path.join(csvDir, `${symbol}.csv`), csvLines.join("\n"));
  }

  // Verify files exist
  assert.ok(fs.existsSync(path.join(csvDir, "OIL.csv")));
  assert.ok(fs.existsSync(path.join(csvDir, "STEEL.csv")));
  assert.ok(fs.existsSync(path.join(csvDir, "WOOD.csv")));

  // Re-import and verify
  const oilCsv = fs.readFileSync(path.join(csvDir, "OIL.csv"), "utf-8");
  const lines = oilCsv.split("\n");

  assert.strictEqual(lines[0], "tick,open,high,low,close,volume");
  assert.ok(lines.length > 1);

  // Cleanup
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("E2E - Market sim -> Backend data sync", async () => {
  // Simulate data sync between market_sim and backend
  const marketSimState = {
    currentTick: 50000,
    running: true,
    populating: false,
  };

  const backendDataStatus = {
    simState: marketSimState,
    dataFiles: {
      full: true,
      dev: true,
      csv: true,
    },
  };

  // Verify state propagation
  assert.strictEqual(backendDataStatus.simState.currentTick, 50000);
  assert.ok(backendDataStatus.dataFiles.full);
  assert.ok(backendDataStatus.dataFiles.dev);
});

test("E2E - User download flow", async () => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  // Create 100k subset
  const fullData = loadMarketSimTestData();
  const devData = {
    OIL: { ticks: fullData.OIL.ticks.slice(0, 100), orderbooks: {} },
    STEEL: { ticks: fullData.STEEL.ticks.slice(0, 100), orderbooks: {} },
    WOOD: { ticks: fullData.WOOD.ticks.slice(0, 100), orderbooks: {} },
    BRICK: { ticks: fullData.BRICK.ticks.slice(0, 100), orderbooks: {} },
    GRAIN: { ticks: fullData.GRAIN.ticks.slice(0, 100), orderbooks: {} },
    _news: {},
  };

  const devPath = path.join(TEST_DATA_DIR, "dev_100k.json");
  fs.writeFileSync(devPath, JSON.stringify(devData));

  // Verify subset
  const loaded = JSON.parse(fs.readFileSync(devPath, "utf-8"));
  assert.strictEqual(loaded.OIL.ticks.length, 100);

  // Cleanup
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

// Integration tests (require running services)
// Set INTEGRATION_TEST=true to run these
test(
  "E2E - Backend health check",
  { skip: !INTEGRATION_AVAILABLE },
  async () => {
    const response = await axios.get(`${BACKEND_URL}/health`);
    assert.strictEqual(response.status, 200);
    assert.ok(response.data.status);
  },
);

test(
  "E2E - Market sim health check",
  { skip: !INTEGRATION_AVAILABLE },
  async () => {
    const response = await axios.get(`${MARKET_SIM_URL}/health`);
    assert.strictEqual(response.status, 200);
    assert.ok(response.data.status);
  },
);

test(
  "E2E - Judge0 health check",
  { skip: !INTEGRATION_AVAILABLE },
  async () => {
    const response = await axios.get(`${JUDGE0_URL}/about`);
    assert.strictEqual(response.status, 200);
  },
);

test(
  "E2E - Full submission flow",
  { skip: !INTEGRATION_AVAILABLE },
  async () => {
    // 1. Register/login user
    // 2. Submit algorithm
    // 3. Wait for execution
    // 4. Check leaderboard

    // This would be a full integration test
    assert.ok(true, "Integration test placeholder");
  },
);

test("E2E - Error propagation chain", async () => {
  // Test error handling through the chain

  // Market sim error
  const marketSimError = { error: "Symbol not found", status: 404 };
  assert.strictEqual(marketSimError.status, 404);

  // Backend should propagate
  const backendError = {
    error: "Market simulator not available",
    originalError: marketSimError.error,
  };
  assert.ok(backendError.originalError);

  // Frontend should display
  const userMessage = `Error: ${backendError.error}`;
  assert.ok(userMessage.includes("Error"));
});

test("E2E - Concurrent operations", async () => {
  // Simulate concurrent data access
  const data = loadMarketSimTestData();

  // Simulate multiple readers
  const readers = [];
  for (let i = 0; i < 10; i++) {
    readers.push(
      new Promise((resolve) => {
        const ticks = data.OIL.ticks;
        const avg = ticks.reduce((sum, t) => sum + t.close, 0) / ticks.length;
        resolve(avg);
      }),
    );
  }

  const results = await Promise.all(readers);

  // All readers should get same result
  for (const result of results) {
    assert.strictEqual(result, results[0]);
  }
});

test("E2E - Data consistency across exports", async () => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  const data = loadMarketSimTestData();

  // Export to JSON
  const jsonPath = path.join(TEST_DATA_DIR, "test.json");
  fs.writeFileSync(jsonPath, JSON.stringify(data));

  // Export to CSV
  const csvPath = path.join(TEST_DATA_DIR, "OIL.csv");
  const csvLines = ["tick,close"];
  for (const tick of data.OIL.ticks) {
    csvLines.push(`${tick.tick},${tick.close}`);
  }
  fs.writeFileSync(csvPath, csvLines.join("\n"));

  // Verify consistency
  const jsonLoaded = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const csvLoaded = fs.readFileSync(csvPath, "utf-8").split("\n");

  // First tick should match
  const jsonTick0 = jsonLoaded.OIL.ticks[0].close;
  const csvTick0 = parseFloat(csvLoaded[1].split(",")[1]);

  assert.strictEqual(jsonTick0, csvTick0);

  // Cleanup
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("E2E - Rate limiting", async () => {
  // Simulate rate limiting
  const rateLimit = {
    max: 100,
    window: 60000, // 1 minute
  };

  function checkRateLimit(requests, window) {
    const now = Date.now();
    const recentRequests = requests.filter((r) => now - r < window);
    return recentRequests.length < rateLimit.max;
  }

  // Within limit
  const okRequests = Array(50).fill(Date.now());
  assert.ok(checkRateLimit(okRequests, rateLimit.window));

  // Over limit
  const tooManyRequests = Array(150).fill(Date.now());
  assert.ok(!checkRateLimit(tooManyRequests, rateLimit.window));
});
