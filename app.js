import * as P from './pay.js?v=3';
import { mapPayLedger } from './js/plimport.js?v=3';
const $ = id => document.getElementById(id);
const KEY = 'shiftclock.v1';
const fmt$ = v => '$' + (v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtH = h => (Math.round(h * 100) / 100).toFixed(2);
const dur = ms => { ms = Math.max(0, ms); const s = Math.floor(ms / 1e3); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const durHM = min => !isFinite(min) ? '—' : `${Math.floor(min / 60)}h ${String(Math.floor(min % 60)).padStart(2, '0')}m`;
const fdate = (ms, o) => new Intl.DateTimeFormat('en-AU', { timeZone: P.TZ, ...o }).format(ms);
const ftime = ms => fdate(ms, { hour: 'numeric', minute: '2-digit' });
const fday = ms => fdate(ms, { weekday: 'short', day: 'numeric', month: 'short' });

let st = load();
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.shifts)) return { shifts: d.shifts, settings: { ...P.DEFAULTS, ...d.settings } }; } catch {} return { shifts: [], settings: { ...P.DEFAULTS } }; }
const save = () => localStorage.setItem(KEY, JSON.stringify(st));
const S = () => st.settings;
const active = () => st.shifts.find(s => s.end == null);

// ---- actions ----
function act(kind) {
  const now = Date.now(), a = active();
  if (kind === 'start' && !a) st.shifts.push({ id: crypto.randomUUID?.() || String(now), start: now, end: null, breaks: [], meal: $('mealNow').checked, note: '' });
  if (kind === 'break' && a && !P.onBreak(a)) a.breaks.push({ start: now, end: null });
  if (kind === 'resume' && a && P.onBreak(a)) a.breaks.at(-1).end = now;
  if (kind === 'stop' && a) { if (P.onBreak(a)) a.breaks.at(-1).end = now; a.end = now; }
  save(); render(); askNotify();
}
function askNotify() { if (S().notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); }
const notified = new Set();
function notify(key, msg) {
  if (notified.has(key)) return; notified.add(key);
  if (S().notify && 'Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then(r => r.showNotification('Shift Clock', { body: msg, tag: key, icon: 'icons/icon-192.png' })).catch(() => { try { new Notification('Shift Clock', { body: msg }); } catch {} });
  }
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([200, 100, 200]);
}

