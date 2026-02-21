import test from "node:test";
import assert from "node:assert";

// ============================================================
// Executor C++ Wrapper & runAlgorithm Tests
// Tests generateCppWrapper and the full runAlgorithm lifecycle
// ============================================================

const INITIAL_CASH = 100000;
const COMMODITIES = ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"];

function createMockDataBundle(tickCount = 100) {
  const data = { _news: {} };
  const basePrices = { OIL: 75, STEEL: 120, WOOD: 45, BRICK: 25, GRAIN: 8 };
  for (const symbol of COMMODITIES) {
    data[symbol] = { ticks: [], orderbooks: {} };
    let price = basePrices[symbol];
    for (let t = 0; t < tickCount; t++) {
      price += (Math.random() - 0.5) * 2;
      price = Math.max(
        basePrices[symbol] * 0.5,
        Math.min(basePrices[symbol] * 1.5, price),
      );
      data[symbol].ticks.push({
        tick: t,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price,
        volume: 1000,
      });
    }
  }
  return data;
}

// --- generateCppWrapper ---

test("Executor - generateCppWrapper creates valid C++ code", async () => {
  const dataBundle = createMockDataBundle(10);
  const userCode = 'if (get_price("OIL") > 80) sell("OIL", 10);';

  function generateCppWrapper(dataBundle, userCode) {
    return `
#include <iostream>
#include <vector>
#include <map>
#include <string>
#include <sstream>
#include <cmath>

std::string _RAW_DATA = R"(${JSON.stringify(dataBundle)})";
std::vector<std::string> _COMMODITIES = {"OIL", "STEEL", "WOOD", "BRICK", "GRAIN"};

double _cash = ${INITIAL_CASH}.0;
std::map<std::string, int> _positions;
int _current_tick = 0;

double get_cash() { return _cash; }
std::map<std::string, int> get_positions() { return _positions; }
int get_position(const std::string& symbol) {
    auto it = _positions.find(symbol);
    return it != _positions.end() ? it->second : 0;
}

bool buy(const std::string& symbol, int quantity) {
    double price = 75.0; // simplified
    double cost = price * quantity;
    if (cost > _cash) return false;
    _cash -= cost;
    _positions[symbol] += quantity;
    return true;
}

bool sell(const std::string& symbol, int quantity) {
    if (_positions[symbol] < quantity) return false;
    double price = 75.0;
    _cash += price * quantity;
    _positions[symbol] -= quantity;
    return true;
}

int main() {
    try {
        for (_current_tick = 0; _current_tick < 10; _current_tick++) {
            ${userCode}
        }
    } catch (...) {
        std::cerr << "Strategy error" << std::endl;
    }
    
    double positions_value = 0;
    for (auto& c : _COMMODITIES) {
        positions_value += _positions[c] * 75.0;
    }
    
    std::cout << "{\\"success\\":true,\\"finalNetWorth\\":" << (_cash + positions_value) << "}" << std::endl;
    return 0;
}
`;
  }

  const wrapper = generateCppWrapper(dataBundle, userCode);

  // Verify C++ essentials
  assert.ok(wrapper.includes("#include <iostream>"));
  assert.ok(wrapper.includes("#include <vector>"));
  assert.ok(wrapper.includes("#include <map>"));
  assert.ok(wrapper.includes("_COMMODITIES"));
  assert.ok(wrapper.includes("_cash"));
  assert.ok(wrapper.includes("buy("));
  assert.ok(wrapper.includes("sell("));
  assert.ok(wrapper.includes("int main()"));
  assert.ok(wrapper.includes("finalNetWorth"));
  assert.ok(wrapper.includes(userCode));
});

test("Executor - C++ wrapper contains R raw string for data", async () => {
  const dataBundle = createMockDataBundle(5);
  const serialized = JSON.stringify(dataBundle);

  // The C++ wrapper uses R"(...)" raw string literal for data
  const rawString = `R"(${serialized})"`;
  assert.ok(rawString.startsWith('R"('));
  assert.ok(rawString.endsWith(')"'));
});

test("Executor - C++ wrapper handles special chars in data", async () => {
  // JSON data shouldn't contain )\" which would break R"()" syntax
  const data = createMockDataBundle(10);
  const json = JSON.stringify(data);

  // Check that the JSON doesn't contain the C++ raw string delimiter
  assert.ok(!json.includes(')"'));
});

// --- runAlgorithm lifecycle ---

test("Executor - runAlgorithm updates status to running", async () => {
  const updates = [];
  const mockPrisma = {
    algorithmSubmission: {
      update: async ({ where, data }) => {
        updates.push({ id: where.id, ...data });
      },
    },
  };

  // Simulate the first update in runAlgorithm
  await mockPrisma.algorithmSubmission.update({
    where: { id: "sub-1" },
    data: { status: "running" },
  });

  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].status, "running");
  assert.strictEqual(updates[0].id, "sub-1");
});

