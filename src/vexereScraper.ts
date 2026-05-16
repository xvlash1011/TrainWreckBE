import puppeteer from 'puppeteer';
import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import type { TrainSchedule } from './fetcher';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── VeXeRe route configuration ──────────────────────────────────────────────
// URL format: /vn/ve-tau-hoa/tu-{from-slug}-di-{to-slug}.{fromId}.{toId}.vi
// We only need ONE page visit to capture the JWT token, then use axios for the rest.

const VEXERE_API = 'https://internal-vroute-cmc.vexere.com/v2/route/train';

// The token capture page (any valid VeXeRe train search page works)
const TOKEN_CAPTURE_URL = 'https://vexere.com/vn/ve-tau-hoa/tu-nha-trang-khanh-hoa-di-ho-chi-minh.417.29.vi';

// All major route pairs to scrape (using VeXeRe station codes - same as DSVN)
const ROUTES: [string, string][] = [
  ['HNO', 'SGO'], ['SGO', 'HNO'], // Hà Nội ↔ Sài Gòn
  ['HNO', 'HPH'], ['HPH', 'HNO'], // Hà Nội ↔ Hải Phòng
  ['HNO', 'LCA'], ['LCA', 'HNO'], // Hà Nội ↔ Lào Cai
  ['SGO', 'NTR'], ['NTR', 'SGO'], // Sài Gòn ↔ Nha Trang
  ['SGO', 'PTH'], ['PTH', 'SGO'], // Sài Gòn ↔ Phan Thiết
  ['DNA', 'QNH'], ['QNH', 'DNA'], // Đà Nẵng ↔ Quy Nhơn
  ['SGO', 'DNA'], ['DNA', 'SGO'], // Sài Gòn ↔ Đà Nẵng
  ['HNO', 'DNA'], ['DNA', 'HNO'], // Hà Nội ↔ Đà Nẵng
  ['HNO', 'HUE'], ['HUE', 'HNO'], // Hà Nội ↔ Huế
  ['HNO', 'VIN'], ['VIN', 'HNO'], // Hà Nội ↔ Vinh
  ['HNO', 'THO'], ['THO', 'HNO'], // Hà Nội ↔ Thanh Hóa
];

// ─── Token Management ─────────────────────────────────────────────────────────
const TOKEN_FILE = path.join(process.cwd(), 'vexere_token.txt');

/**
 * Load cached token from file if it exists and is valid.
 */
function loadCachedToken(): string | null {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      if (token.startsWith('Bearer ') && token.length > 50) {
        // Check JWT expiry
        const payload = token.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp > now) {
          console.log(`[Token] Loaded cached token (expires: ${new Date(decoded.exp * 1000).toISOString()})`);
          return token;
        }
        console.log('[Token] Cached token expired, will refresh.');
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

/**
 * Use Puppeteer to capture a fresh JWT token from VeXeRe.
 * Only needs to load ONE page, then all subsequent calls use axios.
 */
async function captureToken(): Promise<string> {
  console.log('[Token] Launching Puppeteer to capture fresh JWT token...');
  
  const browser = await puppeteer.launch({
    headless: 'new' as any,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );
    
    let token: string | null = null;
    
    // Intercept requests to capture the Authorization header
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const headers = req.headers();
      if (headers['authorization'] && headers['authorization'] !== 'Bearer' &&
          req.url().includes('internal-vroute-cmc')) {
        token = headers['authorization'];
      }
      req.continue();
    });
    
    // Navigate to train search page (triggers the API call with auth token)
    await page.goto(TOKEN_CAPTURE_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    
    // Wait for API call to fire
    await sleep(3000);
    
    if (!token) {
      throw new Error('Failed to capture auth token from VeXeRe page');
    }
    
    // Save token for reuse
    fs.writeFileSync(TOKEN_FILE, token);
    console.log(`[Token] ✅ Captured and cached new token`);
    
    return token;
  } finally {
    await browser.close();
  }
}

/**
 * Get a valid token (from cache or fresh capture).
 */
async function getToken(): Promise<string> {
  const cached = loadCachedToken();
  if (cached) return cached;
  return captureToken();
}

