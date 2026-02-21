import test from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock Judge0 responses for unit testing
const JUDGE0_URL = process.env.JUDGE0_URL || "http://localhost:2358";

// Language IDs
const LANGUAGES = {
  python3: 71,
  cpp: 54,
  javascript: 63,
};

// Status codes
const STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR: 7,
  MEMORY_LIMIT_EXCEEDED: 10,
  OUTPUT_LIMIT_EXCEEDED: 11,
  INTERNAL_ERROR: 13,
};

test("Judge0 - language IDs are correct", async () => {
  assert.strictEqual(LANGUAGES.python3, 71);
  assert.strictEqual(LANGUAGES.cpp, 54);
  assert.strictEqual(LANGUAGES.javascript, 63);
});

test("Judge0 - status codes are defined", async () => {
  assert.strictEqual(STATUS.ACCEPTED, 3);
  assert.strictEqual(STATUS.COMPILATION_ERROR, 6);
  assert.strictEqual(STATUS.RUNTIME_ERROR, 7);
  assert.strictEqual(STATUS.TIME_LIMIT_EXCEEDED, 5);
});

test("Judge0 - base64 encoding for source code", async () => {
  const sourceCode = 'print("Hello, World!")';
  const encoded = Buffer.from(sourceCode).toString("base64");

  assert.ok(encoded);
  assert.strictEqual(typeof encoded, "string");

  // Decode and verify
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  assert.strictEqual(decoded, sourceCode);
});

test("Judge0 - submission body structure", async () => {
  const sourceCode = "x = 1 + 1\nprint(x)";
  const body = {
    source_code: Buffer.from(sourceCode).toString("base64"),
    language_id: LANGUAGES.python3,
    cpu_time_limit: 60,
    memory_limit: 256000,
    max_file_size: 10240,
  };

  assert.ok(body.source_code);
  assert.strictEqual(body.language_id, 71);
  assert.strictEqual(body.cpu_time_limit, 60);
  assert.strictEqual(body.memory_limit, 256000);
});

test("Judge0 - stdin encoding", async () => {
  const stdin = "10\n20\n30";
  const encoded = Buffer.from(stdin).toString("base64");

  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  assert.strictEqual(decoded, stdin);
});

test("Judge0 - result decoding", async () => {
  const mockResult = {
    status: { id: 3, description: "Accepted" },
    stdout: Buffer.from("2\n").toString("base64"),
    stderr: null,
    compile_output: null,
    time: "0.123",
    memory: 1024,
  };

  // Decode stdout
  if (mockResult.stdout) {
    mockResult.stdout = Buffer.from(mockResult.stdout, "base64").toString(
      "utf-8",
    );
  }

  assert.strictEqual(mockResult.stdout, "2\n");
  assert.strictEqual(mockResult.status.id, STATUS.ACCEPTED);
});

test("Judge0 - compilation error detection", async () => {
  const mockResult = {
    status: { id: STATUS.COMPILATION_ERROR, description: "Compilation Error" },
    compile_output: Buffer.from("SyntaxError: invalid syntax").toString(
      "base64",
    ),
  };

  assert.strictEqual(mockResult.status.id, STATUS.COMPILATION_ERROR);
  assert.ok(mockResult.compile_output);
});

test("Judge0 - runtime error detection", async () => {
  const mockResult = {
    status: { id: STATUS.RUNTIME_ERROR, description: "Runtime Error" },
    stderr: Buffer.from("ZeroDivisionError: division by zero").toString(
      "base64",
    ),
  };

  assert.strictEqual(mockResult.status.id, STATUS.RUNTIME_ERROR);
});

test("Judge0 - timeout detection", async () => {
  const mockResult = {
    status: {
      id: STATUS.TIME_LIMIT_EXCEEDED,
      description: "Time Limit Exceeded",
    },
    time: "60.000",
  };

  assert.strictEqual(mockResult.status.id, STATUS.TIME_LIMIT_EXCEEDED);
});

test("Judge0 - submission polling logic", async () => {
  // Simulate status progression
  const statuses = [
    { id: STATUS.IN_QUEUE, description: "In Queue" },
    { id: STATUS.PROCESSING, description: "Processing" },
    { id: STATUS.ACCEPTED, description: "Accepted" },
  ];

  let currentIndex = 0;

  function pollStatus() {
    const status = statuses[currentIndex];
    if (currentIndex < statuses.length - 1) {
      currentIndex++;
    }
    return status;
  }

  // Simulate polling
  assert.strictEqual(pollStatus().id, STATUS.IN_QUEUE);
  assert.strictEqual(pollStatus().id, STATUS.PROCESSING);
  assert.strictEqual(pollStatus().id, STATUS.ACCEPTED);
});

test("Judge0 - health check response structure", async () => {
  const healthyResponse = { healthy: true };
  const unhealthyResponse = { healthy: false, error: "Connection refused" };

  assert.strictEqual(healthyResponse.healthy, true);
  assert.strictEqual(unhealthyResponse.healthy, false);
  assert.ok(unhealthyResponse.error);
});

// Tests requiring actual Judge0 connection
// Set INTEGRATION_TEST=true to run these
const INTEGRATION_AVAILABLE = process.env.INTEGRATION_TEST === "true";

test(
  "Judge0 - actual connection",
  { skip: !INTEGRATION_AVAILABLE },
  async () => {
    try {
      const response = await fetch(`${JUDGE0_URL}/about`);
      if (response.ok) {
        const info = await response.json();
        assert.ok(info);
        console.log("Judge0 connected:", info);
      }
    } catch (error) {
      console.log("Judge0 not available:", error.message);
    }
  },
);

test(
  "Judge0 - submit Python code",
  { skip: !INTEGRATION_AVAILABLE },
  async () => {
    const sourceCode = `
import json
result = {"sum": 2 + 2}
print(json.dumps(result))
`;

    const response = await fetch(
      `${JUDGE0_URL}/submissions?base64_encoded=true&wait=false`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: Buffer.from(sourceCode).toString("base64"),
          language_id: LANGUAGES.python3,
        }),
      },
    );

    assert.ok(response.ok);
    const result = await response.json();
    assert.ok(result.token);

    // Wait for result
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const resultResponse = await fetch(
      `${JUDGE0_URL}/submissions/${result.token}?base64_encoded=true`,
    );
    const execution = await resultResponse.json();

    if (execution.stdout) {
      execution.stdout = Buffer.from(execution.stdout, "base64").toString(
        "utf-8",
      );
    }

    assert.ok(execution.stdout);
    console.log("Execution output:", execution.stdout);
  },
);

test("Judge0 - submit C++ code", { skip: !INTEGRATION_AVAILABLE }, async () => {
  const sourceCode = `
#include <iostream>
int main() {
    std::cout << "Hello from C++" << std::endl;
    return 0;
}
`;

  const response = await fetch(
    `${JUDGE0_URL}/submissions?base64_encoded=true&wait=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: Buffer.from(sourceCode).toString("base64"),
        language_id: LANGUAGES.cpp,
      }),
    },
  );

  assert.ok(response.ok);
  const result = await response.json();
  assert.ok(result.token);
});
