
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function checkYear(year) {
    const symbol = 'AAPL';
    console.log(`Checking ${year}...`);
    try {
        const p1 = new Date(`${year}-01-03T14:30:00Z`); // Jan 3 (usually trading day)
        const p2 = new Date(`${year}-01-10T21:00:00Z`);

        const result = await yahooFinance.chart(symbol, {
            period1: p1,
            period2: p2,
            interval: '1d' // Daily should always work if year is valid locally
        });
        
        if (result.timestamp && result.timestamp.length > 0) {
            console.log(`SUCCESS ${year}: Found ${result.timestamp.length} candles.`);
            return true;
        } else {
            console.log(`EMPTY ${year}: No data.`);
            return false;
        }
    } catch (e) {
        console.log(`ERROR ${year}: ${e.message}`);
        return false;
    }
}

async function test() {
    await checkYear(2023);
    await checkYear(2024);
    await checkYear(2025);
    await checkYear(2026);
}

test();