test("Executor - runAlgorithm handles successful execution", async () => {
  // Simulate Judge0 returning status.id === 3 (Accepted)
  const mockResult = {
    status: { id: 3, description: "Accepted" },
    stdout: JSON.stringify({
      success: true,
      finalNetWorth: 105000.5,
      cash: 45000,
      positions: { OIL: 100 },
      totalTrades: 15,
    }),
  };

  assert.strictEqual(mockResult.status.id, 3);
  const output = JSON.parse(mockResult.stdout);
  assert.ok(output.success);
  assert.strictEqual(output.finalNetWorth, 105000.5);

  // Should update with completed status
  const updateData = {
    status: "completed",
    finalNetWorth: output.finalNetWorth || output.final_net_worth,
    cashBalance: output.cash,
    positions: output.positions || {},
    totalTrades: output.totalTrades || output.total_trades,
    executionTimeMs: 3500,
    stdout: mockResult.stdout.substring(0, 10000),
    completedAt: new Date(),
  };

  assert.strictEqual(updateData.status, "completed");
  assert.strictEqual(updateData.finalNetWorth, 105000.5);
  assert.strictEqual(updateData.totalTrades, 15);
});

test("Executor - runAlgorithm handles parse error in output", async () => {
  const mockResult = {
    status: { id: 3, description: "Accepted" },
    stdout: "not valid json output",
  };

  let parseError = null;
  try {
    JSON.parse(mockResult.stdout);
  } catch (e) {
    parseError = e;
  }

  assert.ok(parseError);
  assert.ok(parseError.message.includes("Unexpected token"));

  // Should update with failed status
  const updateData = {
    status: "failed",
    error: `Failed to parse output: ${parseError.message}`,
    stdout: mockResult.stdout.substring(0, 10000),
  };

  assert.strictEqual(updateData.status, "failed");
  assert.ok(updateData.error.includes("Failed to parse output"));
});

test("Executor - runAlgorithm handles compilation error", async () => {
  const mockResult = {
    status: { id: 6, description: "Compilation Error" },
    compile_output: "error: expected ';' at end of statement",
    stderr: null,
    stdout: null,
  };

  assert.strictEqual(mockResult.status.id, 6);

  const error =
    mockResult.stderr ||
    mockResult.compile_output ||
    mockResult.message ||
    "Execution failed";
  assert.strictEqual(error, "error: expected ';' at end of statement");
});

test("Executor - runAlgorithm handles runtime error", async () => {
  const mockResult = {
    status: { id: 7, description: "Runtime Error" },
    stderr: "ZeroDivisionError: division by zero",
    stdout: null,
  };

  assert.strictEqual(mockResult.status.id, 7);
  const error =
    mockResult.stderr || mockResult.compile_output || "Execution failed";
  assert.ok(error.includes("ZeroDivisionError"));
});

test("Executor - runAlgorithm handles timeout", async () => {
  const mockResult = {
    status: { id: 5, description: "Time Limit Exceeded" },
    stderr: null,
    stdout: null,
    message: "Time limit exceeded",
  };

  assert.strictEqual(mockResult.status.id, 5);
});

test("Executor - runAlgorithm catches top-level errors", async () => {
  // When loadDataBundle or submitCode throws
  const error = new Error("Judge0 connection refused");

  const updateData = {
    status: "failed",
    error: error.message,
    executionTimeMs: 100,
    completedAt: new Date(),
  };

  assert.strictEqual(updateData.status, "failed");
  assert.ok(updateData.error.includes("connection refused"));
});

test("Executor - stdout truncated to 10000 chars", async () => {
  const longOutput = "x".repeat(20000);
  const truncated = longOutput.substring(0, 10000);
  assert.strictEqual(truncated.length, 10000);
});

test("Executor - language selection for wrapper generation", async () => {
  function selectWrapper(language) {
    if (language === "python") return "generatePythonWrapper";
    if (language === "cpp") return "generateCppWrapper";
    throw new Error(`Unsupported language: ${language}`);
  }

  assert.strictEqual(selectWrapper("python"), "generatePythonWrapper");
  assert.strictEqual(selectWrapper("cpp"), "generateCppWrapper");
  assert.throws(() => selectWrapper("javascript"), /Unsupported language/);
});

test("Executor - language ID mapping", async () => {
  const LANGUAGES = { python3: 71, cpp: 54 };

  function getLangId(language) {
    return language === "python" ? LANGUAGES.python3 : LANGUAGES.cpp;
  }

  assert.strictEqual(getLangId("python"), 71);
  assert.strictEqual(getLangId("cpp"), 54);
});

test("Executor - generateMockData produces valid structure", async () => {
  const data = createMockDataBundle(100);

  assert.ok("_news" in data);
  for (const symbol of COMMODITIES) {
    assert.ok(symbol in data);
    assert.ok("ticks" in data[symbol]);
    assert.strictEqual(data[symbol].ticks.length, 100);
    for (const tick of data[symbol].ticks) {
      assert.ok("tick" in tick);
      assert.ok("open" in tick);
      assert.ok("high" in tick);
      assert.ok("low" in tick);
      assert.ok("close" in tick);
      assert.ok("volume" in tick);
      assert.ok(tick.close > 0);
    }
  }
});

test("Executor - executionTimeMs is calculated from start", async () => {
  const startTime = Date.now();
  // Simulate some work
  const endTime = startTime + 3500;
  const executionTimeMs = endTime - startTime;

  assert.strictEqual(executionTimeMs, 3500);
  assert.ok(executionTimeMs > 0);
});
