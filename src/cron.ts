import cron from 'node-cron';
import { fetchAllAndCacheSchedules } from './fetcher';

// Run at 23:59 GMT+7 every night
cron.schedule('59 23 * * *', async () => {
    console.log('[Cron] Fetching tomorrow and day after schedules at 23:59 GMT+7...');
    await fetchAllAndCacheSchedules();
}, {
    timezone: 'Asia/Ho_Chi_Minh'
});

// Run once on startup if the cache is missing
const fs = require('fs');
const path = require('path');
const cachePath = path.join(process.cwd(), 'current_schedules.json');

if (!fs.existsSync(cachePath)) {
    console.log('[Init] No schedule cache found. Bootstrapping data...');
    fetchAllAndCacheSchedules();
}
