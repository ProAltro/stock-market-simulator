import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";

import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";

import authRoutes from "./modules/auth/routes.js";
import dataRoutes from "./modules/data/routes.js";
import submissionsRoutes from "./modules/submissions/routes.js";
import marketRoutes from "./modules/market/routes.js";
import newsRoutes from "./modules/news/routes.js";
import { healthCheck } from "./services/judge0/judge0.js";

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

await app.register(cors, {
  origin:
    process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL || "*"
      : true,
  credentials: true,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  sign: {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
});

await app.register(prismaPlugin);
await app.register(redisPlugin);

app.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

app.get("/health", async () => {
  const judge0 = await healthCheck();
  
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database: "connected",
      judge0: judge0.healthy ? "healthy" : "unavailable",
    },
  };
});

app.register(authRoutes, { prefix: "/api/auth" });
app.register(dataRoutes, { prefix: "/api/data" });
app.register(submissionsRoutes, { prefix: "/api/submissions" });
app.register(marketRoutes, { prefix: "/api/market" });
app.register(newsRoutes, { prefix: "/api/news" });

app.setErrorHandler((error, request, reply) => {
  app.log.error(error);

  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? "Internal Server Error" : error.message;

  reply.code(statusCode).send({
    error: message,
    statusCode,
  });
});

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await app.listen({ port: Number(port), host: "0.0.0.0" });
    app.log.info(`🚀 Algorithmic Trading Competition Platform`);
    app.log.info(`📡 API running on http://localhost:${port}`);
    app.log.info(`📊 Submit algorithms at POST /api/submissions`);

    const shutdown = () => {
      app.log.info("Shutting down...");
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
