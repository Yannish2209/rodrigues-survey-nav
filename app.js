'use strict';
(function () {
const D = window.RSN, LEGS = D.legs, BY = {};
LEGS.forEach(l => BY[l.id] = l);
const DAYC = {sun: '--sun', mon: '--mon', tue: '--tue', wed: '--wed'};
const DAYCOL_NAME = {sun: 'grey', mon: 'blue', tue: 'orange', wed: 'purple'};
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const col = day => css(DAYC[day]);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const TOTAL_KM = LEGS.filter(l => l.id !== 'sun').reduce((a, l) => a + l.tkm, 0);

/* ---------------- geometry & formatting ---------------- */
const KX = 111320 * Math.cos(-19.7 * Math.PI / 180), KY = 110540;
const dist = (a, b) => Math.hypot((b[1] - a[1]) * KX, (b[0] - a[0]) * KY);
const bear = (a, b) => (Math.atan2((b[1] - a[1]) * KX, (b[0] - a[0]) * KY) * 180 / Math.PI + 360) % 360;
const adiff = (a, b) => Math.abs(((b - a + 540) % 360) - 180);
const fmtKm = k => (Math.round(k * 10) / 10).toFixed(1);
const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m >= 100 ? Math.round(m / 10) * 10 + ' m' : Math.max(0, Math.round(m / 5) * 5) + ' m';
const fmtDur = ms => { const m = Math.floor(ms / 60000); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const hm = min => Math.floor(min / 60) + 'h' + String(Math.round(min) % 60).padStart(2, '0');
const clock = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const localDate = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const telHref = t => 'tel:' + t.replace(/[^+\d]/g, '');
const gmaps = ll => `https://www.google.com/maps/search/?api=1&query=${ll[0]},${ll[1]}`;

/* ---------------- storage ---------------- */
const KEY = 'rsn-v2';
const DEF = {legs: {}, obs: [], active: null, ui: {tab: 'today', day: null},
  settings: {voice: true, vibrate: true, theme: 'auto', headingUp: false, demo: false, demoSpeed: 8}};
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
S = Object.assign({}, DEF, S);
S.settings = Object.assign({}, DEF.settings, S.settings || {});
S.ui = Object.assign({}, DEF.ui, S.ui || {});
S.legs = S.legs || {}; S.obs = S.obs || [];
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Phone storage is full: export your log'); } }
const LS = id => S.legs[id] || (S.legs[id] = {idx: 0, elapsed: 0, trace: [], done: false, started: null, finished: null});

/* ---------------- leg helpers ---------------- */
function pointAt(l, f) { const i = Math.min(Math.floor(f), l.pts.length - 1), t = f - i; if (i >= l.pts.length - 1) return l.pts[l.pts.length - 1]; const a = l.pts[i], b = l.pts[i + 1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function interp(arr, f) { const i = Math.min(Math.floor(f), arr.length - 1), t = f - i; if (i >= arr.length - 1) return arr[arr.length - 1]; return arr[i] + (arr[i + 1] - arr[i]) * t; }
const kmAt = (l, f) => interp(l.km, f), mnAt = (l, f) => interp(l.mn, f);
function idxAtKm(l, k) { let lo = 0, hi = l.km.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (l.km[m] < k) lo = m + 1; else hi = m; } return lo; }
function legStatus(id) {
  const l = BY[id], s = LS(id), k = kmAt(l, s.idx);
  if (s.done) return {cls: 'done', txt: 'Done', km: l.tkm};
  if (S.active === id && nav.on) return {cls: 'live', txt: 'Driving', km: k};
  if (s.idx > 1) return {cls: 'part', txt: fmtKm(k) + ' / ' + l.tkm + ' km', km: k};
  return {cls: '', txt: 'Not started', km: 0};
}
function surveyKm() { return LEGS.filter(l => l.id !== 'sun').reduce((a, l) => a + legStatus(l.id).km, 0); }

/* ---------------- theme ---------------- */
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (S.settings.theme === 'auto') redrawAll(); });

/* ---------------- toast & confirm ---------------- */
let toastT;
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
function confirmBox(title, body, yesLabel, onYes) {
  $('cf-title').textContent = title; $('cf-body').textContent = body; $('cf-yes').textContent = yesLabel;
  $('sh-confirm').hidden = false;
  $('cf-yes').onclick = () => { $('sh-confirm').hidden = true; onYes(); };
  $('cf-no').onclick = () => $('sh-confirm').hidden = true;
}
document.querySelectorAll('.sheet').forEach(sh => sh.addEventListener('click', e => { if (e.target === sh && sh.id !== 'sh-check') sh.hidden = true; }));

/* ---------------- layout ---------------- */
function setTopH() { document.documentElement.style.setProperty('--toph', $('topbar').offsetHeight + 'px'); }
setTopH(); addEventListener('resize', () => { setTopH(); map.invalidateSize(); if (nav.on) applyOrientation(); });

/* ---------------- map ---------------- */
const map = L.map('map', {zoomControl: false, attributionControl: true, preferCanvas: true, renderer: L.canvas({padding: 1}), zoomSnap: .5, minZoom: 11, maxZoom: 19});
map.fitBounds([[-19.765, 63.335], [-19.665, 63.51]]);
map.attributionControl.setPrefix(false).addAttribution('© OpenStreetMap contributors');
const baseG = L.layerGroup().addTo(map), ovG = L.layerGroup().addTo(map), navG = L.layerGroup(), chevG = L.layerGroup(), markG = L.layerGroup().addTo(map);
let meMarker = null, focusLeg = null;
function drawBase() {
  baseG.clearLayers();
  D.base.land.forEach(r => L.polygon(r, {color: css('--landedge'), weight: 1, fillColor: css('--land'), fillOpacity: 1, interactive: false}).addTo(baseG));
  D.base.minor.forEach(r => L.polyline(r, {color: css('--road'), weight: 2, interactive: false}).addTo(baseG));
  D.base.main.forEach(r => L.polyline(r, {color: css('--roadmain'), weight: 3.5, interactive: false}).addTo(baseG));
}
const POICOL = {base: '--fg', lunch: '--warn', lunch2: '--warn', scenic: '--accent', sight: '--accent', fuel: '--muted'};
function drawOverview() {
  ovG.clearLayers();
  LEGS.forEach(l => {
    const f = !focusLeg || focusLeg === l.id;
    L.polyline(l.pts, {color: col(l.day), weight: f && focusLeg ? 6 : 3.5, opacity: f ? .95 : .2}).bindTooltip(`${l.name} · ${l.tkm} km`, {sticky: true}).addTo(ovG);
    const tr = LS(l.id).trace; if (tr.length > 1) L.polyline(tr, {color: css('--fg'), weight: 2, opacity: .55, dashArray: '2 5', interactive: false}).addTo(ovG);
  });
  D.pois.forEach(([n, la, lo, k, note]) => {
    const big = k === 'lunch' || k === 'scenic' || k === 'base';
    const m = L.circleMarker([la, lo], {radius: big ? 7 : 4.5, color: css('--panel'), weight: 2, fillColor: css(POICOL[k]), fillOpacity: (k === 'lunch2' || k === 'sight') ? .6 : 1}).addTo(ovG);
    m.bindPopup(`<b>${esc(n)}</b><br>${esc(note)}<br><a href="${gmaps([la, lo])}" target="_blank" rel="noopener">Open in Google Maps</a>`);
    if (k === 'base') m.bindTooltip(n.replace(' (approx. pin)', ''), {permanent: true, direction: 'right', offset: [6, 0], className: 'lab'});
  });
  drawMarks();
  $('maplegend').innerHTML = ['sun', 'mon', 'tue', 'wed'].map(d => `<span><i style="background:var(${DAYC[d]})"></i>${({sun: 'Sun arrival', mon: 'Mon · West', tue: 'Tue · South & east', wed: 'Wed · North & east'})[d]}</span>`).join('') +
    `<span><i style="background:var(--gold);height:10px;width:10px;border-radius:50%"></i>Your marks (${S.obs.length})</span>`;
}
function drawMarks() {
  markG.clearLayers();
  S.obs.forEach(o => L.circleMarker([o.lat, o.lon], {radius: 7, color: '#1b1300', weight: 1.5, fillColor: css('--gold'), fillOpacity: 1})
    .bindPopup(`<b>${esc(o.tag)}</b><br>${esc(new Date(o.t).toLocaleString())}${o.leg ? '<br>' + esc(BY[o.leg]?.name || o.leg) + ' · km ' + fmtKm(o.km) : ''}${o.note ? '<br>' + esc(o.note) : ''}`).addTo(markG));
}
function redrawAll() { drawBase(); drawOverview(); if (nav.on) drawNavLeg(); renderAll(); }
drawBase(); drawOverview();

/* ---------------- views & tabs ---------------- */
function showTab(v) {
  S.ui.tab = v; save();
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.v === v));
  ['today', 'log', 'more'].forEach(x => $('v-' + x).hidden = x !== v);
  if (v === 'map') { setTimeout(() => map.invalidateSize(), 50); drawOverview(); }
  if (v === 'today') renderToday(); if (v === 'log') renderLog(); if (v === 'more') renderMore();
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.v));
function renderAll() { const v = S.ui.tab; if (v === 'today') renderToday(); if (v === 'log') renderLog(); if (v === 'more') renderMore(); }

