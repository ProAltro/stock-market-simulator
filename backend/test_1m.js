
const yahooFinance = require('yahoo-finance2').default;

async function test1m() {
  try {
    const queryOptions = { period1: '2025-02-01', interval: '1m' };
    const result = await yahooFinance.chart('AAPL', queryOptions);
    if (result && result.quotes && result.quotes.length > 0) {
      console.log("1m Data Found:", result.quotes.length, "candles.");
      console.log("First:", result.quotes[0]);
    } else {
      console.log("No 1m data returned.");
    }
  } catch (error) {
    console.error("1m Error:", error.message);
  }
}

test1m();
