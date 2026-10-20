// Shift Clock core maths — pure functions, shared by app and tests.
export const TZ = 'Australia/Brisbane';
export const BNE_OFFSET_MS = 10 * 3600e3; // Brisbane: UTC+10, no daylight saving

export const DEFAULTS = {
  baseRate: 41.21, ordHours: 7.6,
  ot1Rate: 52.75, ot1Hours: 2,   // payslip-displayed 1.5x tier
  ot2Rate: 69.23,                // payslip-displayed 2x tier
  ot1Mult: 1.5, ot2Mult: 2,
  rateMode: 'payslip',           // 'payslip' = use payslip rates; 'multiplier' = base × multiplier exactly
  meal: 21.15, superPct: 12,
  taxTable: 'auto',              // 'auto' (by pay date) | '2025-26' | '2026-27'
  bedtime: '21:30', earliestStart: '05:00', notify: true,
};

// ATO Schedule 1 (NAT 1004), weekly, Scale 2 (resident, tax-free threshold claimed). y = a*x - b
// x = weekly earnings ignoring cents, plus 99 cents; y rounded to nearest dollar.
export const TAX_TABLES = {
  // Applies to payments 1 Jul 2024 – 30 Jun 2026 (i.e. 2025-26 too). Source: LI 2025/15 / ATO "Schedule 1 – tax table 01 July 2024 to 30 June 2026"
  '2025-26': { from: '2024-07-01', to: '2026-06-30', rows: [
    [361, 0, 0], [500, 0.16, 57.8462], [625, 0.26, 107.8462], [721, 0.18, 57.8462], [865, 0.189, 64.3365],
    [1282, 0.3227, 180.0385], [2596, 0.32, 176.5769], [3653, 0.39, 358.3077], [Infinity, 0.47, 650.6154]] },
  // Applies to payments from 1 Jul 2026. Source: ATO "Coefficients to use in formulas for withholding from weekly payments", published 17 Jun 2026
  '2026-27': { from: '2026-07-01', to: '2099-12-31', rows: [
    [362, 0, 0], [538, 0.15, 54.3462], [673, 0.25, 108.2135], [721, 0.17, 54.3473], [865, 0.179, 60.8377],
    [1282, 0.3227, 185.1935], [2596, 0.32, 181.7319], [3653, 0.39, 363.4627], [Infinity, 0.47, 655.7704]] },
};
export function pickTable(setting, payDateISO) {
  if (setting && setting !== 'auto') return setting;
  return payDateISO >= TAX_TABLES['2026-27'].from ? '2026-27' : '2025-26';
}
export function weeklyTax(gross, table = '2025-26') {
  if (gross <= 0) return 0;
  const x = Math.floor(gross) + 0.99;
  const row = TAX_TABLES[table].rows.find(r => x < r[0]);
  return Math.max(0, Math.round(row[1] * x - row[2]));
}

export const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
export function rates(s = DEFAULTS) {
  if (s.rateMode === 'multiplier') return { base: s.baseRate, ot1: s.baseRate * s.ot1Mult, ot2: s.baseRate * s.ot2Mult };
  return { base: s.baseRate, ot1: s.ot1Rate, ot2: s.ot2Rate };
}

// Split paid hours into tiers and price each line (lines rounded to cents, like the payslip).
export function shiftPay(hours, s = DEFAULTS) {
  const R = rates(s);
  const ord = Math.min(hours, s.ordHours);
  const ot1 = Math.min(Math.max(hours - s.ordHours, 0), s.ot1Hours);
  const ot2 = Math.max(hours - s.ordHours - s.ot1Hours, 0);
  const ordPay = r2(ord * R.base), ot1Pay = r2(ot1 * R.ot1), ot2Pay = r2(ot2 * R.ot2);
  const tier = hours < s.ordHours ? 0 : hours < s.ordHours + s.ot1Hours ? 1 : 2;
  const nextTierIn = tier === 0 ? s.ordHours - hours : tier === 1 ? s.ordHours + s.ot1Hours - hours : null;
  return { hours, ord, ot1, ot2, ordPay, ot1Pay, ot2Pay, gross: r2(ordPay + ot1Pay + ot2Pay),
           super: r2(ordPay * s.superPct / 100), tier, nextTierIn };
}

