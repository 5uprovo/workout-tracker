'use strict';
/* RepLog – workout tracker PWA. All data lives on the device (localStorage). */

const KEY = 'replog-db-v1';
const DAY = 864e5;
let _n = 0;
const uid = () => Date.now().toString(36) + (_n++).toString(36) + Math.random().toString(36).slice(2, 6);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CATS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Cardio', 'Full body', 'Other'];
const TYPES = { wr: 'Weight & reps', bw: 'Bodyweight (reps, optional +kg)', dur: 'Duration' };
const MEASURES = [
  ['bodyweight', 'Bodyweight', 'kg'], ['bodyfat', 'Body fat', '%'], ['waist', 'Waist', 'in'],
  ['chest', 'Chest', 'in'], ['shoulders', 'Shoulders', 'in'], ['neck', 'Neck', 'in'],
  ['arm_l', 'Left arm', 'in'], ['arm_r', 'Right arm', 'in'], ['forearm_l', 'Left forearm', 'in'],
  ['forearm_r', 'Right forearm', 'in'], ['hips', 'Hips', 'in'], ['thigh_l', 'Left thigh', 'in'],
  ['thigh_r', 'Right thigh', 'in'], ['calf_l', 'Left calf', 'in'], ['calf_r', 'Right calf', 'in']
].map(([id, name, unit]) => ({ id, name, unit }));
const MEAS = Object.fromEntries(MEASURES.map(m => [m.id, m]));

const DEFAULT_EX = `Bench Press (Barbell)|Chest|wr
Incline Bench Press (Barbell)|Chest|wr
Bench Press (Dumbbell)|Chest|wr
Incline Bench Press (Dumbbell)|Chest|wr
Chest Press (Machine)|Chest|wr
Chest Fly (Cable)|Chest|wr
Pec Deck (Machine)|Chest|wr
Push Up|Chest|bw
Dip|Chest|bw
Deadlift (Barbell)|Back|wr
Pull Up|Back|bw
Chin Up|Back|bw
Lat Pulldown (Cable)|Back|wr
Seated Row (Cable)|Back|wr
Bent Over Row (Barbell)|Back|wr
Single Arm Row (Dumbbell)|Back|wr
T-Bar Row|Back|wr
Chest Supported Row (Machine)|Back|wr
Straight Arm Pulldown (Cable)|Back|wr
Back Extension|Back|bw
Overhead Press (Barbell)|Shoulders|wr
Shoulder Press (Dumbbell)|Shoulders|wr
Shoulder Press (Machine)|Shoulders|wr
Lateral Raise (Dumbbell)|Shoulders|wr
Lateral Raise (Cable)|Shoulders|wr
Rear Delt Fly (Machine)|Shoulders|wr
Face Pull (Cable)|Shoulders|wr
Shrug (Dumbbell)|Shoulders|wr
Bicep Curl (Barbell)|Biceps|wr
Bicep Curl (Dumbbell)|Biceps|wr
Hammer Curl (Dumbbell)|Biceps|wr
Preacher Curl (EZ Bar)|Biceps|wr
Bicep Curl (Cable)|Biceps|wr
Incline Curl (Dumbbell)|Biceps|wr
Triceps Pushdown (Cable)|Triceps|wr
Overhead Triceps Extension (Cable)|Triceps|wr
Skullcrusher (EZ Bar)|Triceps|wr
Close Grip Bench Press|Triceps|wr
Squat (Barbell)|Legs|wr
Front Squat (Barbell)|Legs|wr
Leg Press|Legs|wr
Hack Squat|Legs|wr
Bulgarian Split Squat (Dumbbell)|Legs|wr
Lunge (Dumbbell)|Legs|wr
Romanian Deadlift (Barbell)|Legs|wr
Leg Extension (Machine)|Legs|wr
Lying Leg Curl (Machine)|Legs|wr
Seated Leg Curl (Machine)|Legs|wr
Standing Calf Raise|Legs|wr
Seated Calf Raise|Legs|wr
Hip Thrust (Barbell)|Glutes|wr
Hip Abduction (Machine)|Glutes|wr
Cable Kickback|Glutes|wr
Crunch|Core|bw
Cable Crunch|Core|wr
Hanging Leg Raise|Core|bw
Ab Wheel Rollout|Core|bw
Plank|Core|dur
Running|Cardio|dur
Cycling|Cardio|dur
Rowing Machine|Cardio|dur
Stair Climber|Cardio|dur
Incline Walk|Cardio|dur`.split('\n').map(l => l.split('|'));

/* ---------------- storage ---------------- */
function normalise(d) {
  d = d && typeof d === 'object' ? d : {};
  d.v = 1;
  if (!Array.isArray(d.exercises) || !d.exercises.length)
    d.exercises = DEFAULT_EX.map(([name, cat, type]) => ({ id: uid(), name, cat, type }));
  for (const k of ['templates', 'workouts', 'measurements']) if (!Array.isArray(d[k])) d[k] = [];
  d.active = d.active || null;
  d.settings = Object.assign({ rest: 120, restOn: true }, d.settings || {});
  d.workouts.sort((a, b) => a.start - b.start);
  return d;
}
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) return normalise(d); } catch (e) {}
  return normalise({});
}
let db = load();
let _exMap = null;
function save() {
  _exMap = null;
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save – storage full or blocked. Export a backup.'); }
}
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

const ui = { tab: 'workout', exQ: '', exCat: '', ranges: {}, statWeeks: 12 };

/* ---------------- helpers ---------------- */
function exById(id) {
  if (!_exMap) _exMap = new Map(db.exercises.map(e => [e.id, e]));
  return _exMap.get(id) || { id, name: 'Deleted exercise', cat: 'Other', type: 'wr' };
}
const num = v => { if (v == null) return null; v = String(v).replace(',', '.').trim(); if (v === '') return null; const n = parseFloat(v); return isFinite(n) ? n : null; };
const int = v => { const n = num(v); return n == null ? null : Math.round(n); };
function parseTime(v) {
  v = String(v ?? '').trim(); if (!v) return null;
  if (v.includes(':')) { const p = v.split(':').map(x => parseInt(x, 10) || 0); return p.reduce((a, b) => a * 60 + b, 0) || null; }
  const n = num(v); return n ? Math.round(n) : null;
}
const pad = n => String(n).padStart(2, '0');
function clock(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; }
const clockSec = s => s == null ? '' : clock(s * 1000);
function fmtDur(ms) { const m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? `${h}h ${pad(m % 60)}m` : `${m}m`; }
const fmtNum = (n, d = 1) => (+n || 0).toLocaleString('en-GB', { maximumFractionDigits: d });
const fmtKg = n => n == null ? '' : String(+(+n).toFixed(2));
const fmtDate = ts => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtDateY = ts => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateLong = ts => new Date(ts).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function weekStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
function relDays(ts) { const d = Math.round((dayStart(Date.now()) - dayStart(ts)) / DAY); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 14 ? `${d} days ago` : fmtDateY(ts); }
const toLocalInput = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const todayStr = () => toLocalInput(Date.now()).slice(0, 10);
const dateStrToTs = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
const clone = o => JSON.parse(JSON.stringify(o));
const sortW = () => db.workouts.sort((a, b) => a.start - b.start);
function timeName(ts) { const h = new Date(ts).getHours(); return h < 12 ? 'Morning Workout' : h < 17 ? 'Afternoon Workout' : 'Evening Workout'; }

const e1rm = (w, r) => (w > 0 && r > 0) ? (r === 1 ? w : w * (1 + r / 30)) : 0;
function sessStats(sets) {
  const o = { best: 0, e1rm: 0, vol: 0, reps: 0, totalReps: 0, time: 0, setVol: 0, sets: 0 };
  for (const s of sets) {
    if (s.k === 'w') continue;
    const w = +s.w || 0, r = +s.r || 0, t = +s.t || 0;
    o.sets++; o.best = Math.max(o.best, w); o.e1rm = Math.max(o.e1rm, e1rm(w, r));
    o.vol += w * r; o.setVol = Math.max(o.setVol, w * r); o.reps = Math.max(o.reps, r); o.totalReps += r; o.time = Math.max(o.time, t);
  }
  return o;
}
function setText(ex, s) {
  if (!s) return '';
  if (ex.type === 'dur') return clockSec(s.t);
  if (ex.type === 'bw') return (s.w ? `+${fmtKg(s.w)} kg × ` : '') + `${s.r ?? 0}${s.w ? '' : ' reps'}`;
  return `${fmtKg(s.w ?? 0)} kg × ${s.r ?? 0}`;
}
function bestSet(ex, sets) {
  let b = null, bv = -1;
  for (const s of sets) {
    if (s.k === 'w') continue;
    const v = ex.type === 'dur' ? +s.t || 0 : ex.type === 'bw' ? (+s.r || 0) + (+s.w || 0) / 1000 : e1rm(+s.w || 0, +s.r || 0) || (+s.w || 0);
    if (v > bv) { bv = v; b = s; }
  }
  return b;
}
function wVolume(w) {
  let v = 0;
  for (const x of w.exercises) { if (exById(x.eid).type !== 'wr') continue; for (const s of x.sets) if (s.k !== 'w') v += (+s.w || 0) * (+s.r || 0); }
  return v;
}
const wSets = w => w.exercises.reduce((n, x) => n + x.sets.length, 0);
function lastSets(eid, excludeId) {
  for (let i = db.workouts.length - 1; i >= 0; i--) {
    const w = db.workouts[i]; if (w.id === excludeId) continue;
    const x = w.exercises.find(x => x.eid === eid); if (x) return x.sets;
  }
  return [];
}
function exHistory(eid) {
  const out = [];
  for (const w of db.workouts) for (const x of w.exercises) if (x.eid === eid) out.push({ w, sets: x.sets, st: sessStats(x.sets) });
  return out;
}
function countPRs(w) {
  let n = 0;
  for (const x of w.exercises) {
    const ex = exById(x.eid), cur = sessStats(x.sets);
    const prior = db.workouts.filter(p => p.start < w.start && p.id !== w.id).flatMap(p => p.exercises.filter(y => y.eid === x.eid)).map(y => sessStats(y.sets));
    if (!prior.length) continue;
    const max = k => Math.max(0, ...prior.map(p => p[k]));
    const keys = ex.type === 'wr' ? ['best', 'e1rm', 'setVol'] : ex.type === 'bw' ? ['reps', 'totalReps'] : ['time'];
    if (keys.some(k => cur[k] > max(k) + 1e-9)) n++;
  }
  return n;
}

