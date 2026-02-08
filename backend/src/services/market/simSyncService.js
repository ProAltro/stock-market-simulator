/**
 * Simulation Sync Service
 * Periodically pulls candle data and news from the C++ sim and persists to DB.
 * Also handles initial stock instrument sync from the /stocks endpoint.
 */

const SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";
const SYNC_INTERVAL_MS = 30_000; // 30 seconds

let syncTimer = null;
let lastNewsTimestamp = 0;

// Track populate/sync status for frontend
let populateStatus = {
  active: false,
  phase: "idle", // "populating" | "syncing" | "idle"
  message: null,
  error: null,
};

export function getPopulateStatus() {
  return { ...populateStatus };
}

function setPopulateStatus(phase, message = null, error = null) {
  populateStatus = { active: phase !== "idle", phase, message, error };
}

/**
 * Initialize sim instruments in DB from the C++ /stocks endpoint
 */
export async function syncInstruments(prisma) {
  try {
    const res = await fetch(`${SIM_URL}/stocks`);
    if (!res.ok) return;
    const stocks = await res.json();

    for (const stock of stocks) {
      const founded = stock.founded != null ? String(stock.founded) : null;
      const headquarters = stock.headquarters || null;

      await prisma.simInstrument.upsert({
        where: { symbol: stock.symbol },
        update: {
          name: stock.name,
          industry: stock.industry,
          description: stock.description || null,
          sectorDetail: stock.sector_detail || null,
          character: stock.character || null,
          initialPrice: stock.initialPrice,
          sharesOutstanding: BigInt(stock.sharesOutstanding),
          baseVolatility: stock.baseVolatility,
          founded,
          headquarters,
        },
        create: {
          symbol: stock.symbol,
          name: stock.name,
          industry: stock.industry,
          description: stock.description || null,
          sectorDetail: stock.sector_detail || null,
          character: stock.character || null,
          initialPrice: stock.initialPrice,
          sharesOutstanding: BigInt(stock.sharesOutstanding),
          baseVolatility: stock.baseVolatility,
          founded,
          headquarters,
        },
      });
    }

    console.log(`[SimSync] Synced ${stocks.length} instruments`);
  } catch (err) {
    console.error("[SimSync] Failed to sync instruments:", err.message || err);
  }
}

/**
 * Get data retention limit in milliseconds for each interval (matching Yahoo Finance limits)
 * M1: 7 days, M5/M15/M30: 60 days, H1/D1: unlimited (returns 0)
 */
function getDataLimitMs(interval) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const normalized = interval.toUpperCase();
  
  switch (normalized) {
    case "M1":
      return 7 * DAY_MS;     // 1-minute: 7 days
    case "M5":
    case "M15":
    case "M30":
      return 60 * DAY_MS;    // 5/15/30-minute: 60 days
    case "H1":
    case "D1":
    default:
      return 0;              // Hourly/Daily: unlimited
  }
}

/**
 * Sync candles from C++ engine for all symbols at a given interval
 * Respects Yahoo-aligned data limits:
 * - M1: only last 7 days
 * - M5/M15/M30: only last 60 days  
 * - H1/D1: all data
 */
