// e2e: import real Pay Ledger backup via the History button. Usage: node test/plimport-e2e.mjs [url] [backup.json]
import { createRequire } from 'node:module';
const req = createRequire('/workspace/tools/package.json'); const { chromium } = req('playwright-core');
const URL_ = process.argv[2] || 'http://localhost:8765/shift-clock/';
const FILE = process.argv[3] || '/workspace/pay-ledger-recovery/pay-ledger-backup-2026-10-14.json';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: 'Australia/Brisbane' });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
await page.goto(URL_, { waitUntil: 'networkidle' });
// pre-existing data: one shift duplicating 2026-10-14 05:00, one unrelated (must survive)
await page.evaluate(() => { const P = window.__shiftClock.P; localStorage.setItem('shiftclock.v1', JSON.stringify({ settings: { baseRate: 41.21 }, shifts: [
  { id: 'mine', start: P.bneFromLocal('2026-10-14', '05:00'), end: P.bneFromLocal('2026-10-14', '13:40'), breaks: [], meal: false, note: 'mine' },
  { id: 'keep', start: P.bneFromLocal('2026-10-16', '05:00'), end: P.bneFromLocal('2026-10-16', '15:00'), breaks: [], meal: true, note: '' }] })); });
await page.reload({ waitUntil: 'networkidle' });
await page.click('nav [data-v=hist]');
const fc = page.waitForEvent('filechooser'); await page.click('#impPL'); (await fc).setFiles(FILE);
await page.waitForFunction(() => window.__shiftClock.state.shifts.length > 2 || false, null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(500);
console.log('PREVIEW:\n' + dialogs[0]);
const s = await page.evaluate(() => { const st = window.__shiftClock.state, P = window.__shiftClock.P;
  return { n: st.shifts.length, pl: st.shifts.filter(x => x.src === 'pay-ledger').length, keep: !!st.shifts.find(x => x.id === 'keep'), mine: st.shifts.find(x => x.id === 'mine')?.note,
    hrs: st.shifts.filter(x => x.src === 'pay-ledger').reduce((t, x) => t + P.paidHours(x), 0),
    first: st.shifts.filter(x => x.src === 'pay-ledger').map(x => [P.toLocalInput(x.start), P.toLocalInput(x.end), P.paidHours(x), x.meal])[0] }; });
console.log(JSON.stringify(s));
ok(s.pl === 18 && s.keep && s.mine === 'mine' && s.n === 20, '18 imported, 1 duplicate skipped, existing kept');
ok(Math.abs(s.hrs - (192.08 - 8.25)) < 0.05, 'paid hours match Pay Ledger ' + s.hrs.toFixed(2));
// re-import: nothing new
dialogs.length = 0; const fc2 = page.waitForEvent('filechooser'); await page.click('#impPL'); (await fc2).setFiles(FILE); await page.waitForTimeout(800);
ok(/Nothing new/.test(dialogs[0] || '') && (await page.evaluate(() => window.__shiftClock.state.shifts.length)) === 20, 're-import is a no-op: ' + dialogs[0]);
await page.click('nav [data-v=week]'); await page.click('#wPrev'); await page.screenshot({ path: '/workspace/out/plimport-week.png' });
ok(!errs.length, 'no page errors ' + errs.join('; '));
await b.close(); process.exit(fails ? 1 : 0);