function defaultDay() {
  const t = localDate(), d = D.days.find(x => x.date === t);
  if (d) return d.key;
  return t < D.days[0].date ? 'sun' : 'wed';
}
let curDay = defaultDay();

function ring(frac, c) {
  const r = 34, C = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--line)" stroke-width="9"/>${frac > 0.005 ? `<circle cx="42" cy="42" r="${r}" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * frac} ${C}" transform="rotate(-90 42 42)"/>` : ''}<text x="42" y="47" text-anchor="middle" font-size="17" font-weight="800" fill="currentColor">${Math.round(frac * 100)}%</text></svg>`;
}
function loopCard(id) {
  const l = BY[id], s = LS(id), st = legStatus(id), frac = st.km / l.tkm;
  const btn = s.done ? 'Drive again' : s.idx > 1 ? 'Resume' : 'Start';
  return `<div class="card loop" style="--c:var(${DAYC[l.day]})">
    <div class="row"><h3>${esc(l.name)} loop</h3><span class="pill ${st.cls}">${esc(st.txt)}</span></div>
    <div class="meta">${esc(l.frm)} → ${esc(l.to)}</div>
    <div class="kv"><div><b class="num">${l.tkm}</b><span>km</span></div><div><b class="num">${hm(l.tmin)}</b><span>planned</span></div><div><b class="num">${l.start}</b><span>start</span></div></div>
    <div class="bar" style="--c:var(${DAYC[l.day]})"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
    ${s.done && s.elapsed ? `<p class="meta">Driven in ${fmtDur(s.elapsed)} (plan ${hm(l.tmin)})${s.finished ? ' · finished ' + clock(new Date(s.finished)) : ''}</p>` : ''}
    <div class="btnrow" style="margin-top:10px"><button class="btn" data-start="${id}">${btn} ${esc(l.name)}</button><button class="btn sec small" data-preview="${id}">Map</button></div>
  </div>`;
}
function lunchCard(list) {
  const p = list[0];
  const tels = r => r.tel.map(t => `<a class="callbtn" href="${telHref(t)}">📞 <span class="tel">${esc(t)}</span></a>`).join(' ');
  return `<div class="card"><div class="row"><h3>12:30 · Lunch</h3><span class="pill">Book the day before</span></div>
    <p style="margin:8px 0 2px"><b>${esc(p.name)}</b> · ${esc(p.rating)}</p>
    <div class="meta">${esc(p.area)} · ${esc(p.hours)}<br>${esc(p.food)}</div>
    <div class="btnrow" style="margin-top:10px">${tels(p)} <a class="callbtn" href="${gmaps(p.ll)}" target="_blank" rel="noopener">🗺 Directions</a></div>
    <details><summary>Backups (${list.length - 1})</summary>${list.slice(1).map(r => `<div class="li"><div class="t"><b>${esc(r.name)}</b><span class="meta">${esc(r.area)} · ${esc(r.hours)} · ${esc(r.rating)}<br>${esc(r.food)}</span></div><div style="display:grid;gap:6px">${tels(r)}</div></div>`).join('')}</details>
  </div>`;
}
function scenicCard(s) {
  return `<div class="card"><div class="row"><h3>${esc(s.time)} · Scenery</h3><span class="pill">Sunset 18:08</span></div>
    <p style="margin:8px 0 2px"><b>${esc(s.name)}</b></p><div class="meta">${esc(s.note)}</div>
    <div class="btnrow" style="margin-top:10px"><a class="callbtn" href="${gmaps(s.ll)}" target="_blank" rel="noopener">🗺 Open in Google Maps</a></div></div>`;
}
function renderToday() {
  const v = $('v-today'), day = D.days.find(d => d.key === curDay);
  const act = S.active && BY[S.active] && !LS(S.active).done && LS(S.active).idx > 1 && !nav.on ? S.active : null;
  const doneLoops = LEGS.filter(l => LS(l.id).done && l.id !== 'sun').length;
  const kmDone = surveyKm();
  const dayKm = day.legs.reduce((a, id) => a + BY[id].tkm, 0);
  let h = '';
  if (act) h += `<div class="card" style="border-color:var(--late)"><div class="row"><div><h3>Loop in progress</h3><div class="meta">${esc(BY[act].name)} · ${fmtKm(kmAt(BY[act], LS(act).idx))} of ${BY[act].tkm} km</div></div><button class="btn small" data-start="${act}">Resume</button></div></div>`;
  h += `<div class="daychips" role="group" aria-label="Day">${D.days.map(d => `<button aria-pressed="${d.key === curDay}" data-day="${d.key}" style="--c:var(${DAYC[d.key]})">${d.title.split(' ')[0].slice(0, 3)} ${d.title.split(' ')[1]}<small>${esc(d.sub)}</small></button>`).join('')}</div>`;
  h += `<h2>${esc(day.title)} · ${esc(day.sub)}</h2><p class="sub">${day.legs.length} loop${day.legs.length > 1 ? 's' : ''} · ${fmtKm(dayKm)} km of drive testing${day.date === localDate() ? ' · <b>today</b>' : ''}</p>`;
  h += `<div class="card"><div class="big-progress">${ring(Math.min(1, kmDone / TOTAL_KM), col('mon'))}<div><h3>Whole survey</h3><div class="meta">${fmtKm(kmDone)} of ${Math.round(TOTAL_KM)} km driven<br>${doneLoops} of 6 survey loops done · ${S.obs.length} mark${S.obs.length === 1 ? '' : 's'}</div></div></div></div>`;
  if (day.key === 'sun') { h += `<div class="card"><h3>Arrival evening</h3><div class="timeline">${day.notes.map(n => `<div class="meta" style="padding:6px 0">• ${esc(n)}</div>`).join('')}</div></div>` + loopCard('sun'); }
  else {
    h += loopCard(day.legs[0]) + lunchCard(day.lunch) + loopCard(day.legs[1]) + scenicCard(day.scenic);
    h += `<div class="card"><h3>Notes</h3>${day.notes.map(n => `<div class="meta" style="padding:5px 0">• ${esc(n)}</div>`).join('')}</div>`;
  }
  v.innerHTML = h;
  $('topsub').textContent = day.title + ' · ' + day.sub;
}
$('v-today').addEventListener('click', e => {
  const d = e.target.closest('[data-day]'); if (d) { curDay = d.dataset.day; S.ui.day = curDay; save(); renderToday(); return; }
  const s = e.target.closest('[data-start]'); if (s) { openChecklist(s.dataset.start); return; }
  const p = e.target.closest('[data-preview]'); if (p) { previewLeg(p.dataset.preview); }
});
function previewLeg(id) { focusLeg = id; showTab('map'); drawOverview(); setTimeout(() => map.fitBounds(L.latLngBounds(BY[id].pts), {padding: [30, 30]}), 80); }

