"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function run() {
    console.log('Fetching physical tracks from Overpass API (this may take a bit)...');
    const query = `
    [out:json][timeout:300];
    area["ISO3166-1"="VN"][admin_level=2]->.searchArea;
    way["railway"="rail"](area.searchArea);
    out geom;
  `;
    try {
        const response = await axios_1.default.post('https://overpass-api.de/api/interpreter', query, {
            headers: { 'Content-Type': 'text/plain' }
        });
        const elements = response.data.elements;
        const features = [];
        for (const el of elements) {
            if (el.type === 'way' && el.geometry) {
                const coords = el.geometry.map((pt) => [pt.lon, pt.lat]);
                features.push({
                    type: 'Feature',
                    properties: {
                        id: el.id,
                        name: el.tags?.name || 'Unknown Track',
                        usage: el.tags?.usage || '',
                        gauge: el.tags?.gauge || ''
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: coords
                    }
                });
            }
        }
        const geojson = {
            type: 'FeatureCollection',
            features
        };
        const outPath = path_1.default.join(process.cwd(), 'vietnam_railways.geojson');
        fs_1.default.writeFileSync(outPath, JSON.stringify(geojson, null, 2));
        console.log(`Generated GeoJSON at ${outPath} with ${features.length} track segments.`);
    }
    catch (err) {
        console.error('Failed to generate GeoJSON:', err.message);
    }
}
run();
