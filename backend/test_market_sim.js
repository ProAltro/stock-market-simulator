/**
 * JS Tests for the C++ Market Simulation Engine API
 *
 * Tests all REST endpoints exposed by the market-sim container.
 * Run with: node test_market_sim.js
 *
 * Requires the market-sim container to be running on localhost:8080.
 */

const BASE_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";
const TIMEOUT_MS = 30_000;

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function http(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {},
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, ok: res.ok };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertType(value, type, label) {
  assert(
    typeof value === type,
    `Expected ${label} to be ${type}, got ${typeof value} (${JSON.stringify(value)})`,
  );
}

function assertArray(value, label) {
  assert(
    Array.isArray(value),
    `Expected ${label} to be an array, got ${typeof value}`,
  );
}

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    passed++;
    console.log("\x1b[32mPASS\x1b[0m");
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`\x1b[31mFAIL\x1b[0m  ${err.message}`);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`  ${name} ... \x1b[33mSKIP\x1b[0m  ${reason}`);
}

function section(title) {
  console.log(`\n\x1b[1m── ${title} ──\x1b[0m`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nMarket Sim Engine Tests  (${BASE_URL})\n${"=".repeat(50)}`);

  // ── Health ──
  section("Health & Connectivity");

  await test("GET /health returns healthy", async () => {
    const { status, json } = await http("GET", "/health");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json.status === "healthy", `Expected healthy, got ${json.status}`);
  });

  // ── State ──
  section("Simulation State");

  await test("GET /state returns simulation state", async () => {
    const { status, json } = await http("GET", "/state");
    assert(status === 200, `Expected 200, got ${status}`);
    assertType(json.tick, "number", "tick");
    assertType(json.running, "boolean", "running");
    assertType(json.paused, "boolean", "paused");
    assertType(json.simDate, "string", "simDate");
    assertType(json.tickRateMs, "number", "tickRateMs");
  });

  // ── Stocks ──
  section("Stock Metadata");

  let stockSymbols = [];

  await test("GET /stocks returns stock list", async () => {
    const { status, json } = await http("GET", "/stocks");
    assert(status === 200, `Expected 200, got ${status}`);
    assertArray(json, "stocks");
    assert(json.length > 0, "Expected at least one stock");

    const first = json[0];
    assertType(first.symbol, "string", "symbol");
    assertType(first.name, "string", "name");
    assertType(first.industry, "string", "industry");
    assertType(first.initialPrice, "number", "initialPrice");
    assertType(first.sharesOutstanding, "number", "sharesOutstanding");
    assert(first.initialPrice > 0, "initialPrice should be > 0");

    stockSymbols = json.map((s) => s.symbol);
  });

  await test("GET /stocks includes expected fields", async () => {
    const { json } = await http("GET", "/stocks");
    const first = json[0];
    const fields = [
      "symbol",
      "name",
      "industry",
      "initialPrice",
      "sharesOutstanding",
      "baseVolatility",
    ];
    for (const f of fields) {
      assert(f in first, `Missing field: ${f}`);
    }
  });

  // ── Assets ──
  section("Live Asset Data");

  await test("GET /assets returns asset prices", async () => {
    const { status, json } = await http("GET", "/assets");
    assert(status === 200, `Expected 200, got ${status}`);
    assertArray(json, "assets");
    assert(json.length > 0, "Expected at least one asset");

    const first = json[0];
    assertType(first.symbol, "string", "symbol");
    assertType(first.price, "number", "price");
    assert(first.price > 0, "Price should be > 0");
  });

  await test("Assets include fundamental value", async () => {
    const { json } = await http("GET", "/assets");
    const first = json[0];
    assertType(first.fundamental, "number", "fundamental");
    assert(first.fundamental > 0, "Fundamental should be > 0");
  });

  // ── Agents ──
  section("Agent Summary");

  await test("GET /agents returns agent data", async () => {
    const { status, json } = await http("GET", "/agents");
    assert(status === 200, `Expected 200, got ${status}`);
    assertArray(json, "agents");
    assert(json.length > 0, "Expected at least one agent type");

    const first = json[0];
    assertType(first.type, "string", "type");
    assertType(first.count, "number", "count");
  });

  // ── Metrics ──
  section("Market Metrics");

  await test("GET /metrics returns metrics object", async () => {
    const { status, json } = await http("GET", "/metrics");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json !== null && typeof json === "object", "Expected JSON object");
  });

  // ── Order Book ──
  section("Order Book");

  await test("GET /orderbook/:symbol returns book data", async () => {
    const sym = stockSymbols[0] || "AAPL";
    const { status, json } = await http("GET", `/orderbook/${sym}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assertType(json.symbol, "string", "symbol");
    assert(json.symbol === sym, `Expected symbol ${sym}, got ${json.symbol}`);
    assertArray(json.bids, "bids");
    assertArray(json.asks, "asks");
    assertType(json.bestBid, "number", "bestBid");
    assertType(json.bestAsk, "number", "bestAsk");
    assertType(json.spread, "number", "spread");
    assertType(json.midPrice, "number", "midPrice");
  });

  await test("Order book spread is non-negative", async () => {
    const sym = stockSymbols[0] || "AAPL";
    const { json } = await http("GET", `/orderbook/${sym}`);
    assert(json.spread >= 0, `Spread should be >= 0, got ${json.spread}`);
    if (json.bestBid > 0 && json.bestAsk > 0) {
      assert(
        json.bestAsk >= json.bestBid,
        `Ask (${json.bestAsk}) should be >= Bid (${json.bestBid})`,
      );
    }
  });

  await test("GET /orderbook/INVALID returns 404", async () => {
    const { status } = await http("GET", "/orderbook/ZZZZNOTEXIST");
    assert(status === 404, `Expected 404, got ${status}`);
  });

  // ── Candles ──
  section("Candle Data");

  await test("GET /candles/:symbol returns candle array", async () => {
    const sym = stockSymbols[0] || "AAPL";
    const { status, json } = await http(
      "GET",
      `/candles/${sym}?interval=1m&limit=10`,
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assertArray(json, "candles");
    // May be empty if sim hasn't generated any candles yet
    if (json.length > 0) {
      const c = json[0];
      assertType(c.time, "number", "candle.time");
      assertType(c.open, "number", "candle.open");
      assertType(c.high, "number", "candle.high");
      assertType(c.low, "number", "candle.low");
      assertType(c.close, "number", "candle.close");
      assertType(c.volume, "number", "candle.volume");
      assert(c.high >= c.low, "High should be >= Low");
      assert(c.high >= c.open, "High should be >= Open");
      assert(c.high >= c.close, "High should be >= Close");
      assert(c.low <= c.open, "Low should be <= Open");
      assert(c.low <= c.close, "Low should be <= Close");
    }
  });

  await test("GET /candles/:symbol respects interval param", async () => {
    const sym = stockSymbols[0] || "AAPL";
    const intervals = ["1m", "5m", "15m", "1h", "1d"];
    for (const iv of intervals) {
      const { status } = await http(
        "GET",
        `/candles/${sym}?interval=${iv}&limit=5`,
      );
      assert(status === 200, `Expected 200 for interval ${iv}, got ${status}`);
    }
  });

  await test("GET /candles/bulk returns multi-symbol candles", async () => {
    const { status, json } = await http(
      "GET",
      "/candles/bulk?interval=1h&limit=5",
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(
      json !== null && typeof json === "object",
      "Expected JSON object keyed by symbol",
    );
    // Each value should be an array of candles
    for (const [sym, candles] of Object.entries(json)) {
      assertArray(candles, `candles[${sym}]`);
    }
  });

  // ── Control ──
  section("Simulation Control");

  // Save initial state to restore later
  const { json: initialState } = await http("GET", "/state");
  const wasRunning = initialState.running;

  await test("POST /control stop", async () => {
    const { status, json } = await http("POST", "/control", {
      action: "stop",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json.running === false, "Simulation should be stopped");
  });

  await test("POST /control start", async () => {
    const { status, json } = await http("POST", "/control", {
      action: "start",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json.running === true, "Simulation should be running");
  });

  await test("POST /control pause", async () => {
    const { status, json } = await http("POST", "/control", {
      action: "pause",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json.paused === true, "Simulation should be paused");
  });

  await test("POST /control resume", async () => {
    const { status, json } = await http("POST", "/control", {
      action: "resume",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json.paused === false, "Simulation should not be paused");
  });

  await test("POST /control step advances tick", async () => {
    // Pause first for deterministic step
    await http("POST", "/control", { action: "pause" });
    const before = (await http("GET", "/state")).json.tick;
    const { status } = await http("POST", "/control", {
      action: "step",
      count: 5,
    });
    assert(status === 200, `Expected 200, got ${status}`);
    const after = (await http("GET", "/state")).json.tick;
    assert(
      after >= before + 5,
      `Expected tick to advance by 5: ${before} -> ${after}`,
    );
  });

  await test("POST /control invalid action returns 400", async () => {
    const { status } = await http("POST", "/control", {
      action: "nonexistent",
    });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  // Restore sim state
  if (wasRunning) {
    await http("POST", "/control", { action: "resume" });
  } else {
    await http("POST", "/control", { action: "stop" });
  }

  // ── Config ──
  section("Configuration");

  await test("POST /config updates tick rate", async () => {
    const origState = (await http("GET", "/state")).json;
    const origRate = origState.tickRateMs;

    const { status } = await http("POST", "/config", { tickRate: 100 });
    assert(status === 200, `Expected 200, got ${status}`);

    const newState = (await http("GET", "/state")).json;
    assert(
      newState.tickRateMs === 100,
      `Expected tickRateMs 100, got ${newState.tickRateMs}`,
    );

    // Restore original
    await http("POST", "/config", { tickRate: origRate });
  });

  // ── News ──
  section("News System");

  await test("POST /news injects global news", async () => {
    const { status, json } = await http("POST", "/news", {
      category: "global",
      sentiment: "positive",
      magnitude: 0.05,
      headline: "Test global news from JS test suite",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json.status === "ok", `Expected status ok, got ${json.status}`);
  });

  await test("POST /news injects company news", async () => {
    const sym = stockSymbols[0] || "AAPL";
    const { status, json } = await http("POST", "/news", {
      category: "company",
      sentiment: "negative",
      magnitude: 0.08,
      headline: `Test company news for ${sym}`,
      target: sym,
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json.status === "ok", `Expected status ok`);
  });

  await test("POST /news injects industry news", async () => {
    const { json: stocks } = await http("GET", "/stocks");
    const industry = stocks[0]?.industry || "Technology";
    const { status, json } = await http("POST", "/news", {
      category: "industry",
      sentiment: "neutral",
      magnitude: 0.03,
      headline: `Test industry news for ${industry}`,
      target: industry,
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json.status === "ok", `Expected status ok`);
  });

  await test("GET /news/history returns recent news", async () => {
    const { status, json } = await http("GET", "/news/history?limit=10");
    assert(status === 200, `Expected 200, got ${status}`);
    assertArray(json, "news history");
    // Should contain at least the news we just injected
    assert(json.length > 0, "Expected at least one news event");

    const entry = json[json.length - 1];
    assertType(entry.headline, "string", "headline");
    assertType(entry.category, "string", "category");
    assertType(entry.sentiment, "string", "sentiment");
    assertType(entry.magnitude, "number", "magnitude");
    assert(
      ["global", "political", "industry", "company"].includes(entry.category),
      `Invalid category: ${entry.category}`,
    );
    assert(
      ["positive", "negative", "neutral"].includes(entry.sentiment),
      `Invalid sentiment: ${entry.sentiment}`,
    );
  });

  // ── Orders ──
  section("Order Execution");

  await test("POST /orders places a market buy", async () => {
    const sym = stockSymbols[0] || "AAPL";
    const { status, json } = await http("POST", "/orders", {
      symbol: sym,
      side: "BUY",
      type: "MARKET",
      quantity: 10,
      userId: "test-user",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assertType(json.orderId, "number", "orderId");
    assert(json.symbol === sym, `Expected symbol ${sym}`);
    assert(json.side === "BUY", "Expected side BUY");
    assert(
      ["filled", "partial", "pending"].includes(json.status),
      `Unexpected order status: ${json.status}`,
    );
    if (json.status === "filled") {
      assert(json.avgFillPrice > 0, "Fill price should be > 0");
    }
  });

  await test("POST /orders places a market sell", async () => {
    const sym = stockSymbols[0] || "AAPL";
    const { status, json } = await http("POST", "/orders", {
      symbol: sym,
      side: "SELL",
      type: "MARKET",
      quantity: 5,
      userId: "test-user",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json.side === "SELL", "Expected side SELL");
  });

  await test("POST /orders rejects invalid symbol", async () => {
    const { status, json } = await http("POST", "/orders", {
      symbol: "ZZZZNOTEXIST",
      side: "BUY",
      type: "MARKET",
      quantity: 10,
    });
    assert(status === 404, `Expected 404, got ${status}`);
    assert(json.error, "Expected error message");
  });

  await test("POST /orders rejects zero quantity", async () => {
    const sym = stockSymbols[0] || "AAPL";
    const { status } = await http("POST", "/orders", {
      symbol: sym,
      side: "BUY",
      type: "MARKET",
      quantity: 0,
    });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  // ── Populate ──
  section("Populate (Historical Data)");

  await test("POST /populate rejects when sim is running", async () => {
    // Ensure sim is running
    await http("POST", "/control", { action: "start" });
    const { status, json } = await http("POST", "/populate", {
      days: 1,
      startDate: "2025-01-01",
    });
    assert(status === 400, `Expected 400, got ${status}`);
    assert(
      json.error && json.error.includes("Stop simulation"),
      `Expected error about stopping sim, got: ${json.error}`,
    );
  });

  // ── CORS ──
  section("CORS Headers");

  await test("Responses include CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const cors = res.headers.get("access-control-allow-origin");
    assert(cors === "*", `Expected CORS header *, got ${cors}`);
  });

  await test("OPTIONS returns 200 for preflight", async () => {
    const res = await fetch(`${BASE_URL}/health`, { method: "OPTIONS" });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // ── Error Handling ──
  section("Error Handling");

  await test("Invalid JSON body returns 400", async () => {
    const res = await fetch(`${BASE_URL}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // ── Data Integrity ──
  section("Data Integrity");

  await test("Asset prices are consistent with order book mid", async () => {
    const { json: assets } = await http("GET", "/assets");
    for (const asset of assets.slice(0, 3)) {
      const { json: book } = await http("GET", `/orderbook/${asset.symbol}`);
      if (book.midPrice > 0 && asset.price > 0) {
        const diff = Math.abs(asset.price - book.midPrice) / asset.price;
        assert(
          diff < 0.2,
          `Price/midPrice divergence for ${asset.symbol}: price=${asset.price}, mid=${book.midPrice}, diff=${(diff * 100).toFixed(2)}%`,
        );
      }
    }
  });

  await test("All stock symbols appear in assets", async () => {
    const { json: stocks } = await http("GET", "/stocks");
    const { json: assets } = await http("GET", "/assets");
    const assetSyms = new Set(assets.map((a) => a.symbol));
    for (const stock of stocks) {
      assert(
        assetSyms.has(stock.symbol),
        `Stock ${stock.symbol} not found in assets`,
      );
    }
  });

  await test("Tick counter increases over time", async () => {
    // Ensure running
    await http("POST", "/control", { action: "start" });
    const t1 = (await http("GET", "/state")).json.tick;
    await new Promise((r) => setTimeout(r, 200));
    const t2 = (await http("GET", "/state")).json.tick;
    assert(t2 > t1, `Tick should increase: ${t1} -> ${t2}`);
    // Stop to leave in clean state
    await http("POST", "/control", { action: "stop" });
  });

  // ── Summary ──
  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `Results: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m, \x1b[33m${skipped} skipped\x1b[0m`,
  );
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  \x1b[31m✗\x1b[0m ${f.name}: ${f.error}`);
    }
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

run().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(2);
});
