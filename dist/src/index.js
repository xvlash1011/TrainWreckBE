"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const yieldEngine_1 = require("./yieldEngine");
// Import cron to ensure it runs
require("./cron");
const app = (0, express_1.default)();
// Configure CORS to allow requests from FRONTEND_URL
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.get('/api/stations', (req, res) => {
    const p = path_1.default.join(process.cwd(), 'stations_hydrated.json');
    if (!fs_1.default.existsSync(p))
        return res.status(404).json({ error: "Hydrated stations missing. Run hydrateStations script." });
    res.json(JSON.parse(fs_1.default.readFileSync(p, 'utf8')));
});
app.get('/api/tracks', (req, res) => {
    const p = path_1.default.join(process.cwd(), 'vietnam_railways.geojson');
    if (!fs_1.default.existsSync(p))
        return res.status(404).json({ error: "Tracks geojson missing. Run generateGeoJSON script." });
    res.json(JSON.parse(fs_1.default.readFileSync(p, 'utf8')));
});
app.get('/api/schedule', (req, res) => {
    const p = path_1.default.join(process.cwd(), 'current_schedules.json');
    if (!fs_1.default.existsSync(p))
        return res.status(503).json({ error: "Schedules fetching in progress." });
    let rawSchedules = [];
    try {
        const text = fs_1.default.readFileSync(p, 'utf8');
        if (!text.trim())
            throw new Error("Empty file");
        rawSchedules = JSON.parse(text);
    }
    catch (err) {
        return res.status(503).json({ error: "Schedules fetching in progress or empty file." });
    }
    // Apply real-time 10-minute collision/yield algorithm
    const conflictFree = (0, yieldEngine_1.resolveTrainConflicts)(rawSchedules);
    res.json(conflictFree);
});
const port = process.env.PORT || 3001;
const host = '0.0.0.0';
app.listen(Number(port), host, () => {
    console.log(`Backend Server running on http://${host}:${port}`);
});
