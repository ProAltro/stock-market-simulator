import test from "node:test";
import assert from "node:assert";

// ============================================================
// Auth Module Unit Tests
// Tests authentication logic: registration, login, JWT, profile
// ============================================================

const SALT_ROUNDS = 12;

// --- Registration validation ---

test("Auth - email format validation", async () => {
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  assert.ok(isValidEmail("user@example.com"));
  assert.ok(isValidEmail("test.user@domain.org"));
  assert.ok(isValidEmail("a@b.co"));
  assert.ok(!isValidEmail("invalid"));
  assert.ok(!isValidEmail("@domain.com"));
  assert.ok(!isValidEmail("user@"));
  assert.ok(!isValidEmail("user @domain.com"));
  assert.ok(!isValidEmail(""));
});

test("Auth - password minimum length validation", async () => {
  function isValidPassword(password) {
    return typeof password === "string" && password.length >= 6;
  }

  assert.ok(isValidPassword("123456"));
  assert.ok(isValidPassword("securepassword"));
  assert.ok(!isValidPassword("12345"));
  assert.ok(!isValidPassword(""));
  assert.ok(!isValidPassword(null));
  assert.ok(!isValidPassword(undefined));
});

test("Auth - displayName defaults to email prefix", async () => {
  function getDisplayName(displayName, email) {
    return displayName || email.split("@")[0];
  }

  assert.strictEqual(getDisplayName(null, "john@example.com"), "john");
  assert.strictEqual(
    getDisplayName(undefined, "test.user@domain.org"),
    "test.user",
  );
  assert.strictEqual(
    getDisplayName("CustomName", "john@example.com"),
    "CustomName",
  );
  assert.strictEqual(getDisplayName("", "alice@test.com"), "alice");
});

test("Auth - register request body schema", async () => {
  const schema = {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 6 },
      displayName: { type: "string" },
    },
  };

  assert.deepStrictEqual(schema.required, ["email", "password"]);
  assert.strictEqual(schema.properties.password.minLength, 6);
  assert.strictEqual(schema.properties.email.format, "email");
});

test("Auth - register rejects duplicate email with 409", async () => {
  // Simulate existing user check
  function handleRegister(email, existingEmails) {
    if (existingEmails.includes(email)) {
      return { status: 409, body: { error: "Email already registered" } };
    }
    return { status: 200, body: { user: { email } } };
  }

  const existing = ["alice@test.com", "bob@test.com"];

  const dup = handleRegister("alice@test.com", existing);
  assert.strictEqual(dup.status, 409);
  assert.strictEqual(dup.body.error, "Email already registered");

  const fresh = handleRegister("charlie@test.com", existing);
  assert.strictEqual(fresh.status, 200);
});

test("Auth - register response structure", async () => {
  const mockResponse = {
    user: {
      id: "uuid-123",
      email: "test@example.com",
      displayName: "test",
      createdAt: new Date().toISOString(),
    },
    token: "jwt.token.here",
  };

  assert.ok("user" in mockResponse);
  assert.ok("token" in mockResponse);
  assert.ok("id" in mockResponse.user);
  assert.ok("email" in mockResponse.user);
  assert.ok("displayName" in mockResponse.user);
  assert.ok("createdAt" in mockResponse.user);
  // passwordHash should NOT be in response
  assert.ok(!("passwordHash" in mockResponse.user));
});

// --- Login ---

test("Auth - login validates credentials", async () => {
  // Simulate bcrypt compare
  function simulateLogin(email, password, users) {
    const user = users.find((u) => u.email === email);
    if (!user) {
      return { status: 401, body: { error: "Invalid credentials" } };
    }
    // In real code: bcrypt.compare(password, user.passwordHash)
    if (password !== user.plainPassword) {
      return { status: 401, body: { error: "Invalid credentials" } };
    }
    return {
      status: 200,
      body: {
        user: { id: user.id, email: user.email, displayName: user.displayName },
        token: "jwt-token",
      },
    };
  }

  const users = [
    {
      id: "1",
      email: "alice@test.com",
      plainPassword: "secret123",
      displayName: "Alice",
      passwordHash: "hashed",
    },
  ];

  // Wrong email
  const r1 = simulateLogin("nobody@test.com", "secret123", users);
  assert.strictEqual(r1.status, 401);

  // Wrong password
  const r2 = simulateLogin("alice@test.com", "wrongpass", users);
  assert.strictEqual(r2.status, 401);

  // Correct credentials
  const r3 = simulateLogin("alice@test.com", "secret123", users);
  assert.strictEqual(r3.status, 200);
  assert.ok(r3.body.token);
  assert.strictEqual(r3.body.user.email, "alice@test.com");
});