/* ---------------- log view ---------------- */
function renderLog() {
  const v = $('v-log');
  const rows = LEGS.map(l => { const s = LS(l.id), st = legStatus(l.id); return `<tr><td><b style="color:var(${DAYC[l.day]})">${esc(l.name)}</b></td><td><span class="pill ${st.cls}">${s.done ? 'Done' : s.idx > 1 ? 'Part' : '–'}</span></td><td class="num">${fmtKm(st.km)}/${l.tkm}</td><td class="num">${s.elapsed ? fmtDur(s.elapsed) : '–'} / ${hm(l.tmin)}</td><td class="num">${s.started ? clock(new Date(s.started)) : '–'}</td></tr>`; }).join('');
  const totalMs = LEGS.reduce((a, l) => a + (LS(l.id).elapsed || 0), 0);
  const obs = S.obs.slice().reverse();
  v.innerHTML = `<h2>Survey log</h2><p class="sub">Everything here is stored on this phone. Export it at the end of each day.</p>
   <div class="card"><div class="kv"><div><b class="num">${fmtKm(surveyKm())}</b><span>km driven</span></div><div><b class="num">${fmtDur(totalMs)}</b><span>drive time</span></div><div><b class="num">${S.obs.length}</b><span>marks</span></div></div></div>
   <div class="card"><h3>Loops</h3><div class="tablewrap"><table class="stats"><thead><tr><th>Loop</th><th>Status</th><th>km</th><th>Time / plan</th><th>Start</th></tr></thead><tbody>${rows}</tbody></table></div></div>
   <div class="card"><h3>Marks</h3>${obs.length ? `<div class="list">${obs.map(o => `<div class="li"><div class="t"><b>${esc(o.tag)}</b><span class="meta">${esc(new Date(o.t).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'}))}${o.leg ? ' · ' + esc(BY[o.leg]?.name || '') + ' km ' + fmtKm(o.km) : ''}${o.note ? '<br>' + esc(o.note) : ''}</span></div><div class="btnrow" style="flex-wrap:nowrap"><button class="btn sec small" data-showmark="${o.id}">Map</button><button class="btn sec small" data-delmark="${o.id}" aria-label="Delete mark">✕</button></div></div>`).join('')}</div>` : '<div class="empty">No marks yet. While driving, tap the yellow pin button to mark a spot with no signal, slow data or a blocked road.</div>'}</div>
   <div class="card"><h3>Export</h3><p class="meta">Share to WhatsApp, email or Drive, or save to the phone.</p>
    <div class="btnrow" style="margin-top:8px"><button class="btn sec" id="ex-csv">Marks · CSV</button><button class="btn sec" id="ex-gpx">Tracks + marks · GPX</button></div>
    <div class="btnrow" style="margin-top:8px"><button class="btn sec" id="ex-json">Full backup</button><label class="btn sec" style="text-align:center">Restore backup<input type="file" id="im-json" accept=".json,application/json" hidden></label></div></div>`;
  $('ex-csv').onclick = exportCSV; $('ex-gpx').onclick = exportGPX; $('ex-json').onclick = exportJSON; $('im-json').onchange = importJSON;
}
$('v-log').addEventListener('click', e => {
  const sm = e.target.closest('[data-showmark]'); if (sm) { const o = S.obs.find(x => x.id === sm.dataset.showmark); if (o) { focusLeg = null; showTab('map'); setTimeout(() => map.setView([o.lat, o.lon], 16), 80); } return; }
  const dm = e.target.closest('[data-delmark]'); if (dm) confirmBox('Delete this mark?', 'It is removed from this phone. This cannot be undone.', 'Delete', () => { S.obs = S.obs.filter(x => x.id !== dm.dataset.delmark); save(); drawMarks(); renderLog(); toast('Mark deleted'); });
});
async function shareOrSave(name, mime, text) {
  const blob = new Blob([text], {type: mime});
  try { const f = new File([blob], name, {type: mime}); if (navigator.canShare && navigator.canShare({files: [f]})) { await navigator.share({files: [f], title: name}); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast('Saved ' + name);
}
const stamp = () => localDate().replace(/-/g, '');
function exportCSV() {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const lines = ['time,tag,loop,km_on_loop,lat,lon,note'].concat(S.obs.map(o => [new Date(o.t).toISOString(), q(o.tag), q(o.leg ? BY[o.leg]?.name : ''), o.km != null ? fmtKm(o.km) : '', o.lat.toFixed(6), o.lon.toFixed(6), q(o.note)].join(',')));
  shareOrSave(`rodrigues_marks_${stamp()}.csv`, 'text/csv', lines.join('\n'));
}
function exportGPX() {
  const x = s => esc(s);
  let g = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Rodrigues Survey app" xmlns="http://www.topografix.com/GPX/1/1">\n';
  S.obs.forEach(o => g += `<wpt lat="${o.lat}" lon="${o.lon}"><time>${new Date(o.t).toISOString()}</time><name>${x(o.tag)}</name><desc>${x((o.leg ? BY[o.leg]?.name + ' km ' + fmtKm(o.km) + '. ' : '') + (o.note || ''))}</desc></wpt>\n`);
  LEGS.forEach(l => { const tr = LS(l.id).trace; if (tr.length > 1) g += `<trk><name>${x(l.name)} driven</name><trkseg>${tr.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"/>`).join('')}</trkseg></trk>\n`; });
  shareOrSave(`rodrigues_tracks_${stamp()}.gpx`, 'application/gpx+xml', g + '</gpx>');
}
function exportJSON() { shareOrSave(`rodrigues_backup_${stamp()}.json`, 'application/json', JSON.stringify({app: 'rodrigues-survey', version: D.version, saved: new Date().toISOString(), state: S})); }
function importJSON(e) {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => { const j = JSON.parse(t); if (!j || j.app !== 'rodrigues-survey' || !j.state) throw new Error('bad');
    confirmBox('Restore this backup?', `Saved ${new Date(j.saved).toLocaleString()}. It replaces all loops and marks on this phone.`, 'Restore', () => { S = Object.assign({}, DEF, j.state); S.settings = Object.assign({}, DEF.settings, S.settings); save(); redrawAll(); toast('Backup restored'); }); })
    .catch(() => toast('That file is not a Rodrigues Survey backup'));
}

/* ---------------- more view ---------------- */
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (S.ui.tab === 'more') renderMore(); });
addEventListener('appinstalled', () => { installEvt = null; toast('App installed'); renderMore(); });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
function sw(id, on, label, sub) { return `<div class="li"><div class="t"><b>${label}</b><span class="meta">${sub}</span></div><label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} aria-label="${label}"><span></span></label></div>`; }
function seg(name, cur, opts) { return `<div class="seg" role="group">${opts.map(([v, t]) => `<button data-seg="${name}" data-val="${v}" aria-pressed="${String(cur) === String(v)}">${t}</button>`).join('')}</div>`; }
function renderMore() {
  const st = S.settings;
  const inst = standalone() ? `<p class="meta">✅ Installed. Open it from your home screen icon.</p>`
    : installEvt ? `<p class="meta">Install it like a normal app: it gets its own icon, opens full screen and works without signal.</p><button class="btn" id="b-install">Install app</button>`
    : isIOS ? `<p class="meta">In <b>Safari</b>: tap Share <b>⎙</b> → <b>Add to Home Screen</b> → Add.</p>`
    : `<p class="meta">In <b>Chrome</b>: tap <b>⋮</b> → <b>Install app</b> (or <b>Add to Home screen</b>).</p>`;
  $('v-more').innerHTML = `<h2>More</h2><p class="sub">Settings, contacts and starting over.</p>
   <div class="card"><h3>Install on this phone</h3>${inst}</div>
   <div class="card"><h3>Navigation</h3><div class="list">
     ${sw('set-voice', st.voice, 'Voice instructions', '“In 200 metres, turn left”')}
     ${sw('set-vib', st.vibrate, 'Vibrate on turns', 'Short buzz before each instruction')}
     <div class="li"><div class="t"><b>Map while driving</b><span class="meta">Heading up turns the map with the car</span></div></div>${seg('orient', st.headingUp, [[false, 'North up'], [true, 'Heading up']])}
     <div class="li" style="margin-top:8px"><div class="t"><b>Theme</b><span class="meta">Dark is easier at night</span></div></div>${seg('theme', st.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}
   </div></div>
   <div class="card"><h3>Demo drive</h3><div class="list">
     ${sw('set-demo', st.demo, 'Demo mode', 'Start drives a virtual car along the loop, no GPS. Use it to practise.')}
     <div class="li"><div class="t"><b>Demo speed</b></div></div>${seg('dspeed', st.demoSpeed, [[4, '4×'], [8, '8×'], [20, '20×']])}
   </div></div>
   <div class="card"><h3>Useful numbers</h3><div class="list">${D.contacts.map(([n, t]) => `<div class="li"><div class="t"><b>${esc(n)}</b></div><a class="callbtn" href="${telHref(t)}">📞 <span class="tel">${esc(t)}</span></a></div>`).join('')}</div></div>
   <div class="card"><h3>Start over</h3><p class="meta">Clear progress to drive a loop again from the start, or wipe the phone clean after testing. Export your log first if you need it.</p>
     <div class="btnrow" style="margin-top:10px"><select id="rs-leg" aria-label="Loop to reset" style="flex:1;border:1px solid var(--line);border-radius:12px;background:var(--panel2);padding:10px">${LEGS.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select><button class="btn sec small" id="rs-one">Reset loop</button></div>
     <div class="btnrow" style="margin-top:8px"><button class="btn warn" id="rs-all">Reset everything</button></div></div>
   <div class="card"><h3>About</h3><p class="meta">Rodrigues Survey ${esc(D.version)} · nPerf Fleet QoS drive test, 22–25 Nov 2026. Routes cover every secondary, tertiary, unclassified and residential road (OpenStreetMap, Nov 2026). Your data never leaves this phone unless you export it.</p>
     <button class="btn sec" id="b-update" style="margin-top:8px">Check for updates</button></div>`;
  $('b-install') && ($('b-install').onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; renderMore(); });
  $('set-voice').onchange = e => { st.voice = e.target.checked; save(); syncNavBtns(); };
  $('set-vib').onchange = e => { st.vibrate = e.target.checked; save(); };
  $('set-demo').onchange = e => { st.demo = e.target.checked; save(); toast(st.demo ? 'Demo mode on: Start now drives a virtual car' : 'Demo mode off: Start uses GPS'); };
  $('rs-one').onclick = () => { const id = $('rs-leg').value; confirmBox(`Reset ${BY[id].name}?`, 'Progress, time and the driven track for this loop are cleared. Marks are kept.', 'Reset loop', () => { delete S.legs[id]; if (S.active === id) S.active = null; save(); drawOverview(); toast(BY[id].name + ' reset'); }); };
  $('rs-all').onclick = () => confirmBox('Reset everything?', 'All loops, times, driven tracks and marks on this phone are deleted. Settings are kept. This cannot be undone.', 'Reset everything', () => { S.legs = {}; S.obs = []; S.active = null; save(); drawOverview(); renderMore(); toast('Everything reset'); });
  $('b-update').onclick = async () => { try { const r = await navigator.serviceWorker?.getRegistration(); await r?.update(); } catch (e) {} toast('Updating…'); setTimeout(() => location.reload(), 900); };
}
$('v-more').addEventListener('click', e => {
  const b = e.target.closest('[data-seg]'); if (!b) return;
  const st = S.settings, v = b.dataset.val;
  if (b.dataset.seg === 'orient') st.headingUp = v === 'true';
  if (b.dataset.seg === 'theme') { st.theme = v; applyTheme(); setTimeout(redrawAll, 30); }
  if (b.dataset.seg === 'dspeed') st.demoSpeed = +v;
  save(); renderMore();
});

/* ---------------- checklist ---------------- */
const CHECKS = ['nPerf Fleet running on the my.t phone', 'nPerf Fleet running on the Emtel phone', 'Both phones charging from the inverter', 'Phones mounted, out of direct sun', 'Fuel and water for the loop'];
let pendingLeg = null;
function openChecklist(id) {
  pendingLeg = id; const l = BY[id];
  $('chk-title').textContent = (S.settings.demo ? 'Demo · ' : '') + l.name + ' → ' + l.to;
  $('chk-sub').textContent = `${l.tkm} km · about ${hm(l.tmin)} of driving. Tick each item before you go.`;
  $('chk-list').innerHTML = CHECKS.map((c, i) => `<label class="check"><input type="checkbox" data-chk="${i}">${esc(c)}</label>`).join('');
  $('chk-go').disabled = true; $('chk-go').textContent = S.settings.demo ? 'Start demo drive' : 'Start navigation';
  $('sh-check').hidden = false;
}
$('chk-list').addEventListener('change', () => { $('chk-go').disabled = [...document.querySelectorAll('[data-chk]')].some(x => !x.checked); });
$('chk-go').onclick = () => { $('sh-check').hidden = true; startNav(pendingLeg); };
$('chk-skip').onclick = () => { $('sh-check').hidden = true; startNav(pendingLeg); };
$('chk-cancel').onclick = () => $('sh-check').hidden = true;

/* ---------------- arrows ---------------- */
function arrowSVG(t) {
  const s = 'stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const head = (x, y, r) => `<path d="M${x - 9} ${y + 6} L${x} ${y - 4} L${x + 9} ${y + 6}" ${s} transform="rotate(${r} ${x} ${y})"/>`;
  switch (t) {
    case 'left': return `<path d="M40 56 V32 Q40 24 32 24 H14" ${s}/>` + head(14, 24, -90);
    case 'right': return `<path d="M24 56 V32 Q24 24 32 24 H50" ${s}/>` + head(50, 24, 90);
    case 'slight-left': return `<path d="M38 56 V38 L22 18" ${s}/>` + head(22, 18, -39);
    case 'slight-right': return `<path d="M26 56 V38 L42 18" ${s}/>` + head(42, 18, 39);
    case 'sharp-left': return `<path d="M44 56 V26 L18 46" ${s}/>` + head(18, 46, -127);
    case 'sharp-right': return `<path d="M20 56 V26 L46 46" ${s}/>` + head(46, 46, 127);
    case 'uturn': return `<path d="M40 56 V24 Q40 12 30 12 Q20 12 20 24 V40" ${s}/>` + head(20, 42, 180);
    case 'arrive': return `<path d="M32 58 V32" ${s}/><circle cx="32" cy="20" r="12" fill="currentColor"/>`;
    case 'back': return `<path d="M32 56 V14" ${s} stroke-dasharray="2 11"/>` + head(32, 12, 0);
    default: return `<path d="M32 56 V12" ${s}/>` + head(32, 12, 0);
  }
}

/* ---------------- road graph (guide me back) ---------------- */
const G = D.graph, ADJ = G.n.map(() => []);
G.e.forEach(([a, b, m], i) => { ADJ[a].push([b, m, i, 1]); ADJ[b].push([a, m, i, -1]); });
function nearestNode(p) { let bi = 0, bd = 1e12; for (let i = 0; i < G.n.length; i++) { const d = dist(p, G.n[i]); if (d < bd) { bd = d; bi = i; } } return [bi, bd]; }
function shortestPath(src, dst) {
  const n = G.n.length, dd = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), pe = new Int32Array(n), pdir = new Int8Array(n);
  const heap = [[0, src]]; dd[src] = 0;
  const push = x => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) { const [d, u] = pop(); if (u === dst) break; if (d > dd[u]) continue; for (const [v, m, ei, dir] of ADJ[u]) { const nd = d + m; if (nd < dd[v]) { dd[v] = nd; prev[v] = u; pe[v] = ei; pdir[v] = dir; push([nd, v]); } } }
  if (!isFinite(dd[dst])) return null;
  const segs = []; let v = dst; while (v !== src) { const e = G.e[pe[v]], mid = pdir[v] === 1 ? e[3] : e[3].slice().reverse(); segs.unshift([G.n[prev[v]], ...mid]); v = prev[v]; }
  const pts = [].concat(...segs, [G.n[dst]]); return {pts, m: dd[dst]};
}

/* ---------------- navigation engine ---------------- */
const nav = {on: false, leg: null, st: null, follow: true, paused: false, demo: false, watch: null, sim: null, wake: null,
  lastFix: null, heading: null, lastTick: null, offSince: null, announced: {}, guide: null, guideAt: 0, lastChev: -1, speed: 0};
let rDone, rLeft, rNext, rTrace, manMark, carMk, guideLine;

function syncNavBtns() { $('b-voice').setAttribute('aria-pressed', S.settings.voice); $('b-voice').textContent = S.settings.voice ? 'Voice on' : 'Voice off'; $('orient').textContent = S.settings.headingUp ? '⬆' : 'N'; }
function drawNavLeg() {
  navG.clearLayers(); chevG.clearLayers(); nav.lastChev = -1;
  const l = nav.leg, c = col(l.day);
  rLeft = L.polyline(l.pts, {color: c, weight: 7, opacity: .9, interactive: false}).addTo(navG);
  rDone = L.polyline([], {color: css('--done'), weight: 7, opacity: .9, interactive: false}).addTo(navG);
  rNext = L.polyline([], {color: c, weight: 12, opacity: 1, interactive: false}).addTo(navG);
  rTrace = L.polyline(nav.st.trace, {color: css('--fg'), weight: 2, opacity: .55, dashArray: '2 5', interactive: false}).addTo(navG);
  guideLine = L.polyline([], {color: css('--warn'), weight: 6, dashArray: '2 10', lineCap: 'round', interactive: false}).addTo(navG);
  L.circleMarker(l.end, {radius: 10, color: '#fff', weight: 3, fillColor: css('--warn'), fillOpacity: 1, interactive: false}).bindTooltip(l.to, {permanent: true, direction: 'top', offset: [0, -10], className: 'lab'}).addTo(navG);
  manMark = L.circleMarker(l.pts[0], {radius: 8, color: '#fff', weight: 3, fillColor: css('--fg'), fillOpacity: 1, interactive: false}).addTo(navG);
  updateSplit();
}
function updateSplit() {
  const l = nav.leg, f = nav.st.idx, i = Math.floor(f), p = pointAt(l, f);
  rDone.setLatLngs(l.pts.slice(0, i + 1).concat([p]));
  rLeft.setLatLngs([p].concat(l.pts.slice(i + 1)));
  const k = kmAt(l, f), j = idxAtKm(l, k + 0.8);
  rNext.setLatLngs([p].concat(l.pts.slice(i + 1, j + 1)));
  if (Math.abs(i - nav.lastChev) > 3) {
    nav.lastChev = i; chevG.clearLayers();
    for (let kk = k + 0.15; kk < k + 2.2; kk += 0.25) { const jj = idxAtKm(l, kk); if (jj >= l.pts.length - 1) break;
      const br = bear(l.pts[jj], l.pts[jj + 1]);
      L.marker(l.pts[jj], {interactive: false, keyboard: false, icon: L.divIcon({className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: `<svg viewBox="0 0 18 18" width="18" height="18" style="transform:rotate(${br}deg)"><path d="M4 12 L9 5 L14 12" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`})}).addTo(chevG); }
  }
}
function segDist(p, a, b) { const ax = a[1] * KX, ay = a[0] * KY, bx = b[1] * KX, by = b[0] * KY, px = p[1] * KX, py = p[0] * KY, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return [Math.hypot(px - ax - t * dx, py - ay - t * dy), t]; }
function match(l, cur, p, heading, speed, wide) {
  const n = l.pts.length, from = wide ? Math.floor(cur) : Math.max(0, Math.floor(cur) - 12), to = wide ? n - 1 : Math.min(n - 1, Math.floor(cur) + 260);
  let best = null, nearest = 1e9;
  for (let j = from; j < to; j++) {
    const [d, t] = segDist(p, l.pts[j], l.pts[j + 1]);
    if (d < nearest) nearest = d;
    if (d > (wide ? 400 : 70)) continue;
    let sc = d + (j < Math.floor(cur) ? 8 : 0) + 0.04 * Math.abs(j - cur);
    if (heading != null && speed > 2.5 && adiff(bear(l.pts[j], l.pts[j + 1]), heading) > 100) sc += 60;
    if (!best || sc < best.sc) best = {j, t, d, sc};
  }
  if (best) best.nearest = nearest;
  return best;
}
function say(txt) { if (!S.settings.voice || !('speechSynthesis' in window)) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = 'en-GB'; speechSynthesis.speak(u); } catch (e) {} }
function buzz(p) { if (S.settings.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }
const spoken = m => m.x + (m.r && m.t !== 'uturn' ? ' onto ' + m.r : '');

async function keepAwake() { try { if ('wakeLock' in navigator && !nav.wake) { nav.wake = await navigator.wakeLock.request('screen'); nav.wake.addEventListener('release', () => nav.wake = null); } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && nav.on) keepAwake(); });

function applyOrientation() {
  const m = $('map'), w = $('mapwrap').clientWidth, h = $('mapwrap').clientHeight;
  if (nav.on && S.settings.headingUp) {
    const dg = Math.ceil(Math.hypot(w, h));
    Object.assign(m.style, {left: (w - dg) / 2 + 'px', top: (h - dg) / 2 + 'px', width: dg + 'px', height: dg + 'px', right: 'auto', bottom: 'auto'});
    map.dragging.disable(); map.touchZoom.disable(); nav.follow = true; $('recenter').hidden = true;
  } else {
    Object.assign(m.style, {left: '', top: '', width: '', height: '', right: '', bottom: ''}); $('rot').style.transform = '';
    map.dragging.enable(); map.touchZoom.enable();
  }
  map.invalidateSize({pan: false});
  rotate();
}
function rotate() {
  const hu = nav.on && S.settings.headingUp, h = nav.heading || 0;
  $('rot').style.transform = hu ? `rotate(${-h}deg)` : '';
  const el = carMk && carMk.getElement(); if (el) { const s = el.querySelector('svg'); if (s) s.style.transform = `rotate(${h}deg)`; }
}

function startNav(id) {
  const l = BY[id]; if (!l) return;
  stopFeeds();
  nav.leg = l; nav.st = LS(id);
  if (nav.st.done) Object.assign(nav.st, {idx: 0, elapsed: 0, trace: [], done: false, finished: null});
  if (!nav.st.started) nav.st.started = Date.now();
  S.active = id; save();
  Object.assign(nav, {on: true, follow: true, paused: false, demo: S.settings.demo, lastFix: null, lastTick: null, offSince: null, announced: {}, guide: null, guideAt: 0, heading: null});
  document.body.classList.add('navmode'); $('nav').hidden = false; showTab('map');
  map.removeLayer(ovG); navG.addTo(map); chevG.addTo(map);
  drawNavLeg(); syncNavBtns();
  $('nleg').textContent = l.name + ' → ' + l.to; $('nbar').parentElement.style.setProperty('--c', `var(${DAYC[l.day]})`);
  $('b-pause').textContent = 'Pause'; $('b-pause').setAttribute('aria-pressed', 'false');
  $('offroute').hidden = true; $('demo').hidden = !nav.demo; $('recenter').hidden = true;
  setTimeout(() => { applyOrientation(); const p = pointAt(l, nav.st.idx); map.setView(p, 17); render(p, 0); }, 60);
  keepAwake();
  say(nav.demo ? 'Demo drive started.' : `Navigation started. Follow the ${DAYCOL_NAME[l.day]} line.`);
  if (nav.demo) startSim(); else startGPS(true);
}
function stopFeeds() {
  if (nav.watch != null) { navigator.geolocation.clearWatch(nav.watch); nav.watch = null; }
  if (nav.sim) { clearInterval(nav.sim); nav.sim = null; }
}
function endNav() {
  stopFeeds(); try { nav.wake && nav.wake.release(); } catch (e) {} nav.wake = null;
  nav.on = false; save();
  document.body.classList.remove('navmode'); $('nav').hidden = true;
  map.removeLayer(navG); map.removeLayer(chevG); ovG.addTo(map);
  if (carMk) { carMk.remove(); carMk = null; }
  applyOrientation(); setGps('off');
  focusLeg = null; drawOverview();
}
function setGps(state, acc) {
  const p = $('gpspill'); p.className = state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : '';
  p.textContent = state === 'ok' ? `GPS ±${Math.round(acc || 0)} m` : state === 'bad' ? 'GPS lost' : state === 'demo' ? 'Demo' : 'GPS off';
}
let gpsLostT;
function startGPS(forNav) {
  if (!('geolocation' in navigator)) { toast('This browser has no GPS. Use Chrome or Safari.'); return; }
  if (nav.watch != null) navigator.geolocation.clearWatch(nav.watch);
  nav.watch = navigator.geolocation.watchPosition(pos => {
    const c = pos.coords; setGps('ok', c.accuracy); clearTimeout(gpsLostT); gpsLostT = setTimeout(() => setGps('bad'), 15000);
    const h = (c.heading != null && !isNaN(c.heading)) ? c.heading : null;
    if (nav.on) onFix([c.latitude, c.longitude], h, c.speed, c.accuracy); else showMe([c.latitude, c.longitude], h);
  }, err => {
    setGps('bad');
    if (err.code === 1) { toast('Location is blocked. Allow location for this app in the phone settings.', 5000); }
  }, {enableHighAccuracy: true, maximumAge: 1000, timeout: 20000});
}
function carIcon() { return L.divIcon({className: '', iconSize: [44, 44], iconAnchor: [22, 22], html: `<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="19" fill="#fff" opacity=".92"/><path d="M22 6 L33 33 L22 27 L11 33 Z" fill="${css('--accent')}" stroke="#06343a" stroke-width="1.6"/></svg>`}); }
function showMe(p, h) {
  if (!carMk) carMk = L.marker(p, {interactive: false, keyboard: false, zIndexOffset: 1000, icon: carIcon()}).addTo(map); else carMk.setLatLng(p);
  if (h != null) nav.heading = h; rotate();
  if (nav.locateOnce) { nav.locateOnce = false; map.setView(p, 16); }
}

function onFix(p, heading, speed, acc) {
  if (!nav.on || nav.paused) return;
  const now = Date.now(), l = nav.leg, st = nav.st;
  if (nav.lastTick) st.elapsed += Math.min(now - nav.lastTick, 15000); nav.lastTick = now;
  if (heading == null && nav.lastFix && dist(nav.lastFix, p) > 4) heading = bear(nav.lastFix, p);
  if (heading != null && (speed == null || speed > 1.2)) nav.heading = heading;
  if (speed == null && nav.lastFix && nav.fixT) speed = dist(nav.lastFix, p) / Math.max(.5, (now - nav.fixT) / 1000);
  nav.speed = speed || 0; nav.fixT = now;
  if (!nav.lastFix || dist(nav.lastFix, p) > 10) { st.trace.push([+p[0].toFixed(5), +p[1].toFixed(5)]); rTrace.addLatLng(p); }
  nav.lastFix = p;
  const m = match(l, st.idx, p, nav.heading, nav.speed, false);
  if (m && m.nearest < 45) {
    if (m.d < 45) st.idx = Math.max(st.idx - 12, m.j + m.t);
    if (nav.offSince) { nav.offSince = null; $('offroute').hidden = true; nav.guide = null; guideLine.setLatLngs([]); if (nav.wasOff) { say('Back on route.'); nav.wasOff = false; } }
  } else {
    if (!nav.offSince) nav.offSince = now;
    if ((now - nav.offSince) / 1000 > 6) {
      $('offroute').hidden = false; nav.wasOff = true;
      const a = match(l, st.idx, p, null, 0, true);
      $('offtxt').textContent = a ? `Off route · line ${fmtDist(a.d)} away` : 'Off route';
      if (!nav.guide || now - nav.guideAt > 20000) guideBack(false);
    }
  }
  showMe(p, null);
  if (nav.follow) map.setView(p, nav.speed > 11 ? 16 : 17, {animate: true});
  render(p);
  if (now - (nav.saveT || 0) > 5000) { nav.saveT = now; save(); }
}
function guideBack(announce) {
  if (!nav.lastFix) return;
  const l = nav.leg, k = kmAt(l, nav.st.idx), tgt = pointAt(l, idxAtKm(l, k + 0.25));
  const [s] = nearestNode(nav.lastFix), [t] = nearestNode(tgt);
  const r = shortestPath(s, t); nav.guideAt = Date.now();
  if (!r) { toast('No road found back to the route. Use Find my place.'); return; }
  nav.guide = r; guideLine.setLatLngs([nav.lastFix].concat(r.pts));
  if (announce) { say('Follow the red dotted line back to the route.'); toast(`Route back: ${fmtDist(r.m)} along the red dotted line`); }
  render(nav.lastFix);
}
function render(p) {
  const l = nav.leg, st = nav.st, f = st.idx, k = kmAt(l, f), tot = l.tkm;
  updateSplit();
  const off = !$('offroute').hidden && nav.guide;
  const next = l.man.find(m => m.i > f + 0.05), nn = next ? l.man[l.man.indexOf(next) + 1] : null;
  if (off) {
    $('arrow').innerHTML = arrowSVG('back'); $('ndist').textContent = fmtDist(nav.guide.m); $('ninstr').textContent = 'Back to the route'; $('nroad').textContent = 'Follow the red dotted line'; $('nthen').hidden = true;
  } else if (next) {
    const dm = (l.km[next.i] - k) * 1000;
    $('arrow').innerHTML = arrowSVG(next.t); $('ndist').textContent = fmtDist(dm); $('ninstr').textContent = next.x; $('nroad').textContent = next.r || '';
    if (nn && (l.km[nn.i] - l.km[next.i]) * 1000 < 200) { $('nthen').hidden = false; $('nthenarrow').innerHTML = arrowSVG(nn.t); $('nthentxt').textContent = 'Then ' + nn.x.toLowerCase(); } else $('nthen').hidden = true;
    const key = l.id + ':' + next.i, a = nav.announced[key] || 0, far = nav.speed > 10 ? 350 : 200;
    if (a < 1 && dm < far && dm > 90 && next.t !== 'arrive') { nav.announced[key] = 1; say('In ' + fmtDist(dm).replace(' m', ' metres') + ', ' + spoken(next)); buzz(80); }
    if (a < 2 && dm <= 45) { nav.announced[key] = 2; say(next.t === 'arrive' ? next.x : 'Now, ' + spoken(next)); buzz([60, 60, 60]); }
    manMark.setLatLng(l.pts[next.i]);
  }
  $('s-done').textContent = fmtKm(k); $('s-left').textContent = fmtKm(Math.max(0, tot - k)); $('s-time').textContent = fmtDur(st.elapsed);
  $('nbar').style.width = (100 * k / tot).toFixed(1) + '%';
  const sp = Math.round(nav.speed * 3.6); $('nspeed').textContent = sp; $('speed').classList.toggle('fast', sp > 50);
  const planned = mnAt(l, f), ratio = planned > 8 ? Math.min(1.8, Math.max(.6, (st.elapsed / 60000) / planned)) : 1;
  const eta = new Date(Date.now() + (l.tmin - planned) * ratio * 60000); $('s-eta').textContent = clock(eta);
  if (l.target && l.date === localDate()) { const [h, mi] = l.target.split(':').map(Number), t = new Date(); t.setHours(h, mi, 0, 0); const diff = Math.round((eta - t) / 60000);
    $('ntarget').innerHTML = diff > 5 ? `<span style="color:var(--late)">~${diff} min late for ${l.target}</span>` : `<span style="color:var(--ok)">On time for ${l.target}</span>`; }
  else $('ntarget').textContent = planned > 8 ? `Pace ${Math.round(100 / ratio)}% of plan` : '';
  if ((tot - k) * 1000 < 40) arrive();
}
function arrive() {
  const l = nav.leg, st = nav.st; st.done = true; st.idx = l.pts.length - 1; st.finished = Date.now(); save();
  endNav();
  const day = D.days.find(d => d.key === l.day), lunch = l.next && day.lunch ? day.lunch[0] : null;
  $('arr-title').textContent = 'Arrived · ' + l.to;
  $('arr-body').innerHTML = `<p class="sub">${esc(l.name)} complete: <b>${l.tkm} km in ${fmtDur(st.elapsed)}</b> (plan ${hm(l.tmin)}). Check that both phones are still logging in nPerf and that the sessions uploaded.</p>` +
    (lunch ? `<div class="card" style="margin:0"><b>Lunch: ${esc(lunch.name)}</b><div class="meta">${esc(lunch.hours)}</div><div class="btnrow" style="margin-top:8px">${lunch.tel.map(t => `<a class="callbtn" href="${telHref(t)}">📞 ${esc(t)}</a>`).join('')}</div></div>` : '') +
    (!l.next && day.scenic ? `<div class="card" style="margin:0"><b>${esc(day.scenic.time)} · ${esc(day.scenic.name)}</b><div class="meta">${esc(day.scenic.note)}</div></div>` : '');
  $('arr-next').hidden = !l.next; if (l.next) { $('arr-next').textContent = 'Start ' + BY[l.next].name + ' after lunch'; $('arr-next').onclick = () => { $('sh-arrive').hidden = true; openChecklist(l.next); }; }
  $('sh-arrive').hidden = false; say('You have arrived. ' + l.name + ' complete.'); buzz([200, 100, 200]);
}
$('arr-home').onclick = () => { $('sh-arrive').hidden = true; showTab('today'); };

function startSim() {
  setGps('demo'); const l = nav.leg, speedKmh = 35, mult = S.settings.demoSpeed; let f = nav.st.idx;
  nav.sim = setInterval(() => {
    if (nav.paused) return;
    const k = kmAt(l, f) + speedKmh * mult / 3600, j = idxAtKm(l, k);
    if (j >= l.pts.length - 1) f = l.pts.length - 1; else { const a = l.km[j - 1] ?? 0, b = l.km[j]; f = Math.max(f, (j - 1) + (b > a ? (k - a) / (b - a) : 0)); }
    const p = pointAt(l, f), q = pointAt(l, Math.min(f + .5, l.pts.length - 1));
    onFix([p[0] + (Math.random() - .5) * 6e-5, p[1] + (Math.random() - .5) * 6e-5], bear(p, q), speedKmh / 3.6, 6);
    nav.lastTick = Date.now() - 1000 * mult;
  }, 1000);
}

/* ---------------- nav controls ---------------- */
$('b-pause').onclick = e => { nav.paused = !nav.paused; e.currentTarget.textContent = nav.paused ? 'Resume' : 'Pause'; e.currentTarget.setAttribute('aria-pressed', nav.paused); if (!nav.paused) nav.lastTick = Date.now(); toast(nav.paused ? 'Paused: time and progress are frozen' : 'Resumed'); };
$('b-voice').onclick = () => { S.settings.voice = !S.settings.voice; save(); syncNavBtns(); if (!S.settings.voice) try { speechSynthesis.cancel(); } catch (e) {} };
$('orient').onclick = () => { S.settings.headingUp = !S.settings.headingUp; save(); syncNavBtns(); applyOrientation(); if (nav.lastFix) map.setView(nav.lastFix, map.getZoom()); toast(S.settings.headingUp ? 'Heading up: map turns with the car' : 'North up'); };
$('recenter').onclick = () => { nav.follow = true; $('recenter').hidden = true; if (nav.lastFix) map.setView(nav.lastFix, 17); };
map.on('dragstart', () => { if (nav.on) { nav.follow = false; $('recenter').hidden = false; } });
$('b-guide').onclick = () => guideBack(true);
$('nbanner').onclick = () => {
  const l = nav.leg, f = nav.st.idx, k = kmAt(l, f), up = l.man.filter(m => m.i > f + .05).slice(0, 12);
  $('turns-list').innerHTML = up.map(m => `<div class="turnrow"><svg viewBox="0 0 64 64">${arrowSVG(m.t)}</svg><div><b>${esc(m.x)}</b><div class="meta">${esc(m.r || '')}</div></div><span class="num meta">${fmtDist((l.km[m.i] - k) * 1000)}</span></div>`).join('') || '<div class="empty">No more turns.</div>';
  $('sh-turns').hidden = false;
};
$('turns-close').onclick = () => $('sh-turns').hidden = true;
function findPlace() {
  if (!nav.lastFix) { toast('Waiting for GPS…'); return; }
  const l = nav.leg, m = match(l, nav.st.idx, nav.lastFix, null, 0, true) || match(l, 0, nav.lastFix, null, 0, true);
  if (m) { nav.st.idx = m.j + m.t; nav.offSince = null; $('offroute').hidden = true; nav.guide = null; guideLine.setLatLngs([]); render(nav.lastFix); toast('Placed at km ' + fmtKm(kmAt(l, nav.st.idx))); }
  else toast('The route is more than 400 m away. Use Guide me back.');
}
const MENU = [
  ['find', 'Find my place on the route', 'Jumps to the nearest part of the line ahead. Use after a detour.'],
  ['guide', 'Guide me back to the route', 'Draws the shortest road back to the line, as a red dotted line.'],
  ['skip', 'Skip the next instruction', 'For a blocked turn or a road that no longer exists.'],
  ['overview', 'Show the whole loop', 'Zooms out. Tap the arrow button to come back.'],
  ['mark', 'Mark this spot', 'No signal, slow data, blocked road… saved in your log.'],
  ['end', 'Stop navigating', 'Progress is kept. Resume it later from Today.'],
];
$('b-menu').onclick = () => { $('menu-list').innerHTML = MENU.map(([k, t, s]) => `<button class="li" data-menu="${k}" style="width:100%;border:0;border-top:1px solid var(--line);background:none;text-align:left"><span class="t"><b>${t}</b><span class="meta">${s}</span></span><span aria-hidden="true">›</span></button>`).join(''); $('sh-menu').hidden = false; };
$('menu-close').onclick = () => $('sh-menu').hidden = true;
$('menu-list').addEventListener('click', e => {
  const b = e.target.closest('[data-menu]'); if (!b) return; $('sh-menu').hidden = true; const k = b.dataset.menu, l = nav.leg;
  if (k === 'find') findPlace();
  if (k === 'guide') guideBack(true);
  if (k === 'skip') { const n = l.man.find(m => m.i > nav.st.idx + .05); if (n && n.t !== 'arrive') { nav.st.idx = n.i + .01; render(nav.lastFix || pointAt(l, nav.st.idx)); toast('Skipped: ' + n.x); } }
  if (k === 'overview') { if (S.settings.headingUp) { S.settings.headingUp = false; syncNavBtns(); applyOrientation(); } nav.follow = false; $('recenter').hidden = false; map.fitBounds(L.latLngBounds(l.pts), {padding: [40, 40]}); }
  if (k === 'mark') openMark();
  if (k === 'end') { save(); endNav(); showTab('today'); toast(l.name + ' paused at km ' + fmtKm(kmAt(l, nav.st.idx))); }
});

/* ---------------- marks ---------------- */
const TAGS = [['No signal · my.t', 'my.t has no service'], ['No signal · Emtel', 'Emtel has no service'], ['Weak / slow data', 'Pages or tests stall'], ['Both networks bad', 'Neither works'], ['Road blocked / unpaved', 'Could not drive it'], ['Other', 'Write a note']];
let markTag = null;
function openMark() {
  markTag = null; $('mark-note').value = ''; $('mark-save').disabled = true;
  const p = nav.lastFix || (carMk && [carMk.getLatLng().lat, carMk.getLatLng().lng]);
  $('mark-sub').textContent = p ? 'Saved with GPS position, time and loop.' : 'No GPS fix yet: the mark uses the centre of the map.';
  $('mark-tags').innerHTML = TAGS.map(([t, s]) => `<button data-tag="${esc(t)}" aria-pressed="false">${esc(t)}<small>${esc(s)}</small></button>`).join('');
  $('sh-mark').hidden = false;
}
$('mark-tags').addEventListener('click', e => { const b = e.target.closest('[data-tag]'); if (!b) return; markTag = b.dataset.tag; document.querySelectorAll('[data-tag]').forEach(x => x.setAttribute('aria-pressed', x === b)); $('mark-save').disabled = false; });
$('mark-save').onclick = () => {
  const c = map.getCenter(), p = nav.lastFix || (carMk ? [carMk.getLatLng().lat, carMk.getLatLng().lng] : [c.lat, c.lng]);
  const o = {id: 'm' + Date.now().toString(36), t: Date.now(), lat: +p[0].toFixed(6), lon: +p[1].toFixed(6), tag: markTag, note: $('mark-note').value.trim(), leg: nav.on ? nav.leg.id : null, km: nav.on ? kmAt(nav.leg, nav.st.idx) : null};
  S.obs.push(o); save(); drawMarks(); $('sh-mark').hidden = true; toast('Marked: ' + markTag); buzz(60);
};
$('mark-cancel').onclick = () => $('sh-mark').hidden = true;
$('markbtn').onclick = openMark;

/* ---------------- overview map buttons ---------------- */
$('ov-locate').onclick = () => { nav.locateOnce = true; startGPS(false); toast('Finding your location…'); };
$('ov-fit').onclick = () => { focusLeg = null; drawOverview(); map.fitBounds([[-19.765, 63.335], [-19.665, 63.51]]); };

/* ---------------- boot ---------------- */
if (S.ui.day && D.days.some(d => d.key === S.ui.day) && D.days.some(d => d.date === localDate()) === false) curDay = S.ui.day;
showTab(S.ui.tab === 'map' ? 'map' : S.ui.tab || 'today');
syncNavBtns();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__rsn = {nav, get S() { return S; }, match, kmAt, onFix, pointAt};
})();
