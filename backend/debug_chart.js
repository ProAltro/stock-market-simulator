
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function test() {
    try {
        const p1 = 1704292200; // 2024-01-03
        const p2 = 1704920400; // 2024-01-10

        const result = await yahooFinance.chart('AAPL', {
            period1: p1,
            period2: p2,
            interval: '1d' 
        });
        
        console.log(JSON.stringify(result, null, 2));

    } catch (e) {
        console.error('Chart error:', e.message);
        console.error(JSON.stringify(e, null, 2));
    }
}

test();