// ---- time helpers (Brisbane fixed offset) ----
export const bneParts = ms => { const d = new Date(ms + BNE_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() }; };
export const pad = n => String(n).padStart(2, '0');
export const bneDateKey = ms => { const p = bneParts(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
export const bneMidnight = ms => Math.floor((ms + BNE_OFFSET_MS) / 864e5) * 864e5 - BNE_OFFSET_MS;
export const bneFromLocal = (dateKey, hhmm = '00:00') => Date.parse(`${dateKey}T${hhmm}:00+10:00`);
export const toLocalInput = ms => { const p = bneParts(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`; };
export const fromLocalInput = v => Date.parse(v + ':00+10:00');
export function weekStart(ms) { const mid = bneMidnight(ms); const dow = bneParts(mid).dow; return mid - ((dow + 6) % 7) * 864e5; }
export function payDates(weekStartMs) { return { wed: weekStartMs + 9 * 864e5, thu: weekStartMs + 10 * 864e5 }; }

// ---- shifts ----
// shift: {id, start, end|null, breaks:[{start,end|null}], meal:bool, note}
export function breakMs(sh, now = Date.now()) {
  return (sh.breaks || []).reduce((t, b) => t + Math.max(0, Math.min(b.end ?? now, sh.end ?? now) - b.start), 0);
}
export function paidHours(sh, now = Date.now()) { return Math.max(0, ((sh.end ?? now) - sh.start - breakMs(sh, now)) / 3600e3); }
export function onBreak(sh) { const b = (sh.breaks || []).at(-1); return !!b && b.end == null; }

export function weekSummary(shifts, wsMs, s = DEFAULTS, now = Date.now()) {
  const days = Array.from({ length: 7 }, (_, i) => ({ date: wsMs + i * 864e5, hours: 0, ord: 0, ot: 0, gross: 0, meals: 0, shifts: 0 }));
  let tot = { hours: 0, ord: 0, ot: 0, ordPay: 0, otPay: 0, gross: 0, meals: 0, super: 0 };
  for (const sh of shifts) {
    const i = Math.floor((bneMidnight(sh.start) - wsMs) / 864e5);
    if (i < 0 || i > 6) continue;
    const p = shiftPay(paidHours(sh, now), s), d = days[i];
    d.hours += p.hours; d.ord += p.ord; d.ot += p.ot1 + p.ot2; d.gross = r2(d.gross + p.gross); d.shifts++;
    if (sh.meal) d.meals = r2(d.meals + s.meal);
    tot.hours += p.hours; tot.ord += p.ord; tot.ot += p.ot1 + p.ot2;
    tot.ordPay = r2(tot.ordPay + p.ordPay); tot.otPay = r2(tot.otPay + p.ot1Pay + p.ot2Pay);
    tot.gross = r2(tot.gross + p.gross); tot.super = r2(tot.super + p.super);
    if (sh.meal) tot.meals = r2(tot.meals + s.meal);
  }
  const pd = payDates(wsMs), table = pickTable(s.taxTable, bneDateKey(pd.wed));
  const tax = weeklyTax(tot.gross, table);
  return { days, ...tot, tax, table, net: r2(tot.gross - tax + tot.meals), payWed: pd.wed, payThu: pd.thu };
}

// ---- NHVR Standard Hours, solo drivers (fatigue-regulated heavy vehicles) ----
// Source: https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management/work-and-rest-requirements/standard-hours
export const NHVR_RULES = [
  { periodH: 5.5, maxWorkH: 5.25, rest: '15 continuous minutes rest' },
  { periodH: 8, maxWorkH: 7.5, rest: '30 min rest in blocks of 15 continuous min' },
  { periodH: 11, maxWorkH: 10, rest: '60 min rest in blocks of 15 continuous min' },
  { periodH: 24, maxWorkH: 12, rest: '7 continuous hours stationary rest' },
];
// Work intervals for fatigue: shift time minus breaks; breaks < 15 min don't count as rest (counted as work).
export function workIntervals(shifts, now = Date.now()) {
  const out = [];
  for (const sh of shifts) {
    const end = sh.end ?? now; let cur = sh.start;
    const bs = (sh.breaks || []).map(b => ({ s: b.start, e: Math.min(b.end ?? now, end) }))
      .filter(b => b.e - b.s >= 15 * 60e3).sort((a, b) => a.s - b.s);
    for (const b of bs) { if (b.s > cur) out.push([cur, b.s]); cur = Math.max(cur, b.e); }
    if (end > cur) out.push([cur, end]);
  }
  return out;
}
const workIn = (iv, a, b) => iv.reduce((t, [s, e]) => t + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0);
// Assuming continuous work from now, minutes until each rule's max work would be exceeded.
export function fatigueStatus(shifts, now = Date.now()) {
  const iv = workIntervals(shifts, now);
  return NHVR_RULES.map(r => {
    const P = r.periodH * 3600e3, W = r.maxWorkH * 3600e3;
    const used = workIn(iv, now - P, now);
    let lo = 0, hi = W; // binary search minutes t where work in [now+t-P, now+t] (plus t of new work) hits W
    const f = t => workIn(iv, now + t - P, now) + Math.min(t, P);
    if (f(1e3) > W) return { ...r, usedH: used / 3600e3, minsLeft: 0 };
    hi = P; if (!(f(hi) > W)) return { ...r, usedH: used / 3600e3, minsLeft: Infinity };
    while (hi - lo > 10e3) { const m = (lo + hi) / 2; f(m) > W ? hi = m : lo = m; }
    return { ...r, usedH: used / 3600e3, minsLeft: lo / 60e3 };
  });
}
