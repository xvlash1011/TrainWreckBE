import axios from 'axios';
import fs from 'fs';
import path from 'path';

const FALLBACK_COORDS: Record<string, [number, number]> = {
  // Add some fallback coordinates for known major stations if overpass fails
  "SGO": [10.7818, 106.6775], // Saigon
  "HNO": [21.0245, 105.8412], // Hanoi
  "DAD": [16.0355, 108.2045], // Da Nang
};

async function run() {
  console.log('Hydrating stations with coordinates...');
  try {
    const apiReq = await axios.get("https://k.vnticketonline.vn/api/GTGV/LoadDmGa");
    const vnStations = apiReq.data;

    const query = `
      [out:json];
      area["ISO3166-1"="VN"][admin_level=2]->.searchArea;
      node["railway"="station"](area.searchArea);
      out geom;
    `;
    const overpassReq = await axios.post("https://overpass-api.de/api/interpreter", query, {
      headers: { 'Content-Type': 'text/plain' }
    });
    const overpassNodes = overpassReq.data.elements.filter((e: any) => e.type === 'node');

    const normalize = (s: string) => s.toLowerCase().replace(/ga\s+/gi, '').replace(/-/g, '').trim();

    const hydrated = vnStations.map((station: any) => {
      const apiName = normalize(station.TenGa);
      // Try Overpass Match
      const match = overpassNodes.find((n: any) => {
        const name = n.tags?.name ? normalize(n.tags.name) : '';
        const enName = n.tags?.['name:en'] ? normalize(n.tags['name:en']) : '';
        return name === apiName || enName === apiName;
      });

      if (match) {
        return { ...station, lat: match.lat, lon: match.lon, source: 'overpass' };
      }

      // Try Fallback Dictionary
      if (FALLBACK_COORDS[station.MaGa]) {
        return { 
          ...station, 
          lat: FALLBACK_COORDS[station.MaGa][0], 
          lon: FALLBACK_COORDS[station.MaGa][1], 
          source: 'fallback' 
        };
      }

      // Missing
      return { ...station, lat: null, lon: null, source: 'missing' };
    });

    const outPath = path.join(__dirname, '..', 'stations_hydrated.json');
    fs.writeFileSync(outPath, JSON.stringify(hydrated, null, 2));
    
    const missingCount = hydrated.filter((h: any) => !h.lat).length;
    console.log(`Successfully hydrated stations. Saved to ${outPath}. Missing coordinates for ${missingCount} minor stations.`);
  } catch (err: any) {
    console.error('Failed to hydrate stations:', err.message);
  }
}

run();
