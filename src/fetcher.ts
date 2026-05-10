import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Sleep helper to avoid API banning
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface TrainSchedule {
  tauId: number;
  trainCode: string; // e.g., SE1, TN2
  stations: Array<{
    stationName: string;
    stationCode: string;
    arrivalTime: string;
    departureTime: string;
  }>;
}

const MAJOR_ROUTES = [
  ['HNO', 'SGO'], ['SGO', 'HNO'], // North-South
  ['HNO', 'HPH'], ['HPH', 'HNO'], // Hanoi - Hai Phong
  ['HNO', 'LCA'], ['LCA', 'HNO'], // Hanoi - Lao Cai
  ['SGO', 'NTR'], ['NTR', 'SGO'], // Saigon - Nha Trang
  ['SGO', 'PTH'], ['PTH', 'SGO'], // Saigon - Phan Thiet
  ['DAD', 'QNH'], ['QNH', 'DAD'], // Da Nang - Quy Nhon
  ['SGO', 'DAD'], ['DAD', 'SGO'], // Saigon - Da Nang
];

/**
 * Fetches all daily trains for a given date by iterating major routes.
 */
async function fetchDailyTrains(dateStr: string) {
  let allTrains: any[] = [];
  
  for (const [gadi, gaden] of MAJOR_ROUTES) {
    const url = `https://k.vnticketonline.vn/api/GTGV/LoadDmTau?maGaDen=${gaden}&maGaDi=${gadi}&ngayDi=${dateStr}`;
    try {
      console.log(`[API] Fetching Route ${gadi} -> ${gaden} for ${dateStr}...`);
      const res = await axios.get(url, { timeout: 10000 });
      if (Array.isArray(res.data)) {
        allTrains = allTrains.concat(res.data.filter((t: any) => t.Id && t.MacTau)); // Using MacTau as code
      }
    } catch(e: any) {
      console.warn(`Error fetching DmTau (timeout or fail): ${url}`);
    }
  }
  
  // Deduplicate fetched trains by Id
  const uniqueTrains = Array.from(new Map(allTrains.map(t => [t.Id, t])).values());
  return uniqueTrains;
}

/**
 * Fetch detailed schedules for a single train.
 */
async function fetchTrainDetails(tauId: number) {
  const url = `https://k.vnticketonline.vn/api/GTGV/LoadOneTau?maGaDi=&tauId=${tauId}`;
  try {
    const res = await axios.get(url, { timeout: 10000 });
    return res.data; 
  } catch(e) {
    return null;
  }
}

/**
 * Merge segments with the same TrainCode.
 */
function mergeTrainSegments(trainCode: string, segments: any[][]): TrainSchedule {
  // Flatten all stops across segments
  const allStops = segments.flat();

  // Deduplicate stops by station code and sort by arrival time
  const uniqueMap = new Map();
  allStops.forEach((stop: any) => {
    // Keep the one with actual valid dates
    if (stop.NgayGioDen && new Date(stop.NgayGioDen).getTime() > 0) {
      if (!uniqueMap.has(stop.MaGa)) {
        uniqueMap.set(stop.MaGa, stop);
      } else {
        // If we already have it, pick the one with a later departure time or something
      }
    }
  });

  const sortedStops = Array.from(uniqueMap.values()).sort((a: any, b: any) => {
    return new Date(a.NgayGioDen || a.NgayGioDi).getTime() - new Date(b.NgayGioDen || b.NgayGioDi).getTime();
  });

  return {
    tauId: Math.random(), // Dummy merged ID
    trainCode: trainCode,
    stations: sortedStops.map(s => ({
      stationName: s.TenGa,
      stationCode: s.MaGa,
      arrivalTime: s.NgayGioDen,
      departureTime: s.NgayGioDi
    }))
  };
}

