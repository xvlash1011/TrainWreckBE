import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { resolveTrainConflicts } from './yieldEngine';

// Import cron to ensure it runs
import './cron';

const app = express();
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.get('/api/stations', (req, res) => {
    const p = path.join(__dirname, '..', 'stations_hydrated.json');
    if (!fs.existsSync(p)) return res.status(404).json({ error: "Hydrated stations missing. Run hydrateStations script." });
    res.json(JSON.parse(fs.readFileSync(p, 'utf8')));
});

app.get('/api/tracks', (req, res) => {
    const p = path.join(__dirname, '..', 'vietnam_railways.geojson');
    if (!fs.existsSync(p)) return res.status(404).json({ error: "Tracks geojson missing. Run generateGeoJSON script." });
    res.json(JSON.parse(fs.readFileSync(p, 'utf8')));
});

app.get('/api/schedule', (req, res) => {
    const p = path.join(__dirname, '..', 'current_schedules.json');
    if (!fs.existsSync(p)) return res.status(503).json({ error: "Schedules fetching in progress." });

    let rawSchedules = [];
    try {
        const text = fs.readFileSync(p, 'utf8');
        if (!text.trim()) throw new Error("Empty file");
        rawSchedules = JSON.parse(text);
    } catch (err) {
        return res.status(503).json({ error: "Schedules fetching in progress or empty file." });
    }
    // Apply real-time 10-minute collision/yield algorithm
    const conflictFree = resolveTrainConflicts(rawSchedules);

    res.json(conflictFree);
});

const port = process.env.PORT || 3001;
const host = '0.0.0.0';
app.listen(Number(port), host, () => {
    console.log(`Backend Server running on http://${host}:${port}`);
    console.log(`Local network access at http://100.74.23.86:${port}`);
});