// ─── API Client ───────────────────────────────────────────────────────────────

function createApiClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: VEXERE_API,
    timeout: 15000,
    headers: {
      'Authorization': token,
      'Origin': 'https://vexere.com',
      'Referer': 'https://vexere.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9',
    },
  });
}

interface VexereRouteData {
  from: string;
  to: string;
  date: string;
  trains: any[];
}

/**
 * Fetch train data for a single route and date.
 */
async function fetchRoute(
  client: AxiosInstance, from: string, to: string, date: string
): Promise<VexereRouteData> {
  const params = {
    'filter[from][0]': from,
    'filter[to][0]': to,
    'filter[date]': date,
    'filter[quantity]': '1',
    'filter[page]': '1',
    'page': '1',
    'sort': 'fare:asc',
  };
  
  const res = await client.get('', { params, validateStatus: () => true });
  
  if (res.status === 200 && res.data?.data) {
    return {
      from, to, date,
      trains: Array.isArray(res.data.data) ? res.data.data : [res.data.data],
    };
  }
  
  if (res.status === 401) {
    throw new Error('TOKEN_EXPIRED');
  }
  
  return { from, to, date, trains: [] };
}

// ─── Data Parsing ─────────────────────────────────────────────────────────────

/**
 * Convert VeXeRe API response to our TrainSchedule format.
 * VeXeRe data includes: train_number, departure_time, arrival_time, 
 * pickup_time, dropoff_time, route info, seat/pricing data.
 */
function parseToSchedules(routeData: VexereRouteData[]): TrainSchedule[] {
  // Group by train code + departure date to merge segments
  const trainMap = new Map<string, {
    trainCode: string;
    tauId: number;
    from: string;
    to: string;
    departureTime: string;
    arrivalTime: string;
    duration: number;
    seatsAvailable: number;
    rawData: any;
  }>();
  
  for (const route of routeData) {
    for (const item of route.trains) {
      const segments = item.segments || item.route?.schedules || [];
      const trainCode = segments[0]?.train_number || 
                       item.idIndex?.split('|')[1] || '';
      
      if (!trainCode) continue;
      
      const depDate = item.date || route.date;
      const key = `${trainCode}-${depDate}`;
      
      // Build departure/arrival ISO strings from the data
      const pickupTime = segments[0]?.pickup_time || item.time || '';
      const dropoffTime = segments[0]?.dropoff_time || '';
      const pickupDate = segments[0]?.pickup_date || depDate;
      const dropoffDate = segments[0]?.dropoff_date || depDate;
      
      const departureISO = pickupTime ? `${pickupDate}T${pickupTime}:00` : '';
      const arrivalISO = dropoffTime ? `${dropoffDate}T${dropoffTime}:00` : '';
      
      if (!trainMap.has(key)) {
        trainMap.set(key, {
          trainCode,
          tauId: item.train_id || item.hanh_trinh_id || hashCode(key),
          from: route.from,
          to: route.to,
          departureTime: departureISO,
          arrivalTime: arrivalISO,
          duration: item.duration || segments[0]?.duration || 0,
          seatsAvailable: item.seat_available || segments[0]?.total_available_seats || 0,
          rawData: item,
        });
      }
    }
  }
  
  // Convert to TrainSchedule format
  const schedules: TrainSchedule[] = [];
  
  for (const [_, train] of trainMap) {
    const stations: TrainSchedule['stations'] = [];
    
    // VeXeRe only gives us origin/destination for each route segment
    // Create two-stop schedule (from → to)
    if (train.departureTime) {
      stations.push({
        stationName: getStationName(train.from),
        stationCode: train.from,
        arrivalTime: train.departureTime,
        departureTime: train.departureTime,
      });
    }
    
    if (train.arrivalTime) {
      stations.push({
        stationName: getStationName(train.to),
        stationCode: train.to,
        arrivalTime: train.arrivalTime,
        departureTime: train.arrivalTime,
      });
    }
    
    if (stations.length >= 2) {
      schedules.push({
        tauId: train.tauId,
        trainCode: train.trainCode,
        stations,
      });
    }
  }
  
  return schedules;
}

