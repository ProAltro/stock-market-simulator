import {
  getQuote,
  getHistory,
  getProviderName,
} from "../../services/market/index.js";

// Cache constants removed

export async function register(fastify, opts) {
  // Get real-time quote
  fastify.get("/quote/:symbol", async (request, reply) => {
    const { symbol } = request.params;
    // Cache check removed

    try {
      // Check if instrument exists in database, if not create it
      await ensureInstrumentExists(fastify, symbol);

      const quote = await getQuote(symbol);

      // Cache set removed

      return quote;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(502).send({ error: "Failed to fetch market data" });
    }
  });

  // Get historical data (OHLC)
  fastify.get("/history/:symbol", async (request, reply) => {
    const { symbol } = request.params;
    const { interval = "1day", range = "1mo", outputsize = 500 } = request.query;
    // Cache check removed

    try {
      const history = await getHistory(symbol, {
        interval,
        range,
        outputsize: Number(outputsize),
      });

      // Cache set removed

      return history;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(502).send({ error: "Failed to fetch historical data" });
    }
  });

  // Get current market data provider info
  fastify.get("/provider", async (request, reply) => {
    return {
      provider: getProviderName(),
      timestamp: new Date().toISOString(),
    };
  });
  // Search for instruments
  fastify.get("/search/:query", async (request, reply) => {
    const { query } = request.params;

    try {
      // First search local database
      const localResults = await fastify.prisma.instrument.findMany({
        where: {
          OR: [
            { symbol: { contains: query.toUpperCase() } },
            { name: { contains: query, mode: "insensitive" } },
          ],
          isActive: true,
        },
        take: 10,
        select: {
          symbol: true,
          name: true,
          type: true,
          exchange: true,
        },
      });

      return { results: localResults };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: "Search failed" });
    }
  });

  // Get candles/OHLC data with timeframe options
  fastify.get("/candles/:symbol", async (request, reply) => {
    const { symbol } = request.params;
    const { timeframe = "1d", bars = 100, from, to } = request.query;

    // Cache check removed

    try {
      // Ensure instrument exists
      await ensureInstrumentExists(fastify, symbol);

      // Map timeframe to interval
      const intervalMap = {
        "1m": "1min",
        "5m": "5min",
        "15m": "15min",
        "30m": "30min",
        "1h": "1hour",
        "1d": "1day",
        "1w": "1week",
        "1M": "1month",
      };

      const interval = intervalMap[timeframe] || "1day";
      const history = await getHistory(symbol, {
        interval,
        outputsize: Number(bars),
      });

      // Cache set removed

      return history;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(502).send({ error: "Failed to fetch candle data" });
    }
  });
}

/**
 * Ensure an instrument exists in the database, fetching from Yahoo Finance if needed
 */
async function ensureInstrumentExists(fastify, symbol) {
  const upperSymbol = symbol.toUpperCase();

  // Check if exists first (optimization)
  let existing = await fastify.prisma.instrument.findUnique({
    where: { symbol: upperSymbol },
  });

  if (existing) {
    return existing;
  }

  // Fetch from Yahoo Finance
  try {
    const quote = await getQuote(symbol);

    // Create the instrument safely handling race conditions
    try {
      const instrument = await fastify.prisma.instrument.create({
        data: {
          symbol: upperSymbol,
          name: quote.name || `${upperSymbol} Inc.`,
          type: "EQUITY",
          exchange: quote.exchange || "NASDAQ",
          isActive: true,
        },
      });

      fastify.log.info(`Auto-seeded instrument: ${upperSymbol}`);
      return instrument;
    } catch (dbErr) {
      // If unique constraint violation (P2002), it means another request created it just now
      if (dbErr.code === 'P2002') {
        existing = await fastify.prisma.instrument.findUnique({
            where: { symbol: upperSymbol },
        });
        if (existing) return existing;
      }
      throw dbErr;
    }
  } catch (err) {
    fastify.log.error(`Failed to auto-seed instrument ${upperSymbol}:`, err);
    throw err;
  }
}

export default register;
