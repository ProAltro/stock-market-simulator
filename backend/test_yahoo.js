
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function test() {
    const symbol = 'AAPL';
    console.log(`Testing for ${symbol} with 2025 dates...`);

    try {
        // Hardcoded 2025 dates (assuming real world is ~Feb 2025)
        // Feb 4 2025 was a Tuesday.
        const period1 = new Date('2025-02-03T14:30:00Z'); // Feb 3 2025 9:30 AM EST
        const period2 = new Date('2025-02-04T21:00:00Z'); // Feb 4 2025 4:00 PM EST

        console.log(`Period1: ${period1.toISOString()}`);
        console.log(`Period2: ${period2.toISOString()}`);

        const result = await yahooFinance.chart(symbol, {
            period1: period1,
            period2: period2,
            interval: '15m'
        });
        
        console.log('Meta:', result.meta ? 'Yes' : 'No');
        if (result.timestamp) {
            console.log(`Quotes count: ${result.timestamp.length}`);
            console.log('First:', new Date(result.timestamp[0] * 1000).toISOString());
        } else {
            console.log('No timestamps in result');
        }

    } catch (e) {
        console.error('Chart error:', e.message);
    }
}

test();
