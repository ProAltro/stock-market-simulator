import axios from "axios";

const MARKET_SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";

export async function register(fastify, opts) {
  fastify.get("/", async (request, reply) => {
    const { limit = 100, since } = request.query;

    try {
      const response = await axios.get(`${MARKET_SIM_URL}/news/history`, {
        params: { limit },
        timeout: 5000,
      });

      return response.data;
    } catch (error) {
      return [];
    }
  });

  fastify.get("/:tick", async (request, reply) => {
    const { tick } = request.params;

    try {
      const response = await axios.get(`${MARKET_SIM_URL}/news/history`, {
        params: { limit: 1000 },
        timeout: 5000,
      });

      const tickNum = parseInt(tick, 10);
      const filtered = response.data.filter(
        (n) => n.tick === tickNum || n.timestamp === tickNum
      );

      return filtered;
    } catch (error) {
      return [];
    }
  });
}

export default register;
