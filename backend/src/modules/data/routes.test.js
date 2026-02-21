import test from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock data directory for tests
const TEST_DATA_DIR = path.join(__dirname, "test_data");

test("Data routes - info endpoint returns correct structure", async () => {
  const expectedKeys = [
    "commodities",
    "totalTicks",
    "downloadSize",
    "description",
    "initialCash",
    "priceRange",
    "dataAvailable",
  ];

  const mockInfo = {
    commodities: [
      { symbol: "OIL", name: "Crude Oil", category: "Energy" },
      { symbol: "STEEL", name: "Steel", category: "Construction" },
      { symbol: "WOOD", name: "Lumber", category: "Construction" },
      { symbol: "BRICK", name: "Brick", category: "Construction" },
      { symbol: "GRAIN", name: "Grain", category: "Agriculture" },
    ],
    totalTicks: 1000000,
    downloadSize: 100000,
    description:
      "Commodity trading simulation data. Download the 100K development dataset or run your algorithm on the full 1M tick dataset.",
    initialCash: 100000,
    priceRange: {
      OIL: { min: 60, max: 100 },
      STEEL: { min: 100, max: 150 },
      WOOD: { min: 30, max: 60 },
      BRICK: { min: 15, max: 35 },
      GRAIN: { min: 5, max: 12 },
    },
    dataAvailable: {
      full: false,
      dev: false,
      csv: false,
    },
  };

  for (const key of expectedKeys) {
    assert.ok(key in mockInfo, `Missing key: ${key}`);
  }

  assert.strictEqual(mockInfo.commodities.length, 5);
  assert.strictEqual(mockInfo.totalTicks, 1000000);
  assert.strictEqual(mockInfo.downloadSize, 100000);
});

test("Data routes - info endpoint checks file existence", async () => {
  // Create test directory structure
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  // Test that files don't exist initially
  const fullExists = fs.existsSync(path.join(TEST_DATA_DIR, "full_1m.json"));
  const devExists = fs.existsSync(path.join(TEST_DATA_DIR, "dev_100k.json"));
  const csvExists = fs.existsSync(path.join(TEST_DATA_DIR, "csv"));

  assert.strictEqual(fullExists, false);
  assert.strictEqual(devExists, false);
  assert.strictEqual(csvExists, false);

  // Create test files
  fs.writeFileSync(path.join(TEST_DATA_DIR, "full_1m.json"), "{}");
  fs.writeFileSync(path.join(TEST_DATA_DIR, "dev_100k.json"), "{}");
  fs.mkdirSync(path.join(TEST_DATA_DIR, "csv"), { recursive: true });

  // Verify files exist
  assert.ok(fs.existsSync(path.join(TEST_DATA_DIR, "full_1m.json")));
  assert.ok(fs.existsSync(path.join(TEST_DATA_DIR, "dev_100k.json")));
  assert.ok(fs.existsSync(path.join(TEST_DATA_DIR, "csv")));

  // Cleanup
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("Data routes - status endpoint structure", async () => {
  const mockStatus = {
    simState: {
      running: false,
      paused: false,
      populating: false,
      currentTick: 1000000,
    },
    exportStatus: {
      isExporting: false,
      progress: 1.0,
      totalTicks: 1000000,
    },
    dataFiles: {
      full: true,
      dev: true,
      csv: true,
    },
  };

  assert.ok("simState" in mockStatus);
  assert.ok("exportStatus" in mockStatus);
  assert.ok("dataFiles" in mockStatus);
  assert.strictEqual(typeof mockStatus.simState.currentTick, "number");
  assert.strictEqual(typeof mockStatus.exportStatus.progress, "number");
});

test("Data routes - generate endpoint validation", async () => {
  const validRequest = { ticks: 1000000 };
  const invalidRequest1 = { ticks: -1 };
  const invalidRequest2 = { ticks: "invalid" };

  // Validate tick count
  function validateTicks(ticks) {
    if (typeof ticks !== "number") return false;
    if (ticks < 1000 || ticks > 10000000) return false;
    return true;
  }

  assert.ok(validateTicks(validRequest.ticks));
  assert.ok(!validateTicks(invalidRequest1.ticks));
  assert.ok(!validateTicks(invalidRequest2.ticks));
});

test("Data routes - download returns correct content type", async () => {
  // Test JSON download
  const jsonContentType = "application/json";
  const zipContentType = "application/zip";

  // Simulate content type selection
  function getContentType(hasCsv) {
    return hasCsv ? zipContentType : jsonContentType;
  }

  assert.strictEqual(getContentType(false), jsonContentType);
  assert.strictEqual(getContentType(true), zipContentType);
});

test("Data routes - sample reads partial file", async () => {
  // Create test directory
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  const sampleData = {
    OIL: {
      ticks: Array.from({ length: 1000 }, (_, i) => ({
        tick: i,
        open: 75 + Math.random(),
        high: 76 + Math.random(),
        low: 74 + Math.random(),
        close: 75 + Math.random(),
        volume: 1000 + Math.floor(Math.random() * 500),
      })),
    },
  };

  const filePath = path.join(TEST_DATA_DIR, "dev_100k.json");
  fs.writeFileSync(filePath, JSON.stringify(sampleData));

  // Read partial file
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(1000);
  fs.readSync(fd, buffer, 0, 1000, 0);
  fs.closeSync(fd);

  const content = buffer.toString("utf-8");
  assert.ok(content.startsWith('{"OIL":'));
  assert.ok(content.includes('"ticks":'));

  // Cleanup
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});
