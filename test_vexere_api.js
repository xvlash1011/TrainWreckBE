/**
 * Navigate to actual VeXeRe train search result page to capture the auth token
 * used for the internal-vroute-cmc API.
 * 
 * Correct URL format found: https://vexere.com/vn/ve-tau-hoa/tu-{from}-di-{to}.{fromId}.{toId}.vi
 */
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

(async () => {
  console.log('🚀 Launching browser...\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );
  
  let capturedToken = null;
  let capturedApiResponse = null;
  const allAuthHeaders = [];
  
  // Intercept requests to find auth token
  page.on('request', (req) => {
    const url = req.url();
    const headers = req.headers();
    
    if (headers['authorization'] && headers['authorization'] !== 'Bearer') {
      const token = headers['authorization'];
      console.log(`🔑 AUTH on: ${url.substring(0, 100)}`);
      console.log(`   Token: ${token.substring(0, 80)}...`);
      allAuthHeaders.push({ url, token });
      
      if (url.includes('vroute') || url.includes('route/train')) {
        capturedToken = token;
        console.log(`   ✅ THIS IS THE VROUTE TOKEN!`);
      }
    }
  });
  
  // Also capture API responses
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('internal-vroute-cmc') && url.includes('route/train')) {
      try {
        const json = await res.json();
        capturedApiResponse = json;
        console.log(`\n📦 CAPTURED API RESPONSE from: ${url.substring(0, 100)}`);
        console.log(`   Data size: ${JSON.stringify(json).length} bytes`);
      } catch (e) {
        console.log(`   Response not JSON: ${e.message}`);
      }
    }
  });
  
  // Navigate to actual train search URL 
  // Format: /vn/ve-tau-hoa/tu-{from}-di-{to}.{fromId}.{toId}.vi
  const searchUrl = 'https://vexere.com/vn/ve-tau-hoa/tu-nha-trang-khanh-hoa-di-ho-chi-minh.417.29.vi';
  console.log(`📄 Navigating to: ${searchUrl}\n`);
  
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log(`\n   Title: ${await page.title()}`);
    console.log(`   URL: ${page.url()}`);
  } catch (e) {
    console.log(`   Error: ${e.message}`);
  }
  
  // Wait for dynamic content
  await new Promise(r => setTimeout(r, 5000));
  
  // Scroll to trigger lazy loading
  await page.evaluate(() => window.scrollBy(0, 1000));
  await new Promise(r => setTimeout(r, 3000));
  
  // Check page content for train results
  const pageInfo = await page.evaluate(() => {
    const body = document.body.innerText;
    // Look for train codes
    const trainCodes = body.match(/SE\d+|TN\d+|SNT\d+|SPT\d+/g) || [];
    // Look for times
    const times = body.match(/\d{2}:\d{2}/g) || [];
    return {
      bodyLength: body.length,
      trainCodes: [...new Set(trainCodes)],
      timesSample: times.slice(0, 10),
      bodyPreview: body.substring(0, 500),
    };
  });
  
  console.log(`\n📄 Page content analysis:`);
  console.log(`   Body length: ${pageInfo.bodyLength} chars`);
  console.log(`   Train codes found: ${pageInfo.trainCodes.join(', ') || 'none'}`);
  console.log(`   Times found: ${pageInfo.timesSample.join(', ') || 'none'}`);
  console.log(`   Body preview: ${pageInfo.bodyPreview.substring(0, 200)}...`);
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log('RESULTS');
  console.log(`${'═'.repeat(60)}`);
  console.log(`\nTotal auth headers captured: ${allAuthHeaders.length}`);
  
  for (const ah of allAuthHeaders) {
    console.log(`\n  URL: ${ah.url.substring(0, 120)}`);
    console.log(`  Token: ${ah.token.substring(0, 100)}`);
  }
  
  if (capturedToken) {
    console.log(`\n\n✅ VROUTE API Token: ${capturedToken}`);
    
    // Save token for reuse
    fs.writeFileSync('vexere_token.txt', capturedToken);
    console.log('💾 Token saved to vexere_token.txt');
    
    // Test with different routes
    console.log('\n🧪 Testing token with multiple routes...\n');
    
    const routes = [
      ['NTR', 'SGO', 'Nha Trang → Sài Gòn'],
      ['SGO', 'NTR', 'Sài Gòn → Nha Trang'],
      ['HNO', 'SGO', 'Hà Nội → Sài Gòn'],
    ];
    
    for (const [from, to, label] of routes) {
      try {
        const res = await axios.get('https://internal-vroute-cmc.vexere.com/v2/route/train', {
          params: {
            'filter[from][0]': from,
            'filter[to][0]': to,
            'filter[date]': '2026-05-12',
            'filter[quantity]': '1',
            'filter[page]': '1',
            'page': '1',
            'sort': 'fare:asc',
          },
          headers: {
            'Authorization': capturedToken,
            'Origin': 'https://vexere.com',
            'Referer': 'https://vexere.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          timeout: 10000,
          validateStatus: () => true,
        });
        
        console.log(`  ${label}: HTTP ${res.status}`);
        if (res.status === 200) {
          const items = res.data?.data?.length || '?';
          console.log(`    ✅ ${items} items received`);
          console.log(`    Preview: ${JSON.stringify(res.data).substring(0, 300)}...`);
          
          // Save full response for first successful route
          if (!fs.existsSync('vexere_test_response.json')) {
            fs.writeFileSync('vexere_test_response.json', JSON.stringify(res.data, null, 2));
            console.log('    💾 Saved to vexere_test_response.json');
          }
        }
      } catch (e) {
        console.log(`  ${label}: Error - ${e.message}`);
      }
    }
  } else if (capturedApiResponse) {
    console.log('\n✅ Got API response via page intercept (no direct token needed):');
    fs.writeFileSync('vexere_test_response.json', JSON.stringify(capturedApiResponse, null, 2));
    console.log('💾 Saved to vexere_test_response.json');
    console.log(`Preview: ${JSON.stringify(capturedApiResponse).substring(0, 500)}...`);
  } else {
    console.log('\n❌ No token or API response captured.');
  }
  
  await browser.close();
  console.log('\n✅ Done.');
})();
