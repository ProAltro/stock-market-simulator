
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function test() {
    console.log('Testing numeric timestamps...');
    const symbol = 'AAPL';
    try {
        // Use 2024 dates (known good)
        // 2024-01-03 14:30 UTC = 1704292200
        const p1 = 1704292200; 
        // 2024-01-10 21:00 UTC = 1704920400
        const p2 = 1704920400;

        console.log(`P1: ${p1}, P2: ${p2}`);

        const result = await yahooFinance.chart(symbol, {
            period1: p1,
            period2: p2,
            interval: '1d' 
        });
        
        console.log('Meta:', result.meta ? 'Yes' : 'No');
        if (result.timestamp) {
            console.log(`Quotes count: ${result.timestamp.length}`);
            console.log('First:', new Date(result.timestamp[0] * 1000).toLocaleString());
        } else {
            console.log('No timestamps in result');
        }

    } catch (e) {
        console.error('Chart error:', e.message);
    }
}

test();
