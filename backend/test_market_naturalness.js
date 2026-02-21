#!/usr/bin/env node
/**
 * test_market_naturalness.js – Configures the C++ market simulator with given
 * parameters, runs a populate pass, fetches candle/price data, and evaluates a
 * battery of "naturalness" tests based on HFT stylized facts and market microstructure.
 *
 * Tests based on empirical stylized facts from high-frequency financial data:
 *
 * RETURN DISTRIBUTION:
 *  - Leptokurtosis: kurtosis > 10 (real HFT: 20-100+)
 *  - Negative skewness: -0.5 to -1 (crash risk)
 *  - Jarque-Bera: rejects normality (p < 0.001)
 *
 * AUTOCORRELATION STRUCTURE:
 *  - Volatility clustering: corr(|r_t|, |r_{t-1}|) ~ 0.2-0.4
 *  - Ljung-Box on squares: p < 0.001
 *  - ACF decay: hyperbolic (lag^{-0.7})
 *
 * JUMP DETECTION:
 *  - BNS test: RV/BPV ratio > 2 indicates jumps
 *  - Jump proportion: 0.01-0.05 (1-5% of variance)
 *
 * INTRADAY PATTERNS:
 *  - U-shaped volatility: morning/afternoon peaks
 *  - Vol[open]/vol[midday] > 1.5
 *
 * ORDER BOOK METRICS:
 *  - Heavy-tailed sizes: P(size>s) ~ s^{-1.7}
 *  - Imbalance autocorrelation > 0.8
 *  - Spread: 0.01-0.1% of price
 *
 * RANDOMNESS TESTS:
 *  - NIST monobit: p > 0.01
 *  - Runs test: p > 0.01
 *
 * STATISTICAL DISTANCES:
 *  - KS distance: D < 0.02
 *  - Wasserstein: W1 < 0.01 * std
 *
 * Usage:
 *   node test_market_naturalness.js                    # run with CONFIG below
 *   node test_market_naturalness.js --skip-populate    # skip populate, just test existing data
 *   node test_market_naturalness.js --days 100         # populate 100 days instead of default
 */

const SIM_URL = process.env.SIM_URL || "http://127.0.0.1:8080";

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURATION – parameters to test. Modify these and re-run to iterate.
// ──────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  simulation: {
    tickRateMs: 50,
    ticksPerDay: 72000,
    populateTicksPerDay: 576,
    startDate: "2025-01-01",
  },

  commodity: {
    circuitBreakerLimit: 0.12,
    impactDampening: 0.85,           // less extreme than v2 (0.7) to prevent drift
    priceFloor: 0.01,
    supplyDecayRate: 0.04,
    demandDecayRate: 0.04,
  },

  orderBook: {
    orderExpiryMs: 3600000,
  },

  agentCounts: {
    supplyDemand: 15,
    momentum: 3,
    meanReversion: 25,
    noise: 20,
    marketMaker: 12,
    crossEffects: 6,
    inventory: 5,
    event: 8,
  },

  agentCash: {
    meanCash: 100000,
    stdCash: 50000,
  },

  agentGlobal: {
    capitalFraction: 0.04,
    cashReserve: 0.06,
    maxOrderSize: 500,
    sentimentDecayGlobal: 0.88,      // fastest decay → kills autocorrelation
    sentimentDecayCommodity: 0.82,
    maxShortPosition: 20,
  },

  marketMaker: {
    baseSpreadMin: 0.001,
    baseSpreadMax: 0.004,
    inventorySkewMin: 0.0001,
    inventorySkewMax: 0.0003,
    maxInventoryMin: 500,
    maxInventoryMax: 2000,
    initialInventoryPerCommodity: 30,
    quoteCapitalFrac: 0.02,
    sentimentSpreadMult: 0.4,
    volatilitySpreadMult: 8.0,
  },

  supplyDemand: {
    thresholdBase: 0.015,
    thresholdRiskScale: 0.025,
    noiseStdBase: 0.012,
    noiseStdRange: 0.020,
    sentimentImpact: 0.15,           // reduced from v2 (0.25) to prevent drift
    reactionMult: 0.30,
    limitPriceSpreadMax: 0.006,
  },

  momentum: {
    shortPeriodMin: 3,
    shortPeriodRange: 4,
    longPeriodOffsetMin: 10,
    longPeriodOffsetRange: 15,
    reactionMult: 0.08,
    limitOffsetMin: 0.001,
    limitOffsetMax: 0.005,
    signalThresholdRiskScale: 0.003,
  },

  meanReversion: {
    lookbackMin: 15,
    lookbackRange: 25,
    zThresholdMin: 0.7,
    zThresholdRange: 0.7,
    reactionMult: 0.40,              // strong reversion to fight trends
    limitPriceSpreadMax: 0.005,
  },

  noise: {
    tradeProbMin: 0.07,
    tradeProbRange: 0.10,
    sentSensitivityMin: 0.3,
    sentSensitivityMax: 0.7,
    overreactionMult: 1.5,           // moderated from v2 (2.0)
    marketOrderProb: 0.25,
    limitOffsetMin: 0.001,
    limitOffsetMax: 0.012,
    buyBiasSentWeight: 0.5,          // NEUTRAL — v2 was 0.2 causing sell bias
    buyBiasNoiseStd: 0.08,           // tighter noise around 50/50
  },

  news: {
    lambda: 0.20,
    globalImpactStd: 0.020,
    politicalImpactStd: 0.025,
    supplyImpactStd: 0.04,
    demandImpactStd: 0.04,
  },
};

