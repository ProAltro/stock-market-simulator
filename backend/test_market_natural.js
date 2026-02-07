/**
 * Market Naturalness Tests
 *
 * Queries the 6 months of sim candle data from the DB and runs statistical
 * tests that real-world equity markets would pass.  Any failure flags
 * something the bots are doing wrong.
 *
 * Run with:  node test_market_natural.js
 *
 * Requires DATABASE_URL to be set (or .env loaded) so Prisma can connect.
 */

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
config(); // loads .env

const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warned = 0;
const failures = [];
const warnings = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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

async function warn(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    passed++;
    console.log("\x1b[32mPASS\x1b[0m");
  } catch (err) {
    warned++;
    warnings.push({ name, error: err.message });
    console.log(`\x1b[33mWARN\x1b[0m  ${err.message}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m── ${title} ──\x1b[0m`);
}

// ─── stats helpers ────────────────────────────────────────────────────────────

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr) {
  const m = mean(arr);
  return Math.sqrt(
    arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1),
  );
}

function skewness(arr) {
  const m = mean(arr);
  const s = std(arr);
  if (s === 0) return 0;
  const n = arr.length;
  return (
    (n / ((n - 1) * (n - 2))) *
    arr.reduce((sum, v) => sum + ((v - m) / s) ** 3, 0)
  );
}

function kurtosis(arr) {
  const m = mean(arr);
  const s = std(arr);
  if (s === 0) return 0;
  const n = arr.length;
  return arr.reduce((sum, v) => sum + ((v - m) / s) ** 4, 0) / n - 3; // excess kurtosis
}

function autocorrelation(arr, lag = 1) {
  const m = mean(arr);
  let num = 0;
  let den = 0;
  for (let i = 0; i < arr.length; i++) {
    den += (arr[i] - m) ** 2;
    if (i >= lag) {
      num += (arr[i] - m) * (arr[i - lag] - m);
    }
  }
  return den === 0 ? 0 : num / den;
}

/** Log returns from a series of close prices */
function logReturns(closes) {
  const ret = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      ret.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  return ret;
}

/** Percentage of values in arr that satisfy predicate */
function pct(arr, predicate) {
  return arr.filter(predicate).length / arr.length;
}

