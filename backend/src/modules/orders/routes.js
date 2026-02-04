import Decimal from 'decimal.js';
import { getQuote } from '../../services/market/index.js';

export async function register(fastify, opts) {
  // Place a new order
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['symbol', 'side', 'quantity'],
        properties: {
          symbol: { type: 'string' },
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          quantity: { type: 'number', minimum: 0.0001 },
          orderType: { type: 'string', enum: ['MARKET', 'LIMIT'], default: 'MARKET' },
          limitPrice: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const { symbol, side, quantity, orderType = 'MARKET', limitPrice } = request.body;
    const userId = request.user.userId;

    // Get user's account
    const account = await fastify.prisma.account.findFirst({
      where: { userId }
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    // Get instrument
    const instrument = await fastify.prisma.instrument.findUnique({
      where: { symbol: symbol.toUpperCase() }
    });

    if (!instrument) {
      return reply.code(404).send({ error: 'Instrument not found' });
    }

    // Get current market price from service layer
    let executionPrice;
    try {
      const quote = await getQuote(symbol);
      executionPrice = new Decimal(quote.price);
    } catch (err) {
      fastify.log.error('Failed to get market price:', err);
      return reply.code(502).send({ error: 'Failed to get market price' });
    }

    // For limit orders, use limit price
    if (orderType === 'LIMIT') {
      if (!limitPrice) {
        return reply.code(400).send({ error: 'Limit price required for limit orders' });
      }
      // For simplicity in hackathon, we'll execute immediately if limit is favorable
      const limitDecimal = new Decimal(limitPrice);
      if (side === 'BUY' && limitDecimal.lt(executionPrice)) {
        // Create pending order (would need a separate order matching engine)
        const order = await fastify.prisma.order.create({
          data: {
            accountId: account.id,
            instrumentId: instrument.id,
            orderType: 'LIMIT',
            side,
            quantity,
            limitPrice,
            status: 'PENDING'
          }
        });
        return { order, message: 'Limit order placed, waiting for execution' };
      }
      executionPrice = limitDecimal;
    }

    const qty = new Decimal(quantity);
    const totalValue = executionPrice.mul(qty);
    const cashBalance = new Decimal(account.cashBalance);

    // Risk check for BUY orders
    if (side === 'BUY') {
      if (totalValue.gt(cashBalance)) {
        return reply.code(400).send({ 
          error: 'Insufficient funds',
          required: totalValue.toFixed(2),
          available: cashBalance.toFixed(2)
        });
      }
    }

    // For SELL orders, check if we have the position
    if (side === 'SELL') {
      const position = await fastify.prisma.position.findFirst({
        where: {
          accountId: account.id,
          instrumentId: instrument.id,
          direction: 'LONG'
        }
      });

      if (!position || new Decimal(position.quantity).lt(qty)) {
        return reply.code(400).send({ 
          error: 'Insufficient shares to sell',
          available: position ? position.quantity.toString() : '0'
        });
      }
    }

    // Execute the order in a transaction
    const result = await fastify.prisma.$transaction(async (tx) => {
      // Create the order
      const order = await tx.order.create({
        data: {
          accountId: account.id,
          instrumentId: instrument.id,
          orderType,
          side,
          quantity,
          limitPrice: orderType === 'LIMIT' ? limitPrice : null,
          status: 'FILLED',
          filledQty: quantity,
          avgFillPrice: executionPrice.toNumber()
        }
      });

      // Create trade record
      const trade = await tx.trade.create({
        data: {
          orderId: order.id,
          executionPrice: executionPrice.toNumber(),
          quantity
        }
      });

      // Update position
      if (side === 'BUY') {
        // Check for existing position
        const existingPosition = await tx.position.findFirst({
          where: {
            accountId: account.id,
            instrumentId: instrument.id,
            direction: 'LONG'
          }
        });

        if (existingPosition) {
          // Update existing position with new average price
          const existingQty = new Decimal(existingPosition.quantity);
          const existingValue = existingQty.mul(existingPosition.avgPrice);
          const newValue = existingValue.add(totalValue);
          const newQty = existingQty.add(qty);
          const newAvgPrice = newValue.div(newQty);

          await tx.position.update({
            where: { id: existingPosition.id },
            data: {
              quantity: newQty.toNumber(),
              avgPrice: newAvgPrice.toNumber()
            }
          });
        } else {
          // Create new position
          await tx.position.create({
            data: {
              accountId: account.id,
              instrumentId: instrument.id,
              quantity: qty.toNumber(),
              avgPrice: executionPrice.toNumber(),
              direction: 'LONG'
            }
          });
        }

        // Deduct cash
        await tx.account.update({
          where: { id: account.id },
          data: {
            cashBalance: cashBalance.sub(totalValue).toNumber()
          }
        });
      } else {
        // SELL - reduce position and add cash
        const position = await tx.position.findFirst({
          where: {
            accountId: account.id,
            instrumentId: instrument.id,
            direction: 'LONG'
          }
        });

        const newQty = new Decimal(position.quantity).sub(qty);

        if (newQty.isZero()) {
          await tx.position.delete({
            where: { id: position.id }
          });
        } else {
          await tx.position.update({
            where: { id: position.id },
            data: { quantity: newQty.toNumber() }
          });
        }

        // Add cash
        await tx.account.update({
          where: { id: account.id },
          data: {
            cashBalance: cashBalance.add(totalValue).toNumber()
          }
        });
      }

      return { order, trade };
    });

    fastify.log.info({
      msg: 'Trade executed',
      userId,
      symbol,
      side,
      quantity,
      price: executionPrice.toNumber()
    });

    return {
      order: result.order,
      trade: result.trade,
      executionPrice: executionPrice.toNumber(),
      totalValue: totalValue.toNumber()
    };
  });

  // Get order history
  fastify.get('/history', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.userId;
    const { limit = 50 } = request.query;

    const account = await fastify.prisma.account.findFirst({
      where: { userId }
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    const orders = await fastify.prisma.order.findMany({
      where: { accountId: account.id },
      include: {
        instrument: true,
        trades: true
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit)
    });

    return orders;
  });

  // Cancel a pending order
  fastify.delete('/:orderId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { orderId } = request.params;
    const userId = request.user.userId;

    const account = await fastify.prisma.account.findFirst({
      where: { userId }
    });

    const order = await fastify.prisma.order.findFirst({
      where: {
        id: orderId,
        accountId: account.id,
        status: 'PENDING'
      }
    });

    if (!order) {
      return reply.code(404).send({ error: 'Order not found or already executed' });
    }

    const updatedOrder = await fastify.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' }
    });

    return updatedOrder;
  });
}

export default register;
