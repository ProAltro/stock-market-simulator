/**
 * Market Sim Initialization Service
 *
 * Pushes the tuned RuntimeConfig to the C++ market simulator on startup,
 * then triggers reinitialize + populate if the sim has no history yet.
 * These values match the tuned params from tune_sim.js that passed all
 * 34/35 market naturalness tests.
 */

const SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";
const POPULATE_DAYS = 200;

/**
 * Full tuned config — camelCase format for POST /config (RuntimeConfig::fromJson)
 * Legacy-format fields (agents, news, spread) are already in config.json,
 * but everything else must be pushed via REST.
 */
const TUNED_CONFIG = {
  simulation: {
    tickRateMs: 50,
    populateTicksPerDay: 200,
  },

  engine: {
    annualGrowthRate: 0.08,
    companyShockStd: 0.0008,
    newsToFundamentalScale: 0.02,
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
    impactDampening: 0.5,
    fundamentalShockClamp: 0.05,
    priceFloor: 0.01,
  },

  orderBook: {
    orderExpiryMs: 14400000,
  },

  agentCounts: {
    fundamental: 60,
    momentum: 0,
    meanReversion: 50,
    noise: 55,
    marketMaker: 25,
  },

  agentCash: {
    meanCash: 100000,
    stdCash: 20000,
  },

  agentGlobal: {
    capitalFraction: 0.03,
    cashReserve: 0.05,
    maxOrderSize: 200,
    sentimentDecayGlobal: 0.95,
    sentimentDecayIndustry: 0.93,
    sentimentDecaySymbol: 0.9,
  },

  marketMaker: {
    baseSpreadMin: 0.002,
    baseSpreadMax: 0.006,
    inventorySkewMin: 0.00002,
    inventorySkewMax: 0.00008,
    maxInventoryMin: 800,
    maxInventoryMax: 3000,
    initialInventoryPerStock: 0,
    quoteCapitalFrac: 0.01,
    sentimentSpreadMult: 0.2,
    volatilitySpreadMult: 2.0,
    fundamentalWeight: 0.95,
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
    zThresholdMin: 0.8,
    zThresholdRange: 1.0,
    reactionMult: 0.3,
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
    marketOrderProb: 0.25,
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

/**
 * Wait for the market-sim to become reachable (retry with backoff)
 */
async function waitForSim(maxRetries = 30, intervalMs = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${SIM_URL}/health`);
      if (res.ok) {
        console.log("[SimInit] Market sim is reachable");
        return true;
      }
    } catch {
      // not ready yet
    }
    console.log(`[SimInit] Waiting for market sim... (${i + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.error("[SimInit] Market sim not reachable after retries");
  return false;
}

/**
 * Push the tuned config to the sim via POST /config
 */
async function pushConfig() {
  const res = await fetch(`${SIM_URL}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(TUNED_CONFIG),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Config push failed (${res.status}): ${text}`);
  }
  console.log("[SimInit] Tuned config pushed");
}

/**
 * Reinitialize the sim (rebuilds agents/assets with the new config)
 */
async function reinitialize() {
  const res = await fetch(`${SIM_URL}/reinitialize`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reinitialize failed (${res.status}): ${text}`);
  }
  console.log("[SimInit] Simulation reinitialized");
}

/**
 * Check if the sim already has history (skip populate if re-deploying)
 */
async function hasHistory() {
  try {
    const res = await fetch(`${SIM_URL}/state`);
    if (!res.ok) return false;
    const state = await res.json();
    // If currentDate is past the start date, history already exists
    return state.currentDate && state.currentDate !== "2025-08-07";
  } catch {
    return false;
  }
}

/**
 * Populate historical data
 */
async function populate() {
  console.log(`[SimInit] Populating ${POPULATE_DAYS} days of history...`);
  const res = await fetch(`${SIM_URL}/populate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: POPULATE_DAYS, startDate: "2025-08-07" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Populate failed (${res.status}): ${text}`);
  }
  const result = await res.json();
  console.log(`[SimInit] Populate complete: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Full initialization flow:
 * 1. Wait for sim to be reachable
 * 2. Push tuned config
 * 3. Reinitialize (rebuild agents with new config)
 * 4. Populate if no history exists
 *
 * Safe to call on every backend restart — skips populate if history exists.
 */
export async function initMarketSim() {
  try {
    const reachable = await waitForSim();
    if (!reachable) {
      console.error(
        "[SimInit] Skipping init — market sim unreachable. Sync will retry later.",
      );
      return false;
    }

    await pushConfig();
    await reinitialize();

    const alreadyPopulated = await hasHistory();
    if (alreadyPopulated) {
      console.log("[SimInit] History already exists — skipping populate");
    } else {
      await populate();
    }

    console.log("[SimInit] Market sim initialization complete");
    return true;
  } catch (err) {
    console.error("[SimInit] Initialization error:", err.message);
    return false;
  }
}
