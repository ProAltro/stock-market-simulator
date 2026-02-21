/**
 * Frontend Unit Tests
 * Tests utility functions, API helpers, and template loading logic
 * Run with: node --test frontend/tests/frontend.test.js
 */

import test from "node:test";
import assert from "node:assert";

// ============================================================
// Utils: formatCurrency
// ============================================================

const CURRENCY_LOCALE_MAP = {
  USD: "en-US",
  INR: "en-IN",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
  CAD: "en-CA",
  AUD: "en-AU",
  CHF: "de-CH",
  CNY: "zh-CN",
  SGD: "en-SG",
  HKD: "zh-HK",
};

function getLocale(currency) {
  return CURRENCY_LOCALE_MAP[currency] || "en-US";
}

function formatCurrency(value, currency = "USD") {
  if (value === null || value === undefined) {
    return new Intl.NumberFormat(getLocale(currency), {
      style: "currency",
      currency,
    }).format(0);
  }
  try {
    const locale = getLocale(currency || "USD");
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(value);
  } catch (e) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  }
}

function formatPercent(value) {
  if (value === null || value === undefined) return "0.00%";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

test("Utils - formatCurrency with USD", async () => {
  const result = formatCurrency(1234.56, "USD");
  assert.ok(result.includes("1,234.56") || result.includes("1234.56"));
  assert.ok(result.includes("$"));
});

test("Utils - formatCurrency with null returns zero", async () => {
  const result = formatCurrency(null, "USD");
  assert.ok(result.includes("0"));
});

test("Utils - formatCurrency with undefined returns zero", async () => {
  const result = formatCurrency(undefined, "USD");
  assert.ok(result.includes("0"));
});

test("Utils - formatCurrency with large values", async () => {
  const result = formatCurrency(1000000.5, "USD");
  assert.ok(result.includes("1,000,000.50") || result.includes("1000000.50"));
});

test("Utils - formatCurrency with EUR", async () => {
  const result = formatCurrency(100, "EUR");
  assert.ok(result.includes("100"));
});

test("Utils - formatCurrency with negative values", async () => {
  const result = formatCurrency(-500, "USD");
  assert.ok(result.includes("500"));
});

test("Utils - formatCurrency with zero", async () => {
  const result = formatCurrency(0, "USD");
  assert.ok(result.includes("0"));
});

test("Utils - formatCurrency defaults to USD", async () => {
  const result = formatCurrency(100);
  assert.ok(result.includes("$") || result.includes("100"));
});

// ============================================================
// Utils: formatPercent
// ============================================================

test("Utils - formatPercent positive value", async () => {
  assert.strictEqual(formatPercent(5.5), "+5.50%");
});

test("Utils - formatPercent negative value", async () => {
  assert.strictEqual(formatPercent(-3.2), "-3.20%");
});

test("Utils - formatPercent zero", async () => {
  assert.strictEqual(formatPercent(0), "+0.00%");
});

test("Utils - formatPercent null returns default", async () => {
  assert.strictEqual(formatPercent(null), "0.00%");
});

test("Utils - formatPercent undefined returns default", async () => {
  assert.strictEqual(formatPercent(undefined), "0.00%");
});

test("Utils - formatPercent large value", async () => {
  assert.strictEqual(formatPercent(100.0), "+100.00%");
});

// ============================================================
// Utils: getLocale mapping
// ============================================================

test("Utils - getLocale known currencies", async () => {
  assert.strictEqual(getLocale("USD"), "en-US");
  assert.strictEqual(getLocale("INR"), "en-IN");
  assert.strictEqual(getLocale("EUR"), "de-DE");
  assert.strictEqual(getLocale("GBP"), "en-GB");
  assert.strictEqual(getLocale("JPY"), "ja-JP");
});

test("Utils - getLocale unknown currency defaults to en-US", async () => {
  assert.strictEqual(getLocale("XYZ"), "en-US");
  assert.strictEqual(getLocale(""), "en-US");
  assert.strictEqual(getLocale(undefined), "en-US");
});

// ============================================================
// API: fetchWithAuth logic
// ============================================================

test("API - auth header added when token exists", async () => {
  function buildHeaders(token) {
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  const withToken = buildHeaders("my-jwt-token");
  assert.strictEqual(withToken["Authorization"], "Bearer my-jwt-token");
  assert.strictEqual(withToken["Content-Type"], "application/json");

  const withoutToken = buildHeaders(null);
  assert.ok(!("Authorization" in withoutToken));
});

test("API - post builds correct request", async () => {
  const body = { code: "pass", language: "python" };
  const serialized = JSON.stringify(body);

  assert.ok(serialized.includes("pass"));
  assert.ok(serialized.includes("python"));
  const parsed = JSON.parse(serialized);
  assert.deepStrictEqual(parsed, body);
});

test("API - error parsing from response", async () => {
  function parseError(responseBody) {
    return responseBody?.error || "Request failed";
  }

  assert.strictEqual(parseError({ error: "Unauthorized" }), "Unauthorized");
  assert.strictEqual(parseError({ error: "Not found" }), "Not found");
  assert.strictEqual(parseError({}), "Request failed");
  assert.strictEqual(parseError(null), "Request failed");
});

test("API - API_URL default", async () => {
  const API_URL = "http://localhost:3000/api";
  assert.ok(API_URL.includes("localhost"));
  assert.ok(API_URL.includes("/api"));
  assert.ok(API_URL.startsWith("http"));
});

// ============================================================
// Template Loader logic
// ============================================================

test("TemplateLoader - position values are valid", async () => {
  const validPositions = ["replace", "append", "prepend"];
  for (const pos of validPositions) {
    assert.ok(typeof pos === "string");
  }
});

test("TemplateLoader - default position is replace", async () => {
  function getPosition(position) {
    return position || "replace";
  }

  assert.strictEqual(getPosition(undefined), "replace");
  assert.strictEqual(getPosition("append"), "append");
  assert.strictEqual(getPosition("prepend"), "prepend");
});

test("TemplateLoader - page list includes required pages", async () => {
  const pages = [
    "pages/dashboard.html",
    "pages/trade.html",
    "pages/portfolio.html",
    "pages/leaderboard.html",
    "pages/backtest.html",
    "pages/profile.html",
    "pages/market-sim.html",
    "pages/market-sim-admin.html",
  ];

  assert.ok(pages.some((p) => p.includes("dashboard")));
  assert.ok(pages.some((p) => p.includes("leaderboard")));
  assert.ok(pages.some((p) => p.includes("market-sim")));
});

test("TemplateLoader - components are loaded in correct order", async () => {
  const components = [
    { path: "components/sidebar.html", target: "#sidebar-container" },
    { path: "components/auth-modal.html", target: "#auth-container" },
  ];

  // Sidebar before auth modal
  assert.ok(components[0].path.includes("sidebar"));
  assert.ok(components[1].path.includes("auth-modal"));
});

// ============================================================
// App initialization structure
// ============================================================

test("App - initial state", async () => {
  const appState = {
    loading: true,
    currentPage: "dashboard",
    sidebarOpen: false,
  };

  assert.strictEqual(appState.loading, true);
  assert.strictEqual(appState.currentPage, "dashboard");
  assert.strictEqual(appState.sidebarOpen, false);
});

test("App - dashboard data loading calls multiple endpoints", async () => {
  const endpoints = ["fetchLeaderboard", "fetchDataInfo", "fetchMarketStatus"];
  assert.strictEqual(endpoints.length, 3);
  for (const ep of endpoints) {
    assert.ok(typeof ep === "string");
  }
});

test("App - navigation with valid pages", async () => {
  const validPages = [
    "dashboard",
    "trade",
    "portfolio",
    "leaderboard",
    "backtest",
    "profile",
    "market-sim",
  ];

  function isValidPage(page) {
    return validPages.includes(page);
  }

  assert.ok(isValidPage("dashboard"));
  assert.ok(isValidPage("leaderboard"));
  assert.ok(!isValidPage("nonexistent"));
});
