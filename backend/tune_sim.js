#!/usr/bin/env node
/**
 * tune_sim.js – Runtime tuning script for the C++ market simulation.
 *
 * Usage:
 *   node tune_sim.js                          # Apply config, reinitialize, populate, sync, test
 *   node tune_sim.js --config-only            # Just push config (no reinitialize/populate)
 *   node tune_sim.js --reset                  # Reset to factory defaults
 *   node tune_sim.js --dump                   # Print current live config
 *   node tune_sim.js --defaults               # Print factory defaults
 *
 * Edit the CONFIG object below to experiment.  Only include keys you want to
 * override – the C++ side does a merge-patch so omitted keys keep their
 * current values.
 *
 * No C++ rebuild necessary – all changes go through the REST API.
 */

const SIM_URL = process.env.SIM_URL || "http://127.0.0.1:8080";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG – edit this to tune the simulation.
// Only include sections/keys you want to change.  Everything else stays as-is.
// See RuntimeConfig.hpp for the full list with defaults.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  simulation: {
    tickRateMs: 50,
    // ticksPerDay:      72000,
    populateTicksPerDay: 200, // more ticks = better intraday convergence = lower daily autocorrelation
    // startDate:        "2025-08-07",
  },

  engine: {
    annualGrowthRate: 0.08,
    companyShockStd: 0.0008, // moderate per-tick fundamental noise
    newsToFundamentalScale: 0.02, // strong news-to-price transmission
    industryShockScale: 0.01,
    industryShockDecay: 0.95,
    companyShockDecay: 0.9,
  },

  macro: {
    sentimentReversion: 0.05,
    sentimentNoiseStd: 0.01,
    volatilityReversion: 0.02,
    volatilityNoiseStd: 0.01,
    globalShockSentimentWeight: 0.0003,
    globalShockNoiseStd: 0.0003,
  },

  asset: {
    circuitBreakerLimit: 0.15,
    impactDampening: 0.5, // 50% blend — safe now with MM skew clamp
    fundamentalShockClamp: 0.05,
    priceFloor: 0.01,
  },

  orderBook: {
    orderExpiryMs: 14400000, // 4 hours — prevent stale orders from creating autocorrelation
  },

  agentCounts: {
    fundamental: 60,
    momentum: 0, // eliminated — trend-followers are primary source of AC1
    meanReversion: 50, // aggressive — mean reversion fights persistent trends
    noise: 55, // high — random noise breaks up autocorrelation
    marketMaker: 25,
  },

  agentCash: {
    meanCash: 100000,
    stdCash: 20000,
  },

  agentGlobal: {
    capitalFraction: 0.03, // slightly larger orders for directional traders
    cashReserve: 0.05,
    maxOrderSize: 200,
    sentimentDecayGlobal: 0.95,
    sentimentDecayIndustry: 0.93,
    sentimentDecaySymbol: 0.9,
  },

  marketMaker: {
    baseSpreadMin: 0.002,
    baseSpreadMax: 0.006,
    inventorySkewMin: 0.00002, // CRITICAL: was 0.0002 — skew * inventory must stay < 0.02
    inventorySkewMax: 0.00008, // with 200 shares → max skew effect = 1.6%
    maxInventoryMin: 800,
    maxInventoryMax: 3000,
    initialInventoryPerStock: 0, // start MMs flat — they build inventory naturally
    quoteCapitalFrac: 0.01,
    sentimentSpreadMult: 0.2,
    volatilitySpreadMult: 2.0,
    fundamentalWeight: 0.95, // near-pure fundamental tracking — eliminates EWMA smoothing
  },

  fundamental: {
    thresholdBase: 0.01,
    thresholdRiskScale: 0.02,
    noiseStdBase: 0.005,
    noiseStdRange: 0.01,
    sentimentImpact: 0.15,
    reactionMult: 0.3,
    limitPriceSpreadMax: 0.005,
  },

  momentum: {
    shortPeriodMin: 3,
    shortPeriodRange: 4,
    longPeriodOffsetMin: 10,
    longPeriodOffsetRange: 15,
    reactionMult: 0.25,
    limitOffsetMin: 0.0005,
    limitOffsetMax: 0.005,
    signalThresholdRiskScale: 0.001,
    industrySentWeight: 0.1,
    globalSentWeight: 0.05,
  },

  meanReversion: {
    lookbackMin: 20,
    lookbackRange: 20,
    zThresholdMin: 0.8, // lower threshold — triggers more aggressively against trends
    zThresholdRange: 1.0,
    reactionMult: 0.3, // stronger reaction
    limitPriceSpreadMax: 0.005,
    sentSymbolWeight: 0.2,
    sentGlobalWeight: 0.1,
  },

  noise: {
    tradeProbMin: 0.05,
    tradeProbRange: 0.1,
    sentSensitivityMin: 0.3,
    sentSensitivityMax: 0.8,
    overreactionMult: 1.0,
    marketOrderProb: 0.25, // more market orders = more random impact
    limitOffsetMin: 0.001,
    limitOffsetMax: 0.01,
    buyBiasSentWeight: 0.3,
    buyBiasNoiseStd: 0.1,
  },

  news: {
    lambda: 0.12,
    globalImpactStd: 0.02,
    politicalImpactStd: 0.04,
    industryImpactStd: 0.03,
    companyImpactStd: 0.03,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function simFetch(path, opts = {}) {
  const url = `${SIM_URL}${path}`;
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
  if (!res.ok) {
    throw new Error(
      `${opts.method || "GET"} ${path} → ${res.status}: ${JSON.stringify(json)}`,
    );
  }
  return json;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

async function dumpConfig() {
  const cfg = await simFetch("/config");
  console.log(JSON.stringify(cfg, null, 2));
}

async function dumpDefaults() {
  const cfg = await simFetch("/config/defaults");
  console.log(JSON.stringify(cfg, null, 2));
}

async function resetConfig() {
  console.log("Resetting config to factory defaults + reinitializing...");
  const r = await simFetch("/config/reset", { method: "POST" });
  console.log(r.message || r);
}

async function pushConfig(config) {
  console.log("Pushing config...");
  const r = await simFetch("/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
  console.log(`  ✓ ${r.message || "Config updated"}`);
}

async function reinitialize() {
  console.log(
    "Reinitializing simulation (rebuilds agents/assets with new config)...",
  );
  const r = await simFetch("/reinitialize", { method: "POST" });
  console.log(`  ✓ ${r.message || "Reinitialized"}`);
}

async function populate() {
  const POPULATE_DAYS = 200; // extra data for more stable autocorrelation estimates
  console.log(
    `Starting populate run (${POPULATE_DAYS} days — synchronous, please wait)...`,
  );
  const r = await simFetch("/populate", {
    method: "POST",
    body: JSON.stringify({ days: POPULATE_DAYS, startDate: "2025-08-07" }),
  });
  console.log(`  ✓ Populate complete: ${JSON.stringify(r)}`);
}

async function runSync() {
  console.log("Syncing sim data to database...");
  const { execSync } = await import("child_process");
  try {
    execSync("node sync_sim_data.js", {
      stdio: "inherit",
      cwd: import.meta.dirname || process.cwd(),
    });
    console.log("  ✓ Sync complete");
  } catch (e) {
    console.error("  ✗ Sync failed:", e.message);
  }
}

async function runTests() {
  console.log("Running market naturalness tests...");
  const { execSync } = await import("child_process");
  try {
    execSync("node test_market_natural.js", {
      stdio: "inherit",
      cwd: import.meta.dirname || process.cwd(),
    });
  } catch {
    // test script exits non-zero if failures, that's OK
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  try {
    // Check sim is reachable
    await simFetch("/state");
  } catch (e) {
    console.error(
      `Cannot reach simulation at ${SIM_URL}/state — is it running?`,
    );
    console.error(e.message);
    process.exit(1);
  }

  if (args.includes("--dump")) {
    await dumpConfig();
    return;
  }

  if (args.includes("--defaults")) {
    await dumpDefaults();
    return;
  }

  if (args.includes("--reset")) {
    await resetConfig();
    return;
  }

  // --- Normal flow: push config → reinitialize → populate → sync → test ---

  await pushConfig(CONFIG);

  if (args.includes("--config-only")) {
    console.log("Done (config-only mode).");
    return;
  }

  await reinitialize();
  await populate();
  await runSync();
  await runTests();

  console.log("\n🎉 Tuning run complete. Review test results above.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
