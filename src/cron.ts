import cron from 'node-cron';
import { fetchAllAndCacheSchedules } from './fetcher';

// Run at 23:59 GMT+7 every night
cron.schedule('59 23 * * *', async () => {
    console.log('[Cron] Fetching tomorrow and day after schedules at 23:59 GMT+7...');
    await fetchAllAndCacheSchedules();
}, {
    timezone: 'Asia/Ho_Chi_Minh'
});

// Always fetch on startup to ensure fresh data in production environments
// (file-based cache is NOT reliable across deploys/restarts on Railway)
console.log('[Init] Server starting — fetching latest schedules from API...');
fetchAllAndCacheSchedules()
    .then(() => console.log('[Init] Schedule bootstrap complete.'))
    .catch((err) => console.error('[Init] Schedule bootstrap FAILED:', err));