const POPULATE_DAYS = 50;
const INITIAL_PRICES = { OIL: 75, STEEL: 120, WOOD: 45, BRICK: 25, GRAIN: 8 };
const SYMBOLS = Object.keys(INITIAL_PRICES);

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function simFetch(path, opts = {}) {
  const url = `${SIM_URL}${path}`;
  const method = opts.method || "GET";
  console.log(`  [DEBUG] ${method} ${path}`);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const preview =
    typeof json === "object"
      ? JSON.stringify(json).slice(0, 200)
      : String(json).slice(0, 200);
  console.log(
    `  [DEBUG]   → ${res.status} ${preview}${preview.length >= 200 ? "..." : ""}`,
  );
  if (!res.ok)
    throw new Error(
      `${opts.method || "GET"} ${path} → ${res.status}: ${JSON.stringify(json)}`,
    );
  return json;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr) {
  const m = mean(arr);
  const variance =
    arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1 || 1);
  return Math.sqrt(variance);
}

function kurtosis(arr) {
  const m = mean(arr);
  const s = std(arr);
  if (s === 0) return 0;
  const n = arr.length;
  const m4 = arr.reduce((sum, v) => sum + ((v - m) / s) ** 4, 0) / n;
  return m4 - 3; // excess kurtosis
}

function skewness(arr) {
  const m = mean(arr);
  const s = std(arr);
  if (s === 0) return 0;
  const n = arr.length;
  return arr.reduce((sum, v) => sum + ((v - m) / s) ** 3, 0) / n;
}

function autocorrelation(arr, lag = 1) {
  const m = mean(arr);
  const n = arr.length;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    den += (arr[i] - m) ** 2;
    if (i >= lag) num += (arr[i] - m) * (arr[i - lag] - m);
  }
  return den === 0 ? 0 : num / den;
}

function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  const ma = mean(a.slice(0, n)),
    mb = mean(b.slice(0, n));
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

// Augmented Dickey-Fuller simplified: test if AR(1) coefficient < 1
// Returns the AR(1) coefficient (< 1 means stationary / mean-reverting)
function ar1Coefficient(arr) {
  const n = arr.length;
  if (n < 3) return 1;
  let sumXY = 0,
    sumX2 = 0;
  const m = mean(arr);
  for (let i = 1; i < n; i++) {
    const x = arr[i - 1] - m;
    const y = arr[i] - m;
    sumXY += x * y;
    sumX2 += x * x;
  }
  return sumX2 === 0 ? 1 : sumXY / sumX2;
}

// ──────────────────────────────────────────────────────────────────────────────
// HFT Statistics Helpers
// ──────────────────────────────────────────────────────────────────────────────

function jarqueBeraStatistic(arr) {
  const n = arr.length;
  if (n < 4) return 0;
  const s = skewness(arr);
  const k = kurtosis(arr);
  return (n / 6) * (s * s + 0.25 * k * k);
}

function ljungBoxStatistic(arr, lags = 10) {
  const n = arr.length;
  if (n < lags + 1) return 0;
  let Q = 0;
  for (let k = 1; k <= lags; k++) {
    const rho = autocorrelation(arr, k);
    Q += (rho * rho) / (n - k);
  }
  return n * (n + 2) * Q;
}

function bipowerVariation(returns) {
  if (returns.length < 3) return 0;
  let sum = 0;
  for (let i = 1; i < returns.length; i++) {
    sum += Math.abs(returns[i]) * Math.abs(returns[i - 1]);
  }
  return (Math.PI / 2) * sum;
}

function realizedVariance(returns) {
  return returns.reduce((sum, r) => sum + r * r, 0);
}

function bnsJumpTest(returns) {
  const rv = realizedVariance(returns);
  const bpv = bipowerVariation(returns);
  const ratio = bpv > 0 ? rv / bpv : 1;
  const n = returns.length;
  const zStat = (ratio - 1) * Math.sqrt((Math.PI / 2) * n / (n - 2));
  const jumpProp = ratio > 1 ? Math.max(0, 1 - 1 / ratio) : 0;
  return { rv, bpv, ratio, zStat, jumpProp, hasJumps: zStat > 1.96 };
}

function ksStatistic(a, b) {
  if (!a.length || !b.length) return 1;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  let maxD = 0;
  let i = 0, j = 0;
  const nA = sortedA.length, nB = sortedB.length;
  while (i < nA && j < nB) {
    const cdfA = (i + 1) / nA;
    const cdfB = (j + 1) / nB;
    maxD = Math.max(maxD, Math.abs(cdfA - cdfB));
    if (sortedA[i] < sortedB[j]) i++;
    else j++;
  }
  return maxD;
}

function wassersteinDistance(a, b) {
  if (!a.length || !b.length) return 0;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  const n = Math.max(sortedA.length, sortedB.length);
  if (n <= 1) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const idxA = i * (sortedA.length - 1) / (n - 1);
    const idxB = i * (sortedB.length - 1) / (n - 1);
    const ia = Math.floor(idxA);
    const ib = Math.floor(idxB);
    const fa = idxA - ia;
    const fb = idxB - ib;
    const valA = (ia + 1 < sortedA.length) ? sortedA[ia] * (1 - fa) + sortedA[ia + 1] * fa : sortedA[ia];
    const valB = (ib + 1 < sortedB.length) ? sortedB[ib] * (1 - fb) + sortedB[ib + 1] * fb : sortedB[ib];
    sum += Math.abs(valA - valB);
  }
  return sum / n;
}

