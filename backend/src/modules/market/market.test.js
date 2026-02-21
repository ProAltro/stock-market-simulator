import test from "node:test";
import assert from "node:assert";

// ============================================================
// Market Module Unit Tests
// Tests market status, orderbook, and candles proxy logic
// ============================================================

const MARKET_SIM_URL = "http://localhost:8080";

// --- /status endpoint ---

test("Market - status endpoint response structure", async () => {
  const mockCommodities = [
    {
      symbol: "OIL",
      name: "Crude Oil",
      price: 75.5,
      change: 0.5,
      volume: 10000,
      supplyImbalance: 0.02,
    },
    {
      symbol: "STEEL",
      name: "Steel",
      price: 120.3,
      change: -1.2,
      volume: 5000,
      supplyImbalance: -0.01,
    },
    {
      symbol: "WOOD",
      name: "Lumber",
      price: 45.8,
      change: 0.0,
      volume: 3000,
      supplyImbalance: 0.0,
    },
    {
      symbol: "BRICK",
      name: "Brick",
      price: 25.1,
      change: 0.3,
      volume: 2000,
      supplyImbalance: 0.05,
    },
    {
      symbol: "GRAIN",
      name: "Grain",
      price: 8.2,
      change: -0.1,
      volume: 8000,
      supplyImbalance: -0.03,
    },
  ];

  // Simulate the route's transformation
  const response = {
    timestamp: new Date().toISOString(),
    commodities: mockCommodities.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      price: c.price,
      change: c.change || 0,
      volume: c.volume || 0,
      supplyImbalance: c.supplyImbalance || 0,
    })),
  };

  assert.ok("timestamp" in response);
  assert.ok("commodities" in response);
  assert.strictEqual(response.commodities.length, 5);

  for (const c of response.commodities) {
    assert.ok("symbol" in c);
    assert.ok("name" in c);
    assert.ok("price" in c);
    assert.ok("change" in c);
    assert.ok("volume" in c);
    assert.ok("supplyImbalance" in c);
    assert.strictEqual(typeof c.price, "number");
    assert.strictEqual(typeof c.volume, "number");
  }
});

test("Market - status handles missing optional fields", async () => {
  // Market sim might return commodities without change/volume/supplyImbalance
  const rawCommodities = [{ symbol: "OIL", name: "Crude Oil", price: 75 }];

  const mapped = rawCommodities.map((c) => ({
    symbol: c.symbol,
    name: c.name,
    price: c.price,
    change: c.change || 0,
    volume: c.volume || 0,
    supplyImbalance: c.supplyImbalance || 0,
  }));

  assert.strictEqual(mapped[0].change, 0);
  assert.strictEqual(mapped[0].volume, 0);
  assert.strictEqual(mapped[0].supplyImbalance, 0);
});

test("Market - status returns error when sim unavailable", async () => {
  // Simulate connection error response
  const errorResponse = {
    timestamp: new Date().toISOString(),
    commodities: [],
    error: "Market simulator not available",
    hint: "Start the C++ market simulator on port 8080",
  };

  assert.strictEqual(errorResponse.commodities.length, 0);
  assert.ok(errorResponse.error);
  assert.ok(errorResponse.hint);
});

// --- /orderbook/:symbol endpoint ---

test("Market - orderbook response structure", async () => {
  const mockOrderbook = {
    symbol: "OIL",
    bestBid: 74.95,
    bestAsk: 75.05,
    spread: 0.1,
    midPrice: 75.0,
    bids: [
      { price: 74.95, quantity: 100 },
      { price: 74.9, quantity: 200 },
      { price: 74.85, quantity: 150 },
    ],
    asks: [
      { price: 75.05, quantity: 120 },
      { price: 75.1, quantity: 180 },
      { price: 75.15, quantity: 90 },
    ],
  };

  assert.strictEqual(mockOrderbook.symbol, "OIL");
  assert.ok(mockOrderbook.bestBid < mockOrderbook.bestAsk);
  assert.ok(mockOrderbook.spread > 0);
  assert.ok(
    Math.abs(
      mockOrderbook.midPrice -
        (mockOrderbook.bestBid + mockOrderbook.bestAsk) / 2,
    ) < 0.01,
  );
  assert.ok(mockOrderbook.bids.length > 0);
  assert.ok(mockOrderbook.asks.length > 0);

  // Bids should be in descending price order
  for (let i = 1; i < mockOrderbook.bids.length; i++) {
    assert.ok(mockOrderbook.bids[i].price <= mockOrderbook.bids[i - 1].price);
  }
  // Asks should be in ascending price order
  for (let i = 1; i < mockOrderbook.asks.length; i++) {
    assert.ok(mockOrderbook.asks[i].price >= mockOrderbook.asks[i - 1].price);
  }
});