/* ---------------- icons ---------------- */
const sv = (p, f) => `<svg viewBox="0 0 24 24" fill="${f ? 'currentColor' : 'none'}" stroke="${f ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  stats: sv('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  history: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  workout: sv('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  exercises: sv('<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>'),
  measure: sv('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  down: sv('<path d="m6 9 6 6 6-6"/>'),
  check: sv('<path d="m5 12 5 5L20 7"/>'),
  more: sv('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', true),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  chev: sv('<path d="m9 6 6 6-6 6"/>'),
  clock: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  weight: sv('<path d="M6 7h12l2 13H4z"/><circle cx="12" cy="5" r="2"/>'),
  trophy: sv('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>'),
};

/* ---------------- ui primitives ---------------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

function dialog({ title, body = '', buttons }) {
  return new Promise(res => {
    const el = document.createElement('div'); el.className = 'dlg-wrap';
    el.innerHTML = `<div class="dlg">${title ? `<div class="dtitle">${esc(title)}</div>` : ''}<div class="dbody">${body}</div>
      <div class="dbtns">${buttons.map((b, i) => `<button class="dbtn ${b.cls || ''}" data-di="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    const done = v => { el.remove(); res(v); };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-di]');
      if (b) { const v = buttons[+b.dataset.di].v; const out = typeof v === 'function' ? v(el) : v; if (out !== false || typeof v !== 'function') done(out); }
      else if (e.target === el) done(undefined);
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const p = el.querySelector('.dbtn.primary,.dbtn.danger'); p && p.click(); } });
    document.body.appendChild(el);
    const f = el.querySelector('input'); if (f) setTimeout(() => f.focus(), 50);
  });
}
const confirmDlg = (msg, ok = 'OK', danger = false) =>
  dialog({ title: msg, buttons: [{ label: 'Cancel', v: false }, { label: ok, v: true, cls: danger ? 'danger' : 'primary' }] }).then(Boolean);
function promptDlg(title, value = '', mode = 'decimal') {
  return dialog({
    title, body: `<input ${mode ? `inputmode="${mode}"` : ''} value="${esc(value)}">`,
    buttons: [{ label: 'Cancel', v: null }, { label: 'Save', cls: 'primary', v: el => el.querySelector('input').value }]
  });
}
function actionSheet(title, items) {
  return new Promise(res => {
    const el = document.createElement('div'); el.className = 'as-wrap';
    el.innerHTML = `<div class="as"><div class="asgroup">${title ? `<div class="astitle">${esc(title)}</div>` : ''}${items.map((it, i) =>
      `<button class="asbtn ${it.danger ? 'danger' : ''}" data-ai="${i}">${esc(it.label)}</button>`).join('')}</div>
      <button class="asbtn cancel" data-ai="-1">Cancel</button></div>`;
    const done = v => { el.classList.remove('open'); setTimeout(() => el.remove(), 200); res(v); };
    el.addEventListener('click', e => { const b = e.target.closest('[data-ai]'); if (b) { const i = +b.dataset.ai; done(i < 0 ? null : items[i].v); } else if (e.target === el) done(null); });
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('open'));
  });
}
function exerciseForm(ex) {
  const e = ex || { name: '', cat: 'Chest', type: 'wr' };
  return dialog({
    title: ex ? 'Edit exercise' : 'New exercise',
    body: `<label>Name</label><input data-f="name" value="${esc(e.name)}" placeholder="e.g. Incline Press (Smith)">
      <label>Body part</label><select data-f="cat">${CATS.map(c => `<option ${c === e.cat ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <label>Type</label><select data-f="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${v}</option>`).join('')}</select>`,
    buttons: [{ label: 'Cancel', v: null }, {
      label: 'Save', cls: 'primary', v: el => {
        const name = el.querySelector('[data-f=name]').value.trim();
        if (!name) { toast('Enter a name'); return false; }
        if (db.exercises.some(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== e.id)) { toast('That exercise already exists'); return false; }
        return { name, cat: el.querySelector('[data-f=cat]').value, type: el.querySelector('[data-f=type]').value };
      }
    }]
  });
}

/* ---------------- sheets ---------------- */
const sheets = [];
function openSheet(render, opts = {}) {
  const el = document.createElement('div'); el.className = 'sheet';
  $('#sheets').appendChild(el);
  const s = Object.assign({ el, render }, opts); sheets.push(s);
  paintSheet(s); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  updateActiveBar(); return s;
}
function paintSheet(s) {
  if (!s) return;
  const b = s.el.querySelector('.sbody'), st = b ? b.scrollTop : 0;
  s.el.innerHTML = s.render();
  const nb = s.el.querySelector('.sbody'); if (nb) nb.scrollTop = st;
  tick();
}
function closeSheet() {
  const s = sheets.pop(); if (!s) return;
  s.el.classList.remove('open'); setTimeout(() => s.el.remove(), 300);
  updateActiveBar();
}
const topSheet = () => sheets[sheets.length - 1];
const cur = () => topSheet() && topSheet().ctx;
const sheetOf = ctx => sheets.find(s => s.ctx === ctx);
let charts = {}, chartN = 0;
function repaint() { charts = {}; renderView(); sheets.forEach(paintSheet); }
function repaintTop() { if (sheets.length) paintSheet(topSheet()); else renderView(); }

/* ---------------- charts (inline SVG) ---------------- */
function niceTicks(a, b, n) {
  const span = (b - a) || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
  for (let v = Math.floor(a / step) * step; v < b + step * 0.999; v += step) out.push(+v.toFixed(8));
  return out;
}
function lineChart(pts, { unit = '', dec = 1, fmt } = {}) {
  if (!pts.length) return `<div class="empty small">No data in this range yet</div>`;
  const id = 'c' + (chartN++), W = 340, H = 190, L = 34, R = 12, T = 14, B = 22;
  let x0 = pts[0].x, x1 = pts[pts.length - 1].x; if (x0 === x1) { x0 -= 3 * DAY; x1 += 3 * DAY; }
  let ys = pts.map(p => p.y), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padY = (y1 - y0) * 0.15 || Math.max(1, Math.abs(y1) * 0.05); y0 -= padY; y1 += padY;
  if (Math.min(...ys) >= 0 && y0 < 0) y0 = 0;
  const ticks = niceTicks(y0, y1, 4); y0 = ticks[0]; y1 = ticks[ticks.length - 1];
  const sx = x => L + (x - x0) / (x1 - x0) * (W - L - R), sy = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const f = fmt || (v => fmtNum(v, dec) + (unit ? ' ' + unit : ''));
  charts[id] = { W, H, hits: pts.map(p => ({ cx: sx(p.x), cy: sy(p.y), text: `${f(p.y)} · ${fmtDateY(p.x)}` })) };
  const d = pts.map((p, i) => (i ? 'L' : 'M') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1)).join('');
  const area = d + `L${sx(pts[pts.length - 1].x).toFixed(1)} ${H - B}L${sx(pts[0].x).toFixed(1)} ${H - B}Z`;
  const grid = ticks.map(t => `<line class="gl" x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${L - 6}" y="${sy(t) + 3}" text-anchor="end">${fmtNum(t, t % 1 ? 1 : 0)}</text>`).join('');
  const xl = [0, .5, 1].map((p, i) => `<text x="${sx(x0 + (x1 - x0) * p)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${fmtDate(x0 + (x1 - x0) * p)}</text>`).join('');
  const dots = pts.length <= 50 ? pts.map(p => `<circle class="cdot" r="3" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}"/>`).join('') : '';
  return `<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.22"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>
    ${grid}${xl}<path d="${area}" fill="url(#g${id})"/><path class="cline" d="${d}"/>${dots}<circle class="chl" r="5" style="display:none"/></svg><div class="ctip"></div></div>`;
}
function barChart(bars, { unit = '', dec = 0 } = {}) {
  const id = 'c' + (chartN++), W = 340, H = 170, L = 30, R = 6, T = 12, B = 22;
  const max = Math.max(1, ...bars.map(b => b.y)), ticks = niceTicks(0, max, 3), y1 = ticks[ticks.length - 1];
  const bw = (W - L - R) / bars.length, sy = y => T + (1 - y / y1) * (H - T - B);
  const every = Math.ceil(bars.length / 6);
  charts[id] = { W, H, hits: bars.map((b, i) => ({ cx: L + bw * i + bw / 2, cy: sy(b.y), text: `${b.tip || b.label}: ${fmtNum(b.y, dec)}${unit ? ' ' + unit : ''}` })) };
  const grid = ticks.map(t => `<line class="gl" x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${L - 6}" y="${sy(t) + 3}" text-anchor="end">${t >= 10000 ? fmtNum(t / 1000, 0) + 'k' : fmtNum(t, 1)}</text>`).join('');
  const rects = bars.map((b, i) => {
    const h = Math.max(0, (H - B) - sy(b.y)), x = L + bw * i + bw * 0.18;
    return `<rect class="bar ${b.dim ? 'dim' : ''}" x="${x.toFixed(1)}" y="${sy(b.y).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>` +
      ((bars.length - 1 - i) % every === 0 ? `<text x="${(L + bw * i + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>` : '');
  }).join('');
  return `<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}">${grid}${rects}<circle class="chl" r="0" style="display:none"/></svg><div class="ctip"></div></div>`;
}
function heatmap(weeks = 17) {
  const counts = {}; db.workouts.forEach(w => { const k = dayStart(w.start); counts[k] = (counts[k] || 0) + 1; });
  const start = addDays(weekStart(Date.now()), -7 * (weeks - 1)), today = dayStart(Date.now());
  const cs = 15, g = 3.5, L = 16, T = 14, W = L + weeks * (cs + g), H = T + 7 * (cs + g);
  let out = '', lastM = -1;
  for (let wi = 0; wi < weeks; wi++) for (let di = 0; di < 7; di++) {
    const ts = dayStart(addDays(start, wi * 7 + di)); if (ts > today) continue;
    const m = new Date(ts).getMonth();
    if (di === 0 && m !== lastM) { out += `<text x="${L + wi * (cs + g)}" y="9">${new Date(ts).toLocaleDateString('en-GB', { month: 'short' })}</text>`; lastM = m; }
    const c = counts[ts] || 0;
    out += `<rect class="hm${Math.min(c, 2)} ${ts === today ? 'hmt' : ''}" x="${L + wi * (cs + g)}" y="${T + di * (cs + g)}" width="${cs}" height="${cs}" rx="3.5"><title>${fmtDateY(ts)}: ${c}</title></rect>`;
  }
  ['M', '', 'W', '', 'F', '', 'S'].forEach((d, i) => { if (d) out += `<text x="0" y="${T + i * (cs + g) + 11}">${d}</text>`; });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}">${out}</svg></div>`;
}
function chartPtr(e) {
  const c = e.target.closest && e.target.closest('.chart');
  if (!c) { if (e.type === 'pointerdown') document.querySelectorAll('.ctip.on').forEach(t => t.classList.remove('on')); return; }
  const ch = charts[c.dataset.chart]; if (!ch || !ch.hits.length) return;
  const r = c.querySelector('svg').getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * ch.W;
  let best = ch.hits[0]; for (const h of ch.hits) if (Math.abs(h.cx - vx) < Math.abs(best.cx - vx)) best = h;
  const tip = c.querySelector('.ctip'), px = best.cx / ch.W * 100;
  tip.textContent = best.text; tip.style.left = px + '%'; tip.style.top = (best.cy / ch.H * 100) + '%';
  tip.style.transform = `translate(${px < 22 ? -12 : px > 78 ? -88 : -50}%,-135%)`; tip.classList.add('on');
  const hl = c.querySelector('.chl'); if (hl && hl.getAttribute('r') !== '0') { hl.setAttribute('cx', best.cx); hl.setAttribute('cy', best.cy); hl.style.display = ''; }
}
document.addEventListener('pointerdown', chartPtr);
document.addEventListener('pointermove', chartPtr);

