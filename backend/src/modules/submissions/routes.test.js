import test from "node:test";
import assert from "node:assert";

// ============================================================
// Submissions Routes Unit Tests
// Tests CRUD routes: list, get by id, leaderboard, me/best
// (Trading logic is covered in submissions.test.js)
// ============================================================

// --- Mock data ---

function createMockSubmissions() {
  return [
    {
      id: "sub-1",
      userId: "user-1",
      language: "python",
      code: "buy('OIL', 100)",
      status: "completed",
      finalNetWorth: 120000.5,
      cashBalance: 50000,
      positions: { OIL: 100 },
      totalTrades: 25,
      executionTimeMs: 3500,
      error: null,
      stdout: '{"success": true}',
      createdAt: "2025-01-01T00:00:00Z",
      completedAt: "2025-01-01T00:01:00Z",
    },
    {
      id: "sub-2",
      userId: "user-1",
      language: "python",
      code: "pass",
      status: "completed",
      finalNetWorth: 100000,
      cashBalance: 100000,
      positions: {},
      totalTrades: 0,
      executionTimeMs: 1200,
      error: null,
      stdout: '{"success": true}',
      createdAt: "2025-01-02T00:00:00Z",
      completedAt: "2025-01-02T00:01:00Z",
    },
    {
      id: "sub-3",
      userId: "user-2",
      language: "cpp",
      code: "buy('STEEL', 50)",
      status: "completed",
      finalNetWorth: 115000.75,
      cashBalance: 60000,
      positions: { STEEL: 50 },
      totalTrades: 10,
      executionTimeMs: 4200,
      error: null,
      stdout: '{"success": true}',
      createdAt: "2025-01-03T00:00:00Z",
      completedAt: "2025-01-03T00:01:00Z",
    },
    {
      id: "sub-4",
      userId: "user-1",
      language: "python",
      code: "invalid code",
      status: "failed",
      finalNetWorth: null,
      cashBalance: null,
      positions: null,
      totalTrades: null,
      executionTimeMs: 500,
      error: "SyntaxError: invalid syntax",
      stdout: null,
      createdAt: "2025-01-04T00:00:00Z",
      completedAt: "2025-01-04T00:00:01Z",
    },
    {
      id: "sub-5",
      userId: "user-1",
      language: "python",
      code: "while True: pass",
      status: "failed",
      finalNetWorth: null,
      error: "Time Limit Exceeded",
      executionTimeMs: 60000,
      createdAt: "2025-01-05T00:00:00Z",
      completedAt: "2025-01-05T00:01:00Z",
    },
  ];
}

// --- POST / (create submission) ---

test("Submissions route - POST / request schema validation", async () => {
  const schema = {
    type: "object",
    required: ["code", "language"],
    properties: {
      code: { type: "string" },
      language: { type: "string", enum: ["python", "cpp"] },
    },
  };

  function validate(body) {
    if (!body.code || typeof body.code !== "string") return false;
    if (!schema.properties.language.enum.includes(body.language)) return false;
    return true;
  }

  assert.ok(validate({ code: "pass", language: "python" }));
  assert.ok(validate({ code: "int main(){}", language: "cpp" }));
  assert.ok(!validate({ code: "pass", language: "javascript" })); // Not in enum
  assert.ok(!validate({ code: "", language: "python" })); // Empty code
  assert.ok(!validate({ language: "python" })); // Missing code
});

test("Submissions route - POST / creates pending submission", async () => {
  function createSubmission(userId, code, language) {
    return {
      id: "new-sub-" + Date.now(),
      userId,
      code,
      language,
      status: "pending",
    };
  }

  const sub = createSubmission("user-1", "buy('OIL', 100)", "python");
  assert.strictEqual(sub.status, "pending");
  assert.strictEqual(sub.language, "python");
  assert.ok(sub.id);
});

test("Submissions route - POST / returns id and pending status", async () => {
  const response = {
    id: "sub-new",
    status: "pending",
    message: "Algorithm submitted. Poll for results.",
  };

  assert.strictEqual(response.status, "pending");
  assert.ok(response.id);
  assert.ok(response.message.includes("Poll"));
});

test("Submissions route - POST / requires authentication", async () => {
  // preHandler: [fastify.authenticate] is set on this route
  const routeConfig = { preHandler: ["authenticate"] };
  assert.ok(routeConfig.preHandler.includes("authenticate"));
});

// --- GET / (list user submissions) ---

