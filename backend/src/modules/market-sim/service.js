import fetch from "node-fetch";

const MARKET_SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";

// Ensure user has a SIMULATION account, create if not
export async function ensureSimAccount(prisma, userId) {
  let account = await prisma.account.findFirst({
    where: { userId, mode: "SIMULATION" },
  });

  if (!account) {
    account = await prisma.account.create({
      data: {
        userId,
        name: "Simulation",
        mode: "SIMULATION",
        baseCurrency: "USD",
        cashBalance: 100000,
        initialBalance: 100000,
      },
    });
  }

  return account;
}

// Get sim portfolio
export async function getSimPortfolio(prisma, userId) {
  const account = await ensureSimAccount(prisma, userId);

  const positions = await prisma.position.findMany({
    where: { accountId: account.id },
  });

  // Get current prices from C++ sim
  const pricesRes = await fetch(`${MARKET_SIM_URL}/assets`);
  const assets = await pricesRes.json();
  const priceMap = {};
  for (const a of assets) {
    priceMap[a.symbol] = a.price;
  }

  // Calculate position values
  let totalValue = Number(account.cashBalance);
  const enrichedPositions = positions.map((p) => {
    const currentPrice = priceMap[p.instrument?.symbol] || Number(p.avgPrice);
    const marketValue = Number(p.quantity) * currentPrice;
    const costBasis = Number(p.quantity) * Number(p.avgPrice);
    const unrealizedPnl = marketValue - costBasis;
    totalValue += marketValue;

    return {
      ...p,
      quantity: Number(p.quantity),
      avgPrice: Number(p.avgPrice),
      currentPrice,
      marketValue,
      unrealizedPnl,
    };
  });

  return {
    cashBalance: Number(account.cashBalance),
    totalValue,
    positions: enrichedPositions,
  };
}

// Place order in simulation
export async function placeSimOrder(prisma, userId, orderData) {
  const account = await ensureSimAccount(prisma, userId);

  const { symbol, side, quantity, orderType, limitPrice } = orderData;

  // Forward to C++ API
  const response = await fetch(`${MARKET_SIM_URL}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol,
      side,
      type: orderType || "MARKET",
      price: limitPrice || 0,
      quantity,
      userId,
    }),
  });

  const result = await response.json();

  if (result.status === "filled" || result.status === "partial") {
    const filledQty = result.filledQuantity || quantity;
    const fillPrice = result.avgFillPrice;
    const cost = filledQty * fillPrice;

    // Update cash balance
    if (side === "BUY") {
      await prisma.account.update({
        where: { id: account.id },
        data: { cashBalance: { decrement: cost } },
      });
    } else {
      await prisma.account.update({
        where: { id: account.id },
        data: { cashBalance: { increment: cost } },
      });
    }

    // Upsert position
    const direction = side === "BUY" ? "LONG" : "SHORT";

    // Check if instrument exists, create if needed
    let instrument = await prisma.instrument.findUnique({
      where: { symbol },
    });

    if (!instrument) {
      instrument = await prisma.instrument.create({
        data: {
          symbol,
          name: symbol,
          type: "EQUITY",
          currency: "USD",
          exchange: "SIM",
        },
      });
    }

    const existingPosition = await prisma.position.findFirst({
      where: {
        accountId: account.id,
        instrumentId: instrument.id,
        direction,
      },
    });

    if (existingPosition) {
      // Update existing position
      const newQty =
        side === "BUY"
          ? Number(existingPosition.quantity) + filledQty
          : Number(existingPosition.quantity) - filledQty;

      if (newQty <= 0) {
        await prisma.position.delete({ where: { id: existingPosition.id } });
      } else {
        const totalCost =
          Number(existingPosition.avgPrice) *
            Number(existingPosition.quantity) +
          fillPrice * filledQty;
        const newAvg = totalCost / newQty;

        await prisma.position.update({
          where: { id: existingPosition.id },
          data: {
            quantity: newQty,
            avgPrice: newAvg,
          },
        });
      }
    } else if (side === "BUY") {
      await prisma.position.create({
        data: {
          accountId: account.id,
          instrumentId: instrument.id,
          quantity: filledQty,
          avgPrice: fillPrice,
          direction: "LONG",
          currency: "USD",
        },
      });
    }
  }

  return result;
}

// Get sim orders
export async function getSimOrders(prisma, userId) {
  const account = await prisma.account.findFirst({
    where: { userId, mode: "SIMULATION" },
  });

  if (!account) return [];

  return prisma.order.findMany({
    where: { accountId: account.id },
    include: { instrument: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
