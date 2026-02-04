
import dotenv from 'dotenv';
dotenv.config();

import { getHistory } from './src/services/market/yahooAdapter.js';

async function test() {
    console.log('Testing Extended History...');
    try {
        // Request 1 month of daily data
        // Standard 1mo ~ 22 trading days
        // We expect much more now (1 year ~ 250 days)
        const history = await getHistory('AAPL', { interval: '1day', range: '1mo' });
        
        console.log('Requested Range: 1mo');
        console.log('Data returned (count):', history.data.length);
        
        if (history.data.length > 0) {
            console.log('First Date:', history.data[0].time);
            console.log('Last Date:', history.data[history.data.length - 1].time);
        }
        
        if (history.data.length > 100) {
            console.log('SUCCESS: Data buffer is present (>100 points for 1mo request)');
        } else {
            console.warn('WARNING: Data buffer might be insufficient');
        }

    } catch (e) {
        console.error('Test failed:', e.message);
    }
}

test();
