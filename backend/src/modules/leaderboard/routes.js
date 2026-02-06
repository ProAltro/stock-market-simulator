import Decimal from "decimal.js";
import { getQuote } from "../../services/market/index.js";

export async function register(fastify, opts) {
  // Leaderboard always ranks in USD for fairness
  const LEADERBOARD_CURRENCY = "USD";

  // Get leaderboard
  fastify.get("/", async (request, reply) => {
    const { limit = 20 } = request.query;
    const cacheKey = "leaderboard:top";

    // Check cache
    try {
      const cached = await fastify.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      fastify.log.warn("Redis cache miss for leaderboard");
    }

    // Get all accounts with their users (only opted-in users in RANKED mode)
    const accounts = await fastify.prisma.account.findMany({
      where: {
        mode: "RANKED",
        user: {
          isPublic: true,
          showOnLeaderboard: true,
        },
      },
      include: {
        user: {
          select: {
            email: true,
            displayName: true,
            isPublic: true,
          },
        },
        positions: {
          include: { instrument: true },
        },
      },
    });

    const startingBalance = new Decimal(
      process.env.DEFAULT_STARTING_BALANCE || 100000,
    );
    const rankings = [];

    for (const account of accounts) {
      let positionsValue = new Decimal(0);

      for (const position of account.positions) {
        const price = await getMarketPriceLive(
          fastify,
          position.instrument.symbol,
        );
        const nativeCurrency = (
          position.currency ||
          position.instrument.currency ||
          "USD"
        ).toUpperCase();
        const rate = await fastify.currency.getRate(
          nativeCurrency,
          LEADERBOARD_CURRENCY,
        );
        positionsValue = positionsValue.add(
          new Decimal(position.quantity).mul(price * rate),
        );
      }

      const totalValue = new Decimal(account.cashBalance).add(positionsValue);
      const totalReturn = totalValue.sub(startingBalance);
      const returnPercent = startingBalance.gt(0)
        ? totalReturn.div(startingBalance).mul(100)
        : new Decimal(0);

      // Use display name or masked email
      let displayName;
      if (account.user.displayName) {
        displayName = account.user.displayName;
      } else {
        const email = account.user.email;
        const [localPart, domain] = email.split("@");
        displayName = localPart.slice(0, 3) + "***@" + domain;
      }

      rankings.push({
        userId: account.userId,
        displayName,
        totalValue: totalValue.toNumber(),
        totalReturn: totalReturn.toNumber(),
        returnPercent: returnPercent.toNumber(),
        positionsCount: account.positions.length,
        currency: LEADERBOARD_CURRENCY,
      });
    }

    // Sort by return percentage
    rankings.sort((a, b) => b.returnPercent - a.returnPercent);

    // Add rank
    const leaderboard = rankings
      .slice(0, Number(limit))
      .map((entry, index) => ({
        rank: index + 1,
        ...entry,
      }));

    // Cache for 5 minutes
    try {
      await fastify.redis.setex(cacheKey, 300, JSON.stringify(leaderboard));
    } catch (err) {
      fastify.log.warn("Failed to cache leaderboard");
    }

    return leaderboard;
  });

  // Get current user's rank
  fastify.get(
    "/me",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;

      // Get full leaderboard to find user's rank
      const allRankings = await getFullRankings(fastify);
      const userRank = allRankings.findIndex((r) => r.userId === userId) + 1;
      const userStats = allRankings.find((r) => r.userId === userId);

      if (!userStats) {
        return reply.code(404).send({ error: "User not found in rankings" });
      }

      return {
        rank: userRank,
        totalParticipants: allRankings.length,
        ...userStats,
      };
    },
  );
}

async function getFullRankings(fastify) {
  const LEADERBOARD_CURRENCY = "USD";

  const accounts = await fastify.prisma.account.findMany({
    where: { mode: "RANKED" },
    include: {
      positions: {
        include: { instrument: true },
      },
    },
  });

  const startingBalance = new Decimal(
    process.env.DEFAULT_STARTING_BALANCE || 100000,
  );
  const rankings = [];

  for (const account of accounts) {
    let positionsValue = new Decimal(0);

    for (const position of account.positions) {
      const price = await getMarketPriceLive(
        fastify,
        position.instrument.symbol,
      );
      const nativeCurrency = (
        position.currency ||
        position.instrument.currency ||
        "USD"
      ).toUpperCase();
      const rate = await fastify.currency.getRate(
        nativeCurrency,
        LEADERBOARD_CURRENCY,
      );
      positionsValue = positionsValue.add(
        new Decimal(position.quantity).mul(price * rate),
      );
    }

    const totalValue = new Decimal(account.cashBalance).add(positionsValue);
    const returnPercent = startingBalance.gt(0)
      ? totalValue.sub(startingBalance).div(startingBalance).mul(100)
      : new Decimal(0);

    rankings.push({
      userId: account.userId,
      totalValue: totalValue.toNumber(),
      returnPercent: returnPercent.toNumber(),
    });
  }

  return rankings.sort((a, b) => b.returnPercent - a.returnPercent);
}

// Helper to get live market price with cache fallback
async function getMarketPriceLive(fastify, symbol) {
  try {
    const cacheKey = `quote:${symbol.toUpperCase()}`;
    const cached = await fastify.redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      return data.price;
    }
  } catch (err) {}

  try {
    const quote = await getQuote(symbol);
    if (quote && quote.price) {
      try {
        const cacheKey = `quote:${symbol.toUpperCase()}`;
        await fastify.redis.setex(cacheKey, 60, JSON.stringify(quote));
      } catch (e) {}
      return quote.price;
    }
  } catch (err) {}

  const prices = {
    AAPL: 185,
    GOOGL: 142,
    MSFT: 410,
    AMZN: 178,
    META: 485,
    NVDA: 680,
    TSLA: 185,
    JPM: 195,
    V: 280,
    JNJ: 160,
    WMT: 165,
    PG: 165,
  };
  return prices[symbol.toUpperCase()] || 100;
}

export default register;