export async function syncCandles(prisma, interval = "1h") {
  try {
    // Get instrument map
    const instruments = await prisma.simInstrument.findMany();
    const symbolToId = {};
    for (const inst of instruments) {
      symbolToId[inst.symbol] = inst.id;
    }

    // Get the latest candle timestamp we have for each symbol/interval
    const latestCandles = await prisma.simCandle.groupBy({
      by: ["instrumentId"],
      where: {
        interval: interval
          .toUpperCase()
          .replace("M", "M")
          .replace("H", "H")
          .replace("D", "D"),
      },
      _max: { timestamp: true },
    });
    const sinceMap = {};
    for (const lc of latestCandles) {
      sinceMap[lc.instrumentId] = Number(lc._max.timestamp || 0);
    }

    // Fetch bulk candles from C++ engine
    const globalSince = Math.min(...Object.values(sinceMap), 0);
    const res = await fetch(
      `${SIM_URL}/candles/bulk?interval=${interval}&since=${globalSince}&limit=1000`,
    );
    if (!res.ok) return;
    const allCandles = await res.json();

    // Get current sim time to calculate data limits
    let currentSimTime = Date.now();
    try {
      const stateRes = await fetch(`${SIM_URL}/state`);
      if (stateRes.ok) {
        const state = await stateRes.json();
        if (state.simTimeMs) {
          currentSimTime = state.simTimeMs;
        }
      }
    } catch {
      // Use current time as fallback
    }

    // Calculate cutoff timestamp based on interval limits
    const limitMs = getDataLimitMs(interval);
    const cutoffTimestamp = limitMs > 0 ? currentSimTime - limitMs : 0;

    let count = 0;
    for (const [symbol, candles] of Object.entries(allCandles)) {
      const instId = symbolToId[symbol];
      if (!instId) continue;
      const since = sinceMap[instId] || 0;

      // Filter: only new candles AND within data limit
      const newCandles = candles.filter((c) => {
        if (c.time <= since) return false;                  // Already synced
        if (limitMs > 0 && c.time < cutoffTimestamp) return false;  // Outside limit
        return true;
      });
      if (newCandles.length === 0) continue;

      // Use createMany to bulk insert
      const intervalEnum = mapInterval(interval);
      await prisma.simCandle.createMany({
        data: newCandles.map((c) => ({
          instrumentId: instId,
          interval: intervalEnum,
          timestamp: BigInt(c.time),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: BigInt(Math.round(c.volume)),
        })),
        skipDuplicates: true,
      });

      count += newCandles.length;
    }

    if (count > 0) {
      const limitInfo = limitMs > 0 ? ` (last ${Math.round(limitMs / 86400000)}d only)` : "";
      console.log(`[SimSync] Synced ${count} candles (${interval})${limitInfo}`);
    }
  } catch (err) {
    console.error("[SimSync] Candle sync failed:", err.message);
  }
}

/**
 * Sync news from C++ engine
 */
export async function syncNews(prisma) {
  try {
    const instruments = await prisma.simInstrument.findMany();
    const symbolToId = {};
    for (const inst of instruments) {
      symbolToId[inst.symbol] = inst.id;
    }

    // Fetch larger history to catch all events during populate
    const res = await fetch(`${SIM_URL}/news/history?limit=50000`);
    if (!res.ok) return;
    const newsItems = await res.json();

    // Only insert news newer than what we have
    const newItems = newsItems.filter((n) => n.timestamp > lastNewsTimestamp);
    if (newItems.length === 0) return;

    await prisma.simNews.createMany({
      data: newItems.map((n) => ({
        instrumentId: n.symbol ? symbolToId[n.symbol] || null : null,
        category: n.category,
        sentiment: n.sentiment,
        headline: n.headline,
        magnitude: n.magnitude,
        industry: n.industry || null,
        companyName: n.companyName || null,
        subcategory: n.subcategory || null,
        simTimestamp: BigInt(n.timestamp),
      })),
      skipDuplicates: true,
    });

    lastNewsTimestamp = Math.max(...newItems.map((n) => n.timestamp));
    console.log(`[SimSync] Synced ${newItems.length} news events`);
  } catch (err) {
    console.error("[SimSync] News sync failed:", err.message);
  }
}

/**
 * Save simulation state checkpoint
 */
export async function saveState(prisma) {
  try {
    const res = await fetch(`${SIM_URL}/state`);
    if (!res.ok) return;
    const state = await res.json();

    await prisma.simState.upsert({
      where: { key: "sim_checkpoint" },
      update: { value: state },
      create: { key: "sim_checkpoint", value: state },
    });
  } catch (err) {
    console.error("[SimSync] State save failed:", err.message);
  }
}

/**
 * Start periodic sync
 */