const STATION_NAMES: Record<string, string> = {
  'SGO': 'Sài Gòn', 'HNO': 'Hà Nội', 'NTR': 'Nha Trang',
  'DNA': 'Đà Nẵng', 'HUE': 'Huế', 'HPH': 'Hải Phòng',
  'LCA': 'Lào Cai', 'PTH': 'Phan Thiết', 'VIN': 'Vinh',
  'THO': 'Thanh Hóa', 'QNH': 'Quy Nhơn', 'DTR': 'Diêu Trì',
  'DHO': 'Đồng Hới', 'DHA': 'Đông Hà', 'QNG': 'Quảng Ngãi',
};

function getStationName(code: string): string {
  return STATION_NAMES[code] || code;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ─── Main Scraper ─────────────────────────────────────────────────────────────

export async function scrapeVexere(dates?: string[]): Promise<TrainSchedule[]> {
  if (!dates) {
    dates = [];
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🚂 VeXeRe Train Scraper Bot`);
  console.log(`  📅 Dates: ${dates.join(', ')}`);
  console.log(`  🛤️  Routes: ${ROUTES.length} pairs`);
  console.log(`  📊 Total API calls: ${dates.length * ROUTES.length}`);
  console.log(`${'═'.repeat(60)}\n`);
  
  // Step 1: Get auth token
  let token = await getToken();
  const client = createApiClient(token);
  
  // Step 2: Fetch all routes
  const allRouteData: VexereRouteData[] = [];
  let successCount = 0;
  let failCount = 0;
  let tokenRefreshed = false;
  
  for (const date of dates) {
    console.log(`\n📅 ${date}`);
    
    for (const [from, to] of ROUTES) {
      process.stdout.write(`  ${from} → ${to}... `);
      
      try {
        const data = await fetchRoute(client, from, to, date);
        
        if (data.trains.length > 0) {
          allRouteData.push(data);
          console.log(`✅ ${data.trains.length} trains`);
          successCount++;
        } else {
          console.log(`⊘ no trains`);
        }
      } catch (e: any) {
        if (e.message === 'TOKEN_EXPIRED' && !tokenRefreshed) {
          console.log(`🔄 Token expired, refreshing...`);
          token = await captureToken();
          client.defaults.headers['Authorization'] = token;
          tokenRefreshed = true;
          
          // Retry this route
          try {
            const data = await fetchRoute(client, from, to, date);
            if (data.trains.length > 0) {
              allRouteData.push(data);
              console.log(`✅ ${data.trains.length} trains (after refresh)`);
              successCount++;
            } else {
              console.log(`⊘ no trains`);
            }
          } catch {
            console.log(`❌ failed even after token refresh`);
            failCount++;
          }
        } else {
          console.log(`❌ ${e.message?.substring(0, 50)}`);
          failCount++;
        }
      }
      
      // Rate limiting
      await sleep(300 + Math.random() * 200);
    }
  }
  
  // Step 3: Save raw data
  const rawPath = path.join(process.cwd(), 'vexere_raw_data.json');
  fs.writeFileSync(rawPath, JSON.stringify(allRouteData, null, 2));
  
  // Step 4: Parse to TrainSchedule format
  const schedules = parseToSchedules(allRouteData);
  
  const schedulePath = path.join(process.cwd(), 'vexere_schedules.json');
  fs.writeFileSync(schedulePath, JSON.stringify(schedules, null, 2));
  
  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📊 Results`);
  console.log(`  ✅ Successful routes: ${successCount}`);
  console.log(`  ❌ Failed routes: ${failCount}`);
  console.log(`  🚂 Unique trains: ${schedules.length}`);
  console.log(`  💾 Raw data: ${rawPath}`);
  console.log(`  💾 Schedules: ${schedulePath}`);
  console.log(`${'═'.repeat(60)}\n`);
  
  return schedules;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const dateArg = args.find(a => a.startsWith('--date='));
  const customDates = dateArg ? dateArg.split('=')[1].split(',') : undefined;
  
  scrapeVexere(customDates)
    .then(s => { console.log(`✅ Done! ${s.length} trains scraped.`); process.exit(0); })
    .catch(e => { console.error('❌ Failed:', e); process.exit(1); });
}
