import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('Fetching physical tracks from Overpass API (this may take a bit)...');
  const query = `
    [out:json][timeout:300];
    area["ISO3166-1"="VN"][admin_level=2]->.searchArea;
    way["railway"="rail"](area.searchArea);
    out geom;
  `;
  try {
    const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
      headers: { 'Content-Type': 'text/plain' }
    });
    const elements = response.data.elements;
    
    const features = [];
    for (const el of elements) {
      if (el.type === 'way' && el.geometry) {
        const coords = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
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
    
    const outPath = path.join(__dirname, '..', 'vietnam_railways.geojson');
    fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2));
    console.log(`Generated GeoJSON at ${outPath} with ${features.length} track segments.`);
  } catch (err: any) {
    console.error('Failed to generate GeoJSON:', err.message);
  }
}

run();