export function startSync(prisma) {
  console.log(`[SimSync] Starting sync (interval: ${SYNC_INTERVAL_MS}ms)`);

  // Initial sync after 5 seconds (give C++ time to start)
  setTimeout(async () => {
    await syncInstruments(prisma);
    await syncCandles(prisma, "M1");
    await syncCandles(prisma, "M5");
    await syncCandles(prisma, "M15");
    await syncCandles(prisma, "H1");
    await syncCandles(prisma, "D1");
    await syncNews(prisma);
    await saveState(prisma);
  }, 5000);

  // Periodic sync
  syncTimer = setInterval(async () => {
    try {
      await syncCandles(prisma, "M1");
      await syncCandles(prisma, "M5");
      await syncCandles(prisma, "M15");
      await syncCandles(prisma, "H1");
      await syncCandles(prisma, "D1");
      await syncNews(prisma);
      await saveState(prisma);
    } catch (err) {
      console.error("[SimSync] Periodic sync error:", err.message);
    }
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop periodic sync
 */
export function stopSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("[SimSync] Stopped");
  }
}

/**
 * Delete all simulation data (for admin reset)
 */
export async function deleteAllSimData(prisma) {
  await prisma.simCandle.deleteMany({});
  await prisma.simNews.deleteMany({});
  await prisma.simState.deleteMany({});
  console.log("[SimSync] All sim data deleted");
}

/**
 * Trigger C++ engine to populate (async), then sync the result
 * C++ now returns immediately - we poll for completion before syncing
 */
export async function triggerPopulate(
  prisma,
  days = 180,
  startDate = "2025-08-07",
) {
  try {
    setPopulateStatus("populating", "Starting C++ population...");

    const res = await fetch(`${SIM_URL}/populate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days, startDate }),
    });

    if (!res.ok) {
      const err = await res.json();
      setPopulateStatus("idle", null, err.error || "Populate failed");
      throw new Error(err.error || "Populate failed");
    }

    const result = await res.json();

    // C++ now runs async - poll for completion
    console.log("[SimSync] Populate started, waiting for completion...");
    await waitForPopulateComplete();

    // Sync all the generated data
    setPopulateStatus("syncing", "Syncing candles to database...");
    console.log("[SimSync] Populate complete, syncing data to DB...");
    
    await syncCandles(prisma, "M1");
    setPopulateStatus("syncing", "Syncing M5 candles...");
    await syncCandles(prisma, "M5");
    setPopulateStatus("syncing", "Syncing M15 candles...");
    await syncCandles(prisma, "M15");
    setPopulateStatus("syncing", "Syncing M30 candles...");
    await syncCandles(prisma, "M30");
    setPopulateStatus("syncing", "Syncing H1 candles...");
    await syncCandles(prisma, "H1");
    setPopulateStatus("syncing", "Syncing D1 candles...");
    await syncCandles(prisma, "D1");
    setPopulateStatus("syncing", "Syncing news events...");
    await syncNews(prisma);
    setPopulateStatus("syncing", "Saving state...");
    await saveState(prisma);

    setPopulateStatus("idle", "Complete");
    return result;
  } catch (err) {
    setPopulateStatus("idle", null, err.message);
    throw err;
  }
}

/**
 * Poll C++ /state until populating becomes false
 */
async function waitForPopulateComplete(timeoutMs = 600000) {
  const startTime = Date.now();
  const pollInterval = 1000; // 1 second

  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(`${SIM_URL}/state`);
      if (res.ok) {
        const state = await res.json();
        if (!state.populating) {
          return state;
        }
        // Log progress
        if (state.populateCurrentDay !== undefined) {
          console.log(`[SimSync] Populate progress: ${state.populateCurrentDay}/${state.populateTargetDays} (${state.simDate})`);
        }
      }
    } catch (err) {
      console.error("[SimSync] Error polling state:", err.message);
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  throw new Error("Populate timed out");
}

function mapInterval(str) {
  const map = {
    "1m": "M1",
    M1: "M1",
    "5m": "M5",
    M5: "M5",
    "15m": "M15",
    M15: "M15",
    "30m": "M30",
    M30: "M30",
    "1h": "H1",
    H1: "H1",
    "1d": "D1",
    D1: "D1",
  };
  return map[str] || "M1";
}
