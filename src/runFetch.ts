import { fetchAllAndCacheSchedules } from './fetcher';

fetchAllAndCacheSchedules().then(() => console.log('Done.')).catch(console.error);