const RANGES = [[30, '1M'], [90, '3M'], [180, '6M'], [365, '1Y'], [0, 'All']];
function rangeSeg(key, def = 90) {
  const v = ui.ranges[key] ?? def;
  return `<div class="seg">${RANGES.map(([d, l]) => `<button class="${d === v ? 'on' : ''}" data-a="range" data-k="${key}" data-v="${d}">${l}</button>`).join('')}</div>`;
}
const inRange = (pts, key, def = 90) => { const d = ui.ranges[key] ?? def; return d ? pts.filter(p => p.x >= Date.now() - d * DAY) : pts; };

/* ---------------- main views ---------------- */
const TABS = [['stats', 'Stats'], ['history', 'History'], ['workout', 'Workout'], ['exercises', 'Exercises'], ['measure', 'Measure']];
function renderView() {
  const t = ui.tab;
  $('#title').textContent = TABS.find(x => x[0] === t)[1];
  const extra = t === 'exercises' ? `<button class="tbtn" data-a="newEx">${ICON.plus}New</button>` : t === 'measure' ? `<button class="tbtn" data-a="logMeasure">${ICON.plus}Log</button>` : '';
  $('#topActions').innerHTML = extra + `<button class="gear" data-a="settings" aria-label="Settings">${ICON.gear}</button>`;
  $('#view').innerHTML = VIEWS[t]();
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab ${k === t ? 'on' : ''}" data-a="tab" data-v="${k}">${ICON[k]}<span>${l}</span></button>`).join('');
  updateActiveBar(); tick();
}
function updateActiveBar() {
  const bar = $('#activeBar'), show = !!db.active && !sheets.some(s => s.ctx && s.ctx.mode === 'active');
  bar.hidden = !show; document.body.classList.toggle('has-bar', show);
  if (show) bar.innerHTML = `<button class="abar" data-a="openActive"><span class="adot"></span><span class="aname">${esc(db.active.name)}</span><span class="js-rest-mini"></span><span class="js-elapsed">${clock(Date.now() - db.active.start)}</span></button>`;
}

