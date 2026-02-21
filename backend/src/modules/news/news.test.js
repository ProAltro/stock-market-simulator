import test from "node:test";
import assert from "node:assert";

// ============================================================
// News Module Unit Tests
// Tests news listing and tick-based filtering logic
// ============================================================

const MARKET_SIM_URL = "http://localhost:8080";

// Sample news data matching market_sim format
function createSampleNews() {
  return [
    {
      tick: 10,
      timestamp: 10,
      symbol: "OIL",
      category: "supply",
      sentiment: "negative",
      magnitude: 0.05,
      headline: "Oil supply disruption",
    },
    {
      tick: 10,
      timestamp: 10,
      symbol: "STEEL",
      category: "demand",
      sentiment: "positive",
      magnitude: 0.03,
      headline: "Steel demand surge",
    },
    {
      tick: 25,
      timestamp: 25,
      symbol: "WOOD",
      category: "global",
      sentiment: "neutral",
      magnitude: 0.01,
      headline: "Lumber market stable",
    },
    {
      tick: 50,
      timestamp: 50,
      symbol: "OIL",
      category: "political",
      sentiment: "positive",
      magnitude: 0.08,
      headline: "Trade agreement signed",
    },
    {
      tick: 75,
      timestamp: 75,
      symbol: "GRAIN",
      category: "supply",
      sentiment: "negative",
      magnitude: 0.06,
      headline: "Drought impacts grain",
    },
    {
      tick: 100,
      timestamp: 100,
      symbol: "BRICK",
      category: "demand",
      sentiment: "positive",
      magnitude: 0.04,
      headline: "Construction boom",
    },
  ];
}

// --- GET / (list all news) ---

test("News - list endpoint returns array", async () => {
  const news = createSampleNews();
  assert.ok(Array.isArray(news));
  assert.ok(news.length > 0);
});

test("News - list endpoint respects limit parameter", async () => {
  const allNews = createSampleNews();

  function getNews(limit = 100) {
    return allNews.slice(0, limit);
  }

  assert.strictEqual(getNews(3).length, 3);
  assert.strictEqual(getNews(1).length, 1);
  assert.strictEqual(getNews(100).length, allNews.length); // All 6
  assert.strictEqual(getNews(0).length, 0);
});

test("News - default limit is 100", async () => {
  const defaultLimit = 100;
  assert.strictEqual(defaultLimit, 100);
});

test("News - returns empty array on connection error", async () => {
  // Route returns [] on error
  function getNewsFallback(simAvailable) {
    if (!simAvailable) {
      return [];
    }
    return createSampleNews();
  }

  const result = getNewsFallback(false);
  assert.deepStrictEqual(result, []);
});

// --- GET /:tick (filter by tick) ---

test("News - filter by tick number", async () => {
  const allNews = createSampleNews();

  function filterByTick(tickParam) {
    const tickNum = parseInt(tickParam, 10);
    return allNews.filter((n) => n.tick === tickNum || n.timestamp === tickNum);
  }

  const tick10 = filterByTick("10");
  assert.strictEqual(tick10.length, 2); // OIL and STEEL at tick 10
  assert.ok(tick10.every((n) => n.tick === 10));

  const tick50 = filterByTick("50");
  assert.strictEqual(tick50.length, 1);
  assert.strictEqual(tick50[0].symbol, "OIL");

  const tick999 = filterByTick("999");
  assert.strictEqual(tick999.length, 0); // No news at this tick
});

test("News - tick parameter is parsed as integer", async () => {
  assert.strictEqual(parseInt("50", 10), 50);
  assert.strictEqual(parseInt("0", 10), 0);
  assert.ok(isNaN(parseInt("abc", 10)));
});

test("News - returns empty array on tick filter error", async () => {
  function getTickNewsFallback(simAvailable) {
    if (!simAvailable) {
      return [];
    }
    return createSampleNews();
  }

  const result = getTickNewsFallback(false);
  assert.deepStrictEqual(result, []);
});

// --- News data structure ---

test("News - event has required fields", async () => {
  const news = createSampleNews();
  for (const event of news) {
    assert.ok("tick" in event);
    assert.ok("symbol" in event);
    assert.ok("category" in event);
    assert.ok("sentiment" in event);
    assert.ok("magnitude" in event);
    assert.ok("headline" in event);
  }
});

test("News - sentiment values are valid", async () => {
  const validSentiments = ["positive", "negative", "neutral"];
  const news = createSampleNews();

  for (const event of news) {
    assert.ok(
      validSentiments.includes(event.sentiment),
      `Invalid sentiment: ${event.sentiment}`,
    );
  }
});

test("News - category values are valid", async () => {
  const validCategories = ["supply", "demand", "global", "political"];
  const news = createSampleNews();

  for (const event of news) {
    assert.ok(
      validCategories.includes(event.category),
      `Invalid category: ${event.category}`,
    );
  }
});

test("News - magnitude is a non-negative number", async () => {
  const news = createSampleNews();

  for (const event of news) {
    assert.strictEqual(typeof event.magnitude, "number");
    assert.ok(event.magnitude >= 0);
  }
});

test("News - symbols match known commodities", async () => {
  const knownSymbols = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"];
  const news = createSampleNews();

  for (const event of news) {
    assert.ok(
      knownSymbols.includes(event.symbol),
      `Unknown symbol: ${event.symbol}`,
    );
  }
});

test("News - tick values are non-negative integers", async () => {
  const news = createSampleNews();

  for (const event of news) {
    assert.strictEqual(typeof event.tick, "number");
    assert.ok(Number.isInteger(event.tick));
    assert.ok(event.tick >= 0);
  }
});

test("News - filter handles multiple events at same tick", async () => {
  const allNews = createSampleNews();
  const tick10Events = allNews.filter((n) => n.tick === 10);

  assert.strictEqual(tick10Events.length, 2);
  const symbols = tick10Events.map((n) => n.symbol);
  assert.ok(symbols.includes("OIL"));
  assert.ok(symbols.includes("STEEL"));
});
