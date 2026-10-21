// Pay Ledger backup -> Shift Clock shifts. Pure functions (no DOM) so they can be unit-tested.
import { bneFromLocal } from '../pay.js?v=3';
const HM = /^\d{1,2}:\d{2}$/;
const hm = t => t.length === 4 ? '0' + t : t;
// Returns { shifts: [Shift Clock shift], skipped: [{date, reason}] }
export function mapPayLedger(backup, existing = []) {
  if (!backup || backup.app !== 'pay-ledger' || !Array.isArray(backup.shifts)) throw new Error('Not a Pay Ledger backup file.');
  const have = new Set(existing.map(s => s.start)); const out = [], skipped = [];
  for (const p of [...backup.shifts].sort((a, b) => String(a.date + a.start).localeCompare(String(b.date + b.start)))) {
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') || p.deleted) { skipped.push({ date: p?.date, reason: 'invalid' }); continue; }
    const brk = Math.max(0, Number(p.breakMins) || 0);
    let start, end;
    if (HM.test(p.start || '') && HM.test(p.end || '')) {
      start = bneFromLocal(p.date, hm(p.start)); end = bneFromLocal(p.date, hm(p.end));
      if (end <= start) end += 864e5; // overnight
    } else if (Number(p.workedHours) > 0) { // duration-only shift: assume 05:00 start
      start = bneFromLocal(p.date, HM.test(p.start || '') ? hm(p.start) : '05:00'); end = start + Number(p.workedHours) * 3600e3;
    } else { skipped.push({ date: p.date, reason: 'no times' }); continue; }
    if (!isFinite(start) || !isFinite(end)) { skipped.push({ date: p.date, reason: 'invalid' }); continue; }
    if (have.has(start)) { skipped.push({ date: p.date, reason: 'duplicate' }); continue; }
    have.add(start);
    // Pay Ledger stores only total unpaid break minutes; place it 4 h into the shift (same as "+ Add break").
    const bs = Math.min(start + 4 * 3600e3, end - brk * 60e3);
    out.push({ id: 'pl-' + (p.id || start), start, end, breaks: brk ? [{ start: bs, end: bs + brk * 60e3 }] : [],
      meal: !!p.meal, note: [p.notes, '(from Pay Ledger)'].filter(Boolean).join(' '), src: 'pay-ledger' });
  }
  return { shifts: out, skipped };
}