/** Max drawdown from a price series */
function maxDrawdown(prices) {
  let peak = prices[0];
  let maxDD = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (peak - p) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

/** Hurst exponent estimate via R/S analysis */
function hurstExponent(series) {
  const n = series.length;
  if (n < 20) return 0.5;

  const sizes = [];
  for (let s = 10; s <= Math.floor(n / 2); s = Math.floor(s * 1.5)) {
    sizes.push(s);
  }

  const logRS = [];
  const logN = [];

  for (const size of sizes) {
    const numBlocks = Math.floor(n / size);
    if (numBlocks < 1) continue;

    let sumRS = 0;
    let count = 0;

    for (let b = 0; b < numBlocks; b++) {
      const block = series.slice(b * size, (b + 1) * size);
      const m = mean(block);
      const devs = block.map((v) => v - m);

      // Cumulative deviate
      const cumDevs = [];
      let cum = 0;
      for (const d of devs) {
        cum += d;
        cumDevs.push(cum);
      }

      const R = Math.max(...cumDevs) - Math.min(...cumDevs);
      const S = std(block);
      if (S > 0) {
        sumRS += R / S;
        count++;
      }
    }

    if (count > 0) {
      logRS.push(Math.log(sumRS / count));
      logN.push(Math.log(size));
    }
  }

  if (logRS.length < 2) return 0.5;

  // Linear regression slope
  const mx = mean(logN);
  const my = mean(logRS);
  let num = 0;
  let den = 0;
  for (let i = 0; i < logN.length; i++) {
    num += (logN[i] - mx) * (logRS[i] - my);
    den += (logN[i] - mx) ** 2;
  }
  return den === 0 ? 0.5 : num / den;
}

/** Ljung-Box Q statistic for serial correlation */
function ljungBoxQ(returns, maxLag = 10) {
  const n = returns.length;
  let Q = 0;
  for (let k = 1; k <= maxLag; k++) {
    const rk = autocorrelation(returns, k);
    Q += (rk * rk) / (n - k);
  }
  return n * (n + 2) * Q;
}

// ─── data loading ─────────────────────────────────────────────────────────────

async function loadDailyCandles() {
  const instruments = await prisma.simInstrument.findMany();
  const result = {};

  for (const inst of instruments) {
    const candles = await prisma.simCandle.findMany({
      where: { instrumentId: inst.id, interval: "D1" },
      orderBy: { timestamp: "asc" },
    });

    if (candles.length === 0) continue;

    result[inst.symbol] = {
      instrument: inst,
      candles: candles.map((c) => ({
        time: Number(c.timestamp),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      })),
    };
  }

  return result;
}

async function loadHourlyCandles() {
  const instruments = await prisma.simInstrument.findMany();
  const result = {};

  for (const inst of instruments) {
    const candles = await prisma.simCandle.findMany({
      where: { instrumentId: inst.id, interval: "H1" },
      orderBy: { timestamp: "asc" },
    });

    if (candles.length === 0) continue;

    result[inst.symbol] = {
      instrument: inst,
      candles: candles.map((c) => ({
        time: Number(c.timestamp),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      })),
    };
  }

  return result;
}

// ─── tests ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nMarket Naturalness Tests\n${"=".repeat(50)}`);

  // ── Load data ──
  section("Data Loading");

  let daily, hourly;

  await test("Load daily candles from DB", async () => {
    daily = await loadDailyCandles();
    const symbols = Object.keys(daily);
    assert(symbols.length > 0, "No daily candle data found in DB");
    console.log(
      `(${symbols.length} symbols, ${symbols.map((s) => daily[s].candles.length).join("/")} days) `,
    );
  });

  await test("Load hourly candles from DB", async () => {
    hourly = await loadHourlyCandles();
    const symbols = Object.keys(hourly);
    assert(symbols.length > 0, "No hourly candle data found in DB");
  });

  await test("Sufficient history (>= 90 trading days per symbol)", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      assert(
        data.candles.length >= 90,
        `${sym} only has ${data.candles.length} daily candles (need >= 90)`,
      );
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. RETURN DISTRIBUTION TESTS
  // Real markets have fat-tailed return distributions (leptokurtic),
  // slight negative skew, and daily returns roughly in -10% to +10%.
  // ══════════════════════════════════════════════════════════════════════════
  section("Return Distribution");

  await test("Daily returns are not constant (std > 0)", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const s = std(rets);
      assert(s > 0, `${sym} has zero return variance — prices are frozen`);
    }
  });

  await test("Annualised volatility is in realistic range (5%-120%)", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const annVol = std(rets) * Math.sqrt(252) * 100;
      assert(
        annVol >= 5 && annVol <= 120,
        `${sym} annualised vol = ${annVol.toFixed(1)}% — outside [5, 120]`,
      );
    }
  });

  await test("Mean daily return is plausible (annualised -80% to +150%)", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const annRet = mean(rets) * 252 * 100;
      assert(
        annRet >= -80 && annRet <= 150,
        `${sym} annualised return = ${annRet.toFixed(1)}% — unrealistic`,
      );
    }
  });

  await test("No single-day return exceeds ±30%", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const maxRet = Math.max(...rets.map(Math.abs));
      assert(
        maxRet < 0.3,
        `${sym} has a single-day return of ${(maxRet * 100).toFixed(1)}% — flash crash / spike`,
      );
    }
  });

  await test("Excess kurtosis > 0 (fat tails present)", async () => {
    // Real markets have excess kurtosis typically 3-50 for daily returns
    let anyFat = false;
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const k = kurtosis(rets);
      if (k > 0) anyFat = true;
    }
    assert(anyFat, "No symbol shows fat tails — returns are too Gaussian");
  });

  await warn("Skewness is slightly negative for most symbols", async () => {
    let negSkew = 0;
    const total = Object.keys(daily).length;
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      if (skewness(rets) < 0) negSkew++;
    }
    assert(
      negSkew / total >= 0.3,
      `Only ${negSkew}/${total} symbols have negative skew (expect >= 30% for natural markets)`,
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. SERIAL-CORRELATION / EFFICIENCY TESTS
  // Real markets have near-zero autocorrelation of returns (weak-form
  // efficiency), but squared returns are positively autocorrelated
  // (volatility clustering).
  // ══════════════════════════════════════════════════════════════════════════
  section("Serial Correlation & Efficiency");

  await test("Lag-1 return autocorrelation is small (|ρ| < 0.3)", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const ac = autocorrelation(rets, 1);
      assert(
        Math.abs(ac) < 0.3,
        `${sym} lag-1 autocorrelation = ${ac.toFixed(3)} — too predictable`,
      );
    }
  });

  await warn(
    "Volatility clustering: squared-return autocorrelation > 0.05",
    async () => {
      let count = 0;
      for (const [sym, data] of Object.entries(daily)) {
        const closes = data.candles.map((c) => c.close);
        const rets = logReturns(closes);
        const sqRets = rets.map((r) => r * r);
        const ac = autocorrelation(sqRets, 1);
        if (ac > 0.05) count++;
      }
      const total = Object.keys(daily).length;
      assert(
        count / total >= 0.25,
        `Only ${count}/${total} symbols show volatility clustering`,
      );
    },
  );

  await test("No extreme positive autocorrelation (ρ > 0.5) — trending bias", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const ac = autocorrelation(rets, 1);
      assert(
        ac < 0.5,
        `${sym} lag-1 autocorrelation = ${ac.toFixed(3)} — extreme trending pattern`,
      );
    }
  });

  await test("No extreme negative autocorrelation (ρ < -0.5) — mean-reversion ping-pong", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const ac = autocorrelation(rets, 1);
      assert(
        ac > -0.5,
        `${sym} lag-1 autocorrelation = ${ac.toFixed(3)} — ping-pong pattern`,
      );
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. HURST EXPONENT
  // H ≈ 0.5 = random walk, H > 0.5 = trending, H < 0.5 = mean-reverting
  // Real equities usually 0.45 - 0.65
  // ══════════════════════════════════════════════════════════════════════════
  section("Hurst Exponent (Random Walk)");

  await test("Hurst exponent in [0.30, 0.80] per symbol", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const H = hurstExponent(rets);
      assert(
        H >= 0.3 && H <= 0.8,
        `${sym} Hurst = ${H.toFixed(3)} — outside natural [0.30, 0.80]`,
      );
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. PRICE LEVEL SANITY
  // Prices should stay positive, shouldn't diverge to infinity,
  // and different volatility profiles should spread apart naturally.
  // ══════════════════════════════════════════════════════════════════════════
  section("Price Level Sanity");

  await test("All prices remain positive", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      for (const c of data.candles) {
        assert(
          c.close > 0 && c.open > 0 && c.high > 0 && c.low > 0,
          `${sym} has a non-positive price at time ${c.time}`,
        );
      }
    }
  });

  await test("No price drifts to >20x or <0.05x initial price", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const initPrice = Number(data.instrument.initialPrice);
      const lastClose = data.candles[data.candles.length - 1].close;
      const ratio = lastClose / initPrice;
      assert(
        ratio > 0.05 && ratio < 20,
        `${sym} price ratio = ${ratio.toFixed(2)}x initial (${initPrice} → ${lastClose.toFixed(2)})`,
      );
    }
  });

  await test("High >= Open, Close, Low for every candle", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      for (const c of data.candles) {
        assert(
          c.high >= c.low - 0.001,
          `${sym} candle at ${c.time}: high (${c.high}) < low (${c.low})`,
        );
        assert(
          c.high >= c.open - 0.001 && c.high >= c.close - 0.001,
          `${sym} candle at ${c.time}: high (${c.high}) < open (${c.open}) or close (${c.close})`,
        );
        assert(
          c.low <= c.open + 0.001 && c.low <= c.close + 0.001,
          `${sym} candle at ${c.time}: low (${c.low}) > open (${c.open}) or close (${c.close})`,
        );
      }
    }
  });

  await test("Max drawdown < 80% for any symbol", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const dd = maxDrawdown(closes);
      assert(
        dd < 0.8,
        `${sym} max drawdown = ${(dd * 100).toFixed(1)}% — catastrophic crash`,
      );
    }
  });

  await test("Prices are not totally flat (range/mean > 1%)", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const range = Math.max(...closes) - Math.min(...closes);
      const m = mean(closes);
      assert(
        range / m > 0.01,
        `${sym} price range = ${((range / m) * 100).toFixed(2)}% — virtually flat`,
      );
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. VOLUME TESTS
  // Volume should be positive, vary day to day, and not be stuck at
  // the same number every candle.
  // ══════════════════════════════════════════════════════════════════════════
  section("Volume Behavior");

  await test("Volume is always >= 0", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      for (const c of data.candles) {
        assert(c.volume >= 0, `${sym} negative volume at ${c.time}`);
      }
    }
  });

  await test("Volume is not constant (coefficient of variation > 0.05)", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const vols = data.candles.map((c) => c.volume);
      const m = mean(vols);
      if (m === 0) continue; // will be caught by other tests
      const cv = std(vols) / m;
      assert(
        cv > 0.05,
        `${sym} volume CV = ${cv.toFixed(3)} — volumes are too uniform`,
      );
    }
  });

  await warn("Volume increases on large price moves", async () => {
    let count = 0;
    const total = Object.keys(daily).length;

    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const volumes = data.candles.map((c) => c.volume);
      const rets = logReturns(closes);
      const absRets = rets.map(Math.abs);
      const medianRet = [...absRets].sort((a, b) => a - b)[
        Math.floor(absRets.length / 2)
      ];
      const medianVol = [...volumes.slice(1)].sort((a, b) => a - b)[
        Math.floor(volumes.length / 2)
      ];

      let bigMoveBigVol = 0;
      let bigMoveTotal = 0;

      for (let i = 0; i < rets.length; i++) {
        if (absRets[i] > medianRet * 2) {
          bigMoveTotal++;
          if (volumes[i + 1] > medianVol) bigMoveBigVol++;
        }
      }

      if (bigMoveTotal > 5 && bigMoveBigVol / bigMoveTotal > 0.4) count++;
    }

    assert(
      count / total >= 0.3,
      `Only ${count}/${total} symbols show volume-price correlation`,
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. CROSS-ASSET CORRELATION
  // Stocks in the same industry should be somewhat correlated.
  // The overall market shouldn't be perfectly correlated (ρ = 1) or
  // perfectly uncorrelated (ρ ≈ 0 for all pairs).
  // ══════════════════════════════════════════════════════════════════════════
  section("Cross-Asset Correlation");

  await test("Not all pairs are perfectly correlated (ρ < 0.99)", async () => {
    const symbols = Object.keys(daily);
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const retsA = logReturns(daily[symbols[i]].candles.map((c) => c.close));
        const retsB = logReturns(daily[symbols[j]].candles.map((c) => c.close));
        const len = Math.min(retsA.length, retsB.length);
        if (len < 30) continue;

        const a = retsA.slice(0, len);
        const b = retsB.slice(0, len);
        const corr = pearsonCorrelation(a, b);

        assert(
          corr < 0.99,
          `${symbols[i]} vs ${symbols[j]} ρ = ${corr.toFixed(4)} — perfectly locked`,
        );
      }
    }
  });

  await test("Some cross-asset correlation exists (avg |ρ| > 0.02)", async () => {
    const symbols = Object.keys(daily);
    let sumAbs = 0;
    let count = 0;

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const retsA = logReturns(daily[symbols[i]].candles.map((c) => c.close));
        const retsB = logReturns(daily[symbols[j]].candles.map((c) => c.close));
        const len = Math.min(retsA.length, retsB.length);
        if (len < 30) continue;

        const corr = pearsonCorrelation(
          retsA.slice(0, len),
          retsB.slice(0, len),
        );
        sumAbs += Math.abs(corr);
        count++;
      }
    }

    const avgAbsCorr = count > 0 ? sumAbs / count : 0;
    assert(
      avgAbsCorr > 0.02,
      `Avg cross-asset |ρ| = ${avgAbsCorr.toFixed(4)} — assets move independently (no market factor)`,
    );
  });

  await warn(
    "Same-industry pairs more correlated than cross-industry",
    async () => {
      const symbols = Object.keys(daily);
      let sameInd = [];
      let diffInd = [];

      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          const retsA = logReturns(
            daily[symbols[i]].candles.map((c) => c.close),
          );
          const retsB = logReturns(
            daily[symbols[j]].candles.map((c) => c.close),
          );
          const len = Math.min(retsA.length, retsB.length);
          if (len < 30) continue;

          const corr = pearsonCorrelation(
            retsA.slice(0, len),
            retsB.slice(0, len),
          );

          const indA = daily[symbols[i]].instrument.industry;
          const indB = daily[symbols[j]].instrument.industry;

          if (indA === indB) sameInd.push(corr);
          else diffInd.push(corr);
        }
      }

      if (sameInd.length < 3 || diffInd.length < 3) {
        throw new Error("Not enough pairs to compare");
      }

      const avgSame = mean(sameInd);
      const avgDiff = mean(diffInd);
      assert(
        avgSame > avgDiff,
        `Same-industry avg ρ (${avgSame.toFixed(3)}) <= cross-industry (${avgDiff.toFixed(3)})`,
      );
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 7. INTRADAY CONSISTENCY (hourly vs daily)
  // Daily close should match the last hourly close of that day.
  // Hourly bars should aggregate up roughly to the daily bar.
  // ══════════════════════════════════════════════════════════════════════════
  section("Intraday / Daily Consistency");

  await warn("Hourly data exists for each symbol with daily data", async () => {
    const dailySyms = Object.keys(daily);
    const hourlySyms = Object.keys(hourly);
    const missing = dailySyms.filter((s) => !hourlySyms.includes(s));
    assert(
      missing.length === 0,
      `Symbols missing hourly data: ${missing.join(", ")}`,
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 8. NO STUCK / REPEATING PATTERNS
  // Detect if price just repeats the same value or follows an
  // obvious repeating pattern.
  // ══════════════════════════════════════════════════════════════════════════
  section("Pattern Monotony Detection");

  await test("Price doesn't stay the same for >10 consecutive days", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      let streak = 1;
      for (let i = 1; i < data.candles.length; i++) {
        if (
          Math.abs(data.candles[i].close - data.candles[i - 1].close) < 0.001
        ) {
          streak++;
        } else {
          streak = 1;
        }
        assert(
          streak <= 10,
          `${sym} price stuck at ${data.candles[i].close.toFixed(2)} for ${streak}+ days`,
        );
      }
    }
  });

  await test("Not >80% of days have the exact same return direction", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      const upPct = pct(rets, (r) => r > 0);
      assert(
        upPct > 0.2 && upPct < 0.8,
        `${sym} up-day ratio = ${(upPct * 100).toFixed(1)}% — too one-directional`,
      );
    }
  });

  await test("Price changes vary — not alternating identical up/down", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      const closes = data.candles.map((c) => c.close);
      const rets = logReturns(closes);
      if (rets.length < 10) continue;

      // Check if consecutive returns are identical more than 20% of time
      let identicalCount = 0;
      for (let i = 1; i < rets.length; i++) {
        if (Math.abs(rets[i] - rets[i - 1]) < 1e-8) identicalCount++;
      }
      const identicalPct = identicalCount / (rets.length - 1);
      assert(
        identicalPct < 0.2,
        `${sym} has ${(identicalPct * 100).toFixed(1)}% identical consecutive returns — looks mechanical`,
      );
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 9. VOLATILITY PROFILE CONSISTENCY
  // Stocks defined as high-vol (biotech, small-cap speculative) should
  // actually be more volatile than blue-chip / utilities.
  // ══════════════════════════════════════════════════════════════════════════
  section("Volatility Profile Consistency");

  await warn(
    "Higher baseVolatility stocks have higher realized vol",
    async () => {
      const vols = [];
      for (const [sym, data] of Object.entries(daily)) {
        const closes = data.candles.map((c) => c.close);
        const rets = logReturns(closes);
        const realizedVol = std(rets) * Math.sqrt(252);
        vols.push({
          symbol: sym,
          baseVol: Number(data.instrument.baseVolatility),
          realizedVol,
        });
      }

      vols.sort((a, b) => a.baseVol - b.baseVol);
      const half = Math.floor(vols.length / 2);
      const lowBase = vols.slice(0, half);
      const highBase = vols.slice(half);

      const avgLow = mean(lowBase.map((v) => v.realizedVol));
      const avgHigh = mean(highBase.map((v) => v.realizedVol));

      assert(
        avgHigh > avgLow,
        `High base-vol group realized vol (${(avgHigh * 100).toFixed(1)}%) <= low group (${(avgLow * 100).toFixed(1)}%)`,
      );
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 10. NEWS IMPACT
  // Check that news events exist and roughly align with price movements
  // ══════════════════════════════════════════════════════════════════════════
  section("News Events");

  await test("News events exist in the DB", async () => {
    const count = await prisma.simNews.count();
    assert(count > 0, "No news events in the database");
    console.log(`(${count} events) `);
  });

  await test("Multiple news categories present", async () => {
    const categories = await prisma.simNews.groupBy({
      by: ["category"],
    });
    assert(
      categories.length >= 2,
      `Only ${categories.length} news categories found`,
    );
  });

  await test("Both positive and negative sentiment news exist", async () => {
    const sentiments = await prisma.simNews.groupBy({
      by: ["sentiment"],
    });
    const sentList = sentiments.map((s) => s.sentiment);
    assert(sentList.includes("positive"), "No positive news");
    assert(sentList.includes("negative"), "No negative news");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 11. GAP BEHAVIOR (open vs prev close)
  // Real markets have overnight gaps. The open should sometimes differ
  // meaningfully from the prior close.
  // ══════════════════════════════════════════════════════════════════════════
  section("Gap Behavior");

  await test("Overnight gaps exist (open ≠ prev close sometimes)", async () => {
    let anyGaps = false;
    for (const [sym, data] of Object.entries(daily)) {
      let gapCount = 0;
      for (let i = 1; i < data.candles.length; i++) {
        const gap = Math.abs(data.candles[i].open - data.candles[i - 1].close);
        const pct = gap / data.candles[i - 1].close;
        if (pct > 0.001) gapCount++; // > 0.1%
      }
      if (gapCount > 5) anyGaps = true;
    }
    assert(anyGaps, "No symbols show meaningful overnight gaps");
  });

  await test("Gaps are not too extreme (< 15% on any day)", async () => {
    for (const [sym, data] of Object.entries(daily)) {
      for (let i = 1; i < data.candles.length; i++) {
        const gapPct =
          Math.abs(data.candles[i].open - data.candles[i - 1].close) /
          data.candles[i - 1].close;
        assert(
          gapPct < 0.15,
          `${sym} has ${(gapPct * 100).toFixed(1)}% gap at time ${data.candles[i].time}`,
        );
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════════════════
  section("Per-Symbol Report Card");

  for (const [sym, data] of Object.entries(daily)) {
    const closes = data.candles.map((c) => c.close);
    const rets = logReturns(closes);
    const annVol = std(rets) * Math.sqrt(252) * 100;
    const annRet = mean(rets) * 252 * 100;
    const ac1 = autocorrelation(rets, 1);
    const k = kurtosis(rets);
    const sk = skewness(rets);
    const H = hurstExponent(rets);
    const dd = maxDrawdown(closes) * 100;
    const initP = Number(data.instrument.initialPrice);
    const lastP = closes[closes.length - 1];
    const totalRet = (((lastP - initP) / initP) * 100).toFixed(1);

    console.log(
      `  ${sym.padEnd(6)} | ` +
        `days=${String(data.candles.length).padStart(3)} | ` +
        `$${initP.toFixed(0).padStart(4)}→$${lastP.toFixed(0).padStart(4)} (${totalRet.padStart(6)}%) | ` +
        `vol=${annVol.toFixed(1).padStart(5)}% | ` +
        `ret=${annRet.toFixed(1).padStart(6)}% | ` +
        `AC1=${ac1.toFixed(3).padStart(7)} | ` +
        `H=${H.toFixed(2)} | ` +
        `kurt=${k.toFixed(1).padStart(5)} | ` +
        `skew=${sk.toFixed(2).padStart(6)} | ` +
        `DD=${dd.toFixed(1).padStart(5)}%`,
    );
  }

  // ── Final ──
  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `  \x1b[32m${passed} passed\x1b[0m  ` +
      `\x1b[31m${failed} failed\x1b[0m  ` +
      `\x1b[33m${warned} warnings\x1b[0m`,
  );

  if (failures.length > 0) {
    console.log(`\n  \x1b[31mFailures:\x1b[0m`);
    for (const f of failures) {
      console.log(`    ✗ ${f.name}: ${f.error}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n  \x1b[33mWarnings:\x1b[0m`);
    for (const w of warnings) {
      console.log(`    ⚠ ${w.name}: ${w.error}`);
    }
  }

  console.log();
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

// ─── additional helper ────────────────────────────────────────────────────────

function pearsonCorrelation(a, b) {
  const n = a.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    denA += (a[i] - ma) ** 2;
    denB += (b[i] - mb) ** 2;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

run().catch((err) => {
  console.error("Fatal:", err);
  prisma.$disconnect();
  process.exit(2);
});