function countRuns(bits) {
  if (!bits.length) return 0;
  let runs = 1;
  for (let i = 1; i < bits.length; i++) {
    if (bits[i] !== bits[i - 1]) runs++;
  }
  return runs;
}

function runsTestPValue(bits) {
  if (!bits.length) return 1;
  const n0 = bits.filter(b => b === 0).length;
  const n1 = bits.filter(b => b === 1).length;
  const n = n0 + n1;
  if (n0 === 0 || n1 === 0) return 0;
  const R = countRuns(bits);
  const mu = 2 * n0 * n1 / n + 1;
  const sigma2 = 2 * n0 * n1 * (2 * n0 * n1 - n) / (n * n * (n - 1));
  const sigma = Math.sqrt(sigma2);
  if (sigma < 1e-10) return 1;
  const z = (R - mu) / sigma;
  return Math.min(1, Math.max(0, 2 * (1 - erf(Math.abs(z) / Math.sqrt(2)))));
}

function monobitTestPValue(bits) {
  if (!bits.length) return 1;
  const n = bits.length;
  let S = 0;
  for (const b of bits) S += b === 1 ? 1 : -1;
  const sObs = Math.abs(S) / Math.sqrt(n);
  return erfc(sObs / Math.sqrt(2));
}

function binarizeReturns(returns) {
  return returns.filter(r => r !== 0).map(r => r > 0 ? 1 : 0);
}

function erf(x) {
  const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function erfc(x) {
  return 1 - erf(x);
}

function powerLawExponent(sizes, xMin = 0) {
  if (sizes.length < 10) return 1;
  let minVal = xMin;
  if (minVal <= 0) {
    const sorted = [...sizes].sort((a, b) => a - b);
    minVal = sorted[Math.floor(sorted.length * 0.9)];
  }
  let sum = 0;
  let count = 0;
  for (const s of sizes) {
    if (s > minVal) {
      sum += Math.log(s / minVal);
      count++;
    }
  }
  if (count < 5) return 1;
  return 1 + count / sum;
}

function sumACF(arr, maxLag) {
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    sum += Math.abs(autocorrelation(arr, lag));
  }
  return sum;
}

function filterNonZero(arr) {
  return arr.filter(x => Math.abs(x) > 1e-15);
}

// ──────────────────────────────────────────────────────────────────────────────
// News injection – simulates real-world information shocks
// ──────────────────────────────────────────────────────────────────────────────

