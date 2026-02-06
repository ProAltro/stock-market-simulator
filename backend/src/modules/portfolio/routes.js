import Decimal from "decimal.js";
import { getQuote } from "../../services/market/index.js";

export async function register(fastify, opts) {
  // Get portfolio summary
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate, fastify.withBaseCurrency],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const baseCurrency = request.baseCurrency;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { activeMode: true },
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

      // Calculate portfolio value with currency conversion
      let totalPositionsValueBase = new Decimal(0);
      const positionsWithValue = [];

      for (const position of account.positions) {
        const nativeCurrency = (
          position.currency ||
          position.instrument.currency ||
          "USD"
        ).toUpperCase();

        // Get live market price
        const marketPrice = await getMarketPriceLive(
          fastify,
          position.instrument.symbol,
        );

        // Convert market price to base currency
        const exchangeRate = await fastify.currency.getRate(
          nativeCurrency,
          baseCurrency,
        );
        const marketPriceBase = marketPrice * exchangeRate;

        const qty = new Decimal(position.quantity);
        const positionValueBase = qty.mul(marketPriceBase);

        // Cost basis: use stored avgPriceBase if available, else convert on the fly
        const avgPriceBase = position.avgPriceBase
          ? Number(position.avgPriceBase)
          : Number(position.avgPrice) * exchangeRate;
        const costBasisBase = qty.mul(avgPriceBase);

        const unrealizedPnLBase = positionValueBase.sub(costBasisBase);
        const unrealizedPnLPercent = costBasisBase.gt(0)
          ? unrealizedPnLBase.div(costBasisBase).mul(100).toNumber()
          : 0;

        totalPositionsValueBase =
          totalPositionsValueBase.add(positionValueBase);

        positionsWithValue.push({
          ...position,
          // Native currency values
          currency: nativeCurrency,
          currentPrice: marketPrice,
          avgPrice: Number(position.avgPrice),
          marketValue: qty.mul(marketPrice).toNumber(),
          costBasis: qty.mul(position.avgPrice).toNumber(),
          unrealizedPnL: qty
            .mul(marketPrice)
            .sub(qty.mul(position.avgPrice))
            .toNumber(),
          // Base currency values
          baseCurrency,
          exchangeRate,
          currentPriceBase: marketPriceBase,
          avgPriceBase,
          marketValueBase: positionValueBase.toNumber(),
          costBasisBase: costBasisBase.toNumber(),
          unrealizedPnLBase: unrealizedPnLBase.toNumber(),
          unrealizedPnLPercent,
        });
      }

      const cashBalance = new Decimal(account.cashBalance);
      const totalValue = cashBalance.add(totalPositionsValueBase);
      const startingBalance = new Decimal(
        process.env.DEFAULT_STARTING_BALANCE || 100000,
      );
      const totalReturn = totalValue.sub(startingBalance);
      const totalReturnPercent = startingBalance.gt(0)
        ? totalReturn.div(startingBalance).mul(100)
        : new Decimal(0);

      return {
        accountId: account.id,
        baseCurrency,
        cashBalance: cashBalance.toNumber(),
        positionsValue: totalPositionsValueBase.toNumber(),
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
      preHandler: [fastify.authenticate, fastify.withBaseCurrency],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const baseCurrency = request.baseCurrency;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { activeMode: true },
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
        const nativeCurrency = (
          position.currency ||
          position.instrument.currency ||
          "USD"
        ).toUpperCase();
        const marketPrice = await getMarketPriceLive(
          fastify,
          position.instrument.symbol,
        );
        const exchangeRate = await fastify.currency.getRate(
          nativeCurrency,
          baseCurrency,
        );
        const marketPriceBase = marketPrice * exchangeRate;

        const qty = new Decimal(position.quantity);
        const avgPriceBase = position.avgPriceBase
          ? Number(position.avgPriceBase)
          : Number(position.avgPrice) * exchangeRate;

        const positionValueBase = qty.mul(marketPriceBase);
        const costBasisBase = qty.mul(avgPriceBase);
        const unrealizedPnLBase = positionValueBase.sub(costBasisBase);

        positionsWithValue.push({
          id: position.id,
          symbol: position.instrument.symbol,
          name: position.instrument.name,
          quantity: position.quantity,
          // Native
          currency: nativeCurrency,
          avgPrice: position.avgPrice,
          currentPrice: marketPrice,
          marketValue: qty.mul(marketPrice).toNumber(),
          costBasis: qty.mul(position.avgPrice).toNumber(),
          unrealizedPnL: qty
            .mul(marketPrice)
            .sub(qty.mul(position.avgPrice))
            .toNumber(),
          // Base
          baseCurrency,
          exchangeRate,
          avgPriceBase,
          currentPriceBase: marketPriceBase,
          marketValueBase: positionValueBase.toNumber(),
          costBasisBase: costBasisBase.toNumber(),
          unrealizedPnLBase: unrealizedPnLBase.toNumber(),
          unrealizedPnLPercent: costBasisBase.gt(0)
            ? unrealizedPnLBase.div(costBasisBase).mul(100).toNumber()
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
      preHandler: [fastify.authenticate, fastify.withBaseCurrency],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const baseCurrency = request.baseCurrency;
      const { limit = 100 } = request.query;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { activeMode: true },
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

      return trades.map((trade) => {
        const tradeCurrency = trade.currency || trade.order.currency || "USD";
        const tradeRate = Number(trade.exchangeRate) || 1;
        const total = new Decimal(trade.quantity)
          .mul(trade.executionPrice)
          .toNumber();
        return {
          id: trade.id,
          symbol: trade.order.instrument.symbol,
          side: trade.order.side,
          quantity: trade.quantity,
          price: trade.executionPrice,
          total,
          currency: tradeCurrency,
          exchangeRate: tradeRate,
          priceBase: Number(trade.executionPrice) * tradeRate,
          totalBase: total * tradeRate,
          baseCurrency,
          timestamp: trade.createdAt,
        };
      });
    },
  );

  // Get detailed portfolio analytics
  fastify.get(
    "/analytics",
    {
      preHandler: [fastify.authenticate, fastify.withBaseCurrency],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const baseCurrency = request.baseCurrency;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { activeMode: true },
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

      const startingBalance = new Decimal(
        process.env.DEFAULT_STARTING_BALANCE || 100000,
      );
      let totalPositionsValue = new Decimal(0);
      let totalCostBasis = new Decimal(0);
      const positionsBySymbol = {};

      for (const position of account.positions) {
        const nativeCurrency = (
          position.currency ||
          position.instrument.currency ||
          "USD"
        ).toUpperCase();
        const marketPrice = await getMarketPriceLive(
          fastify,
          position.instrument.symbol,
        );
        const exchangeRate = await fastify.currency.getRate(
          nativeCurrency,
          baseCurrency,
        );
        const marketPriceBase = marketPrice * exchangeRate;

        const qty = new Decimal(position.quantity);
        const positionValue = qty.mul(marketPriceBase);
        const avgPriceBase = position.avgPriceBase
          ? Number(position.avgPriceBase)
          : Number(position.avgPrice) * exchangeRate;
        const costBasis = qty.mul(avgPriceBase);

        totalPositionsValue = totalPositionsValue.add(positionValue);
        totalCostBasis = totalCostBasis.add(costBasis);

        if (!positionsBySymbol[position.instrument.symbol]) {
          positionsBySymbol[position.instrument.symbol] = {
            symbol: position.instrument.symbol,
            name: position.instrument.name,
            currency: nativeCurrency,
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
        pos.weight = totalValue.gt(0)
          ? (pos.value / totalValue.toNumber()) * 100
          : 0;
      });

      // Trading activity stats
      const totalTrades = account.orders.reduce(
        (sum, order) => sum + order.trades.length,
        0,
      );
      const buyOrders = account.orders.filter((o) => o.side === "BUY").length;
      const sellOrders = account.orders.filter((o) => o.side === "SELL").length;

      const totalReturn = totalValue.sub(startingBalance);
      const totalReturnPercent = startingBalance.gt(0)
        ? totalReturn.div(startingBalance).mul(100)
        : new Decimal(0);

      return {
        baseCurrency,
        summary: {
          totalValue: totalValue.toNumber(),
          cashBalance: new Decimal(account.cashBalance).toNumber(),
          investedValue: totalPositionsValue.toNumber(),
          totalReturn: totalReturn.toNumber(),
          totalReturnPercent: totalReturnPercent.toNumber(),
          cashWeight: totalValue.gt(0)
            ? new Decimal(account.cashBalance)
                .div(totalValue)
                .mul(100)
                .toNumber()
            : 100,
          investedWeight: totalValue.gt(0)
            ? totalPositionsValue.div(totalValue).mul(100).toNumber()
            : 0,
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
          winRate: 0,
        },
      };
    },
  );

  // Get portfolio performance over time
  fastify.get(
    "/performance",
    {
      preHandler: [fastify.authenticate, fastify.withBaseCurrency],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const baseCurrency = request.baseCurrency;
      const { period = "1M" } = request.query;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { activeMode: true },
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

      for (const order of account.orders) {
        for (const trade of order.trades) {
          const currentValue = await calculatePortfolioValueConverted(
            fastify,
            account.id,
            baseCurrency,
          );
          const totalReturn = new Decimal(currentValue).sub(startingBalance);

          timeline.push({
            timestamp: trade.createdAt,
            value: currentValue,
            return: totalReturn.toNumber(),
            returnPercent: startingBalance.gt(0)
              ? totalReturn.div(startingBalance).mul(100).toNumber()
              : 0,
          });
        }
      }

      // Add current value
      const currentValue = await calculatePortfolioValueConverted(
        fastify,
        account.id,
        baseCurrency,
      );
      const totalReturn = new Decimal(currentValue).sub(startingBalance);

      timeline.push({
        timestamp: new Date(),
        value: currentValue,
        return: totalReturn.toNumber(),
        returnPercent: startingBalance.gt(0)
          ? totalReturn.div(startingBalance).mul(100).toNumber()
          : 0,
      });

      return {
        baseCurrency,
        period,
        timeline,
        startValue: startingBalance.toNumber(),
        currentValue,
        totalReturn: totalReturn.toNumber(),
        totalReturnPercent: startingBalance.gt(0)
          ? totalReturn.div(startingBalance).mul(100).toNumber()
          : 0,
      };
    },
  );
}

// Helper to calculate total portfolio value in a given base currency
async function calculatePortfolioValueConverted(
  fastify,
  accountId,
  baseCurrency,
) {
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
    const nativeCurrency = (
      position.currency ||
      position.instrument.currency ||
      "USD"
    ).toUpperCase();
    const price = await getMarketPriceLive(fastify, position.instrument.symbol);
    const rate = await fastify.currency.getRate(nativeCurrency, baseCurrency);
    positionsValue = positionsValue.add(
      new Decimal(position.quantity).mul(price * rate),
    );
  }

  return new Decimal(account.cashBalance).add(positionsValue).toNumber();
}

// Helper to get live market price (real quotes with Redis cache, fallback to mock)
async function getMarketPriceLive(fastify, symbol) {
  // 1. Try Redis cache
  try {
    const cacheKey = `quote:${symbol.toUpperCase()}`;
    const cached = await fastify.redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      return data.price;
    }
  } catch (err) {}

  // 2. Try live quote
  try {
    const quote = await getQuote(symbol);
    if (quote && quote.price) {
      // Cache for 60 seconds
      try {
        const cacheKey = `quote:${symbol.toUpperCase()}`;
        await fastify.redis.setex(cacheKey, 60, JSON.stringify(quote));
      } catch (e) {}
      return quote.price;
    }
  } catch (err) {}

  // 3. Fallback mock prices
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
