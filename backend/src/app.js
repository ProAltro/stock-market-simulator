import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";

// Import plugins
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import currencyPlugin from "./plugins/currency.js";

// Import routes
import authRoutes from "./modules/auth/routes.js";
import instrumentRoutes from "./modules/instruments/routes.js";
import marketDataRoutes from "./modules/market-data/routes.js";
import orderRoutes from "./modules/orders/routes.js";
import portfolioRoutes from "./modules/portfolio/routes.js";
import leaderboardRoutes from "./modules/leaderboard/routes.js";
import profileRoutes from "./modules/profile/routes.js";
import backtestRoutes from "./modules/backtest/routes.js";
import marketSimRoutes from "./modules/market-sim/routes.js";
import marketSimAdminRoutes from "./modules/market-sim/admin.js";
import { startSync, stopSync } from "./services/market/simSyncService.js";
import { initMarketSim } from "./services/market/simInitService.js";
const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport:
      process.env.NODE_ENV !== "production"
        ? {
            target: "pino-pretty",
            options: { colorize: true },
          }
        : undefined,
  },
});

// Register CORS
await app.register(cors, {
  origin:
    process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL || "*"
      : true,
  credentials: true,
});

// Register rate limiting
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  allowList: (req) => req.url.startsWith("/api/market-sim"),
});

// Register JWT
await app.register(jwt, {
  secret: process.env.JWT_SECRET || "dev-secret",
  sign: {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
});

// Register database and cache plugins
await app.register(prismaPlugin);
await app.register(redisPlugin);
await app.register(currencyPlugin);

// Authentication decorator
app.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

// Base currency decorator - attaches user's preferred currency to request
// Must run after authenticate. Routes opt-in via preHandler: [fastify.authenticate, fastify.withBaseCurrency]
app.decorate("withBaseCurrency", async function (request, reply) {
  try {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { currency: true },
    });
    request.baseCurrency = (user?.currency || "USD").toUpperCase();
  } catch (err) {
    request.baseCurrency = "USD";
  }
});

// Health check
app.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));

// Register routes
app.register(authRoutes, { prefix: "/api/auth" });
app.register(instrumentRoutes, { prefix: "/api/instruments" });
app.register(marketDataRoutes, { prefix: "/api/market" });
app.register(orderRoutes, { prefix: "/api/orders" });
app.register(portfolioRoutes, { prefix: "/api/portfolio" });
app.register(leaderboardRoutes, { prefix: "/api/leaderboard" });
app.register(profileRoutes, { prefix: "/api/profile" });
app.register(backtestRoutes, { prefix: "/api/backtest" });
app.register(marketSimRoutes, { prefix: "/api/market-sim" });
app.register(marketSimAdminRoutes, { prefix: "/api/market-sim/admin" });

// Global error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);

  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? "Internal Server Error" : error.message;

  reply.code(statusCode).send({
    error: message,
    statusCode,
  });
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await app.listen({ port: Number(port), host: "0.0.0.0" });
    app.log.info(`🚀 Server running on http://localhost:${port}`);

    // Initialize market sim (push tuned config, populate if needed), then start sync
    initMarketSim().then(() => {
      startSync(app.prisma);
    });

    // Graceful shutdown
    const shutdown = () => {
      stopSync();
      app.close();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
