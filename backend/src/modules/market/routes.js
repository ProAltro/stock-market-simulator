import axios from "axios";

const MARKET_SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";

export async function register(fastify, opts) {
  fastify.get("/status", async (request, reply) => {
    try {
      const response = await axios.get(`${MARKET_SIM_URL}/commodities`, {
        timeout: 5000,
      });

      const commodities = response.data;

      return {
        timestamp: new Date().toISOString(),
        commodities: commodities.map((c) => ({
          symbol: c.symbol,
          name: c.name,
          price: c.price,
          change: c.change || 0,
          volume: c.volume || 0,
          supplyImbalance: c.supplyImbalance || 0,
        })),
      };
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        commodities: [],
        error: "Market simulator not available",
        hint: "Start the C++ market simulator on port 8080",
      };
    }
  });

  fastify.get("/orderbook/:symbol", async (request, reply) => {
    const { symbol } = request.params;

    try {
      const response = await axios.get(`${MARKET_SIM_URL}/orderbook/${symbol}`, {
        timeout: 5000,
      });

      const data = response.data;

      return {
        symbol: data.symbol,
        bestBid: data.bestBid,
        bestAsk: data.bestAsk,
        spread: data.spread,
        midPrice: data.midPrice,
        bids: data.bids?.map((b) => ({
          price: b.price,
          quantity: b.quantity,
        })),
        asks: data.asks?.map((a) => ({
          price: a.price,
          quantity: a.quantity,
        })),
      };
    } catch (error) {
      return reply.code(503).send({
        error: "Market simulator not available",
      });
    }
  });

  fastify.get("/candles/:symbol", async (request, reply) => {
    const { symbol } = request.params;
    const { interval = "1m", limit = 500 } = request.query;

    try {
      const response = await axios.get(
        `${MARKET_SIM_URL}/candles/${symbol}`,
        {
          params: { interval, limit },
          timeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      return reply.code(503).send({
        error: "Market simulator not available",
      });
    }
  });
}

export default register;
