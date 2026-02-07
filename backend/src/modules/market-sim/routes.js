import { getSimPortfolio, placeSimOrder, getSimOrders } from "./service.js";

const SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";

export default async function marketSimRoutes(fastify) {
  // Get simulation portfolio
  fastify.get(
    "/portfolio",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      return getSimPortfolio(fastify.prisma, request.user.userId);
    },
  );

  // Place simulation order
  fastify.post(
    "/orders",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { symbol, side, quantity, orderType, limitPrice } = request.body;

      if (!symbol || !side || !quantity) {
        return reply.code(400).send({ error: "Missing required fields" });
      }

      try {
        const result = await placeSimOrder(
          fastify.prisma,
          request.user.userId,
          {
            symbol,
            side: side.toUpperCase(),
            quantity: Number(quantity),
            orderType: orderType?.toUpperCase() || "MARKET",
            limitPrice: limitPrice ? Number(limitPrice) : null,
          },
        );

        return result;
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: "Order execution failed" });
      }
    },
  );

  // Get simulation order history
  fastify.get(
    "/orders",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      return getSimOrders(fastify.prisma, request.user.userId);
    },
  );

  // Proxy to C++ sim for assets (with field normalization)
  fastify.get("/assets", async () => {
    const res = await fetch(`${SIM_URL}/assets`);
    const assets = await res.json();
    // Normalize: C++ returns "return", frontend expects "change"
    return (Array.isArray(assets) ? assets : []).map((a) => ({
      ...a,
      change: a.return ?? a.change ?? 0,
      name: a.name || "",
      sectorDetail: a.sectorDetail || "",
      character: a.character || "",
      marketCap: a.marketCap || 0,
    }));
  });

  // Proxy to C++ sim for state
  fastify.get("/state", async () => {
    const res = await fetch(`${SIM_URL}/state`);
    return res.json();
  });

  // Proxy orderbook
  fastify.get("/orderbook/:symbol", async (request) => {
    const res = await fetch(`${SIM_URL}/orderbook/${request.params.symbol}`);
    return res.json();
  });

  // === NEW: Stock metadata ===
  fastify.get("/stocks", async () => {
    const res = await fetch(`${SIM_URL}/stocks`);
    return res.json();
  });

  // === NEW: Candles from DB (historical) or C++ (live) ===
  fastify.get("/candles/:symbol", async (request) => {
    const { symbol } = request.params;
    const interval = request.query.interval || "1h";
    const limit = parseInt(request.query.limit) || 500;
    const source = request.query.source || "db"; // "db" or "live"

    if (source === "live") {
      const since = request.query.since || 0;
      const res = await fetch(
        `${SIM_URL}/candles/${symbol}?interval=${interval}&since=${since}&limit=${limit}`,
      );
      return res.json();
    }

    // Serve from DB
    const intervalEnum = mapIntervalEnum(interval);
    const instrument = await fastify.prisma.simInstrument.findUnique({
      where: { symbol },
    });
    if (!instrument) {
      return { error: "Symbol not found" };
    }

    const candles = await fastify.prisma.simCandle.findMany({
      where: {
        instrumentId: instrument.id,
        interval: intervalEnum,
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    // Return in ascending order
    return candles.reverse().map((c) => ({
      time: Number(c.timestamp),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
    }));
  });

  // === NEW: News history from DB ===
  fastify.get("/news", async (request) => {
    const limit = parseInt(request.query.limit) || 50;
    const category = request.query.category;
    const symbol = request.query.symbol;

    const where = {};
    if (category) where.category = category;
    if (symbol) {
      const inst = await fastify.prisma.simInstrument.findUnique({
        where: { symbol },
      });
      if (inst) where.instrumentId = inst.id;
    }

    const news = await fastify.prisma.simNews.findMany({
      where,
      orderBy: { simTimestamp: "desc" },
      take: limit,
      include: {
        instrument: { select: { symbol: true, name: true } },
      },
    });

    return news.reverse().map((n) => ({
      headline: n.headline,
      category: n.category,
      sentiment: n.sentiment,
      magnitude: Number(n.magnitude),
      symbol: n.instrument?.symbol || null,
      companyName: n.companyName,
      industry: n.industry,
      subcategory: n.subcategory,
      timestamp: Number(n.simTimestamp),
    }));
  });

  // === NEW: Get sim instruments with details ===
  fastify.get("/instruments", async () => {
    return fastify.prisma.simInstrument.findMany({
      orderBy: { symbol: "asc" },
    });
  });

  // === NEW: Quote endpoint (Yahoo-Finance-like) ===
  fastify.get("/quote/:symbol", async (request) => {
    const { symbol } = request.params;

    // Get live price from C++ engine
    const assetsRes = await fetch(`${SIM_URL}/assets`);
    const assets = await assetsRes.json();
    const asset = assets.find((a) => a.symbol === symbol);

    if (!asset) {
      return { error: "Symbol not found" };
    }

    // Get DB instrument for metadata
    const instrument = await fastify.prisma.simInstrument.findUnique({
      where: { symbol },
    });

    return {
      symbol: asset.symbol,
      name: asset.name || instrument?.name || symbol,
      price: asset.price,
      change: asset.return,
      changePercent: (asset.return || 0) * 100,
      volume: asset.volume,
      marketCap: asset.marketCap,
      industry: asset.industry,
      sectorDetail: asset.sectorDetail || instrument?.sectorDetail,
      description: instrument?.description,
      character: asset.character || instrument?.character,
      fundamental: asset.fundamental,
      volatility: asset.volatility,
    };
  });
}

function mapIntervalEnum(str) {
  const map = {
    "1m": "M1",
    "5m": "M5",
    "15m": "M15",
    "1h": "H1",
    "1d": "D1",
    M1: "M1",
    M5: "M5",
    M15: "M15",
    H1: "H1",
    D1: "D1",
  };
  return map[str] || "M1";
}
