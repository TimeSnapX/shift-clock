import test from 'node:test'; import assert from 'node:assert/strict';
import * as P from '../pay.js';
const close = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
test('10 h shift = 7.6×41.21 + 2×1.5 tier + 0.4×2x tier', () => {
  const p = P.shiftPay(10);
  close(p.ordPay, P.r2(7.6 * 41.21)); close(p.ot1Pay, 2 * 52.75); close(p.ot2Pay, P.r2(0.4 * 69.23));
  close(p.gross, 313.20 + 105.50 + 27.69); assert.equal(p.tier, 2);
});
test('multiplier mode computes 1.5x/2x precisely', () => {
  const p = P.shiftPay(10, { ...P.DEFAULTS, rateMode: 'multiplier' });
  close(p.ot1Pay, P.r2(2 * 41.21 * 1.5)); close(p.ot2Pay, P.r2(0.4 * 82.42));
});
test('tiers and next-tier countdown', () => {
  assert.equal(P.shiftPay(5).tier, 0); close(P.shiftPay(5).nextTierIn, 2.6);
  assert.equal(P.shiftPay(8).tier, 1); close(P.shiftPay(8).nextTierIn, 1.6);
  assert.equal(P.shiftPay(9.6).tier, 2);
});
test('super = 12% of ordinary-time only', () => { close(P.shiftPay(10).super, P.r2(313.20 * 0.12)); });
test('ATO scale 2 weekly tax', () => {
  assert.equal(P.weeklyTax(300, '2025-26'), 0);
  assert.equal(P.weeklyTax(1000, '2025-26'), Math.round(0.3227 * 1000.99 - 180.0385));
  assert.equal(P.weeklyTax(1065.86, '2025-26'), 164);
  assert.equal(P.weeklyTax(1065.86, '2026-27'), 159);
  assert.equal(P.pickTable('auto', '2026-06-25'), '2025-26'); assert.equal(P.pickTable('auto', '2026-07-01'), '2026-27');
});
test('payslip cross-check: 22.5 h = 2 × 11.25 h shifts with meals', () => {
  const ws = P.bneFromLocal('2026-09-28'); // Monday
  const mk = (d) => ({ id: d, start: P.bneFromLocal(d, '05:00'), end: P.bneFromLocal(d, '16:15'), breaks: [], meal: true });
  const w = P.weekSummary([mk('2026-09-28'), mk('2026-09-29')], ws);
  close(w.hours, 22.5); assert.equal(w.gross, 1065.86); assert.equal(w.table, '2026-27');
  assert.equal(w.tax, 159); close(w.meals, 42.30); assert.equal(w.net, 949.16);
  assert.equal(P.bneDateKey(w.payWed), '2026-10-07'); assert.equal(P.bneDateKey(w.payThu), '2026-10-08');
});
test('unpaid breaks are excluded', () => {
  const s = P.bneFromLocal('2026-10-20', '05:00');
  close(P.paidHours({ start: s, end: s + 10.5 * 3600e3, breaks: [{ start: s + 4 * 3600e3, end: s + 4.5 * 3600e3 }] }), 10);
});
test('week starts Monday (Brisbane)', () => {
  assert.equal(P.bneDateKey(P.weekStart(P.bneFromLocal('2026-10-25', '23:30'))), '2026-10-19');
  assert.equal(P.bneDateKey(P.weekStart(P.bneFromLocal('2026-10-19', '00:10'))), '2026-10-19');
});
test('NHVR standard hours: 5.25 h in 5.5 h', () => {
  const s = Date.parse('2026-10-20T05:00:00+10:00'), now = s + 5 * 3600e3;
  const f = P.fatigueStatus([{ start: s, end: null, breaks: [] }], now);
  close(f[0].minsLeft, 15, 1); assert.ok(f[1].minsLeft > 15);
  const f2 = P.fatigueStatus([{ start: s, end: null, breaks: [{ start: s + 3 * 3600e3, end: s + 3 * 3600e3 + 10 * 60e3 }] }], now);
  close(f2[0].minsLeft, 15, 1); // 10-min break doesn't count as rest
  const f3 = P.fatigueStatus([{ start: s, end: null, breaks: [{ start: s + 3 * 3600e3, end: s + 3.25 * 3600e3 }] }], now);
  assert.ok(f3[0].minsLeft > 60, "15-min break resets"); close(f3[0].minsLeft, 210, 1); close(f[1].minsLeft, 150, 1);
  const f4 = P.fatigueStatus([{ start: s, end: null, breaks: [] }], s + 12 * 3600e3);
  assert.equal(f4[3].minsLeft, 0);
});
