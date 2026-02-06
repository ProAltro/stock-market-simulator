/**
 * Backtest API Routes
 * Endpoints for running backtests and managing submissions
 */

import { runBacktest, getStrategyTemplates } from '../../services/backtest/backtestRunner.js';
import { getSystemInfo, getLanguages } from '../../services/judge0/judge0.js';

export async function register(fastify, opts) {
  // Submit a backtest
  fastify.post('/submit', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['symbols', 'code'],
        properties: {
          symbols: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
          timeframe: { type: 'string', enum: ['1d', '5d', '1w', '1mo', '3mo', '6mo', '1y', '2y', '5y'], default: '3mo' },
          interval: { type: 'string', enum: ['5m', '15m', '30m', '1h', '1d', '1wk'], default: '1d' },
          code: { type: 'string', minLength: 1, maxLength: 50000 },
        },
      },
    },
  }, async (request, reply) => {
    const { symbols, timeframe, interval, code } = request.body;
    console.log('Backtest Request User:', request.user);
    const userId = request.user.userId || request.user.id;
    
    if (!userId) {
        console.error('Missing userId in token payload:', request.user);
        return reply.code(401).send({ error: "Invalid token: missing userId" });
    }

    try {
      // Run the backtest
      const result = await runBacktest({ symbols, timeframe, interval, code });

      // Store submission in database
      const submission = await fastify.prisma.backtestSubmission.create({
        data: {
          userId,
          symbols: symbols.join(','),
          timeframe,
          interval,
          code,
          status: result.success ? 'completed' : 'failed',
          result: result,
        },
      });

      return {
        submissionId: submission.id,
        ...result,
      };
    } catch (error) {
      fastify.log.error('Backtest error:', error);
      return reply.code(500).send({
        success: false,
        error: error.message || 'Backtest execution failed',
      });
    }
  });

  // Get user's backtest history
  fastify.get('/history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.userId;
    const { limit = 20, offset = 0 } = request.query;

    const submissions = await fastify.prisma.backtestSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      select: {
        id: true,
        symbols: true,
        timeframe: true,
        interval: true,
        status: true,
        result: true,
        createdAt: true,
      },
    });

    const total = await fastify.prisma.backtestSubmission.count({
      where: { userId },
    });

    return { submissions, total };
  });

  // Get a specific backtest submission
  fastify.get('/submission/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.userId;

    const submission = await fastify.prisma.backtestSubmission.findFirst({
      where: { id, userId },
    });

    if (!submission) {
      return reply.code(404).send({ error: 'Submission not found' });
    }

    return submission;
  });

  // Get strategy templates
  fastify.get('/templates', async (request, reply) => {
    return getStrategyTemplates();
  });

  // Get supported intervals and timeframes
  fastify.get('/options', async (request, reply) => {
    return {
      timeframes: [
        { value: '1d', label: '1 Day', description: 'Intraday analysis' },
        { value: '5d', label: '5 Days', description: 'Short-term swing' },
        { value: '1mo', label: '1 Month', description: 'Medium-term' },
        { value: '3mo', label: '3 Months', description: 'Position trading' },
        { value: '6mo', label: '6 Months', description: 'Longer positions' },
        { value: '1y', label: '1 Year', description: 'Long-term trends' },
        { value: '2y', label: '2 Years', description: 'Multi-year analysis' },
        { value: '5y', label: '5 Years', description: 'Historical studies' },
      ],
      intervals: [
        { value: '5m', label: '5 Minutes', availableFor: ['1d'] },
        { value: '15m', label: '15 Minutes', availableFor: ['1d', '5d'] },
        { value: '30m', label: '30 Minutes', availableFor: ['1d', '5d'] },
        { value: '1h', label: '1 Hour', availableFor: ['1d', '5d', '1mo'] },
        { value: '1d', label: '1 Day', availableFor: ['1mo', '3mo', '6mo', '1y', '2y', '5y'] },
        { value: '1wk', label: '1 Week', availableFor: ['1y', '2y', '5y'] },
      ],
      popularSymbols: {
        stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'],
        indices: ['^SPX', '^DJI', '^IXIC', '^VIX'],
        forex: ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X'],
        crypto: ['BTC-USD', 'ETH-USD'],
        commodities: ['GC=F', 'CL=F', 'SI=F'],
        sectors: ['XLK', 'XLF', 'XLE', 'XLV', 'XLI'],
      },
    };
  });

  // Health check for Judge0 connectivity
  fastify.get('/health', async (request, reply) => {
    try {
      const info = await getSystemInfo();
      return {
        status: 'healthy',
        judge0: info,
      };
    } catch (error) {
      return reply.code(503).send({
        status: 'unhealthy',
        error: 'Judge0 not available',
      });
    }
  });
}

export default register;
