/**
 * Quick script to sync sim data from the C++ engine to the database.
 * Run after a /populate call.
 */
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
config();

const prisma = new PrismaClient();
const SIM_URL = process.env.MARKET_SIM_URL || "http://127.0.0.1:8080";

async function syncInstruments() {
  const res = await fetch(`${SIM_URL}/stocks`);
  const stocks = await res.json();

  for (const stock of stocks) {
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
        founded: stock.founded != null ? String(stock.founded) : null,
        headquarters: stock.headquarters || null,
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
        founded: stock.founded != null ? String(stock.founded) : null,
        headquarters: stock.headquarters || null,
      },
    });
  }
  console.log(`Synced ${stocks.length} instruments`);
}

async function syncCandles(interval) {
  const instruments = await prisma.simInstrument.findMany();
  const symbolToId = {};
  for (const inst of instruments) symbolToId[inst.symbol] = inst.id;

  const res = await fetch(
    `${SIM_URL}/candles/bulk?interval=${interval}&since=0&limit=50000`,
  );
  if (!res.ok) {
    console.error(`Failed to fetch candles for ${interval}: ${res.status}`);
    return;
  }
  const allCandles = await res.json();

  let count = 0;
  const intervalMap = {
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
  const intervalEnum = intervalMap[interval] || "M1";

  for (const [symbol, candles] of Object.entries(allCandles)) {
    const instId = symbolToId[symbol];
    if (!instId || candles.length === 0) continue;

    await prisma.simCandle.createMany({
      data: candles.map((c) => ({
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

    count += candles.length;
  }
  console.log(`Synced ${count} candles (${interval})`);
}

async function syncNews() {
  const instruments = await prisma.simInstrument.findMany();
  const symbolToId = {};
  for (const inst of instruments) symbolToId[inst.symbol] = inst.id;

  const res = await fetch(`${SIM_URL}/news/history?limit=10000`);
  if (!res.ok) return;
  const newsItems = await res.json();

  if (newsItems.length === 0) return;

  await prisma.simNews.createMany({
    data: newsItems.map((n) => ({
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

  console.log(`Synced ${newsItems.length} news events`);
}

async function main() {
  console.log("Syncing sim data to database...");

  // Clean old data before re-syncing
  console.log("Clearing old sim candles and news...");
  await prisma.simCandle.deleteMany({});
  await prisma.simNews.deleteMany({});

  await syncInstruments();
  for (const interval of ["D1", "H1", "M5", "M1"]) {
    await syncCandles(interval);
  }
  await syncNews();
  console.log("Done!");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