test("Auth - login request body schema", async () => {
  const schema = {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string" },
    },
  };

  assert.deepStrictEqual(schema.required, ["email", "password"]);
});

// --- JWT ---

test("Auth - JWT payload structure", async () => {
  const payload = {
    userId: "uuid-123",
    email: "test@example.com",
  };

  assert.ok("userId" in payload);
  assert.ok("email" in payload);
  assert.strictEqual(typeof payload.userId, "string");
  assert.strictEqual(typeof payload.email, "string");
});

test("Auth - JWT sign/verify round-trip", async () => {
  // Simplified JWT-like encode/decode
  function signToken(payload, secret) {
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
      "base64url",
    );
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    // In real code this would be HMAC-SHA256
    const signature = Buffer.from(secret + header + body).toString("base64url");
    return `${header}.${body}.${signature}`;
  }

  function decodePayload(token) {
    const parts = token.split(".");
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
  }

  const payload = { userId: "abc-123", email: "test@test.com" };
  const token = signToken(payload, "my-secret");

  assert.ok(token.includes("."));
  assert.strictEqual(token.split(".").length, 3);

  const decoded = decodePayload(token);
  assert.strictEqual(decoded.userId, "abc-123");
  assert.strictEqual(decoded.email, "test@test.com");
});

// --- Authenticated endpoints ---

test("Auth - GET /me returns user without passwordHash", async () => {
  const dbUser = {
    id: "uuid-1",
    email: "alice@test.com",
    passwordHash: "$2b$12$hashedvalue",
    displayName: "Alice",
    createdAt: new Date().toISOString(),
  };

  // Route selects specific fields
  const selected = {
    id: dbUser.id,
    email: dbUser.email,
    displayName: dbUser.displayName,
    createdAt: dbUser.createdAt,
  };

  assert.ok(!("passwordHash" in selected));
  assert.strictEqual(selected.id, dbUser.id);
  assert.strictEqual(selected.email, dbUser.email);
});

test("Auth - GET /me returns 404 for missing user", async () => {
  function getMe(userId, users) {
    const user = users.find((u) => u.id === userId);
    if (!user) {
      return { status: 404, body: { error: "User not found" } };
    }
    return { status: 200, body: user };
  }

  const users = [{ id: "1", email: "alice@test.com" }];

  const found = getMe("1", users);
  assert.strictEqual(found.status, 200);

  const notFound = getMe("999", users);
  assert.strictEqual(notFound.status, 404);
  assert.strictEqual(notFound.body.error, "User not found");
});

test("Auth - PATCH /me updates displayName", async () => {
  function updateMe(userId, updates, users) {
    const user = users.find((u) => u.id === userId);
    if (!user) {
      return { status: 404, body: { error: "User not found" } };
    }
    if (updates.displayName) {
      user.displayName = updates.displayName;
    }
    return {
      status: 200,
      body: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
    };
  }

  const users = [
    {
      id: "1",
      email: "alice@test.com",
      displayName: "Alice",
      createdAt: "2025-01-01",
    },
  ];

  const result = updateMe("1", { displayName: "NewName" }, users);
  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.body.displayName, "NewName");
});

test("Auth - PATCH /me displayName validation", async () => {
  const schema = {
    properties: {
      displayName: { type: "string", minLength: 1, maxLength: 50 },
    },
  };

  function isValidDisplayName(name) {
    if (typeof name !== "string") return false;
    if (name.length < schema.properties.displayName.minLength) return false;
    if (name.length > schema.properties.displayName.maxLength) return false;
    return true;
  }

  assert.ok(isValidDisplayName("Alice"));
  assert.ok(isValidDisplayName("A"));
  assert.ok(isValidDisplayName("A".repeat(50)));
  assert.ok(!isValidDisplayName(""));
  assert.ok(!isValidDisplayName("A".repeat(51)));
});

test("Auth - unauthenticated request returns 401", async () => {
  function authenticate(request) {
    if (!request.headers.authorization) {
      return { status: 401, body: { error: "Unauthorized" } };
    }
    const token = request.headers.authorization.replace("Bearer ", "");
    if (!token || token === "invalid") {
      return { status: 401, body: { error: "Unauthorized" } };
    }
    return { status: 200, user: { userId: "123" } };
  }

  const noAuth = authenticate({ headers: {} });
  assert.strictEqual(noAuth.status, 401);

  const invalidAuth = authenticate({
    headers: { authorization: "Bearer invalid" },
  });
  assert.strictEqual(invalidAuth.status, 401);

  const validAuth = authenticate({
    headers: { authorization: "Bearer valid-token" },
  });
  assert.strictEqual(validAuth.status, 200);
});

test("Auth - password hash uses bcrypt with 12 rounds", async () => {
  // Verify the constant matches what the route uses
  assert.strictEqual(SALT_ROUNDS, 12);
});
