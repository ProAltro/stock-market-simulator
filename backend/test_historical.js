
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function test() {
    console.log('Testing historical (legacy)...');
    try {
        const result = await yahooFinance.historical('AAPL', {
            period1: '2024-01-01',
            period2: '2024-01-10',
            interval: '1d'
        });
        
        console.log(`Historical result length: ${result.length}`);
        if(result.length > 0) console.log('Sample:', result[0]);

    } catch (e) {
        console.error('Historical error:', e.message);
    }
}

test();
