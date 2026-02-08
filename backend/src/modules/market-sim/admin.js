/**
 * Market Simulation Admin Routes
 * Protected by a simple password ("manipulation")
 * Provides: delete all sim data, repopulate, inject news, view status
 */
import {
  deleteAllSimData,
  triggerPopulate,
  syncInstruments,
  startSync,
  stopSync,
  getPopulateStatus,
} from "../../services/market/simSyncService.js";

const ADMIN_PASSWORD = process.env.SIM_ADMIN_PASSWORD || "manipulation";
const SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";

function checkPassword(request, reply) {
  const password =
    request.headers["x-admin-password"] ||
    request.body?.password ||
    request.query?.password;

  if (password !== ADMIN_PASSWORD) {
    reply.code(401).send({ error: "Invalid admin password" });
    return false;
  }
  return true;
}

export default async function marketSimAdminRoutes(fastify) {
  // POST /authenticate - verify password
  fastify.post("/authenticate", async (request, reply) => {
    const { password } = request.body || {};
    if (password !== ADMIN_PASSWORD) {
      return reply.code(401).send({ error: "Invalid password" });
    }
    return { status: "ok", authenticated: true };
  });

  // GET /status - Sim state + backend sync status
  fastify.get("/status", async () => {
    try {
      const res = await fetch(`${SIM_URL}/state`);
      const simState = await res.json();
      const backendStatus = getPopulateStatus();
      
      // Merge C++ state with backend sync status
      return {
        ...simState,
        backendPhase: backendStatus.phase,
        backendMessage: backendStatus.message,
        backendError: backendStatus.error,
      };
    } catch (err) {
      return { error: "C++ engine unreachable", message: err.message };
    }
  });

  // POST /delete - Delete all sim data from DB
  fastify.post("/delete", async (request, reply) => {
    if (!checkPassword(request, reply)) return;

    await deleteAllSimData(fastify.prisma);
    return { status: "ok", message: "All simulation data deleted" };
  });

  // POST /populate - Delete data, reset C++ sim, populate history
  fastify.post("/populate", async (request, reply) => {
    if (!checkPassword(request, reply)) return;

    const defaultStart = new Date();
    defaultStart.setMonth(defaultStart.getMonth() - 6);
    const defaultStartDate = defaultStart.toISOString().split("T")[0];
    const { days = 180, startDate = defaultStartDate } = request.body || {};

    try {
      // 1. Delete existing data
      await deleteAllSimData(fastify.prisma);

      // 2. Reset C++ engine
      await fetch(`${SIM_URL}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });

      // 3. Re-sync instruments
      await syncInstruments(fastify.prisma);

      // 4. Populate history
      const result = await triggerPopulate(fastify.prisma, days, startDate);

      return {
        status: "ok",
        message: `Populated ${days} days of history`,
        ...result,
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });

  // POST /control - Proxy sim control (start/stop/pause/resume)
  fastify.post("/control", async (request, reply) => {
    if (!checkPassword(request, reply)) return;

    const { action, count } = request.body || {};

    // Handle DB sync start/stop separately from C++ engine control
    if (action === "start-sync") {
      startSync(fastify.prisma);
      return { status: "ok", message: "Database sync started" };
    }
    if (action === "stop-sync") {
      stopSync();
      return { status: "ok", message: "Database sync stopped" };
    }

    try {
      const res = await fetch(`${SIM_URL}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, count }),
      });
      const data = await res.json();
      const messages = {
        start: "Simulation started",
        stop: "Simulation stopped",
        pause: "Simulation paused",
        resume: "Simulation resumed",
        reset: "Simulation reset",
        step: `Stepped ${count || 1} tick(s)`,
      };
      return {
        status: "ok",
        message: messages[action] || `Action '${action}' executed`,
        state: data,
      };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // POST /news - Inject news via C++ engine (with optional AI headline generation)
  fastify.post("/news", async (request, reply) => {
    if (!checkPassword(request, reply)) return;

    const { category, sentiment, magnitude, headline, target, symbol, useAi } =
      request.body || {};

    try {
      let finalHeadline = headline;
      
      // If no headline provided and useAi is true, generate one with Pollinations AI
      if (!headline && useAi) {
        try {
          const { generateHeadline } = await import("../../services/ai/pollinationsService.js");
          finalHeadline = await generateHeadline(
            (category || "GLOBAL").toUpperCase(),
            sentiment || "neutral",
            target || symbol || "",
            ""  // no fallback, let C++ generate if AI fails
          );
        } catch (aiErr) {
          console.warn("[Admin] AI headline generation failed:", aiErr.message);
          // C++ will generate a template headline if empty
        }
      }
      
      const res = await fetch(`${SIM_URL}/news`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: (category || "global").toLowerCase(),
          sentiment,
          magnitude,
          headline: finalHeadline || "",
          target: target || symbol || "",
        }),
      });
      return res.json();
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // POST /config - Update sim config
  fastify.post("/config", async (request, reply) => {
    if (!checkPassword(request, reply)) return;

    try {
      const res = await fetch(`${SIM_URL}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
      return res.json();
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // GET /instruments - List sim instruments from DB
  fastify.get("/instruments", async () => {
    return fastify.prisma.simInstrument.findMany({
      orderBy: { symbol: "asc" },
    });
  });

  // GET /stats - DB row counts
  fastify.get("/stats", async () => {
    const [candles, news, instruments, states] = await Promise.all([
      fastify.prisma.simCandle.count(),
      fastify.prisma.simNews.count(),
      fastify.prisma.simInstrument.count(),
      fastify.prisma.simState.count(),
    ]);
    return { candles, news, instruments, states };
  });
}
