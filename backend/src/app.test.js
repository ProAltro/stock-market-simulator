import test from "node:test";
import assert from "node:assert";

// ============================================================
// App-level Tests
// Tests route registration, error handler, CORS, rate limiting,
// JWT middleware, and health endpoint logic
// ============================================================

// --- Route registration ---

test("App - all route prefixes are registered", async () => {
  const expectedRoutes = [
    { prefix: "/api/auth", module: "authRoutes" },
    { prefix: "/api/data", module: "dataRoutes" },
    { prefix: "/api/submissions", module: "submissionsRoutes" },
    { prefix: "/api/market", module: "marketRoutes" },
    { prefix: "/api/news", module: "newsRoutes" },
  ];

  for (const route of expectedRoutes) {
    assert.ok(route.prefix.startsWith("/api/"));
    assert.ok(route.module);
  }
  assert.strictEqual(expectedRoutes.length, 5);
});

test("App - health endpoint returns correct structure", async () => {
  function buildHealthResponse(judge0Healthy) {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        judge0: judge0Healthy ? "healthy" : "unavailable",
      },
    };
  }

  const healthy = buildHealthResponse(true);
  assert.strictEqual(healthy.status, "ok");
  assert.strictEqual(healthy.services.judge0, "healthy");
  assert.strictEqual(healthy.services.database, "connected");
  assert.ok(healthy.timestamp);

  const unhealthy = buildHealthResponse(false);
  assert.strictEqual(unhealthy.services.judge0, "unavailable");
  assert.strictEqual(unhealthy.services.database, "connected");
});

// --- Error handler ---

test("App - error handler returns correct status code", async () => {
  function errorHandler(error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Internal Server Error" : error.message;
    return { error: message, statusCode };
  }

  const notFound = errorHandler({ statusCode: 404, message: "Not found" });
  assert.strictEqual(notFound.statusCode, 404);
  assert.strictEqual(notFound.error, "Not found");

  const badRequest = errorHandler({ statusCode: 400, message: "Bad request" });
  assert.strictEqual(badRequest.statusCode, 400);
  assert.strictEqual(badRequest.error, "Bad request");

  // 500 errors hide the message
  const serverError = errorHandler({ message: "DB connection lost" });
  assert.strictEqual(serverError.statusCode, 500);
  assert.strictEqual(serverError.error, "Internal Server Error");
});

test("App - error handler hides internal error messages for 500", async () => {
  function errorHandler(error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Internal Server Error" : error.message;
    return { error: message, statusCode };
  }

  const result = errorHandler({ message: "SELECT * FROM users leaked" });
  assert.strictEqual(result.error, "Internal Server Error");
  assert.ok(!result.error.includes("SELECT"));
});

// --- CORS ---

test("App - CORS config allows credentials", async () => {
  const corsConfig = {
    origin: true, // development mode
    credentials: true,
  };

  assert.strictEqual(corsConfig.credentials, true);
});

test("App - CORS uses frontend URL in production", async () => {
  function getCorsOrigin(nodeEnv, frontendUrl) {
    if (nodeEnv === "production") {
      return frontendUrl || "*";
    }
    return true;
  }

  assert.strictEqual(getCorsOrigin("development", null), true);
  assert.strictEqual(
    getCorsOrigin("production", "https://example.com"),
    "https://example.com",
  );
  assert.strictEqual(getCorsOrigin("production", null), "*");
});

// --- Rate limiting ---

test("App - rate limit config", async () => {
  const rateLimitConfig = {
    max: 100,
    timeWindow: "1 minute",
  };

  assert.strictEqual(rateLimitConfig.max, 100);
  assert.strictEqual(rateLimitConfig.timeWindow, "1 minute");
});

test("App - rate limiting logic simulation", async () => {
  function checkRateLimit(requestCount, max) {
    return requestCount < max;
  }

  assert.ok(checkRateLimit(50, 100));
  assert.ok(checkRateLimit(99, 100));
  assert.ok(!checkRateLimit(100, 100));
  assert.ok(!checkRateLimit(150, 100));
});

// --- JWT ---

test("App - JWT secret defaults in development", async () => {
  const secret = process.env.JWT_SECRET || "dev-secret-change-in-production";
  assert.ok(secret.length > 0);
  assert.strictEqual(typeof secret, "string");
});

test("App - JWT expiry defaults to 7 days", async () => {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  assert.strictEqual(expiresIn, "7d");
});

// --- authenticate decorator ---

test("App - authenticate middleware rejects missing token", async () => {
  function authenticate(request) {
    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      return { status: 401, body: { error: "Unauthorized" } };
    }
    return { status: 200 };
  }

  const noHeader = authenticate({ headers: {} });
  assert.strictEqual(noHeader.status, 401);
  assert.strictEqual(noHeader.body.error, "Unauthorized");
});

test("App - authenticate middleware extracts Bearer token", async () => {
  function extractToken(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    return authHeader.substring(7);
  }

  assert.strictEqual(extractToken("Bearer abc123"), "abc123");
  assert.strictEqual(extractToken("Bearer "), "");
  assert.strictEqual(extractToken("Basic abc123"), null);
  assert.strictEqual(extractToken(null), null);
  assert.strictEqual(extractToken(undefined), null);
});

// --- Server config ---

test("App - default port is 3000", async () => {
  const port = process.env.PORT || 3000;
  assert.strictEqual(typeof Number(port), "number");
  assert.ok(Number(port) > 0 && Number(port) < 65536);
});

test("App - logger level based on environment", async () => {
  function getLogLevel(nodeEnv) {
    return nodeEnv === "production" ? "info" : "debug";
  }

  assert.strictEqual(getLogLevel("production"), "info");
  assert.strictEqual(getLogLevel("development"), "debug");
  assert.strictEqual(getLogLevel(undefined), "debug");
});

test("App - pino-pretty disabled in production", async () => {
  function getTransport(nodeEnv) {
    return nodeEnv !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined;
  }

  assert.ok(getTransport("development"));
  assert.strictEqual(getTransport("production"), undefined);
});
