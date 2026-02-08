import Decimal from "decimal.js";
import { getQuote } from "../../services/market/index.js";
import { validateOrderRisk } from "../risk/service.js";

export async function register(fastify, opts) {
  // Place a new order
  fastify.post(
    "/",
    {
      preHandler: [fastify.authenticate, fastify.withBaseCurrency],
      schema: {
        body: {
          type: "object",
          required: ["symbol", "side", "quantity"],
          properties: {
            symbol: { type: "string" },
            side: { type: "string", enum: ["BUY", "SELL"] },
            quantity: { type: "number", minimum: 0.0001 },
            orderType: {
              type: "string",
              enum: ["MARKET", "LIMIT"],
              default: "MARKET",
            },
            limitPrice: { type: "number" },
          },
        },
      },
    },
    async (request, reply) => {
      const {
        symbol,
        side,
        quantity,
        orderType = "MARKET",
        limitPrice,
      } = request.body;
      const userId = request.user.userId;
      const baseCurrency = request.baseCurrency;

      // Get user's account
      const account = await fastify.prisma.account.findFirst({
        where: { userId },
      });

      if (!account) {
        return reply.code(404).send({ error: "Account not found" });
      }

      const upperSymbol = symbol.toUpperCase();

      // Get current market price + currency from a quote call (this also validates the symbol exists)
      let executionPrice;
      let quoteCurrency = "USD";
      let quote;
      try {
        quote = await getQuote(symbol);
        executionPrice = new Decimal(quote.price);
        quoteCurrency = (quote.currency || "USD").toUpperCase();
      } catch (err) {
        fastify.log.error("Failed to get market price:", err);
        return reply
          .code(502)
          .send({ error: "Failed to get market price or invalid symbol" });
      }

      // Get or create instrument
      let instrument = await fastify.prisma.instrument.findUnique({
        where: { symbol: upperSymbol },
      });

      if (!instrument) {
        // Auto-create instrument from quote data
        try {
          instrument = await fastify.prisma.instrument.create({
            data: {
              symbol: upperSymbol,
              name: quote.name || `${upperSymbol} Inc.`,
              type: "EQUITY",
              currency: quoteCurrency,
              exchange: quote.exchange || "NASDAQ",
              isActive: true,
            },
          });
          fastify.log.info(`Auto-created instrument: ${upperSymbol}`);
        } catch (dbErr) {
          // Handle race condition: another request might have just created it
          if (dbErr.code === "P2002") {
            instrument = await fastify.prisma.instrument.findUnique({
              where: { symbol: upperSymbol },
            });
            if (!instrument) {
              return reply
                .code(500)
                .send({ error: "Failed to create instrument" });
            }
          } else {
            throw dbErr;
          }
        }
      } else if (instrument.currency === "USD" && quoteCurrency !== "USD") {
        // Update instrument currency if it was unknown/incorrect
        try {
          await fastify.prisma.instrument.update({
            where: { id: instrument.id },
            data: { currency: quoteCurrency },
          });
        } catch (e) {
          /* non-critical */
        }
      }

      // For limit orders, use limit price
      if (orderType === "LIMIT") {
        if (!limitPrice) {
          return reply
            .code(400)
            .send({ error: "Limit price required for limit orders" });
        }
        const limitDecimal = new Decimal(limitPrice);
        if (side === "BUY" && limitDecimal.lt(executionPrice)) {
          const order = await fastify.prisma.order.create({
            data: {
              accountId: account.id,
              instrumentId: instrument.id,
              orderType: "LIMIT",
              side,
              quantity,
              limitPrice,
              status: "PENDING",
              currency: quoteCurrency,
              exchangeRate: 1,
            },
          });
          return {
            order,
            message: "Limit order placed, waiting for execution",
          };
        }
        executionPrice = limitDecimal;
      }

      const qty = new Decimal(quantity);
      const totalValueNative = executionPrice.mul(qty);

      // Get exchange rate: native currency -> user's base currency
      const exchangeRate = await fastify.currency.getRate(
        quoteCurrency,
        baseCurrency,
      );
      const totalValueBase = new Decimal(
        totalValueNative.toNumber() * exchangeRate,
      );
      const executionPriceBase = new Decimal(
        executionPrice.toNumber() * exchangeRate,
      );
      const cashBalance = new Decimal(account.cashBalance);

      // Risk validation (in base currency)
      const riskCheck = validateOrderRisk(
        account,
        instrument,
        side,
        qty.toNumber(),
        executionPriceBase.toNumber(),
      );
      if (!riskCheck.valid) {
        return reply.code(400).send({
          error: riskCheck.errors[0].message,
          riskErrors: riskCheck.errors,
        });
      }

      // Cash check for BUY orders (in base currency)
      if (side === "BUY") {
        if (totalValueBase.gt(cashBalance)) {
          return reply.code(400).send({
            error: "Insufficient funds",
            required: totalValueBase.toFixed(2),
            available: cashBalance.toFixed(2),
            currency: baseCurrency,
          });
        }
      }

      // For SELL orders, check if we have the position
      if (side === "SELL") {
        const position = await fastify.prisma.position.findFirst({
          where: {
            accountId: account.id,
            instrumentId: instrument.id,
            direction: "LONG",
          },
        });

        if (!position || new Decimal(position.quantity).lt(qty)) {
          return reply.code(400).send({
            error: "Insufficient shares to sell",
            available: position ? position.quantity.toString() : "0",
          });
        }
      }

      // Execute the order in a transaction
      const result = await fastify.prisma.$transaction(async (tx) => {
        // Create the order with currency metadata
        const order = await tx.order.create({
          data: {
            accountId: account.id,
            instrumentId: instrument.id,
            orderType,
            side,
            quantity,
            limitPrice: orderType === "LIMIT" ? limitPrice : null,
            status: "FILLED",
            filledQty: quantity,
            avgFillPrice: executionPrice.toNumber(),
            currency: quoteCurrency,
            exchangeRate: exchangeRate,
          },
        });

        // Create trade record with currency metadata
        const trade = await tx.trade.create({
          data: {
            orderId: order.id,
            executionPrice: executionPrice.toNumber(),
            quantity,
            currency: quoteCurrency,
            exchangeRate: exchangeRate,
          },
        });

        // Update position
        if (side === "BUY") {
          const existingPosition = await tx.position.findFirst({
            where: {
              accountId: account.id,
              instrumentId: instrument.id,
              direction: "LONG",
            },
          });

          if (existingPosition) {
            // Weighted average in native currency
            const existingQty = new Decimal(existingPosition.quantity);
            const existingValue = existingQty.mul(existingPosition.avgPrice);
            const newValue = existingValue.add(totalValueNative);
            const newQty = existingQty.add(qty);
            const newAvgPrice = newValue.div(newQty);

            // Weighted average in base currency
            const existingValueBase = existingQty.mul(
              existingPosition.avgPriceBase || existingPosition.avgPrice,
            );
            const newValueBase = existingValueBase.add(totalValueBase);
            const newAvgPriceBase = newValueBase.div(newQty);

            await tx.position.update({
              where: { id: existingPosition.id },
              data: {
                quantity: newQty.toNumber(),
                avgPrice: newAvgPrice.toNumber(),
                avgPriceBase: newAvgPriceBase.toNumber(),
                currency: quoteCurrency,
              },
            });
          } else {
            await tx.position.create({
              data: {
                accountId: account.id,
                instrumentId: instrument.id,
                quantity: qty.toNumber(),
                avgPrice: executionPrice.toNumber(),
                avgPriceBase: executionPriceBase.toNumber(),
                currency: quoteCurrency,
                direction: "LONG",
              },
            });
          }

          // Deduct cash in base currency
          await tx.account.update({
            where: { id: account.id },
            data: {
              cashBalance: cashBalance.sub(totalValueBase).toNumber(),
            },
          });
        } else {
          // SELL - reduce position and add cash
          const position = await tx.position.findFirst({
            where: {
              accountId: account.id,
              instrumentId: instrument.id,
              direction: "LONG",
            },
          });

          const newQty = new Decimal(position.quantity).sub(qty);

          if (newQty.isZero()) {
            await tx.position.delete({
              where: { id: position.id },
            });
          } else {
            await tx.position.update({
              where: { id: position.id },
              data: { quantity: newQty.toNumber() },
            });
          }

          // Add cash in base currency
          await tx.account.update({
            where: { id: account.id },
            data: {
              cashBalance: cashBalance.add(totalValueBase).toNumber(),
            },
          });
        }

        return { order, trade };
      });

      fastify.log.info({
        msg: "Trade executed",
        userId,
        symbol,
        side,
        quantity,
        price: executionPrice.toNumber(),
        currency: quoteCurrency,
        exchangeRate,
        baseCurrency,
      });

      return {
        order: result.order,
        trade: result.trade,
        executionPrice: executionPrice.toNumber(),
        totalValue: totalValueNative.toNumber(),
        currency: quoteCurrency,
        exchangeRate,
        executionPriceBase: executionPriceBase.toNumber(),
        totalValueBase: totalValueBase.toNumber(),
        baseCurrency,
      };
    },
  );

  // Get order history
  fastify.get(
    "/history",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const { limit = 50 } = request.query;

      const account = await fastify.prisma.account.findFirst({
        where: { userId },
      });

      if (!account) {
        return reply.code(404).send({ error: "Account not found" });
      }

      const orders = await fastify.prisma.order.findMany({
        where: { accountId: account.id },
        include: {
          instrument: true,
          trades: true,
        },
        orderBy: { createdAt: "desc" },
        take: Number(limit),
      });

      return orders;
    },
  );

  // Cancel a pending order
  fastify.delete(
    "/:orderId",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { orderId } = request.params;
      const userId = request.user.userId;

      const account = await fastify.prisma.account.findFirst({
        where: { userId },
      });

      const order = await fastify.prisma.order.findFirst({
        where: {
          id: orderId,
          accountId: account.id,
          status: "PENDING",
        },
      });

      if (!order) {
        return reply
          .code(404)
          .send({ error: "Order not found or already executed" });
      }

      const updatedOrder = await fastify.prisma.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
      });

      return updatedOrder;
    },
  );
}

export default register;