export async function fetchAllAndCacheSchedules() {
  const dates = [];
  const today = new Date();
  
  // Today, Tomorrow, Day After
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const rawTrainsToFetch: { 
    date: string, tauId: number, code: string,
    maGaDi: string, tenGaDi: string, maGaDen: string, tenGaDen: string,
    ngayDi: string, ngayDen: string 
  }[] = [];

  for (const date of dates) {
    const trains = await fetchDailyTrains(date);
    trains.forEach((t: any) => {
      rawTrainsToFetch.push({ 
        date, 
        tauId: t.Id, 
        code: t.MacTau,
        maGaDi: t.MaGaDi, tenGaDi: t.TenGaDi,
        maGaDen: t.MaGaDen, tenGaDen: t.TenGaDen,
        ngayDi: t.NgayDi.split('T')[0] + 'T' + t.GioDi + ':00',
        ngayDen: t.NgayDen.split('T')[0] + 'T' + t.GioDen + ':00'
      });
    });
    await sleep(200);
  }

  console.log(`Found ${rawTrainsToFetch.length} train instances. Fetching details...`);
  
  const fetchedByCodeAndDate: Record<string, any[][]> = {};

  for (const t of rawTrainsToFetch) {
    let details = await fetchTrainDetails(t.tauId);
    
    let stops: any[] | null = null;
    
    if (details?.LyTrinhs && Array.isArray(details.LyTrinhs) && details.LyTrinhs.length > 0) {
      let currentDateStr = t.ngayDi.split('T')[0];
      stops = details.LyTrinhs.map((l: any) => {
        let depDateStr = l.NgayDi ? l.NgayDi.split('T')[0] : currentDateStr;
        let arrDateStr = depDateStr;

        let [arrH] = l.GioDen.split(':').map(Number);
        let [depH] = l.GioDi.split(':').map(Number);
        
        // If Arrival Hour is much greater than Departure Hour (e.g., Arr 23:45, Dep 00:00), 
        // it means the train arrived the day *prior* to NgayDi.
        if (arrH > depH && (arrH - depH > 12)) {
           const d = new Date(depDateStr);
           d.setDate(d.getDate() - 1);
           arrDateStr = d.toISOString().split('T')[0];
        }

        currentDateStr = depDateStr;

        return {
          MaGa: l.MaGa,
          TenGa: l.TenGa,
          NgayGioDi: `${depDateStr}T${l.GioDi}:00`,
          NgayGioDen: `${arrDateStr}T${l.GioDen}:00`
        };
      });
    } else {
      stops = Array.isArray(details) ? details : (details?.stops || null);
    }

    if (!stops || stops.length === 0) {
      stops = [
        { MaGa: t.maGaDi, TenGa: t.tenGaDi, NgayGioDi: t.ngayDi, NgayGioDen: t.ngayDi },
        { MaGa: t.maGaDen, TenGa: t.tenGaDen, NgayGioDi: t.ngayDen, NgayGioDen: t.ngayDen }
      ];
    }

    const cacheKey = `${t.date}_${t.code}`;
    if (!fetchedByCodeAndDate[cacheKey]) {
      fetchedByCodeAndDate[cacheKey] = [];
    }
    
    fetchedByCodeAndDate[cacheKey].push(stops);
    
    await sleep(50); // Be nice to the API
  }

  console.log(`Deduplicating and merging segments...`);
  const finalizedSchedules: TrainSchedule[] = [];
  
  for (const [key, segments] of Object.entries(fetchedByCodeAndDate)) {
    const code = key.split('_')[1];
    if (segments.flat().length === 0) continue;
    
    const merged = mergeTrainSegments(code, segments);
    finalizedSchedules.push(merged);
  }

  const outPath = path.join(__dirname, '..', 'current_schedules.json');
  fs.writeFileSync(outPath, JSON.stringify(finalizedSchedules, null, 2));
  console.log(`Saved ${finalizedSchedules.length} complete train journeys to schedules cache.`);
}