// ---- shift view (ticks every second) ----
function tick() {
  const now = Date.now(), a = active(), s = S(), R = P.rates(s);
  $('now').textContent = fdate(now, { weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  $('r0').textContent = fmt$(R.base); $('r1').textContent = fmt$(R.ot1); $('r2').textContent = fmt$(R.ot2);
  const alerts = [];
  if (a) {
    const h = P.paidHours(a, now), p = P.shiftPay(h, s), brk = P.onBreak(a);
    $('stateLbl').textContent = brk ? 'On unpaid break' : 'On shift since ' + ftime(a.start);
    $('timer').textContent = dur(h * 3600e3);
    $('gross').textContent = fmt$(p.gross);
    [0, 1, 2].forEach(i => $('t' + i).classList.toggle('on', p.tier === i));
    $('nextTier').textContent = p.nextTierIn == null ? 'Top tier (2x)' : `${p.tier === 0 ? '1.5x' : '2x'} in ${dur(p.nextTierIn * 3600e3)}`;
    $('brkTot').textContent = 'Breaks ' + dur(P.breakMs(a, now));
    $('mealNow').checked = !!a.meal;
  } else {
    $('stateLbl').textContent = 'Off shift'; $('timer').textContent = '0:00:00'; $('gross').textContent = fmt$(0);
    [0, 1, 2].forEach(i => $('t' + i).classList.remove('on')); $('nextTier').textContent = '—'; $('brkTot').textContent = '';
  }
  // fatigue
  const fs = P.fatigueStatus(st.shifts, now), working = a && !P.onBreak(a);
  const next = Math.min(...fs.map(f => f.minsLeft));
  $('fatNext').textContent = working || a ? durHM(next) : 'Off shift';
  $('rules').innerHTML = fs.map(f => `<div class="rule"><span>Max ${f.maxWorkH} h work in any ${f.periodH} h <small>(then ${f.rest})</small></span><b>${fmtH(f.usedH)} h · ${durHM(f.minsLeft)}</b><div class="bar"><i style="width:${Math.min(100, f.usedH / f.maxWorkH * 100)}%;background:${f.minsLeft <= 15 ? 'var(--stop)' : f.minsLeft <= 30 ? 'var(--warn)' : 'var(--go)'}"></i></div></div>`).join('');
  if (working) {
    const f = fs.find(x => x.minsLeft === next);
    if (next <= 0) { alerts.push(['red', `REST REQUIRED NOW: ${f.maxWorkH} h work in ${f.periodH} h reached — take ${f.rest}.`]); notify('lim-' + f.periodH + '-' + a.id + '-' + a.breaks.length, `Rest required now (${f.maxWorkH} h in ${f.periodH} h).`); }
    else if (next <= 15) { alerts.push(['', `Rest due in ${Math.ceil(next)} min (${f.maxWorkH} h in ${f.periodH} h rule) — plan ${f.rest}.`]); notify('near-' + f.periodH + '-' + a.id + '-' + a.breaks.length, `Rest due in ${Math.ceil(next)} min (${f.maxWorkH} h in ${f.periodH} h).`); }
  }
  // bedtime (work nights Sun–Thu)
  const bp = P.bneParts(now), today = P.bneDateKey(now), bed = P.bneFromLocal(today, s.bedtime), workNight = bp.dow <= 4;
  $('bedCard').style.display = '';
  if (workNight) {
    $('bedLbl').textContent = `Bedtime ${ftime(bed)} (work night)`;
    $('bedCd').textContent = now < bed ? dur(bed - now) : 'Past bedtime';
    if (now < bed && bed - now <= 30 * 60e3) { alerts.push(['', `Bedtime in ${Math.ceil((bed - now) / 60e3)} min.`]); notify('bed-' + today, 'Bedtime in 30 min.'); }
    const es = P.bneFromLocal(P.bneDateKey(now + 864e5), s.earliestStart);
    $('esLbl').textContent = `${ftime(es)} · ${durHM((es - Math.max(now, bed)) / 60e3)} after bedtime`;
  } else { $('bedLbl').textContent = 'No work tomorrow (Fri/Sat)'; $('bedCd').textContent = '—'; $('esLbl').textContent = '—'; }
  const al = $('alert'); al.className = 'alert' + (alerts.length ? ' on ' + alerts[0][0] : ''); al.textContent = alerts.map(x => x[1]).join(' ');
}
function renderActions() {
  const a = active();
  $('actions').innerHTML = !a ? `<button class="btn go" data-a="start">▶ Start shift</button>`
    : P.onBreak(a) ? `<button class="btn go" data-a="resume">▶ Resume work</button><button class="btn stop" data-a="stop">■ Stop shift</button>`
    : `<button class="btn brk" data-a="break">❚❚ Start break (unpaid)</button><button class="btn stop" data-a="stop">■ Stop shift</button>`;
}

// ---- adjust active shift start ----
// Allowed range: not later than now (or the first break), not earlier than the Brisbane midnight before the
// original start's day boundary (i.e. previous midnight relative to now, or the start's own midnight for overnight shifts).
let startUndo = null;
function startBounds(a, now = Date.now()) {
  const firstBrk = (a.breaks || []).reduce((m, b) => Math.min(m, b.start), Infinity);
  const min = Math.min(P.bneMidnight(now), P.bneMidnight(a.origStart ?? a.start));
  return { min, max: Math.min(now, firstBrk) };
}
function setStart(ms) {
  const a = active(); if (!a) return false;
  const { min, max } = startBounds(a), msg = $('startMsg');
  let v = Math.round(ms / 60e3) * 60e3, note = '';
  if (v > max) { v = Math.floor(max / 60e3) * 60e3; note = max < Date.now() ? 'Start can’t be after your first break.' : 'Start can’t be later than now.'; }
  if (v < min) { v = min; note = 'Start can’t be earlier than ' + fday(min) + ' ' + ftime(min) + '.'; }
  if (v === a.start) { msg.textContent = note; return false; }
  startUndo = a.start; if (a.origStart == null) a.origStart = a.start;
  a.start = v; save(); render(); msg.textContent = note || 'Start changed to ' + ftime(v) + '.'; return true;
}
function renderStartEdit() {
  const a = active(); $('startEdit').classList.toggle('on', !!a);
  if (!a) { startUndo = null; $('startMsg').textContent = ''; return; }
  $('startBtn').textContent = ftime(a.start) + (P.bneDateKey(a.start) !== P.bneDateKey(Date.now()) ? ' (' + fday(a.start) + ')' : '');
  $('startUndo').disabled = startUndo == null;
}
function openStartDlg() {
  const a = active(); if (!a) return; const { min, max } = startBounds(a);
  $('startTime').value = P.toLocalInput(a.start).slice(11);
  $('startRange').textContent = `Allowed: ${fday(min)} ${ftime(min)} – ${ftime(max)}. A time later than now is taken as yesterday.`;
  $('startDlg').showModal();
}
$('startBtn').onclick = openStartDlg; $('startEditBtn').onclick = openStartDlg;
$('startSave').onclick = () => { const a = active(), t = $('startTime').value; if (!a || !/^\d\d:\d\d$/.test(t)) return;
  const now = Date.now(); let v = P.bneFromLocal(P.bneDateKey(now), t); if (v > now) v -= 864e5;
  setStart(v); $('startDlg').close(); };
$('startEdit').addEventListener('click', e => { const m = +e.target.dataset.wb; const a = active(); if (m && a) setStart(a.start - m * 60e3); });
$('startUndo').onclick = () => { const a = active(); if (a && startUndo != null) { const u = startUndo; a.start = u; startUndo = null; save(); render(); $('startMsg').textContent = 'Start restored to ' + ftime(u) + '.'; } };

// ---- week view ----
let wOff = 0;
function renderWeek() {
  const ws = P.weekStart(Date.now()) + wOff * 7 * 864e5, w = P.weekSummary(st.shifts, ws, S());
  $('wTitle').textContent = `${fday(ws)} – ${fday(ws + 6 * 864e5)}`;
  $('wBody').innerHTML = w.days.map(d => `<tr><td>${fday(d.date)}</td><td>${d.shifts ? fmtH(d.hours) : '–'}</td><td>${d.shifts ? fmtH(d.ord) : ''}</td><td>${d.shifts ? fmtH(d.ot) : ''}</td><td>${d.shifts ? fmt$(d.gross) : ''}</td><td>${d.meals ? fmt$(d.meals) : ''}</td></tr>`).join('')
    + `<tr><th>Total</th><th>${fmtH(w.hours)}</th><th>${fmtH(w.ord)}</th><th>${fmtH(w.ot)}</th><th>${fmt$(w.gross)}</th><th>${fmt$(w.meals)}</th></tr>`;
  $('wTot').innerHTML = `<h2>Week pay (estimate)</h2>
   <div class="row"><span>Ordinary pay</span><b>${fmt$(w.ordPay)}</b></div><div class="row"><span>Overtime pay</span><b>${fmt$(w.otPay)}</b></div>
   <div class="row"><span>Gross</span><b>${fmt$(w.gross)}</b></div><div class="row"><span>Tax (estimate, ATO ${w.table} Scale 2)</span><b>−${fmt$(w.tax)}</b></div>
   <div class="row"><span>Meal allowances (tax-free)</span><b>+${fmt$(w.meals)}</b></div><div class="row" style="font-size:20px"><span>Net (estimate)</span><b style="color:var(--go)">${fmt$(w.net)}</b></div>
   <div class="row"><span>Super ${S().superPct}% of ordinary time</span><b>${fmt$(w.super)}</b></div>
   <div class="row"><span>Expected pay date</span><b>${fday(w.payWed)} or ${fday(w.payThu)}</b></div>`;
}

// ---- history + editing ----
function renderHist() {
  const list = [...st.shifts].sort((a, b) => b.start - a.start);
  $('histList').innerHTML = list.length ? list.map(sh => { const p = P.shiftPay(P.paidHours(sh), S());
    return `<div class="hist"><div class="row"><b>${fday(sh.start)}</b><b>${fmt$(p.gross)}</b></div><div class="row mut"><span>${ftime(sh.start)} – ${sh.end ? ftime(sh.end) : 'now'} · ${fmtH(p.hours)} h paid${sh.meal ? ' · meal' : ''}</span><button class="sm" data-edit="${sh.id}">Edit</button></div></div>`; }).join('')
    : '<p class="mut">No shifts yet.</p>';
}
function openEdit(id) {
  const isNew = !id, sh = isNew ? { id: crypto.randomUUID?.() || String(Date.now()), start: Date.now() - 10 * 3600e3, end: Date.now(), breaks: [], meal: true, note: '' } : structuredClone(st.shifts.find(s => s.id === id));
  const f = $('editForm');
  const draw = () => {
    f.innerHTML = `<h2>${isNew ? 'Add' : 'Edit'} shift <small>(Brisbane time)</small></h2>
    <label>Start<input type="datetime-local" name="start" value="${P.toLocalInput(sh.start)}" required></label>
    <label>End<input type="datetime-local" name="end" value="${sh.end ? P.toLocalInput(sh.end) : ''}"></label>
    ${sh.breaks.map((b, i) => `<label>Break ${i + 1}<span><input type="datetime-local" name="bs${i}" value="${P.toLocalInput(b.start)}" style="max-width:100%"><input type="datetime-local" name="be${i}" value="${b.end ? P.toLocalInput(b.end) : ''}" style="max-width:100%"></span></label><button type="button" class="sm" data-rmb="${i}">Remove break ${i + 1}</button>`).join('')}
    <div style="margin:8px 0"><button type="button" class="sm" id="addBrk">+ Add break</button></div>
    <label>Meal allowance<input type="checkbox" name="meal" ${sh.meal ? 'checked' : ''}></label>
    <label>Note<input name="note" value="${(sh.note || '').replace(/"/g, '&quot;')}"></label>
    <div class="btns" style="grid-template-columns:1fr 1fr 1fr;margin-top:12px">${isNew ? '<span></span>' : '<button type="button" class="sm" id="delShift" style="background:var(--stop)">Delete</button>'}<button value="cancel" class="sm">Cancel</button><button type="button" class="sm" id="saveShift" style="background:var(--go)">Save</button></div>`;
  };
  const read = () => { const d = new FormData(f); sh.start = P.fromLocalInput(d.get('start')); sh.end = d.get('end') ? P.fromLocalInput(d.get('end')) : null;
    sh.breaks = sh.breaks.map((b, i) => ({ start: P.fromLocalInput(d.get('bs' + i)), end: d.get('be' + i) ? P.fromLocalInput(d.get('be' + i)) : null })); sh.meal = d.get('meal') === 'on'; sh.note = d.get('note') || ''; };
  f.onclick = e => {
    const t = e.target;
    if (t.id === 'addBrk') { read(); const s0 = sh.start + 4 * 3600e3; sh.breaks.push({ start: s0, end: s0 + 30 * 60e3 }); draw(); }
    if (t.dataset.rmb) { read(); sh.breaks.splice(+t.dataset.rmb, 1); draw(); }
    if (t.id === 'delShift' && confirm('Delete this shift?')) { st.shifts = st.shifts.filter(s => s.id !== sh.id); save(); $('edit').close(); render(); }
    if (t.id === 'saveShift') { read();
      if (!isFinite(sh.start) || (sh.end != null && sh.end <= sh.start)) return alert('End must be after start.');
      if (sh.end == null && st.shifts.some(s => s.end == null && s.id !== sh.id)) return alert('Another shift is already running.');
      const i = st.shifts.findIndex(s => s.id === sh.id); i < 0 ? st.shifts.push(sh) : st.shifts[i] = sh; save(); $('edit').close(); render(); }
  };
  draw(); $('edit').showModal();
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1e3); }
function csv() {
  const rows = [['date', 'start', 'end', 'break_min', 'paid_hours', 'ordinary_h', 'ot15_h', 'ot2_h', 'gross', 'super', 'meal', 'note']];
  for (const sh of [...st.shifts].sort((a, b) => a.start - b.start)) { const p = P.shiftPay(P.paidHours(sh), S());
    rows.push([P.bneDateKey(sh.start), P.toLocalInput(sh.start), sh.end ? P.toLocalInput(sh.end) : '', Math.round(P.breakMs(sh) / 60e3), fmtH(p.hours), fmtH(p.ord), fmtH(p.ot1), fmtH(p.ot2), p.gross.toFixed(2), p.super.toFixed(2), sh.meal ? S().meal.toFixed(2) : '0.00', sh.note || '']); }
  return rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
}

// ---- settings ----
const FIELDS = [['baseRate', 'Ordinary rate $/h', 'number'], ['ordHours', 'Ordinary hours per shift', 'number'], ['ot1Rate', '1.5x tier rate $/h (payslip)', 'number'], ['ot1Hours', '1.5x tier hours', 'number'], ['ot2Rate', '2x tier rate $/h (payslip)', 'number'],
  ['rateMode', 'OT rate basis', ['payslip', 'multiplier']], ['ot1Mult', '1.5x multiplier', 'number'], ['ot2Mult', '2x multiplier', 'number'], ['meal', 'Meal allowance $/shift', 'number'], ['superPct', 'Super % (ordinary time)', 'number'],
  ['taxTable', 'Tax table', ['auto', '2025-26', '2026-27']], ['bedtime', 'Bedtime (work nights)', 'time'], ['earliestStart', 'Earliest start reminder', 'time'], ['notify', 'Notifications', 'checkbox']];
function renderSettings() {
  const s = S();
  $('setForm').innerHTML = '<h2>Pay settings (Randstad casual)</h2>' + FIELDS.map(([k, l, t]) => Array.isArray(t)
    ? `<label>${l}<select data-k="${k}">${t.map(o => `<option ${s[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`
    : t === 'checkbox' ? `<label>${l}<input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}></label>`
    : `<label>${l}<input type="${t}" step="any" inputmode="decimal" data-k="${k}" value="${s[k]}"></label>`).join('')
    + `<p class="fine">"payslip" uses the tier rates exactly as printed on the payslip ($52.75 / $69.23). "multiplier" computes base × 1.5 and × 2 precisely (unrounded). Super is calculated on ordinary-time pay only. Pay week Mon–Sun, paid the following Wed/Thu.</p><button class="sm" id="resetSet">Reset to defaults</button>`;
}
$('setForm').addEventListener('change', e => { const k = e.target.dataset.k; if (!k) return; const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
  if (e.target.type === 'number' && !isFinite(v)) return; st.settings[k] = v; save(); if (k === 'notify' && v) askNotify(); render(); });
$('setForm').addEventListener('click', e => { if (e.target.id === 'resetSet') { st.settings = { ...P.DEFAULTS }; save(); renderSettings(); render(); } });

// ---- wiring ----
document.querySelector('nav').onclick = e => { const v = e.target.dataset.v; if (!v) return; document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b === e.target)); document.querySelectorAll('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v)); render(); };
$('actions').onclick = e => e.target.dataset.a && act(e.target.dataset.a);
$('mealNow').onchange = () => { const a = active(); if (a) { a.meal = $('mealNow').checked; save(); } };
$('wPrev').onclick = () => { wOff--; renderWeek(); }; $('wNext').onclick = () => { wOff++; renderWeek(); };
$('histList').onclick = e => e.target.dataset.edit && openEdit(e.target.dataset.edit);
$('addShift').onclick = () => openEdit(null);
$('expJson').onclick = () => download(`shift-clock-${P.bneDateKey(Date.now())}.json`, JSON.stringify({ app: 'shift-clock', version: 1, exported: new Date().toISOString(), ...st }, null, 2), 'application/json');
$('expCsv').onclick = () => download(`shift-clock-${P.bneDateKey(Date.now())}.csv`, csv(), 'text/csv');
$('impJson').onclick = () => $('impFile').click();
$('impFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text());
  if (d && d.app === 'pay-ledger') { e.target.value = ''; return importPayLedger(d); } if (!Array.isArray(d.shifts)) throw 0;
  if (!confirm(`Import ${d.shifts.length} shifts? Existing shifts with the same id are replaced.`)) return;
  const m = new Map(st.shifts.map(s => [s.id, s])); d.shifts.forEach(s => s && isFinite(s.start) && m.set(s.id, { breaks: [], meal: false, note: '', ...s }));
  st.shifts = [...m.values()]; if (d.settings) st.settings = { ...P.DEFAULTS, ...d.settings }; save(); render(); } catch { alert('Not a valid Shift Clock JSON file.'); } e.target.value = ''; };

$('impPL').onclick = () => $('plFile').click();
$('plFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let d; try { d = JSON.parse(await f.text()); } catch { return alert('That file isn’t valid JSON. Pick the pay-ledger-backup-….json file.'); }
  importPayLedger(d); };
function importPayLedger(d) {
  let r; try { r = mapPayLedger(d, st.shifts); } catch (err) { return alert(err.message + ' Pick the pay-ledger-backup-….json file.'); }
  const dup = r.skipped.filter(x => x.reason === 'duplicate').length, bad = r.skipped.length - dup;
  if (!r.shifts.length) return alert(`Nothing new to import: ${d.shifts.length} shifts in the file, ${dup} already in Shift Clock${bad ? `, ${bad} unusable` : ''}.`);
  const days = r.shifts.map(s => P.bneDateKey(s.start)), hrs = r.shifts.reduce((t, s) => t + P.paidHours(s), 0);
  if (!confirm(`Pay Ledger backup: ${d.shifts.length} shifts.\n\nImport ${r.shifts.length} new shifts (${days[0]} to ${days.at(-1)}, ${fmtH(hrs)} paid hours).\nSkip ${dup} already in Shift Clock${bad ? `, ${bad} unusable` : ''}.\n\nNothing existing is changed or deleted.`)) return;
  st.shifts.push(...r.shifts); save(); render(); alert(`Imported ${r.shifts.length} shifts.`);
}

function render() { renderActions(); renderStartEdit(); tick(); renderWeek(); renderHist(); if (!document.activeElement?.closest?.('#setForm')) renderSettings(); }
render(); setInterval(tick, 1000);
window.__shiftClock = { get state() { return st; }, P };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
