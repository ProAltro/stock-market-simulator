import { searchSymbols } from '../../services/market/yahooAdapter.js';

export async function register(fastify, opts) {
  // Search instruments - combines DB + Yahoo Finance API
  fastify.get('/search', async (request, reply) => {
    const { q, exchange } = request.query;
    
    if (!q || q.length < 1) {
      return [];
    }
    
    // Search in database first
    const dbWhere = {
      isActive: true,
      OR: [
        { symbol: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } }
      ]
    };
    
    const dbResults = await fastify.prisma.instrument.findMany({
      where: dbWhere,
      orderBy: { symbol: 'asc' },
      take: 10
    });
    
    // Transform DB results
    const dbInstruments = dbResults.map(i => ({
      symbol: i.symbol,
      name: i.name,
      exchange: i.exchange || 'Unknown',
      type: i.type,
      inDb: true
    }));
    
    // Search via Yahoo Finance API
    let apiResults = [];
    try {
      apiResults = await searchSymbols(q, exchange || null);
      // Mark API results and filter out duplicates
      apiResults = apiResults
        .filter(r => !dbInstruments.some(d => d.symbol === r.symbol))
        .map(r => ({ ...r, inDb: false }));
    } catch (err) {
      console.error('Yahoo search error:', err);
    }
    
    // Combine results: DB first, then API
    const combined = [...dbInstruments, ...apiResults].slice(0, 20);
    
    return combined;
  });

  // Get all active instruments
  fastify.get('/', async (request, reply) => {
    const { type, search } = request.query;
    
    const where = { isActive: true };
    
    if (type) {
      where.type = type;
    }
    
    if (search) {
      where.OR = [
        { symbol: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } }
      ];
    }

    const instruments = await fastify.prisma.instrument.findMany({
      where,
      orderBy: { symbol: 'asc' }
    });

    return instruments;
  });

  // Get instrument by symbol
  fastify.get('/:symbol', async (request, reply) => {
    const { symbol } = request.params;

    const instrument = await fastify.prisma.instrument.findUnique({
      where: { symbol: symbol.toUpperCase() }
    });

    if (!instrument) {
      return reply.code(404).send({ error: 'Instrument not found' });
    }

    return instrument;
  });
}

export default register;
