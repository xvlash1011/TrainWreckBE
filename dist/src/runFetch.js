"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fetcher_1 = require("./fetcher");
(0, fetcher_1.fetchAllAndCacheSchedules)().then(() => console.log('Done.')).catch(console.error);
