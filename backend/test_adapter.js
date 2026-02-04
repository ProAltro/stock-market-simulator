
import { getHistory } from './src/services/market/yahooAdapter.js';

async function test() {
    console.log('Testing getHistory refactor...');
    
    // Test 1D (Intraday 5m)
    try {
        console.log('\n--- 1D Range (5m interval) ---');
        const data = await getHistory('AAPL', { interval: '5min', range: '1d' });
        console.log('Symbol:', data.symbol);
        console.log('Interval:', data.interval);
        console.log('Data points:', data.data.length);
        if (data.data.length > 0) {
            console.log('First point:', data.data[0]);
            console.log('Last point:', data.data[data.data.length - 1]);
            const firstTime = data.data[0].time;
            console.log('Time format (should be number):', typeof firstTime, firstTime);
        }
    } catch (e) {
        console.error('1D test failed:', e);
    }

    // Test 1W (Intraday 15m)
    try {
        console.log('\n--- 1W Range (15m interval) ---');
        const data = await getHistory('AAPL', { interval: '15min', range: '1wk' });
        console.log('Data points:', data.data.length);
        if (data.data.length > 0) {
           console.log('First point:', data.data[0]); 
        }
    } catch (e) {
        console.error('1W test failed:', e);
    }

    // Test 1M (Daily) - check compatibility
    try {
        console.log('\n--- 1M Range (1day interval) ---');
        const data = await getHistory('AAPL', { interval: '1day', range: '1mo' });
        console.log('Data points:', data.data.length);
        if (data.data.length > 0) {
            console.log('First point:', data.data[0]);
            const firstTime = data.data[0].time;
            console.log('Time format (should be string):', typeof firstTime, firstTime);
        }
    } catch (e) {
        console.error('1M test failed:', e);
    }
}

test();