const VIEWS = {
  workout() {
    const tpls = db.templates;
    return `<div class="lbl">Quick start</div>
      <button class="btn wide primary" data-a="startEmpty">Start an empty workout</button>
      <div class="sechead"><div class="lbl">My templates (${tpls.length})</div><button class="tbtn" data-a="newTemplate">${ICON.plus}Template</button></div>
      ${tpls.length ? `<div class="tgrid">${tpls.map(tplCard).join('')}</div>` :
        `<div class="card empty">No templates yet.<br>Create one for each session you run, e.g. Push, Pull, Legs.</div>`}`;
  },
  history() {
    const ws = [...db.workouts].reverse();
    if (!ws.length) return `<div class="empty">No workouts logged yet.<br>Finish a workout and it will appear here.</div>`;
    let out = '', m = '';
    for (const w of ws) {
      const mm = new Date(w.start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (mm !== m) { out += `<div class="month">${mm}</div>`; m = mm; }
      out += workoutCard(w);
    }
    return out;
  },
  exercises() {
    return `<div class="searchrow"><input class="search" type="search" data-in="exQ" placeholder="Search exercises" value="${esc(ui.exQ)}"></div>
      <div class="chips">${['', ...CATS].map(c => `<button class="chip ${ui.exCat === c ? 'on' : ''}" data-a="exCat" data-v="${c}">${c || 'All'}</button>`).join('')}</div>
      <div class="card list exlist">${exListHTML()}</div>`;
  },
  measure() {
    const bw = db.measurements.filter(m => m.type === 'bodyweight').sort((a, b) => a.date - b.date);
    let top = '';
    if (bw.length) {
      const pts = inRange(bw.map(m => ({ x: m.date, y: m.value })), 'mtop');
      top = `<div class="card" data-a="mOpen" data-v="bodyweight"><div class="ctitle2"><div class="ctitle">Bodyweight</div><div class="big">${fmtNum(bw[bw.length - 1].value, 2)} <span class="muted" style="font-size:15px">kg</span></div></div></div>
        <div class="card">${rangeSeg('mtop')}${lineChart(pts, { unit: 'kg' })}</div>`;
    }
    const rows = MEASURES.map(m => {
      const es = db.measurements.filter(e => e.type === m.id).sort((a, b) => a.date - b.date);
      const last = es[es.length - 1], prev = es[es.length - 2];
      const d = last && prev ? last.value - prev.value : null;
      return `<div class="lrow" data-a="mOpen" data-v="${m.id}"><div><div class="lname">${m.name}</div><div class="lsub">${last ? relDays(last.date) : 'No entries'}</div></div>
        <div style="display:flex;align-items:center;gap:10px"><div class="lval">${last ? `<div><b>${fmtNum(last.value, 2)}</b> ${m.unit}</div>` : ''}${d != null ? `<div class="delta ${Math.abs(d) < 1e-9 ? 'flat' : d > 0 ? 'up' : 'down'}" style="color:var(--muted)">${d > 0 ? '+' : ''}${fmtNum(d, 2)}</div>` : ''}</div>${ICON.chev.replace('<svg', '<svg class="chev"')}</div></div>`;
    }).join('');
    return `${top}${bw.length ? '' : `<button class="btn wide primary" data-a="logMeasure" style="margin-top:4px">Log measurements</button>`}
      <div class="lbl">Body parts</div><div class="card list">${rows}</div>`;
  },
  stats() {
    const ws = db.workouts, now = Date.now();
    const thisWeek = ws.filter(w => w.start >= weekStart(now)).length;
    const weeksSet = new Set(ws.map(w => weekStart(w.start)));
    let wk = weekStart(now), streak = 0; if (!weeksSet.has(wk)) wk = addDays(wk, -7);
    while (weeksSet.has(wk)) { streak++; wk = addDays(wk, -7); }
    const last30 = ws.filter(w => w.start >= now - 30 * DAY);
    const avgDur = last30.length ? last30.reduce((a, w) => a + (w.end - w.start), 0) / last30.length : 0;
    const N = ui.statWeeks, w0 = addDays(weekStart(now), -7 * (N - 1));
    const counts = Array.from({ length: N }, (_, i) => ({ ts: addDays(w0, 7 * i), c: 0, v: 0 }));
    for (const w of ws) { if (w.start < w0) continue; const i = Math.round((weekStart(w.start) - w0) / (7 * DAY)); if (counts[i]) { counts[i].c++; counts[i].v += wVolume(w); } }
    const lbl = c => fmtDate(c.ts), tipL = c => 'w/c ' + fmtDate(c.ts);
    const avgWk = counts.reduce((a, c) => a + c.c, 0) / N;
    // sets per body part, last 30 days
    const split = {}; for (const w of last30) for (const x of w.exercises) { const c = exById(x.eid).cat; split[c] = (split[c] || 0) + x.sets.filter(s => s.k !== 'w').length; }
    const sp = Object.entries(split).sort((a, b) => b[1] - a[1]), spMax = Math.max(1, ...sp.map(s => s[1]));
    const seg = `<div class="seg">${[12, 26, 52].map(n => `<button class="${n === N ? 'on' : ''}" data-a="statWeeks" data-v="${n}">${n} weeks</button>`).join('')}</div>`;
    return `<div class="kpis">
        <div class="kpi"><div class="v">${ws.length}</div><div class="k">Workouts logged</div></div>
        <div class="kpi"><div class="v">${thisWeek}</div><div class="k">This week</div></div>
        <div class="kpi"><div class="v">${streak}</div><div class="k">Week streak</div></div>
        <div class="kpi"><div class="v">${avgDur ? fmtDur(avgDur) : '–'}</div><div class="k">Avg duration (30 days)</div></div>
      </div>
      <div class="lbl">Workout frequency</div>
      <div class="card">${seg}<div class="ctitle2"><span class="muted" style="font-size:14px">Workouts per week</span><span class="muted" style="font-size:14px">avg ${fmtNum(avgWk, 1)}/wk</span></div>
        ${barChart(counts.map(c => ({ label: lbl(c), tip: tipL(c), y: c.c, dim: c.ts === weekStart(now) })), {})}</div>
      <div class="card"><div class="muted" style="font-size:14px;margin-bottom:6px">Training days</div>${heatmap()}</div>
      <div class="lbl">Volume</div>
      <div class="card"><div class="muted" style="font-size:14px">Weekly volume (kg lifted, working sets)</div>${barChart(counts.map(c => ({ label: lbl(c), tip: tipL(c), y: Math.round(c.v), dim: c.ts === weekStart(now) })), { unit: 'kg' })}</div>
      <div class="card"><div class="muted" style="font-size:14px">Working sets per body part · last 30 days</div>
        ${sp.length ? `<div class="hbars">${sp.map(([c, n]) => `<div class="hbar"><span>${c}</span><span class="t"><i style="width:${n / spMax * 100}%"></i></span><span class="n">${n}</span></div>`).join('')}</div>` : `<div class="empty small">No workouts in the last 30 days</div>`}</div>
      <div class="lbl">Exercise progress</div>
      <div class="card list">${topExercises()}</div>`;
  }
};
function topExercises() {
  const c = {}; db.workouts.forEach(w => w.exercises.forEach(x => c[x.eid] = (c[x.eid] || 0) + 1));
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length) return `<div class="empty small">Log some workouts to see per-exercise charts</div>`;
  return top.map(([id, n]) => {
    const ex = exById(id), h = exHistory(id), first = h[0].st, last = h[h.length - 1].st;
    const k = ex.type === 'wr' ? 'e1rm' : ex.type === 'bw' ? 'reps' : 'time';
    const d = last[k] - first[k];
    const unit = ex.type === 'wr' ? ' kg' : ex.type === 'bw' ? ' reps' : '';
    const fmtv = v => ex.type === 'dur' ? clockSec(v) : fmtNum(v, 1) + unit;
    return `<div class="lrow" data-a="exOpen" data-id="${id}"><div><div class="lname">${esc(ex.name)}</div><div class="lsub">${n} sessions · ${ex.type === 'wr' ? 'est. 1RM' : ex.type === 'bw' ? 'best reps' : 'longest'} ${fmtv(last[k])}</div></div>
      <div style="display:flex;align-items:center;gap:8px">${h.length > 1 ? `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '+' : ''}${ex.type === 'dur' ? clockSec(Math.abs(d)) : fmtNum(d, 1)}</span>` : ''}${ICON.chev.replace('<svg', '<svg class="chev"')}</div></div>`;
  }).join('');
}
function tplCard(t) {
  let last = 0; for (const w of db.workouts) if (w.templateId === t.id) last = Math.max(last, w.start);
  return `<div class="card tpl" data-a="tplOpen" data-id="${t.id}"><div class="ctop"><div class="ctitle">${esc(t.name)}</div>
    <button class="ibtn" data-a="tplMenu" data-id="${t.id}" aria-label="Template options">${ICON.more}</button></div>
    <div class="cmeta">${last ? 'Last performed ' + relDays(last) : 'Not performed yet'}</div>
    <div class="clines">${t.exercises.slice(0, 6).map(x => `<div>${x.sets.length} × ${esc(exById(x.eid).name)}</div>`).join('')}${t.exercises.length > 6 ? `<div>+${t.exercises.length - 6} more</div>` : ''}</div></div>`;
}
function workoutCard(w) {
  return `<div class="card" data-a="wOpen" data-id="${w.id}"><div class="ctitle">${esc(w.name)}</div><div class="cmeta">${fmtDateLong(w.start)}</div>
    <div class="wstats"><span>${ICON.clock}${fmtDur(w.end - w.start)}</span><span>${ICON.weight}${fmtNum(wVolume(w), 0)} kg</span>${w.prs ? `<span class="pr">${ICON.trophy}${w.prs} PR</span>` : ''}</div>
    <div class="wex"><span class="wh">Exercise</span><span class="wh" style="text-align:right">Best set</span>
    ${w.exercises.map(x => { const ex = exById(x.eid); return `<span>${x.sets.length} × ${esc(ex.name)}</span><span class="bs">${setText(ex, bestSet(ex, x.sets))}</span>`; }).join('')}</div></div>`;
}
function exUseCounts() { const c = {}; db.workouts.forEach(w => w.exercises.forEach(x => c[x.eid] = (c[x.eid] || 0) + 1)); return c; }
function filterEx(q, cat) {
  q = q.trim().toLowerCase();
  return db.exercises.filter(e => (!cat || e.cat === cat) && (!q || q.split(/\s+/).every(t => e.name.toLowerCase().includes(t))))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function exListHTML() {
  const list = filterEx(ui.exQ, ui.exCat), c = exUseCounts();
  if (!list.length) return `<div class="empty small">No matches. Tap New to add it.</div>`;
  return list.map(e => `<div class="lrow" data-a="exOpen" data-id="${e.id}"><div><div class="lname">${esc(e.name)}</div><div class="lsub">${e.cat}${c[e.id] ? ` · ${c[e.id]} session${c[e.id] > 1 ? 's' : ''}` : ''}</div></div>${ICON.chev.replace('<svg', '<svg class="chev"')}</div>`).join('');
}

/* ---------------- workout / template editor ---------------- */
function editorSheet(ctx) { return openSheet(() => editorHTML(ctx), { ctx }); }
function openActive() {
  if (!db.active) return;
  if (sheets.some(s => s.ctx && s.ctx.mode === 'active')) return;
  editorSheet({ mode: 'active', obj: db.active });
}
function editorHTML(ctx) {
  const o = ctx.obj, m = ctx.mode;
  const head = m === 'active'
    ? `<button class="tbtn" data-a="edMin" aria-label="Minimise">${ICON.down}</button><div class="stitle js-elapsed">${clock(Date.now() - o.start)}</div><button class="tbtn primary" data-a="edFinish">Finish</button>`
    : `<button class="tbtn" data-a="sheetClose">Cancel</button><div class="stitle">${m === 'template' ? (ctx.isNew ? 'New template' : 'Edit template') : 'Edit workout'}</div><button class="tbtn primary" data-a="edSave">Save</button>`;
  const body = `<input class="titlein" data-in="edName" value="${esc(o.name)}" placeholder="${m === 'template' ? 'Template name' : 'Workout name'}">
    ${m === 'active' ? `<div class="sub">${fmtDateLong(o.start)}</div>` : ''}
    ${m === 'edit' ? `<div class="row2"><label>Started<input type="datetime-local" data-in="edStart" value="${toLocalInput(o.start)}"></label><label>Duration (min)<input inputmode="numeric" data-in="edDur" value="${Math.round((o.end - o.start) / 60000)}"></label></div>` : ''}
    <textarea class="notes" data-in="edNotes" placeholder="Notes" rows="1">${esc(o.notes || '')}</textarea>
    ${o.exercises.map((x, i) => exBlock(ctx, x, i)).join('')}
    <div style="height:14px"></div>
    <button class="btn wide soft" data-a="edAddEx">Add exercises</button>
    ${m === 'active' ? `<div style="height:10px"></div><button class="btn wide dangerSoft" data-a="edCancel">Cancel workout</button>` : ''}
    <div class="spacer"></div>`;
  const rest = m === 'active' ? `<div class="restbar js-rest"><div class="rprog"></div><span class="rlbl">Rest</span><span class="rtime"></span>
      <button data-a="restAdj" data-v="-15">−15</button><button data-a="restAdj" data-v="15">+15</button><button class="rskip" data-a="restSkip">Skip</button></div>` : '';
  return `<div class="shead">${head}</div><div class="sbody">${body}</div>${rest}`;
}
function hint(s, p) { return { w: p ? p.w : s.pw, r: p ? p.r : s.pr, t: p ? p.t : s.pt }; }
function exBlock(ctx, x, i) {
  const ex = exById(x.eid), prev = lastSets(x.eid, ctx.obj.id), m = ctx.mode, chk = m === 'active';
  const cols = ex.type === 'dur' ? ['Time'] : [ex.type === 'bw' ? '+kg' : 'kg', 'Reps'];
  const gtc = `34px minmax(0,1fr) ${cols.length === 1 ? '96px' : '64px 56px'}${chk ? ' 42px' : ''}`;
  let n = 0;
  const rows = x.sets.map((s, j) => {
    const k = s.k || 'n', lbl = k === 'n' ? String(++n) : k.toUpperCase();
    const p = prev[j], h = hint(s, p), dj = `data-i="${i}" data-j="${j}"`;
    const inputs = ex.type === 'dur'
      ? `<input inputmode="numeric" data-in="setT" ${dj} value="${clockSec(s.t)}" placeholder="${h.t ? clockSec(h.t) : 'm:ss'}">`
      : `<input inputmode="decimal" data-in="setW" ${dj} value="${fmtKg(s.w)}" placeholder="${h.w != null && h.w !== '' ? fmtKg(h.w) : ex.type === 'bw' ? '–' : ''}">
         <input inputmode="numeric" data-in="setR" ${dj} value="${s.r ?? ''}" placeholder="${h.r ?? ''}">`;
    return `<div class="srow k-${k} ${chk && s.done ? 'done' : ''}" style="grid-template-columns:${gtc}">
      <button class="slbl" data-a="setMenu" ${dj}>${lbl}</button>
      <button class="sprev" data-a="usePrev" ${dj}>${p ? setText(ex, p) : '–'}</button>
      ${inputs}${chk ? `<button class="chk" data-a="setDone" ${dj} aria-label="Complete set">${ICON.check}</button>` : ''}</div>`;
  }).join('');
  return `<div class="exb"><div class="exh"><button class="exname" data-a="exInfo" data-i="${i}">${esc(ex.name)}</button>
    <button class="ibtn" data-a="exMenu" data-i="${i}" aria-label="Exercise options">${ICON.more}</button></div>
    <div class="srow head" style="grid-template-columns:${gtc}"><span>Set</span><span>Previous</span>${cols.map(c => `<span>${c}</span>`).join('')}${chk ? `<span>${ICON.check.replace('<svg', '<svg style="width:14px;height:14px;margin:auto"')}</span>` : ''}</div>
    ${rows}<button class="addset" data-a="addSet" data-i="${i}">+ Add set</button></div>`;
}
function newSets(eid, ctx) {
  const prev = lastSets(eid, ctx.obj.id);
  const src = prev.length ? prev : [{ k: 'n' }, { k: 'n' }, { k: 'n' }];
  return src.map(s => ctx.mode === 'template'
    ? { k: s.k || 'n', w: s.w ?? null, r: s.r ?? null, t: s.t ?? null }
    : { k: s.k || 'n', w: null, r: null, t: null, done: false });
}
const cleanSet = s => ({ k: s.k || 'n', w: s.w ?? null, r: s.r ?? null, t: s.t ?? null });
function persist(ctx) { if (ctx && ctx.mode === 'active') save(); }
const setOf = el => { const c = cur(); return c.obj.exercises[+el.dataset.i].sets[+el.dataset.j]; };

async function startWorkout(src, kind) {
  if (db.active) {
    const r = await actionSheet('A workout is already in progress', [{ label: 'Resume current workout', v: 'resume' }, { label: 'Discard it and start new', v: 'new', danger: true }]);
    if (!r) return;
    if (r === 'resume') { openActive(); return; }
    closeActiveSheet();
  }
  const start = Date.now();
  db.active = {
    id: uid(), name: src ? src.name : timeName(start), start, notes: '', rest: null,
    templateId: kind === 'template' ? src.id : (src && src.templateId) || null,
    exercises: src ? src.exercises.map(x => ({ eid: x.eid, sets: x.sets.map(s => ({ k: s.k || 'n', pw: s.w ?? null, pr: s.r ?? null, pt: s.t ?? null, w: null, r: null, t: null, done: false })) })) : []
  };
  save(); renderView(); openActive();
}
function closeActiveSheet() {
  const i = sheets.findIndex(s => s.ctx && s.ctx.mode === 'active');
  if (i >= 0) { const [s] = sheets.splice(i, 1); s.el.remove(); }
}
function startRest() { db.active.rest = { end: Date.now() + db.settings.rest * 1000, total: db.settings.rest }; save(); tick(); }

/* ---------------- detail sheets ---------------- */
const METRICS = {
  wr: [['e1rm', 'Est. 1RM', 'kg'], ['best', 'Heaviest', 'kg'], ['vol', 'Volume', 'kg'], ['reps', 'Most reps', 'reps']],
  bw: [['reps', 'Most reps', 'reps'], ['totalReps', 'Total reps', 'reps'], ['best', 'Added kg', 'kg']],
  dur: [['time', 'Longest', 'min']]
};
function openExercise(eid) { const st = { eid, metric: null }; openSheet(() => exDetailHTML(st), { exd: st }); }
function exDetailHTML(st) {
  const ex = exById(st.eid), ms = METRICS[ex.type] || METRICS.wr;
  if (!ms.some(m => m[0] === st.metric)) st.metric = ms[0][0];
  const [mk, , mu] = ms.find(m => m[0] === st.metric), hist = exHistory(st.eid);
  const pts = inRange(hist.map(h => ({ x: h.w.start, y: mk === 'time' ? h.st.time / 60 : h.st[mk] })).filter(p => p.y > 0), 'ex');
  const head = `<div class="shead"><button class="tbtn" data-a="sheetClose">Close</button><div class="stitle">${esc(ex.name)}</div><button class="tbtn" data-a="exEdit" data-id="${ex.id}">Edit</button></div>`;
  if (!hist.length) return head + `<div class="sbody"><div class="sub">${ex.cat} · ${TYPES[ex.type]}</div><div class="empty">No history for this exercise yet.</div></div>`;
  // records
  let rec = [];
  const maxBy = f => { let b = null, bv = -1; for (const h of hist) for (const s of h.sets) { if (s.k === 'w') continue; const v = f(s); if (v > bv) { bv = v; b = { s, w: h.w, v }; } } return b; };
  const recRow = (l, r, fmt) => r && r.v > 0 ? rec.push(`<span>${l}</span><span class="rv">${fmt(r)}<div class="rd">${fmtDateY(r.w.start)}</div></span>`) : 0;
  if (ex.type === 'wr') {
    recRow('Heaviest weight', maxBy(s => +s.w || 0), r => `${fmtKg(r.s.w)} kg × ${r.s.r}`);
    recRow('Best est. 1RM', maxBy(s => e1rm(+s.w || 0, +s.r || 0)), r => `${fmtNum(r.v, 1)} kg`);
    recRow('Best set volume', maxBy(s => (+s.w || 0) * (+s.r || 0)), r => `${fmtKg(r.s.w)} kg × ${r.s.r}`);
    const bv = hist.reduce((b, h) => h.st.vol > (b ? b.v : 0) ? { v: h.st.vol, w: h.w } : b, null);
    recRow('Best session volume', bv, r => `${fmtNum(r.v, 0)} kg`);
    recRow('Most reps', maxBy(s => +s.r || 0), r => `${r.s.r} × ${fmtKg(r.s.w)} kg`);
  } else if (ex.type === 'bw') {
    recRow('Most reps', maxBy(s => +s.r || 0), r => `${r.s.r} reps`);
    const bt = hist.reduce((b, h) => h.st.totalReps > (b ? b.v : 0) ? { v: h.st.totalReps, w: h.w } : b, null);
    recRow('Most reps in a session', bt, r => `${r.v}`);
    recRow('Heaviest added weight', maxBy(s => +s.w || 0), r => `+${fmtKg(r.s.w)} kg × ${r.s.r}`);
  } else recRow('Longest', maxBy(s => +s.t || 0), r => clockSec(r.s.t));
  const histList = [...hist].reverse().slice(0, 40).map(h => `<div class="hist" style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="hd">${fmtDateLong(h.w.start)}</div>
    <div class="hs">${h.sets.map((s, i) => `${s.k && s.k !== 'n' ? s.k.toUpperCase() : i + 1}. ${setText(ex, s)}${ex.type === 'wr' && s.k !== 'w' && s.r ? ` <span style="opacity:.7">(1RM ${fmtNum(e1rm(+s.w || 0, +s.r), 1)})</span>` : ''}`).join('<br>')}</div></div>`).join('');
  return head + `<div class="sbody"><div class="sub">${ex.cat} · ${hist.length} session${hist.length > 1 ? 's' : ''}</div>
    <div class="chips">${ms.map(([k, l]) => `<button class="chip ${k === st.metric ? 'on' : ''}" data-a="exMetric" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="card">${rangeSeg('ex')}${lineChart(pts, mk === 'time' ? { fmt: v => clockSec(Math.round(v * 60)) } : { unit: mu, dec: mu === 'kg' ? 1 : 0 })}</div>
    ${rec.length ? `<div class="lbl">Personal records</div><div class="card recs">${rec.join('')}</div>` : ''}
    <div class="lbl">History</div><div class="card" style="padding-top:2px;padding-bottom:2px">${histList}</div></div>`;
}
function openMeasure(type) { openSheet(() => mDetailHTML(type), { mtype: type }); }
function mDetailHTML(type) {
  const m = MEAS[type], es = db.measurements.filter(e => e.type === type).sort((a, b) => a.date - b.date);
  const pts = inRange(es.map(e => ({ x: e.date, y: e.value })), 'meas');
  const first = es[0], last = es[es.length - 1];
  const rows = [...es].reverse().map((e, i, arr) => {
    const p = arr[i + 1], d = p ? e.value - p.value : null;
    return `<div class="lrow" data-a="mEntry" data-id="${e.id}"><span>${fmtDateY(e.date)}</span><span class="lval"><b>${fmtNum(e.value, 2)}</b> ${m.unit}${d != null ? ` <span class="delta flat">${d > 0 ? '+' : ''}${fmtNum(d, 2)}</span>` : ''}</span></div>`;
  }).join('');
  return `<div class="shead"><button class="tbtn" data-a="sheetClose">Close</button><div class="stitle">${m.name}</div><button class="tbtn" data-a="mAdd" data-v="${type}">${ICON.plus}Add</button></div>
    <div class="sbody">${last ? `<div class="kpis"><div class="kpi"><div class="v">${fmtNum(last.value, 2)}<span class="muted" style="font-size:15px"> ${m.unit}</span></div><div class="k">Latest · ${relDays(last.date)}</div></div>
      <div class="kpi"><div class="v">${es.length > 1 ? (last.value - first.value > 0 ? '+' : '') + fmtNum(last.value - first.value, 2) : '–'}</div><div class="k">Change since ${fmtDate(first.date)}</div></div></div>` : ''}
    <div class="card" style="margin-top:10px">${rangeSeg('meas')}${lineChart(pts, { unit: m.unit, dec: 2 })}</div>
    <div class="lbl">Entries</div><div class="card list">${rows || '<div class="empty small">No entries yet. Tap Add.</div>'}</div></div>`;
}
function openWorkout(id) {
  openSheet(() => {
    const w = db.workouts.find(x => x.id === id);
    if (!w) return `<div class="shead"><button class="tbtn" data-a="sheetClose">Close</button><div></div><div></div></div><div class="sbody"><div class="empty">Workout deleted.</div></div>`;
    return `<div class="shead"><button class="tbtn" data-a="sheetClose">Close</button><div class="stitle">${esc(w.name)}</div><button class="ibtn" data-a="wMenu" data-id="${w.id}">${ICON.more}</button></div>
      <div class="sbody"><div class="sub">${fmtDateLong(w.start)}</div>
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><div class="v" style="font-size:20px">${fmtDur(w.end - w.start)}</div><div class="k">Duration</div></div>
        <div class="kpi"><div class="v" style="font-size:20px">${fmtNum(wVolume(w), 0)}</div><div class="k">Volume (kg)</div></div>
        <div class="kpi"><div class="v" style="font-size:20px">${w.prs || 0}</div><div class="k">PRs</div></div></div>
      ${w.notes ? `<div class="card" style="margin-top:10px">${esc(w.notes)}</div>` : ''}
      ${w.exercises.map(x => { const ex = exById(x.eid); return `<div class="card hist" style="margin-top:10px" data-a="exOpen" data-id="${x.eid}"><div class="hd" style="color:var(--accent)">${esc(ex.name)}</div>
        <div class="hs">${x.sets.map((s, i) => `${s.k && s.k !== 'n' ? s.k.toUpperCase() : i + 1}. ${setText(ex, s)}`).join('<br>')}</div></div>`; }).join('')}
      </div>`;
  }, { wid: id });
}
function openSettings() {
  openSheet(() => `<div class="shead"><div></div><div class="stitle">Settings</div><button class="tbtn" data-a="sheetClose">Done</button></div>
    <div class="sbody"><div class="lbl">Rest timer</div><div class="card list">
      <div class="lrow"><span>Default rest</span><select data-ch="rest">${[30, 45, 60, 75, 90, 120, 150, 180, 240, 300].map(s => `<option value="${s}" ${s === db.settings.rest ? 'selected' : ''}>${clockSec(s)}</option>`).join('')}</select></div>
      <label class="lrow"><span>Start automatically after each set</span><input type="checkbox" data-ch="restOn" ${db.settings.restOn ? 'checked' : ''}></label></div>
    <div class="lbl">Your data</div><div class="card list">
      <button class="lrow action" data-a="exportJSON">Export backup (JSON)</button>
      <button class="lrow action" data-a="exportCSV">Export spreadsheets (CSV)</button>
      <button class="lrow action" data-a="importJSON">Restore from backup…</button></div>
    <p class="note">Your data is stored only on this phone, inside this app. Export a backup regularly and save it to Files or iCloud Drive; restore it here if you change phone or reinstall. CSV export gives two files (sets and measurements) that open in Excel or Google Sheets.</p>
    <p class="note">${db.workouts.length} workouts · ${db.templates.length} template${db.templates.length === 1 ? "" : "s"} · ${db.measurements.length} measurements · ${db.exercises.length} exercises</p>
    <div class="card list"><button class="lrow danger" data-a="wipe">Delete all data</button></div></div>`, { settings: true });
}
function openPicker(cb, single = false) {
  const st = { q: '', cat: '', sel: [] };
  openSheet(() => `<div class="shead"><button class="tbtn" data-a="sheetClose">Cancel</button><div class="stitle">${single ? 'Replace exercise' : 'Add exercises'}</div>
      ${single ? '<div></div>' : `<button class="tbtn primary" data-a="pickDone">Add${st.sel.length ? ` (${st.sel.length})` : ''}</button>`}</div>
    <div class="sbody"><div class="searchrow"><input class="search" type="search" data-in="pickQ" placeholder="Search" value="${esc(st.q)}"><button class="tbtn" data-a="newEx">${ICON.plus}New</button></div>
      <div class="chips">${['', ...CATS].map(c => `<button class="chip ${st.cat === c ? 'on' : ''}" data-a="pickCat" data-v="${c}">${c || 'All'}</button>`).join('')}</div>
      <div class="card list plist">${pickList(st)}</div></div>`, { picker: st, cb, single });
}
function pickList(st) {
  const list = filterEx(st.q, st.cat), c = exUseCounts();
  if (!list.length) return `<div class="empty small">No matches. Tap New to create it.</div>`;
  return list.map(e => { const on = st.sel.includes(e.id); return `<div class="lrow ${on ? 'exsel' : ''}" data-a="pickToggle" data-id="${e.id}"><div><div class="lname">${esc(e.name)}</div><div class="lsub">${e.cat}${c[e.id] ? ` · ${c[e.id]}×` : ''}</div></div><span class="tick">${on ? ICON.check : ''}</span></div>`; }).join('');
}
function showSummary(w) {
  dialog({
    title: 'Workout complete', body: `<div class="sum"><div><div class="v">${fmtDur(w.end - w.start)}</div><div class="k">Duration</div></div>
      <div><div class="v">${fmtNum(wVolume(w), 0)} kg</div><div class="k">Volume</div></div>
      <div><div class="v">${wSets(w)}</div><div class="k">Sets</div></div><div><div class="v">${w.prs || 0}</div><div class="k">Exercises with a PR</div></div></div>`,
    buttons: [{ label: 'Done', v: true, cls: 'primary' }]
  });
}

/* ---------------- export / import ---------------- */
const csvCell = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const csv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');
async function shareFiles(files) {
  const fs = files.map(f => new File([f.text], f.name, { type: f.type }));
  if (navigator.canShare && navigator.canShare({ files: fs })) {
    try { await navigator.share({ files: fs }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  fs.forEach((f, i) => setTimeout(() => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }, i * 400));
}
function exportJSON() {
  const data = { app: 'RepLog', exportedAt: new Date().toISOString(), data: db };
  shareFiles([{ name: `replog-backup-${todayStr()}.json`, type: 'application/json', text: JSON.stringify(data, null, 1) }]);
}
function exportCSV() {
  const sets = [['date', 'start_time', 'workout', 'duration_min', 'exercise', 'body_part', 'set', 'set_type', 'weight_kg', 'reps', 'seconds', 'est_1rm_kg', 'notes']];
  const kn = { n: 'normal', w: 'warmup', d: 'drop', f: 'failure' };
  for (const w of db.workouts) {
    const d = new Date(w.start), date = toLocalInput(w.start).slice(0, 10), time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    for (const x of w.exercises) { const ex = exById(x.eid); x.sets.forEach((s, i) => sets.push([date, time, w.name, Math.round((w.end - w.start) / 60000), ex.name, ex.cat, i + 1, kn[s.k || 'n'], s.w, s.r, s.t, ex.type === 'wr' && s.r ? +e1rm(+s.w || 0, +s.r).toFixed(1) : '', w.notes])); }
  }
  const ms = [['date', 'measurement', 'value', 'unit']];
  [...db.measurements].sort((a, b) => a.date - b.date).forEach(m => ms.push([toLocalInput(m.date).slice(0, 10), (MEAS[m.type] || { name: m.type }).name, m.value, (MEAS[m.type] || {}).unit || '']));
  shareFiles([{ name: `replog-sets-${todayStr()}.csv`, type: 'text/csv', text: csv(sets) }, { name: `replog-measurements-${todayStr()}.csv`, type: 'text/csv', text: csv(ms) }]);
}
function importJSON() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text()), d = j.data || j;
      if (!Array.isArray(d.workouts) || !Array.isArray(d.exercises)) throw new Error('bad');
      if (!await confirmDlg(`Restore backup with ${d.workouts.length} workouts? This replaces everything currently in the app.`, 'Restore', true)) return;
      db = normalise(d); save(); while (sheets.length) closeSheet(); repaint(); toast('Backup restored');
    } catch (e) { toast('That file is not a valid RepLog backup'); }
  };
  inp.click();
}

/* ---------------- actions ---------------- */
const A = {
  tab(el) { ui.tab = el.dataset.v; charts = {}; renderView(); window.scrollTo(0, 0); },
  sheetClose() { closeSheet(); },
  settings() { openSettings(); },
  startEmpty() { startWorkout(null); },
  openActive() { openActive(); },
  newTemplate() { editorSheet({ mode: 'template', isNew: true, obj: { id: uid(), name: '', notes: '', exercises: [] } }); },
  async tplOpen(el) {
    const t = db.templates.find(x => x.id === el.dataset.id); if (!t) return;
    const r = await dialog({
      title: t.name, body: `<div class="dlist">${t.exercises.map(x => `<div><span>${x.sets.length} ×</span>${esc(exById(x.eid).name)}</div>`).join('')}</div>${t.notes ? `<p class="muted">${esc(t.notes)}</p>` : ''}`,
      buttons: [{ label: 'Edit', v: 'edit' }, { label: 'Start workout', v: 'start', cls: 'primary' }]
    });
    if (r === 'edit') editorSheet({ mode: 'template', obj: clone(t) });
    if (r === 'start') startWorkout(t, 'template');
  },
  async tplMenu(el) {
    const t = db.templates.find(x => x.id === el.dataset.id); if (!t) return;
    const r = await actionSheet(t.name, [{ label: 'Start workout', v: 'start' }, { label: 'Edit template', v: 'edit' }, { label: 'Duplicate', v: 'dup' }, { label: 'Delete template', v: 'del', danger: true }]);
    if (r === 'start') startWorkout(t, 'template');
    if (r === 'edit') editorSheet({ mode: 'template', obj: clone(t) });
    if (r === 'dup') { const c = clone(t); c.id = uid(); c.name += ' (copy)'; db.templates.push(c); save(); renderView(); }
    if (r === 'del' && await confirmDlg(`Delete template "${t.name}"? Past workouts are kept.`, 'Delete', true)) { db.templates = db.templates.filter(x => x.id !== t.id); save(); renderView(); }
  },
  // editor
  edMin() { closeSheet(); },
  edAddEx() {
    const ctx = cur();
    openPicker(ids => { ids.forEach(eid => ctx.obj.exercises.push({ eid, sets: newSets(eid, ctx) })); persist(ctx); paintSheet(sheetOf(ctx)); });
  },
  addSet(el) {
    const ctx = cur(), x = ctx.obj.exercises[+el.dataset.i], l = x.sets[x.sets.length - 1];
    x.sets.push(ctx.mode === 'active'
      ? { k: 'n', w: null, r: null, t: null, done: false, pw: l ? (l.w ?? l.pw) : null, pr: l ? (l.r ?? l.pr) : null, pt: l ? (l.t ?? l.pt) : null }
      : { k: 'n', w: l ? l.w : null, r: l ? l.r : null, t: l ? l.t : null });
    persist(ctx); paintSheet(topSheet());
  },
  async setMenu(el) {
    const ctx = cur(), i = +el.dataset.i, j = +el.dataset.j, x = ctx.obj.exercises[i];
    const r = await actionSheet(`Set ${j + 1}`, [{ label: 'Normal set', v: 'n' }, { label: 'Warm-up set (W)', v: 'w' }, { label: 'Drop set (D)', v: 'd' }, { label: 'Failure set (F)', v: 'f' }, { label: 'Delete set', v: 'del', danger: true }]);
    if (!r) return;
    if (r === 'del') x.sets.splice(j, 1); else x.sets[j].k = r;
    persist(ctx); paintSheet(sheetOf(ctx));
  },
  usePrev(el) {
    const ctx = cur(), x = ctx.obj.exercises[+el.dataset.i], p = lastSets(x.eid, ctx.obj.id)[+el.dataset.j]; if (!p) return;
    const s = x.sets[+el.dataset.j]; s.w = p.w; s.r = p.r; s.t = p.t; persist(ctx); paintSheet(topSheet());
  },
  setDone(el) {
    const ctx = cur(), x = ctx.obj.exercises[+el.dataset.i], j = +el.dataset.j, s = x.sets[j], ex = exById(x.eid);
    if (!s.done) {
      const h = hint(s, lastSets(x.eid, ctx.obj.id)[j]);
      if (ex.type === 'dur') { if (s.t == null) s.t = h.t ?? null; if (!s.t) return toast('Enter a time first'); }
      else {
        if (s.r == null) s.r = h.r ?? null;
        if (s.w == null && h.w != null && h.w !== '') s.w = h.w;
        if (!s.r) return toast('Enter reps first');
        if (ex.type === 'wr' && s.w == null) return toast('Enter the weight first');
      }
      s.done = true;
      if (db.settings.restOn && s.k !== 'w') startRest();
    } else s.done = false;
    persist(ctx); paintSheet(topSheet());
  },
  async exMenu(el) {
    const ctx = cur(), i = +el.dataset.i, arr = ctx.obj.exercises, x = arr[i];
    const r = await actionSheet(exById(x.eid).name, [{ label: 'History & charts', v: 'info' }, ...(i > 0 ? [{ label: 'Move up', v: 'up' }] : []), ...(i < arr.length - 1 ? [{ label: 'Move down', v: 'down' }] : []), { label: 'Replace exercise', v: 'rep' }, { label: 'Remove exercise', v: 'del', danger: true }]);
    if (r === 'info') return openExercise(x.eid);
    if (r === 'up') [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    else if (r === 'down') [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
    else if (r === 'rep') return openPicker(ids => { x.eid = ids[0]; x.sets.forEach(s => { s.pw = s.pr = s.pt = null; }); persist(ctx); paintSheet(sheetOf(ctx)); }, true);
    else if (r === 'del') { if (x.sets.some(s => s.done) && !await confirmDlg('Remove this exercise and its completed sets?', 'Remove', true)) return; arr.splice(i, 1); }
    else return;
    persist(ctx); paintSheet(sheetOf(ctx));
  },
  exInfo(el) { openExercise(cur().obj.exercises[+el.dataset.i].eid); },
  async edCancel() {
    if (!await confirmDlg('Discard this workout? Nothing will be saved.', 'Discard', true)) return;
    db.active = null; save(); closeActiveSheet(); repaint();
  },
  async edFinish() {
    const o = db.active; if (!o) return;
    const done = o.exercises.reduce((n, x) => n + x.sets.filter(s => s.done).length, 0);
    const pending = o.exercises.some(x => x.sets.some(s => !s.done));
    if (!done) { if (await confirmDlg('No sets have been ticked off. Discard this workout?', 'Discard', true)) { db.active = null; save(); closeActiveSheet(); repaint(); } return; }
    if (!await confirmDlg(pending ? 'Finish workout? Sets not ticked off will be discarded.' : 'Finish workout?', 'Finish')) return;
    const w = { id: o.id, name: o.name.trim() || timeName(o.start), templateId: o.templateId || null, start: o.start, end: Date.now(), notes: o.notes || '',
      exercises: o.exercises.map(x => ({ eid: x.eid, sets: x.sets.filter(s => s.done).map(cleanSet) })).filter(x => x.sets.length) };
    w.prs = countPRs(w);
    db.workouts.push(w); sortW(); db.active = null; save(); closeActiveSheet(); repaint();
    const t = db.templates.find(t => t.id === w.templateId);
    if (t) {
      const same = t.exercises.length === w.exercises.length && t.exercises.every((x, i) => x.eid === w.exercises[i].eid && x.sets.length === w.exercises[i].sets.length);
      if (!same && await confirmDlg(`Update the "${t.name}" template to match this workout's exercises and sets?`, 'Update')) {
        t.exercises = w.exercises.map(x => ({ eid: x.eid, sets: x.sets.map(cleanSet) })); save(); repaint();
      }
    }
    showSummary(w);
  },
  edSave() {
    const ctx = cur(), o = ctx.obj;
    if (ctx.mode === 'template') {
      if (!o.name.trim()) return toast('Give the template a name');
      if (!o.exercises.length) return toast('Add at least one exercise');
      const t = { id: o.id, name: o.name.trim(), notes: o.notes || '', exercises: o.exercises.map(x => ({ eid: x.eid, sets: x.sets.map(cleanSet) })) };
      const i = db.templates.findIndex(x => x.id === t.id); if (i >= 0) db.templates[i] = t; else db.templates.push(t);
    } else {
      const w = Object.assign({}, o, { name: o.name.trim() || 'Workout', exercises: o.exercises.map(x => ({ eid: x.eid, sets: x.sets.filter(s => s.r != null || s.t != null || s.w != null).map(cleanSet) })).filter(x => x.sets.length) });
      const i = db.workouts.findIndex(x => x.id === w.id); if (i < 0) return closeSheet();
      db.workouts[i] = w; sortW(); w.prs = countPRs(w);
    }
    save(); closeSheet(); repaint();
  },
  restAdj(el) { const r = db.active && db.active.rest; if (!r) return; const v = +el.dataset.v; r.end += v * 1000; r.total = Math.max(1, r.total + v); save(); tick(); },
  restSkip() { if (db.active) { db.active.rest = null; save(); tick(); } },
  // picker
  pickToggle(el) {
    const s = topSheet(), id = el.dataset.id;
    if (s.single) { closeSheet(); return s.cb([id]); }
    const i = s.picker.sel.indexOf(id); if (i >= 0) s.picker.sel.splice(i, 1); else s.picker.sel.push(id);
    paintSheet(s);
  },
  pickCat(el) { const s = topSheet(); s.picker.cat = el.dataset.v; paintSheet(s); },
  pickDone() { const s = topSheet(), sel = [...s.picker.sel]; closeSheet(); if (sel.length) s.cb(sel); },
  async newEx() {
    const r = await exerciseForm(); if (!r) return;
    const e = Object.assign({ id: uid() }, r); db.exercises.push(e); save();
    const s = topSheet();
    if (s && s.picker) { if (s.single) { closeSheet(); return s.cb([e.id]); } s.picker.sel.push(e.id); s.picker.q = ''; paintSheet(s); } else repaint();
    toast('Exercise added');
  },
  async exEdit(el) {
    const ex = db.exercises.find(e => e.id === el.dataset.id); if (!ex) return;
    const used = db.workouts.some(w => w.exercises.some(x => x.eid === ex.id)) || db.templates.some(t => t.exercises.some(x => x.eid === ex.id));
    const r = await actionSheet(ex.name, [{ label: 'Rename / change body part', v: 'edit' }, { label: used ? 'Delete (in use – not allowed)' : 'Delete exercise', v: used ? 'no' : 'del', danger: !used }]);
    if (r === 'edit') { const f = await exerciseForm(ex); if (f) { Object.assign(ex, f); save(); repaint(); } }
    if (r === 'no') toast('Remove it from your workouts and templates first');
    if (r === 'del' && await confirmDlg(`Delete "${ex.name}"?`, 'Delete', true)) { db.exercises = db.exercises.filter(e => e.id !== ex.id); save(); closeSheet(); repaint(); }
  },
  exOpen(el) { openExercise(el.dataset.id); },
  exCat(el) { ui.exCat = el.dataset.v; renderView(); },
  exMetric(el) { topSheet().exd.metric = el.dataset.v; paintSheet(topSheet()); },
  range(el) { ui.ranges[el.dataset.k] = +el.dataset.v; repaintTop(); },
  statWeeks(el) { ui.statWeeks = +el.dataset.v; renderView(); },
  // history
  wOpen(el) { openWorkout(el.dataset.id); },
  async wMenu(el) {
    const w = db.workouts.find(x => x.id === el.dataset.id); if (!w) return;
    const r = await actionSheet(w.name, [{ label: 'Edit workout', v: 'edit' }, { label: 'Repeat this workout', v: 'rep' }, { label: 'Save as template', v: 'tpl' }, { label: 'Delete workout', v: 'del', danger: true }]);
    if (r === 'edit') editorSheet({ mode: 'edit', obj: clone(w) });
    if (r === 'rep') { closeSheet(); startWorkout(w, 'repeat'); }
    if (r === 'tpl') {
      const name = await promptDlg('Template name', w.name, ''); if (!name || !name.trim()) return;
      db.templates.push({ id: uid(), name: name.trim(), notes: '', exercises: w.exercises.map(x => ({ eid: x.eid, sets: x.sets.map(cleanSet) })) }); save(); repaint(); toast('Template saved');
    }
    if (r === 'del' && await confirmDlg('Delete this workout permanently?', 'Delete', true)) { db.workouts = db.workouts.filter(x => x.id !== w.id); save(); closeSheet(); repaint(); }
  },
  // measurements
  mOpen(el) { openMeasure(el.dataset.v); },
  logMeasure() {
    const st = { date: todayStr() };
    openSheet(() => `<div class="shead"><button class="tbtn" data-a="sheetClose">Cancel</button><div class="stitle">Log measurements</div><button class="tbtn primary" data-a="mSave">Save</button></div>
      <div class="sbody"><label class="field">Date<input type="date" data-in="mDate" value="${st.date}"></label>
      <p class="note" style="margin-top:0">Fill in only what you measured. Placeholders show your last entry.</p>
      <div class="card list">${MEASURES.map(m => { const l = db.measurements.filter(e => e.type === m.id).sort((a, b) => b.date - a.date)[0];
        return `<label class="mrow"><span>${m.name}</span><input inputmode="decimal" data-m="${m.id}" placeholder="${l ? fmtNum(l.value, 2) : ''}"><span class="unit">${m.unit}</span></label>`; }).join('')}</div></div>`, { mlog: st });
  },
  mSave() {
    const s = topSheet(), ts = dateStrToTs(s.mlog.date || todayStr()); let n = 0;
    s.el.querySelectorAll('[data-m]').forEach(i => { const v = num(i.value); if (v != null && v > 0) { db.measurements.push({ id: uid(), type: i.dataset.m, date: ts, value: v }); n++; } });
    if (!n) return toast('Enter at least one value');
    save(); closeSheet(); repaint(); toast(`Saved ${n} measurement${n > 1 ? 's' : ''}`);
  },
  async mAdd(el) {
    const m = MEAS[el.dataset.v], v = num(await promptDlg(`${m.name} today (${m.unit})`));
    if (v == null || v <= 0) return;
    db.measurements.push({ id: uid(), type: m.id, date: dateStrToTs(todayStr()), value: v }); save(); repaint();
  },
  async mEntry(el) {
    const e = db.measurements.find(x => x.id === el.dataset.id); if (!e) return;
    const r = await actionSheet(`${MEAS[e.type].name} · ${fmtDateY(e.date)}`, [{ label: 'Edit value', v: 'edit' }, { label: 'Delete entry', v: 'del', danger: true }]);
    if (r === 'edit') { const v = num(await promptDlg(`${MEAS[e.type].name} (${MEAS[e.type].unit})`, e.value)); if (v != null && v > 0) { e.value = v; save(); repaint(); } }
    if (r === 'del') { db.measurements = db.measurements.filter(x => x.id !== e.id); save(); repaint(); }
  },
  // settings
  exportJSON() { exportJSON(); },
  exportCSV() { exportCSV(); },
  importJSON() { importJSON(); },
  async wipe() {
    if (!await confirmDlg('Delete ALL workouts, templates and measurements? Export a backup first if unsure.', 'Delete all', true)) return;
    db = normalise({}); save(); while (sheets.length) closeSheet(); repaint(); toast('All data deleted');
  }
};

