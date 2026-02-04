import Decimal from "decimal.js";

export async function register(fastify, opts) {
  // Get portfolio summary
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;

      const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { activeMode: true }
      });

      const account = await fastify.prisma.account.findFirst({
        where: { userId, mode: user.activeMode },
        include: {
          positions: {
            include: { instrument: true },
          },
        },
      });

      if (!account) {
        return reply.code(404).send({ error: "Account not found" });
      }

      // Calculate portfolio value
      let totalPositionsValue = new Decimal(0);
      const positionsWithValue = [];

      for (const position of account.positions) {
        const marketPrice = await getMarketPrice(
          fastify,
          position.instrument.symbol,
        );
        const positionValue = new Decimal(position.quantity).mul(marketPrice);
        const costBasis = new Decimal(position.quantity).mul(position.avgPrice);
        const unrealizedPnL = positionValue.sub(costBasis);
        const unrealizedPnLPercent = costBasis.gt(0)
          ? unrealizedPnL.div(costBasis).mul(100).toNumber()
          : 0;

        totalPositionsValue = totalPositionsValue.add(positionValue);

        positionsWithValue.push({
          ...position,
          currentPrice: marketPrice,
          marketValue: positionValue.toNumber(),
          costBasis: costBasis.toNumber(),
          unrealizedPnL: unrealizedPnL.toNumber(),
          unrealizedPnLPercent,
        });
      }

      const cashBalance = new Decimal(account.cashBalance);
      const totalValue = cashBalance.add(totalPositionsValue);
      const startingBalance = new Decimal(
        process.env.DEFAULT_STARTING_BALANCE || 100000,
      );
      const totalReturn = totalValue.sub(startingBalance);
      const totalReturnPercent = totalReturn.div(startingBalance).mul(100);

      return {
        accountId: account.id,
        cashBalance: cashBalance.toNumber(),
        positionsValue: totalPositionsValue.toNumber(),
        totalValue: totalValue.toNumber(),
        totalReturn: totalReturn.toNumber(),
        totalReturnPercent: totalReturnPercent.toNumber(),
        positions: positionsWithValue,
      };
    },
  );

  // Get positions only
  fastify.get(
    "/positions",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;

      const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { activeMode: true }
      });

      const account = await fastify.prisma.account.findFirst({
        where: { userId, mode: user.activeMode },
        include: {
          positions: {
            include: { instrument: true },
          },
        },
      });

      if (!account) {
        return reply.code(404).send({ error: "Account not found" });
      }

      const positionsWithValue = [];

      for (const position of account.positions) {
        const marketPrice = await getMarketPrice(
          fastify,
          position.instrument.symbol,
        );
        const positionValue = new Decimal(position.quantity).mul(marketPrice);
        const costBasis = new Decimal(position.quantity).mul(position.avgPrice);
        const unrealizedPnL = positionValue.sub(costBasis);

        positionsWithValue.push({
          id: position.id,
          symbol: position.instrument.symbol,
          name: position.instrument.name,
          quantity: position.quantity,
          avgPrice: position.avgPrice,
          currentPrice: marketPrice,
          marketValue: positionValue.toNumber(),
          costBasis: costBasis.toNumber(),
          unrealizedPnL: unrealizedPnL.toNumber(),
          unrealizedPnLPercent: costBasis.gt(0)
            ? unrealizedPnL.div(costBasis).mul(100).toNumber()
            : 0,
          direction: position.direction,
        });
      }

      return positionsWithValue;
    },
  );

  // Get trade history (realized PnL)
  fastify.get(
    "/history",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const { limit = 100 } = request.query;

      const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { activeMode: true }
      });

      const account = await fastify.prisma.account.findFirst({
        where: { userId, mode: user.activeMode },
      });

      if (!account) {
        return reply.code(404).send({ error: "Account not found" });
      }

      const trades = await fastify.prisma.trade.findMany({
        where: {
          order: {
            accountId: account.id,
          },
        },
        include: {
          order: {
            include: { instrument: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: Number(limit),
      });

      return trades.map((trade) => ({
        id: trade.id,
        symbol: trade.order.instrument.symbol,
        side: trade.order.side,
        quantity: trade.quantity,
        price: trade.executionPrice,
        total: new Decimal(trade.quantity).mul(trade.executionPrice).toNumber(),
        timestamp: trade.createdAt,
      }));
    },
  );

  // Get detailed portfolio analytics
  fastify.get(
    "/analytics",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;

      const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { activeMode: true }
      });

      const account = await fastify.prisma.account.findFirst({
        where: { userId, mode: user.activeMode },
        include: {
          positions: {
            include: { instrument: true },
          },
          orders: {
            where: { status: "FILLED" },
            include: {
              instrument: true,
              trades: true,
            },
          },
        },
      });

      if (!account) {
        return reply.code(404).send({ error: "Account not found" });
      }

      // Calculate metrics
      const startingBalance = new Decimal(
        process.env.DEFAULT_STARTING_BALANCE || 100000,
      );
      let totalPositionsValue = new Decimal(0);
      let totalCostBasis = new Decimal(0);
      const positionsBySymbol = {};

      for (const position of account.positions) {
        const marketPrice = await getMarketPrice(
          fastify,
          position.instrument.symbol,
        );
        const positionValue = new Decimal(position.quantity).mul(marketPrice);
        const costBasis = new Decimal(position.quantity).mul(position.avgPrice);

        totalPositionsValue = totalPositionsValue.add(positionValue);
        totalCostBasis = totalCostBasis.add(costBasis);

        if (!positionsBySymbol[position.instrument.symbol]) {
          positionsBySymbol[position.instrument.symbol] = {
            symbol: position.instrument.symbol,
            name: position.instrument.name,
            value: 0,
            weight: 0,
          };
        }
        positionsBySymbol[position.instrument.symbol].value +=
          positionValue.toNumber();
      }

      const totalValue = new Decimal(account.cashBalance).add(
        totalPositionsValue,
      );

      // Calculate weights
      Object.values(positionsBySymbol).forEach((pos) => {
        pos.weight = (pos.value / totalValue.toNumber()) * 100;
      });

      // Trading activity stats
      const totalTrades = account.orders.reduce(
        (sum, order) => sum + order.trades.length,
        0,
      );
      const buyOrders = account.orders.filter((o) => o.side === "BUY").length;
      const sellOrders = account.orders.filter((o) => o.side === "SELL").length;

      // Calculate daily returns (simplified - would need historical snapshots for accurate calculation)
      const totalReturn = totalValue.sub(startingBalance);
      const totalReturnPercent = totalReturn.div(startingBalance).mul(100);

      return {
        summary: {
          totalValue: totalValue.toNumber(),
          cashBalance: new Decimal(account.cashBalance).toNumber(),
          investedValue: totalPositionsValue.toNumber(),
          totalReturn: totalReturn.toNumber(),
          totalReturnPercent: totalReturnPercent.toNumber(),
          cashWeight: new Decimal(account.cashBalance)
            .div(totalValue)
            .mul(100)
            .toNumber(),
          investedWeight: totalPositionsValue
            .div(totalValue)
            .mul(100)
            .toNumber(),
        },
        positions: {
          count: account.positions.length,
          allocation: Object.values(positionsBySymbol).sort(
            (a, b) => b.weight - a.weight,
          ),
        },
        activity: {
          totalTrades,
          buyOrders,
          sellOrders,
          winRate: 0, // Would require tracking closed positions
        },
      };
    },
  );

  // Get portfolio performance over time
  fastify.get(
    "/performance",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const { period = "1M" } = request.query;

      const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { activeMode: true }
      });

      const account = await fastify.prisma.account.findFirst({
        where: { userId, mode: user.activeMode },
        include: {
          orders: {
            where: { status: "FILLED" },
            include: { trades: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!account) {
        return reply.code(404).send({ error: "Account not found" });
      }

      // Build performance timeline from orders
      const startingBalance = new Decimal(
        process.env.DEFAULT_STARTING_BALANCE || 100000,
      );
      const timeline = [
        {
          timestamp: account.createdAt,
          value: startingBalance.toNumber(),
          return: 0,
          returnPercent: 0,
        },
      ];

      // This is simplified - in production, you'd want periodic snapshots
      for (const order of account.orders) {
        for (const trade of order.trades) {
          const currentValue = await calculatePortfolioValue(
            fastify,
            account.id,
          );
          const totalReturn = new Decimal(currentValue).sub(startingBalance);

          timeline.push({
            timestamp: trade.createdAt,
            value: currentValue,
            return: totalReturn.toNumber(),
            returnPercent: totalReturn.div(startingBalance).mul(100).toNumber(),
          });
        }
      }

      // Add current value
      const currentValue = await calculatePortfolioValue(fastify, account.id);
      const totalReturn = new Decimal(currentValue).sub(startingBalance);

      timeline.push({
        timestamp: new Date(),
        value: currentValue,
        return: totalReturn.toNumber(),
        returnPercent: totalReturn.div(startingBalance).mul(100).toNumber(),
      });

      return {
        period,
        timeline,
        startValue: startingBalance.toNumber(),
        currentValue,
        totalReturn: totalReturn.toNumber(),
        totalReturnPercent: totalReturn
          .div(startingBalance)
          .mul(100)
          .toNumber(),
      };
    },
  );
}

// Helper to calculate total portfolio value
async function calculatePortfolioValue(fastify, accountId) {
  const account = await fastify.prisma.account.findUnique({
    where: { id: accountId },
    include: {
      positions: {
        include: { instrument: true },
      },
    },
  });

  let positionsValue = new Decimal(0);
  for (const position of account.positions) {
    const price = await getMarketPrice(fastify, position.instrument.symbol);
    positionsValue = positionsValue.add(
      new Decimal(position.quantity).mul(price),
    );
  }

  return new Decimal(account.cashBalance).add(positionsValue).toNumber();
}

// Helper to get market price
async function getMarketPrice(fastify, symbol) {
  try {
    const cacheKey = `quote:${symbol.toUpperCase()}`;
    const cached = await fastify.redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      return data.price;
    }
  } catch (err) {}

  // Mock prices for development
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
    DIS: 95,
    NFLX: 480,
    AMD: 175,
    INTC: 45,
  };
  return prices[symbol.toUpperCase()] || 100 + Math.random() * 50;
}

export default register;