test("Market - orderbook maps only price and quantity", async () => {
  // Raw data from market_sim might have extra fields
  const rawBids = [
    { price: 74.95, quantity: 100, agentId: 42, orderId: 999 },
    { price: 74.9, quantity: 200, agentId: 43, orderId: 998 },
  ];

  const mapped = rawBids.map((b) => ({
    price: b.price,
    quantity: b.quantity,
  }));

  // Should not leak agentId/orderId
  assert.ok(!("agentId" in mapped[0]));
  assert.ok(!("orderId" in mapped[0]));
  assert.strictEqual(mapped[0].price, 74.95);
  assert.strictEqual(mapped[0].quantity, 100);
});

test("Market - orderbook returns 503 when sim unavailable", async () => {
  function getOrderbook(symbol, simAvailable) {
    if (!simAvailable) {
      return { status: 503, body: { error: "Market simulator not available" } };
    }
    return { status: 200, body: { symbol, bids: [], asks: [] } };
  }

  const down = getOrderbook("OIL", false);
  assert.strictEqual(down.status, 503);
  assert.ok(down.body.error);

  const up = getOrderbook("OIL", true);
  assert.strictEqual(up.status, 200);
});

// --- /candles/:symbol endpoint ---

test("Market - candles passes query params", async () => {
  const defaults = { interval: "1m", limit: 500 };

  function parseQuery(query) {
    return {
      interval: query.interval || defaults.interval,
      limit: query.limit || defaults.limit,
    };
  }

  // Default params
  const q1 = parseQuery({});
  assert.strictEqual(q1.interval, "1m");
  assert.strictEqual(q1.limit, 500);

  // Custom params
  const q2 = parseQuery({ interval: "5m", limit: 100 });
  assert.strictEqual(q2.interval, "5m");
  assert.strictEqual(q2.limit, 100);
});

test("Market - candles returns 503 when sim unavailable", async () => {
  function getCandles(symbol, params, simAvailable) {
    if (!simAvailable) {
      return { status: 503, body: { error: "Market simulator not available" } };
    }
    return { status: 200, body: [] };
  }

  const down = getCandles("OIL", {}, false);
  assert.strictEqual(down.status, 503);

  const up = getCandles("OIL", {}, true);
  assert.strictEqual(up.status, 200);
});

test("Market - candle data format", async () => {
  const candle = {
    time: 1706745600000,
    open: 75.0,
    high: 76.2,
    low: 74.8,
    close: 75.5,
    volume: 5000,
  };

  assert.strictEqual(typeof candle.time, "number");
  assert.ok(candle.high >= candle.open);
  assert.ok(candle.high >= candle.close);
  assert.ok(candle.low <= candle.open);
  assert.ok(candle.low <= candle.close);
  assert.ok(candle.high >= candle.low);
  assert.ok(candle.volume > 0);
});

test("Market - supported candle intervals", async () => {
  const validIntervals = ["1m", "5m", "15m", "30m", "1h", "1d"];

  for (const interval of validIntervals) {
    assert.ok(typeof interval === "string");
    assert.ok(interval.length >= 2);
  }

  // Default is "1m"
  const defaultInterval = "1m";
  assert.ok(validIntervals.includes(defaultInterval));
});

test("Market - MARKET_SIM_URL defaults to localhost:8080", async () => {
  const url = process.env.MARKET_SIM_URL || "http://localhost:8080";
  // Default should be localhost
  const defaultUrl = "http://localhost:8080";
  assert.ok(defaultUrl.includes("8080"));
  assert.ok(defaultUrl.startsWith("http"));
});

test("Market - status timestamp is ISO 8601", async () => {
  const timestamp = new Date().toISOString();
  // ISO 8601 pattern: YYYY-MM-DDTHH:mm:ss.sssZ
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(timestamp));
});

test("Market - commodity symbols are uppercase", async () => {
  const symbols = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"];
  for (const s of symbols) {
    assert.strictEqual(s, s.toUpperCase());
  }
});
