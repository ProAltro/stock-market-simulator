
import dotenv from 'dotenv';
dotenv.config();

import { getHistory } from './src/services/market/twelveDataAdapter.js';

async function test() {
    console.log('Testing 5m interval mapping...');
    try {
        // Simulate frontend request: interval='5m'
        const history = await getHistory('AAPL', { interval: '5m', outputsize: 5 });
        console.log('Interval used:', history.interval); // Should be '5min'
        console.log('Data length:', history.data.length);
        if (history.data.length > 0) {
            console.log('Sample:', history.data[0]);
        }
    } catch (e) {
        console.error('Test failed:', e.message);
    }
}

test();