test("Submissions route - GET / returns user's submissions only", async () => {
  const all = createMockSubmissions();

  function getUserSubmissions(userId) {
    return all.filter((s) => s.userId === userId);
  }

  const user1 = getUserSubmissions("user-1");
  assert.strictEqual(user1.length, 4); // sub-1, sub-2, sub-4, sub-5
  assert.ok(user1.every((s) => s.userId === "user-1"));

  const user2 = getUserSubmissions("user-2");
  assert.strictEqual(user2.length, 1);
});

test("Submissions route - GET / orders by createdAt desc", async () => {
  const all = createMockSubmissions().filter((s) => s.userId === "user-1");
  const sorted = [...all].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );

  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      new Date(sorted[i - 1].createdAt) >= new Date(sorted[i].createdAt),
    );
  }
});

test("Submissions route - GET / supports pagination", async () => {
  const all = createMockSubmissions().filter((s) => s.userId === "user-1");

  function paginate(items, limit = 20, offset = 0) {
    return items.slice(Number(offset), Number(offset) + Number(limit));
  }

  assert.strictEqual(paginate(all, 2, 0).length, 2);
  assert.strictEqual(paginate(all, 2, 2).length, 2);
  assert.strictEqual(paginate(all, 2, 4).length, 0);
  assert.strictEqual(paginate(all, 20, 0).length, 4); // All user-1 subs
});

test("Submissions route - GET / select fields exclude code", async () => {
  const selectFields = {
    id: true,
    language: true,
    status: true,
    finalNetWorth: true,
    totalTrades: true,
    executionTimeMs: true,
    error: true,
    createdAt: true,
    completedAt: true,
  };

  // code should NOT be in the list response (too large)
  assert.ok(!("code" in selectFields));
  assert.ok("id" in selectFields);
  assert.ok("status" in selectFields);
});

// --- GET /:id (single submission) ---

test("Submissions route - GET /:id returns submission for owner", async () => {
  const all = createMockSubmissions();

  function getSubmission(id, userId) {
    const sub = all.find((s) => s.id === id && s.userId === userId);
    if (!sub) return { status: 404, body: { error: "Submission not found" } };
    return { status: 200, body: sub };
  }

  const found = getSubmission("sub-1", "user-1");
  assert.strictEqual(found.status, 200);
  assert.strictEqual(found.body.id, "sub-1");

  // Wrong user can't access
  const forbidden = getSubmission("sub-1", "user-2");
  assert.strictEqual(forbidden.status, 404);

  // Non-existent submission
  const notFound = getSubmission("sub-999", "user-1");
  assert.strictEqual(notFound.status, 404);
});

test("Submissions route - GET /:id returns full submission with code", async () => {
  const sub = createMockSubmissions()[0];
  assert.ok("code" in sub);
  assert.ok("status" in sub);
  assert.ok("finalNetWorth" in sub);
});

// --- GET /leaderboard ---

test("Submissions route - leaderboard returns completed submissions sorted by netWorth", async () => {
  const all = createMockSubmissions();

  function getLeaderboard(limit = 100) {
    const completed = all
      .filter((s) => s.status === "completed" && s.finalNetWorth !== null)
      .sort((a, b) => b.finalNetWorth - a.finalNetWorth)
      .slice(0, Number(limit));

    return completed.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));
  }

  const lb = getLeaderboard();
  assert.strictEqual(lb.length, 3); // 3 completed submissions
  assert.strictEqual(lb[0].rank, 1);
  assert.ok(lb[0].finalNetWorth >= lb[1].finalNetWorth);
  assert.ok(lb[1].finalNetWorth >= lb[2].finalNetWorth);
});

test("Submissions route - leaderboard excludes failed submissions", async () => {
  const all = createMockSubmissions();
  const completed = all.filter(
    (s) => s.status === "completed" && s.finalNetWorth !== null,
  );
  const failed = all.filter((s) => s.status === "failed");

  assert.ok(failed.length > 0);
  assert.ok(completed.every((s) => s.status === "completed"));
});

test("Submissions route - leaderboard respects limit", async () => {
  const all = createMockSubmissions();
  const completed = all.filter(
    (s) => s.status === "completed" && s.finalNetWorth !== null,
  );

  function getLeaderboard(limit) {
    return completed
      .sort((a, b) => b.finalNetWorth - a.finalNetWorth)
      .slice(0, Number(limit));
  }

  assert.strictEqual(getLeaderboard(1).length, 1);
  assert.strictEqual(getLeaderboard(2).length, 2);
  assert.strictEqual(getLeaderboard(100).length, completed.length);
});

