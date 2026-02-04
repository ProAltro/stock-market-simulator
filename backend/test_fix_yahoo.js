
import dotenv from 'dotenv';
dotenv.config();

import { getHistory } from './src/services/market/yahooAdapter.js';

async function test() {
    console.log('Testing Yahoo Intraday Fix...');
    const symbol = 'ADANIPOWER.NS'; 
    
    // Simulate what frontend sends exactly
    const interval = '5m';
    const range = '1d'; // Typical day view
    
    console.log(`Request: ${symbol} | Interval: ${interval} | Range: ${range}`);

    try {
        const history = await getHistory(symbol, { interval, range });
        
        console.log('Returned Interval:', history.interval); // Should be '1day' or '5m'? Input interval is returned usually.
        console.log('Data Length:', history.data.length);
        
        if (history.data.length > 0) {
            const first = history.data[0];
            const second = history.data[1];
            
            console.log('First Point:', first);
            
            // Check Time Format
            const isUnix = typeof first.time === 'number';
            console.log('Time is Unix Timestamp (Number)?', isUnix);
            
            if (isUnix) {
                console.log('SUCCESS: Intraday format detected.');
                if (second) {
                   const diff = second.time - first.time;
                   console.log(`Gap: ${diff}s`);
                   if (diff === 300) console.log('SUCCESS: 5-minute gap verified.');
                }
            } else {
                console.error('FAILURE: Time is string (Daily format detected instead of Intraday). Bug persists.');
            }
        } else {
            console.warn('WARNING: No data returned.');
        }

    } catch (e) {
        console.error('Test failed:', e.message);
    }
}

test();