const IN = {
  edName(t) { cur().obj.name = t.value; persist(cur()); },
  edNotes(t) { cur().obj.notes = t.value; persist(cur()); },
  edStart(t) { const o = cur().obj, v = new Date(t.value).getTime(); if (!isNaN(v)) { const d = o.end - o.start; o.start = v; o.end = v + d; } },
  edDur(t) { const o = cur().obj, m = num(t.value); if (m > 0) o.end = o.start + m * 60000; },
  setW(t) { setOf(t).w = num(t.value); persist(cur()); },
  setR(t) { setOf(t).r = int(t.value); persist(cur()); },
  setT(t) { setOf(t).t = parseTime(t.value); persist(cur()); },
  exQ(t) { ui.exQ = t.value; $('.exlist').innerHTML = exListHTML(); },
  pickQ(t) { const s = topSheet(); s.picker.q = t.value; s.el.querySelector('.plist').innerHTML = pickList(s.picker); },
  mDate(t) { topSheet().mlog.date = t.value; }
};

document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  const fn = A[a.dataset.a]; if (fn) { e.preventDefault(); fn(a, e); }
});
document.addEventListener('input', e => { const t = e.target, f = t.dataset && IN[t.dataset.in]; if (f) f(t); });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.ch === 'rest') { db.settings.rest = +t.value; save(); }
  if (t.dataset.ch === 'restOn') { db.settings.restOn = t.checked; save(); }
});
// select numbers on focus so typing replaces them
document.addEventListener('focusin', e => { if (e.target.matches('.srow input')) setTimeout(() => { try { e.target.select(); } catch (x) {} }, 0); });