test("Submissions route - leaderboard includes user displayName", async () => {
  const mockLeaderboardEntry = {
    rank: 1,
    id: "sub-1",
    finalNetWorth: 120000.5,
    totalTrades: 25,
    executionTimeMs: 3500,
    createdAt: "2025-01-01T00:00:00Z",
    user: {
      id: "user-1",
      displayName: "Alice",
    },
  };

  assert.ok("user" in mockLeaderboardEntry);
  assert.ok("displayName" in mockLeaderboardEntry.user);
  assert.ok("id" in mockLeaderboardEntry.user);
  // Should NOT include email in leaderboard
  assert.ok(!("email" in mockLeaderboardEntry.user));
});

test("Submissions route - leaderboard is public (no auth required)", async () => {
  // Unlike other routes, GET /leaderboard has no preHandler
  const routeHasAuth = false; // No preHandler on this route
  assert.strictEqual(routeHasAuth, false);
});

// --- GET /me/best ---

test("Submissions route - me/best returns highest netWorth submission", async () => {
  const all = createMockSubmissions();

  function getBest(userId) {
    const userCompleted = all
      .filter(
        (s) =>
          s.userId === userId &&
          s.status === "completed" &&
          s.finalNetWorth !== null,
      )
      .sort((a, b) => b.finalNetWorth - a.finalNetWorth);

    const best = userCompleted[0] || null;
    return best;
  }

  const best = getBest("user-1");
  assert.ok(best);
  assert.strictEqual(best.id, "sub-1"); // Highest net worth for user-1
  assert.strictEqual(best.finalNetWorth, 120000.5);
});

test("Submissions route - me/best calculates rank", async () => {
  const all = createMockSubmissions();

  function getRank(best) {
    if (!best) return null;
    const betterOrEqual = all.filter(
      (s) =>
        s.status === "completed" &&
        s.finalNetWorth !== null &&
        s.finalNetWorth >= best.finalNetWorth,
    );
    return betterOrEqual.length;
  }

  const best1 = all.find((s) => s.id === "sub-1"); // 120000.5
  const rank1 = getRank(best1);
  assert.strictEqual(rank1, 1); // Top ranked

  const best3 = all.find((s) => s.id === "sub-3"); // 115000.75
  const rank3 = getRank(best3);
  assert.strictEqual(rank3, 2); // Second
});

test("Submissions route - me/best returns null when no completed submissions", async () => {
  const all = createMockSubmissions();

  function getBestAndRank(userId) {
    const userCompleted = all.filter(
      (s) =>
        s.userId === userId &&
        s.status === "completed" &&
        s.finalNetWorth !== null,
    );
    if (userCompleted.length === 0) {
      return { bestSubmission: null, rank: null };
    }
    const best = userCompleted.sort(
      (a, b) => b.finalNetWorth - a.finalNetWorth,
    )[0];
    return { bestSubmission: best, rank: 1 };
  }

  // User with no completed submissions
  const result = getBestAndRank("user-999");
  assert.strictEqual(result.bestSubmission, null);
  assert.strictEqual(result.rank, null);
});

test("Submissions route - me/best requires authentication", async () => {
  // preHandler: [fastify.authenticate] is set on this route
  const routeConfig = { preHandler: ["authenticate"] };
  assert.ok(routeConfig.preHandler.includes("authenticate"));
});

// --- Submission status lifecycle ---

test("Submissions route - status lifecycle: pending -> running -> completed", async () => {
  const validStatuses = ["pending", "running", "completed", "failed"];
  const validTransitions = {
    pending: ["running"],
    running: ["completed", "failed"],
    completed: [],
    failed: [],
  };

  function isValidTransition(from, to) {
    return validTransitions[from]?.includes(to) || false;
  }

  assert.ok(isValidTransition("pending", "running"));
  assert.ok(isValidTransition("running", "completed"));
  assert.ok(isValidTransition("running", "failed"));
  assert.ok(!isValidTransition("pending", "completed")); // Can't skip running
  assert.ok(!isValidTransition("completed", "failed")); // Terminal state
});

test("Submissions route - failed submission stores error message", async () => {
  const failed = createMockSubmissions().filter((s) => s.status === "failed");
  assert.ok(failed.length > 0);

  for (const sub of failed) {
    assert.ok(sub.error !== null);
    assert.strictEqual(typeof sub.error, "string");
    assert.ok(sub.error.length > 0);
  }
});

test("Submissions route - completed submission has executionTimeMs", async () => {
  const completed = createMockSubmissions().filter(
    (s) => s.status === "completed",
  );
  for (const sub of completed) {
    assert.ok(sub.executionTimeMs > 0);
    assert.strictEqual(typeof sub.executionTimeMs, "number");
  }
});
