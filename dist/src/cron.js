"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const fetcher_1 = require("./fetcher");
// Run at 23:59 GMT+7 every night
node_cron_1.default.schedule('59 23 * * *', async () => {
    console.log('[Cron] Fetching tomorrow and day after schedules at 23:59 GMT+7...');
    await (0, fetcher_1.fetchAllAndCacheSchedules)();
}, {
    timezone: 'Asia/Ho_Chi_Minh'
});
// Run once on startup if the cache is missing
const fs = require('fs');
const path = require('path');
const cachePath = path.join(process.cwd(), 'current_schedules.json');
if (!fs.existsSync(cachePath)) {
    console.log('[Init] No schedule cache found. Bootstrapping data...');
    (0, fetcher_1.fetchAllAndCacheSchedules)();
}
