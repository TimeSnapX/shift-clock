// Headless mobile (Pixel-class 412×915) e2e test. Usage: node test/e2e.mjs [url]
import { createRequire } from 'node:module';
const req = createRequire('/workspace/tools/package.json'); const { chromium } = req('playwright-core');
const URL_ = process.argv[2] || 'http://localhost:8765/shift-clock/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, timezoneId: 'Australia/Brisbane',
  userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36' });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
await page.goto(URL_, { waitUntil: 'networkidle' });
// in-browser pay maths
const r = await page.evaluate(() => { const P = window.__shiftClock.P; const p = P.shiftPay(10);
  const ws = P.bneFromLocal('2026-09-28'); const mk = d => ({ id: d, start: P.bneFromLocal(d, '05:00'), end: P.bneFromLocal(d, '16:15'), breaks: [], meal: true });
  return { p, w: P.weekSummary([mk('2026-09-28'), mk('2026-09-29')], ws) }; });
ok(r.p.gross === 446.39, `10 h shift gross ${r.p.gross} = 313.20 + 105.50 + 27.69`);
ok(r.w.gross === 1065.86 && r.w.net === 949.16, `payslip week gross ${r.w.gross} net ${r.w.net} (tax ${r.w.tax}, ${r.w.table})`);
// seed an in-progress 9 h shift with a 30 min break, and a past shift
await page.evaluate(() => { const now = Date.now(), H = 3600e3;
  localStorage.setItem('shiftclock.v1', JSON.stringify({ settings: {}, shifts: [
    { id: 'past', start: now - 50 * H, end: now - 40 * H, breaks: [], meal: true, note: '' },
    { id: 'cur', start: now - 9.5 * H, end: null, breaks: [{ start: now - 5 * H, end: now - 4.5 * H }], meal: true, note: '' }] })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
ok(/^9:0\d:\d\d$/.test(await page.textContent('#timer')), 'live timer shows 9 h paid: ' + await page.textContent('#timer'));
ok((await page.getAttribute('#t1', 'class')).includes('on'), 'tier indicator on 1.5x');
ok(/2x in 0:3/.test(await page.textContent('#nextTier')), 'next tier countdown: ' + await page.textContent('#nextTier'));
ok(/\$387\.0\d/.test(await page.textContent('#gross')), 'gross so far (7.6h ord + 1.4h 1.5x ≈ $387.05) ' + await page.textContent('#gross'));
const btnH = await page.$eval('#actions button', e => e.getBoundingClientRect().height); ok(btnH >= 64, `big button height ${btnH}px`);
ok(/h/.test(await page.textContent('#fatNext')), 'fatigue countdown ' + await page.textContent('#fatNext'));
await page.screenshot({ path: '/workspace/out/shift-clock.png', fullPage: false });
// break + resume + stop
await page.tap('[data-a=break]'); ok(/break/i.test(await page.textContent('#stateLbl')), 'pause works');
await page.tap('[data-a=resume]'); await page.tap('[data-a=stop]'); ok(await page.isVisible('[data-a=start]'), 'stop works');
// week view
await page.tap('nav [data-v=week]'); const wt = await page.textContent('#wTot');
ok(/Net \(estimate\)/.test(wt) && /Expected pay date/.test(wt) && /Super/.test(wt), 'week view totals present');
await page.screenshot({ path: '/workspace/out/shift-clock-week.png' });
// edit past shift
await page.tap('nav [data-v=hist]'); await page.tap('[data-edit=past]');
const v = await page.inputValue('[name=end]'); const nv = v.slice(0, 11) + String((+v.slice(11, 13) + 1) % 24).padStart(2, '0') + v.slice(13);
await page.fill('[name=end]', nv); await page.tap('#saveShift');
const past = await page.evaluate(() => window.__shiftClock.state.shifts.find(s => s.id === 'past'));
ok(Math.abs((past.end - past.start) / 3600e3 - 11) < 0.02 || nv.slice(11, 13) === '00', 'edit past shift end +1 h → ' + ((past.end - past.start) / 3600e3).toFixed(2) + ' h');
// exports
const [dl] = await Promise.all([page.waitForEvent('download'), page.tap('#expCsv')]); ok(/\.csv$/.test(dl.suggestedFilename()), 'CSV export ' + dl.suggestedFilename());
const [dj] = await Promise.all([page.waitForEvent('download'), page.tap('#expJson')]); ok(/\.json$/.test(dj.suggestedFilename()), 'JSON export ' + dj.suggestedFilename());
await page.tap('nav [data-v=set]'); await page.fill('[data-k=baseRate]', '42'); await page.press('[data-k=baseRate]', 'Tab');
ok((await page.evaluate(() => window.__shiftClock.state.settings.baseRate)) === 42, 'settings editable');
ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
console.log(fails ? `${fails} FAILED` : 'ALL E2E PASSED'); await b.close(); process.exit(fails ? 1 : 0);
