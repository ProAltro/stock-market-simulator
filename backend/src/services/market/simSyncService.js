/**
 * Simulation Sync Service
 * Periodically pulls candle data and news from the C++ sim and persists to DB.
 * Also handles initial stock instrument sync from the /stocks endpoint.
 */

const SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";
const SYNC_INTERVAL_MS = 30_000; // 30 seconds

let syncTimer = null;
let lastNewsTimestamp = 0;

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
 * Sync candles from C++ engine for all symbols at a given interval
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

    let count = 0;
    for (const [symbol, candles] of Object.entries(allCandles)) {
      const instId = symbolToId[symbol];
      if (!instId) continue;
      const since = sinceMap[instId] || 0;

      const newCandles = candles.filter((c) => c.time > since);
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
      console.log(`[SimSync] Synced ${count} candles (${interval})`);
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

    const res = await fetch(`${SIM_URL}/news/history?limit=200`);
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
    await syncCandles(prisma, "H1");
    await syncCandles(prisma, "D1");
    await syncNews(prisma);
    await saveState(prisma);
  }, 5000);

  // Periodic sync
  syncTimer = setInterval(async () => {
    try {
      await syncCandles(prisma, "M1");
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
 * Trigger C++ engine to populate, then sync the result
 */
export async function triggerPopulate(
  prisma,
  days = 180,
  startDate = "2025-08-07",
) {
  const res = await fetch(`${SIM_URL}/populate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days, startDate }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Populate failed");
  }

  const result = await res.json();

  // Sync all the generated data
  await syncCandles(prisma, "M1");
  await syncCandles(prisma, "M5");
  await syncCandles(prisma, "M15");
  await syncCandles(prisma, "H1");
  await syncCandles(prisma, "D1");
  await syncNews(prisma);
  await saveState(prisma);

  return result;
}

function mapInterval(str) {
  const map = {
    "1m": "M1",
    M1: "M1",
    "5m": "M5",
    M5: "M5",
    "15m": "M15",
    M15: "M15",
    "1h": "H1",
    H1: "H1",
    "1d": "D1",
    D1: "D1",
  };
  return map[str] || "M1";
}