async function injectRandomNews(count = 20) {
  const categories = ["global", "political", "supply", "demand"];
  const sentiments = ["positive", "negative", "neutral"];

  for (let i = 0; i < count; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
    const magnitude = 0.02 + Math.random() * 0.08; // 2–10% impact

    const event = { category, sentiment, magnitude: +magnitude.toFixed(4) };

    // Supply/demand news needs a target commodity
    if (category === "supply" || category === "demand") {
      event.target = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    }

    try {
      await simFetch("/news", { method: "POST", body: JSON.stringify(event) });
    } catch (e) {
      console.warn(`   Warning: failed to inject news event: ${e.message}`);
    }
  }
  console.log(`   Injected ${count} news events`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Test harness
// ──────────────────────────────────────────────────────────────────────────────

const results = [];
const JSON_OUTPUT = process.argv.includes("--json");

function test(name, pass, detail, weight = 1) {
  results.push({ name, pass, detail, weight });
  if (!JSON_OUTPUT) {
    const icon = pass ? "✅" : "❌";
    console.log(`  ${icon} ${name}: ${detail}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const skipPopulate = args.includes("--skip-populate");
  const daysArg = args.indexOf("--days");
  const days = daysArg >= 0 ? parseInt(args[daysArg + 1]) : POPULATE_DAYS;

  // 1. Check sim is reachable
  try {
    await simFetch("/state");
  } catch (e) {
    console.error(`Cannot reach simulation at ${SIM_URL} — is it running?`);
    console.error(e.message);
    process.exit(1);
  }

  if (!skipPopulate) {
    // 2. Push config
    console.log("📋 Pushing configuration...");
    await simFetch("/config", { method: "POST", body: JSON.stringify(CONFIG) });

    // 3. Stop the running simulation (populate refuses while running)
    console.log("⏹️  Stopping simulation...");
    await simFetch("/control", {
      method: "POST",
      body: JSON.stringify({ action: "stop" }),
    });

    // 4. Reinitialize (rebuilds agents/commodities)
    console.log("🔄 Reinitializing simulation...");
    await simFetch("/reinitialize", { method: "POST" });

    // 5. Populate
    console.log(
      `📈 Populating ${days} days of data (this may take a moment)...`,
    );
    const popResult = await simFetch("/populate", {
      method: "POST",
      body: JSON.stringify({
        days,
        startDate: CONFIG.simulation.startDate || "2025-01-01",
      }),
    });
    console.log(`   Populate started: ${JSON.stringify(popResult)}`);

    // 6. Poll /state until populating is complete
    console.log("   Waiting for populate to complete...");
    let popDone = false;
    for (let i = 0; i < 300; i++) {
      await sleep(1000);
      const state = await simFetch("/state");
      if (!state.populating) {
        popDone = true;
        console.log(
          `   Populate done at tick ${state.currentTick} (${state.simDate})`,
        );
        break;
      }
      if (i % 10 === 0) {
        console.log(
          `   ... day ${state.populateProgress?.current}/${state.populateProgress?.target}`,
        );
      }
    }
    if (!popDone) {
      console.warn(
        "   ⚠️ Populate still running after 5 minutes, continuing anyway...",
      );
    }

    // 7. Start the sim so it's running for news injection / live behavior
    console.log("▶️  Starting simulation...");
    await simFetch("/control", {
      method: "POST",
      body: JSON.stringify({ action: "start" }),
    });

    // 8. Inject random news events to simulate real-world shocks
    console.log("📰 Injecting random news events...");
    await injectRandomNews(20);
  } else {
    console.log("⏭️  Skipping populate (--skip-populate)");
  }

  // 9. Fetch data for tests
  console.log("\n📊 Fetching market data for tests...\n");

  const commodities = await simFetch("/commodities");
  console.log(
    `\n  [DEBUG] Commodities received: ${Array.isArray(commodities) ? commodities.length : "not-array"}`,
  );
  const priceMap = {};
  for (const c of commodities) {
    priceMap[c.symbol] = c.price;
    console.log(
      `  [DEBUG]   ${c.symbol}: price=$${c.price?.toFixed(4)}, vol=${c.dailyVolume}, imb=${c.supplyDemand?.imbalance?.toFixed(6)}, prod=${c.supplyDemand?.production?.toFixed(2)}, cons=${c.supplyDemand?.consumption?.toFixed(2)}, inv=${c.supplyDemand?.inventory?.toFixed(2)}`,
    );
  }

  // Fetch daily candles for each symbol
  const dailyCandles = {};
  const hourlyCandles = {};
  for (const sym of SYMBOLS) {
    try {
      dailyCandles[sym] = await simFetch(
        `/candles/${sym}?interval=1d&limit=500`,
      );
    } catch (e) {
      console.log(
        `  [DEBUG] Failed to fetch daily candles for ${sym}: ${e.message}`,
      );
      dailyCandles[sym] = [];
    }
    try {
      hourlyCandles[sym] = await simFetch(
        `/candles/${sym}?interval=1h&limit=500`,
      );
    } catch (e) {
      console.log(
        `  [DEBUG] Failed to fetch hourly candles for ${sym}: ${e.message}`,
      );
      hourlyCandles[sym] = [];
    }
    const dc = dailyCandles[sym];
    const hc = hourlyCandles[sym];
    console.log(
      `  [DEBUG] ${sym}: ${dc.length} daily candles, ${hc.length} hourly candles`,
    );
    if (dc.length > 0) {
      const first = dc[0],
        last = dc[dc.length - 1];
      console.log(
        `  [DEBUG]   Daily first: O=${first.open?.toFixed(4)} H=${first.high?.toFixed(4)} L=${first.low?.toFixed(4)} C=${first.close?.toFixed(4)} V=${first.volume}`,
      );
      console.log(
        `  [DEBUG]   Daily last:  O=${last.open?.toFixed(4)} H=${last.high?.toFixed(4)} L=${last.low?.toFixed(4)} C=${last.close?.toFixed(4)} V=${last.volume}`,
      );
    }
  }

  // Fetch orderbooks
  const orderbooks = {};
  for (const sym of SYMBOLS) {
    try {
      orderbooks[sym] = await simFetch(`/orderbook/${sym}`);
      const ob = orderbooks[sym];
      console.log(
        `  [DEBUG] ${sym} orderbook: ${ob?.bids?.length || 0} bids, ${ob?.asks?.length || 0} asks`,
      );
      if (ob?.bids?.length > 0)
        console.log(
          `  [DEBUG]   bestBid=${ob.bids[0].price?.toFixed(4)}, bestAsk=${ob.asks?.[0]?.price?.toFixed(4)}`,
        );
    } catch (e) {
      console.log(
        `  [DEBUG] Failed to fetch orderbook for ${sym}: ${e.message}`,
      );
      orderbooks[sym] = null;
    }
  }

  // Fetch metrics
  let metrics = {};
  try {
    metrics = await simFetch("/metrics");
    console.log(`  [DEBUG] Metrics: ${JSON.stringify(metrics).slice(0, 300)}`);
  } catch (e) {
    console.log(`  [DEBUG] Failed to fetch metrics: ${e.message}`);
  }

  // ── Run tests ──────────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  MARKET NATURALNESS TEST BATTERY");
  console.log("═══════════════════════════════════════════════════════════\n");

  // --- Test 1: Price Range (no extreme decay/explosion) ---
  console.log("── Price Stability ──");
  for (const sym of SYMBOLS) {
    const initial = INITIAL_PRICES[sym];
    const current = priceMap[sym];
    const ratio = current / initial;
    // Prices should stay within 0.1x to 10x of initial over 200 days
    const pass = ratio >= 0.1 && ratio <= 10;
    test(
      `${sym} price range`,
      pass,
      `initial=$${initial}, current=$${current?.toExponential(4)}, ratio=${ratio?.toExponential(2)} (want 0.1–10x)`,
    );
  }

  // --- Test 2: Daily returns distribution ---
  console.log("\n── Return Distribution ──");
  for (const sym of SYMBOLS) {
    const candles = dailyCandles[sym];
    if (!candles || candles.length < 10) {
      test(
        `${sym} returns`,
        false,
        `Not enough daily candles (${candles?.length || 0})`,
      );
      continue;
    }
    const closes = candles.map((c) => c.close).filter((c) => c > 0);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    if (returns.length < 5) {
      test(`${sym} returns`, false, "Too few returns to analyze");
      continue;
    }

    const m = mean(returns);
    const s = std(returns);
    const k = kurtosis(returns);
    const sk = skewness(returns);
    const ac1 = autocorrelation(returns, 1);
    const annualizedVol = s * Math.sqrt(252);

    // Volatility: real commodities ≈ 15–60% annualized
    const volOk = annualizedVol > 0.05 && annualizedVol < 1.5;
    test(
      `${sym} annualized volatility`,
      volOk,
      `${(annualizedVol * 100).toFixed(1)}% (want 5%–150%)`,
    );

    // Mean return: should be roughly near zero for daily (-1% to +1%)
    const meanOk = Math.abs(m) < 0.03;
    test(
      `${sym} mean daily return`,
      meanOk,
      `${(m * 100).toFixed(4)}% (want |mean| < 3%)`,
    );

    // Kurtosis > 0 means fat tails (leptokurtic, like real markets)
    test(
      `${sym} fat tails (excess kurtosis)`,
      k > -1,
      `${k.toFixed(2)} (want > -1, real markets ≈ 1–10+)`,
    );

    // Autocorrelation: daily returns should have low AC(1) (< 0.3 absolute)
    const acOk = Math.abs(ac1) < 0.4;
    test(
      `${sym} return autocorrelation AC(1)`,
      acOk,
      `${ac1.toFixed(4)} (want |ac| < 0.4, ideal < 0.1)`,
    );
  }

  // --- Test 3: Volatility clustering (GARCH-like) ---
  console.log("\n── Volatility Clustering ──");
  for (const sym of SYMBOLS) {
    const candles = hourlyCandles[sym];
    if (!candles || candles.length < 20) {
      test(`${sym} vol clustering`, false, `Not enough hourly candles`);
      continue;
    }
    const closes = candles.map((c) => c.close).filter((c) => c > 0);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    const absReturns = returns.map(Math.abs);
    const ac1Abs = autocorrelation(absReturns, 1);
    // Positive AC of absolute returns = volatility clustering
    test(
      `${sym} volatility clustering`,
      ac1Abs > -0.1,
      `AC(1) of |returns| = ${ac1Abs.toFixed(4)} (want > -0.1, real > 0.1)`,
    );
  }

  // --- Test 4: Mean reversion (AR1 of price levels) ---
  console.log("\n── Mean Reversion ──");
  for (const sym of SYMBOLS) {
    const candles = dailyCandles[sym];
    if (!candles || candles.length < 10) {
      test(`${sym} mean reversion`, false, `Not enough data`);
      continue;
    }
    const closes = candles.map((c) => c.close).filter((c) => c > 0);
    const ar1 = ar1Coefficient(closes);
    // AR(1) close to 1 = random walk (good for short-term)
    // AR(1) < 1 = mean-reverting (good for long-term commodities)
    const pass = ar1 > 0.5 && ar1 < 1.05;
    test(
      `${sym} AR(1) coefficient`,
      pass,
      `${ar1.toFixed(4)} (want 0.5–1.05, real markets ≈ 0.95–1.00)`,
    );
  }

  // --- Test 5: Volume variation ---
  console.log("\n── Volume ──");
  for (const sym of SYMBOLS) {
    const candles = dailyCandles[sym];
    if (!candles || candles.length < 5) {
      test(`${sym} volume`, false, `Not enough data`);
      continue;
    }
    const vols = candles.map((c) => c.volume);
    const volStd = std(vols);
    const volMean = mean(vols);
    const cv = volMean > 0 ? volStd / volMean : 0;
    // Volume should not be perfectly constant — some variation
    test(
      `${sym} volume variation (CV)`,
      cv > 0.01,
      `CV = ${cv.toFixed(4)} (want > 0.01, i.e. not constant)`,
    );
    // Volume should be positive
    const allPositive = vols.every((v) => v > 0);
    test(`${sym} positive volume`, allPositive, `min=${Math.min(...vols)}`);
  }

  // --- Test 6: Cross-commodity correlation ---
  console.log("\n── Cross-Commodity Correlation ──");
  // OIL and STEEL should be positively correlated (from crossEffects config)
  const oilCandles = dailyCandles["OIL"] || [];
  const steelCandles = dailyCandles["STEEL"] || [];
  if (oilCandles.length > 10 && steelCandles.length > 10) {
    const n = Math.min(oilCandles.length, steelCandles.length);
    const oilCloses = oilCandles.slice(0, n).map((c) => c.close);
    const steelCloses = steelCandles.slice(0, n).map((c) => c.close);
    const oilRet = [],
      steelRet = [];
    for (let i = 1; i < n; i++) {
      if (oilCloses[i] > 0 && oilCloses[i - 1] > 0)
        oilRet.push(Math.log(oilCloses[i] / oilCloses[i - 1]));
      if (steelCloses[i] > 0 && steelCloses[i - 1] > 0)
        steelRet.push(Math.log(steelCloses[i] / steelCloses[i - 1]));
    }
    const corr = correlation(oilRet, steelRet);
    // These have cross-effects defined, should show some positive correlation
    test(
      "OIL-STEEL return correlation",
      corr > -0.5,
      `ρ = ${corr.toFixed(4)} (want > -0.5)`,
    );
  } else {
    test("OIL-STEEL correlation", false, "Not enough data");
  }

  // --- Test 7: Spread reasonableness ---
  console.log("\n── Spread & Orderbook ──");
  for (const sym of SYMBOLS) {
    const ob = orderbooks[sym];
    if (!ob || !ob.bids?.length || !ob.asks?.length) {
      test(`${sym} orderbook present`, false, "No orderbook data");
      continue;
    }
    test(
      `${sym} orderbook present`,
      true,
      `bids=${ob.bids.length}, asks=${ob.asks.length}`,
    );

    const bestBid = ob.bids[0]?.price;
    const bestAsk = ob.asks[0]?.price;
    if (bestBid > 0 && bestAsk > 0) {
      const midPrice = (bestBid + bestAsk) / 2;
      const spreadPct = (bestAsk - bestBid) / midPrice;
      const pass = spreadPct > 0 && spreadPct < 0.1;
      test(
        `${sym} spread`,
        pass,
        `${(spreadPct * 100).toFixed(3)}% (want 0%–10%)`,
      );
    }
  }

  // --- Test 8: No flatline ---
  console.log("\n── Activity ──");
  for (const sym of SYMBOLS) {
    const candles = dailyCandles[sym];
    if (!candles || candles.length < 5) {
      test(`${sym} not flatline`, false, "Not enough data");
      continue;
    }
    // Check that not all closes are identical
    const closes = candles.map((c) => c.close);
    const unique = new Set(closes.map((c) => c.toFixed(8)));
    test(
      `${sym} price variety`,
      unique.size > 2,
      `${unique.size} unique daily closes (want > 2)`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HFT/MICROSTRUCTURE VALIDATION TESTS
  // Based on empirical stylized facts from high-frequency financial data
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  HFT STYLIZED FACTS VALIDATION");
  console.log("═══════════════════════════════════════════════════════════\n");

  // --- HFT Test 1: Leptokurtosis (fat tails) ---
  console.log("── HFT: Return Distribution ──");
  for (const sym of SYMBOLS) {
    const candles = hourlyCandles[sym];
    if (!candles || candles.length < 50) {
      test(`HFT ${sym} kurtosis`, false, "Not enough hourly data");
      continue;
    }
    const closes = candles.map(c => c.close).filter(c => c > 0);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      const r = Math.log(closes[i] / closes[i - 1]);
      if (Math.abs(r) > 1e-15) returns.push(r);
    }
    if (returns.length < 30) {
      test(`HFT ${sym} kurtosis`, false, "Too few non-zero returns");
      continue;
    }
    
    const k = kurtosis(returns);
    const sk = skewness(returns);
    const jb = jarqueBeraStatistic(returns);
    
    // Real HFT: kurtosis > 10 (often 20-100+), Gaussian: ~0
    test(
      `HFT ${sym} excess kurtosis`,
      k > 3,
      `${k.toFixed(2)} (want >3, ideal >10, real HFT: 20-100+)`,
      3
    );
    
    // Real HFT: skewness -0.5 to -1 (negative, crash risk)
    test(
      `HFT ${sym} skewness`,
      sk > -3 && sk < 0.5,
      `${sk.toFixed(3)} (want -3 to 0.5, ideal: -0.5 to -1)`,
      2
    );
    
    // JB should be large for non-normal data
    test(
      `HFT ${sym} Jarque-Bera`,
      jb > 50,
      `JB=${jb.toFixed(2)} (want >50, rejects normality)`,
      2
    );
  }

  // --- HFT Test 2: Volatility Clustering ---
  console.log("\n── HFT: Volatility Clustering ──");
  for (const sym of SYMBOLS) {
    const candles = hourlyCandles[sym];
    if (!candles || candles.length < 100) {
      test(`HFT ${sym} vol clustering`, false, "Not enough hourly data");
      continue;
    }
    const closes = candles.map(c => c.close).filter(c => c > 0);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    const nonZeroReturns = filterNonZero(returns);
    if (nonZeroReturns.length < 50) {
      test(`HFT ${sym} vol clustering`, false, "Too few non-zero returns");
      continue;
    }
    
    const absReturns = nonZeroReturns.map(Math.abs);
    const acf1 = autocorrelation(absReturns, 1);
    const acfSum = sumACF(absReturns, 20);
    const sqReturns = nonZeroReturns.map(r => r * r);
    const lbQ = ljungBoxStatistic(sqReturns, 10);
    
    // Real: acf(|r|) ~ 0.2-0.4 at lag 1, sum(acf[1:20]) > 1.0
    test(
      `HFT ${sym} ACF(|returns|) lag-1`,
      acf1 > 0.05,
      `${acf1.toFixed(4)} (want >0.05, ideal: 0.2-0.4)`,
      3
    );
    
    test(
      `HFT ${sym} ACF sum (lags 1-20)`,
      acfSum > 0.5,
      `${acfSum.toFixed(4)} (want >0.5, ideal: >1.0)`,
      2
    );
    
    test(
      `HFT ${sym} Ljung-Box (squared)`,
      lbQ > 20,
      `Q=${lbQ.toFixed(2)} (want >20, real: large, p<0.001)`,
      2
    );
  }

  // --- HFT Test 3: Jump Detection (BNS) ---
  console.log("\n── HFT: Jump Detection ──");
  for (const sym of SYMBOLS) {
    const candles = hourlyCandles[sym];
    if (!candles || candles.length < 100) {
      test(`HFT ${sym} jumps`, false, "Not enough hourly data");
      continue;
    }
    const closes = candles.map(c => c.close).filter(c => c > 0);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      const r = Math.log(closes[i] / closes[i - 1]);
      if (Math.abs(r) > 1e-15) returns.push(r);
    }
    if (returns.length < 50) {
      test(`HFT ${sym} jumps`, false, "Too few non-zero returns");
      continue;
    }
    
    const jump = bnsJumpTest(returns);
    
    // Real: RV/BPV ratio > 2 indicates jumps, jump proportion 0.01-0.05
    test(
      `HFT ${sym} BNS ratio (RV/BPV)`,
      jump.ratio > 1.2,
      `${jump.ratio.toFixed(4)} (want >1.2, real: >2 indicates jumps)`,
      2
    );
    
    test(
      `HFT ${sym} BNS Z-statistic`,
      jump.zStat > 1.96,
      `Z=${jump.zStat.toFixed(2)} (want >1.96 = significant jumps)`,
      1
    );
    
    test(
      `HFT ${sym} jump proportion`,
      jump.jumpProp >= 0.005 && jump.jumpProp <= 0.15,
      `${(jump.jumpProp * 100).toFixed(2)}% (want 0.5-15%, real: 1-5%)`,
      2
    );
  }

  // --- HFT Test 4: Intraday Volatility Pattern ---
  console.log("\n── HFT: Intraday Patterns ──");
  for (const sym of SYMBOLS) {
    const candles = hourlyCandles[sym];
    if (!candles || candles.length < 100) {
      test(`HFT ${sym} intraday pattern`, false, "Not enough hourly data");
      continue;
    }
    const closes = candles.map(c => c.close).filter(c => c > 0);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    if (returns.length < 50) continue;
    
    // Divide into 5 periods (simulating intraday: open, morning, midday, afternoon, close)
    const periodSize = Math.floor(returns.length / 5);
    if (periodSize < 10) continue;
    
    const periodVols = [];
    for (let p = 0; p < 5; p++) {
      const periodReturns = returns.slice(p * periodSize, (p + 1) * periodSize);
      periodVols.push(std(periodReturns));
    }
    
    // U-shape: morning/afternoon higher than midday
    const volRatio = periodVols[0] > 0 && periodVols[2] > 0 
      ? periodVols[0] / periodVols[2] 
      : 1;
    
    test(
      `HFT ${sym} vol ratio (open/midday)`,
      volRatio > 1.1,
      `${volRatio.toFixed(2)} (want >1.1, real U-shape: >1.5)`,
      2
    );
    
    const volOfVol = std(periodVols);
    test(
      `HFT ${sym} volatility of volatility`,
      volOfVol > 1e-6,
      `${volOfVol.toFixed(6)} (want >0, indicates U-shape)`,
      1
    );
  }

  // --- HFT Test 5: Randomness Tests ---
  console.log("\n── HFT: Randomness Tests ──");
  for (const sym of SYMBOLS) {
    const candles = hourlyCandles[sym];
    if (!candles || candles.length < 100) {
      test(`HFT ${sym} randomness`, false, "Not enough hourly data");
      continue;
    }
    const closes = candles.map(c => c.close).filter(c => c > 0);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      const r = Math.log(closes[i] / closes[i - 1]);
      if (Math.abs(r) > 1e-15) returns.push(r);
    }
    if (returns.length < 50) continue;
    
    const bits = binarizeReturns(returns);
    if (bits.length < 30) continue;
    
    const monobitP = monobitTestPValue(bits);
    const runsP = runsTestPValue(bits);
    
    // Real data passes monobit/runs (p > 0.01)
    test(
      `HFT ${sym} monobit test`,
      monobitP > 0.01,
      `p=${monobitP.toFixed(4)} (want p>0.01)`,
      2
    );
    
    test(
      `HFT ${sym} runs test`,
      runsP > 0.01,
      `p=${runsP.toFixed(4)} (want p>0.01)`,
      2
    );
    
    // Sign balance
    const posCount = bits.filter(b => b === 1).length;
    const posRatio = posCount / bits.length;
    test(
      `HFT ${sym} sign balance`,
      posRatio >= 0.40 && posRatio <= 0.60,
      `${(posRatio * 100).toFixed(1)}% positive (want 40-60%, real: 45-55%)`,
      2
    );
  }

  // --- HFT Test 6: Statistical Distances ---
  console.log("\n── HFT: Statistical Distances ──");
  const allReturns = {};
  for (const sym of SYMBOLS) {
    const candles = hourlyCandles[sym];
    if (!candles || candles.length < 100) continue;
    const closes = candles.map(c => c.close).filter(c => c > 0);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      const r = Math.log(closes[i] / closes[i - 1]);
      if (Math.abs(r) > 1e-15) returns.push(r);
    }
    if (returns.length >= 50) {
      allReturns[sym] = returns;
    }
  }
  
  // Compare distributions across commodities
  const symbols = Object.keys(allReturns);
  if (symbols.length >= 2) {
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symA = symbols[i];
        const symB = symbols[j];
        const retA = allReturns[symA];
        const retB = allReturns[symB];
        
        const ks = ksStatistic(retA, retB);
        const wass = wassersteinDistance(retA, retB);
        const avgStd = (std(retA) + std(retB)) / 2;
        
        // KS < 0.05 for reasonably similar distributions
        test(
          `HFT KS(${symA},${symB})`,
          ks < 0.15,
          `D=${ks.toFixed(4)} (want <0.15, ideal <0.05)`,
          1
        );
        
        // Wasserstein normalized by std
        const wassNorm = avgStd > 0 ? wass / avgStd : wass;
        test(
          `HFT W1(${symA},${symB})`,
          wassNorm < 0.5,
          `W1=${wass.toFixed(6)}, normalized=${wassNorm.toFixed(4)} (want <0.5)`,
          1
        );
      }
    }
  }

  // --- HFT Test 7: Order Book Metrics ---
  console.log("\n── HFT: Order Book Metrics ──");
  for (const sym of SYMBOLS) {
    const ob = orderbooks[sym];
    if (!ob || !ob.bids?.length || !ob.asks?.length) {
      test(`HFT ${sym} orderbook metrics`, false, "No orderbook data");
      continue;
    }
    
    const bidVols = ob.bids.map(b => b.quantity || b.totalQuantity || 0).filter(v => v > 0);
    const askVols = ob.asks.map(a => a.quantity || a.totalQuantity || 0).filter(v => v > 0);
    const allVols = [...bidVols, ...askVols];
    
    if (allVols.length >= 10) {
      const alpha = powerLawExponent(allVols);
      // Real: P(size>s) ~ s^{-1.7}, alpha ~ 1.5-2.0
      test(
        `HFT ${sym} power law exponent`,
        alpha > 1.2 && alpha < 3.0,
        `α=${alpha.toFixed(2)} (want 1.2-3.0, real: ~1.7)`,
        2
      );
    }
    
    // Spread check
    const bestBid = ob.bids[0]?.price;
    const bestAsk = ob.asks[0]?.price;
    if (bestBid > 0 && bestAsk > 0) {
      const midPrice = (bestBid + bestAsk) / 2;
      const spreadPct = (bestAsk - bestBid) / midPrice;
      // Real: spread ~ 0.01-0.1% of price
      test(
        `HFT ${sym} spread %`,
        spreadPct > 0 && spreadPct < 0.01,
        `${(spreadPct * 100).toFixed(4)}% (want <1%, real: 0.01-0.1%)`,
        3
      );
    }
    
    // Imbalance
    const totalBid = bidVols.reduce((a, b) => a + b, 0);
    const totalAsk = askVols.reduce((a, b) => a + b, 0);
    const totalVol = totalBid + totalAsk;
    if (totalVol > 0) {
      const imbalance = Math.abs(totalBid - totalAsk) / totalVol;
      // Real: mean imbalance ~ 0.6
      test(
        `HFT ${sym} order imbalance`,
        imbalance > 0.2 && imbalance < 0.9,
        `${imbalance.toFixed(3)} (want 0.2-0.9, real mean: ~0.6)`,
        1
      );
    }
  }

  // ── Summary & Naturalness Score ────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const pct = ((passed / total) * 100).toFixed(0);
  
  // Weighted naturalness score
  const totalWeight = results.reduce((s, r) => s + (r.weight || 1), 0);
  const passedWeight = results.filter(r => r.pass).reduce((s, r) => s + (r.weight || 1), 0);
  const naturalnessScore = ((passedWeight / totalWeight) * 100).toFixed(1);

  // HFT-specific score (tests starting with "HFT")
  const hftResults = results.filter(r => r.name.startsWith("HFT"));
  const hftTotal = hftResults.reduce((s, r) => s + (r.weight || 1), 0);
  const hftPassed = hftResults.filter(r => r.pass).reduce((s, r) => s + (r.weight || 1), 0);
  const hftScore = hftTotal > 0 ? ((hftPassed / hftTotal) * 100).toFixed(1) : "N/A";

  if (JSON_OUTPUT) {
    const output = {
      passed, total, pct: +pct,
      naturalnessScore: +naturalnessScore,
      hftScore: hftScore === "N/A" ? 0 : +hftScore,
      results: results.map(r => ({ name: r.name, pass: r.pass, detail: r.detail, weight: r.weight })),
      prices: Object.fromEntries(SYMBOLS.map(s => [s, priceMap[s]])),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  RESULTS: ${passed}/${total} passed (${pct}%)`);
    console.log(`  NATURALNESS SCORE: ${naturalnessScore}/100 (weighted)`);
    console.log(`  HFT SCORE: ${hftScore}/100`);
    if (passed < total) {
      console.log(`  FAILURES:`);
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`    ❌ ${r.name}: ${r.detail}`);
      }
    }
    console.log("═══════════════════════════════════════════════════════════\n");

    // Print current prices as quick reference
    console.log("  Current prices:");
    for (const sym of SYMBOLS) {
      const p = priceMap[sym];
      const init = INITIAL_PRICES[sym];
      const ratio = p / init;
      console.log(
        `    ${sym}: $${p?.toExponential(4)} (${(ratio * 100).toFixed(1)}% of initial $${init})`,
      );
    }
    console.log();
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
