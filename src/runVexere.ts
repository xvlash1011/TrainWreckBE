/**
 * Run the VeXeRe scraper standalone.
 * 
 * Usage:
 *   npm run vexere                                     # Default: today + 2 days
 *   npm run vexere -- --date=2026-05-12                # Specific date
 *   npm run vexere -- --date=2026-05-12,2026-05-13     # Multiple dates
 */

import { scrapeVexere } from './vexereScraper';

const args = process.argv.slice(2);
const dateArg = args.find(a => a.startsWith('--date='));
const customDates = dateArg ? dateArg.split('=')[1].split(',') : undefined;

console.log('🚀 Starting VeXeRe Train Scraper Bot...');
if (customDates) console.log(`   Dates: ${customDates.join(', ')}`);

scrapeVexere(customDates)
  .then(schedules => {
    console.log(`\n✅ Done! Scraped ${schedules.length} train schedules.`);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Scraper failed:', err);
    process.exit(1);
  });