/* ---------------- timers ---------------- */
let actx = null;
document.addEventListener('pointerdown', () => { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } else if (actx.state === 'suspended') actx.resume(); });
function beep() {
  if (!actx) return;
  try {
    [0, 0.25].forEach(off => {
      const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + off;
      o.frequency.value = 880; g.gain.setValueAtTime(0.001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
      o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + 0.22);
    });
  } catch (e) {}
}
function tick() {
  if (!db.active) return;
  const el = clock(Date.now() - db.active.start);
  document.querySelectorAll('.js-elapsed').forEach(e => e.textContent = el);
  const r = db.active.rest; let left = r ? Math.ceil((r.end - Date.now()) / 1000) : 0;
  if (r && left <= 0) { if (left > -3) beep(); db.active.rest = null; save(); left = 0; if (navigator.vibrate) navigator.vibrate(300); }
  const on = !!db.active.rest;
  document.querySelectorAll('.js-rest').forEach(b => {
    b.classList.toggle('on', on);
    if (on) { b.querySelector('.rtime').textContent = clockSec(left); b.querySelector('.rprog').style.width = Math.min(100, 100 * left / db.active.rest.total) + '%'; }
  });
  document.querySelectorAll('.js-rest-mini').forEach(e => e.textContent = on ? 'Rest ' + clockSec(left) : '');
}
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });

renderView();
if (db.active) openActive();
