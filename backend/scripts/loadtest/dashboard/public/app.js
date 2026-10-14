'use strict';
// Live view + controls over SSE, plus past-run browsing via the History
// tab. Three tabs share one page and one SSE connection (/api/events):
// Mode 2 (run-loadtest.sh), Mode 1 (login-capacity.sh), and History. Each
// mode has exactly ONE view — clicking a History row loads that run's
// full detail into the SAME elements the live SSE ticks update, via the
// same render functions (see loadPastRunIntoMode2/loadPastRunIntoMode1
// further down), rather than a separate past-runs section.

const el = (id) => document.getElementById(id);

// ── Known worker targets (2026-09-13 capacity session, see docs/audit.html)
// The single biggest lever found that session was going from one Node
// process to a multi-worker cluster — this maps a Base URL to how many
// backend processes are actually behind it, so a run's throughput can be
// read in context instead of as a bare, unexplained number.
const TARGET_PRESETS = [
  { url: 'http://localhost:3100/api/v1', label: '1 Worker · :3100', workers: 1, container: 'XXX_backend_load' },
  { url: 'http://localhost:3102/api/v1', label: '8-Worker Cluster · :3102', workers: 8, container: 'XXX_backend_cluster_experiment' },
];

function findTargetPreset(url) {
  return TARGET_PRESETS.find((t) => t.url === (url || '').trim()) || null;
}

// Keeps a target <select>, its (normally hidden) custom-URL field and a
// worker-count badge in sync. Returns an apply(url) function so callers
// that set the URL programmatically (loading a past run, restoring live
// state on reconnect) can re-sync the same three elements from one place.
function wireTargetControl(selectEl, urlFieldEl, badgeEl) {
  const urlInputEl = urlFieldEl.querySelector('input');

  function apply(url) {
    const preset = findTargetPreset(url);
    urlInputEl.value = url || '';
    selectEl.value = preset ? preset.url : 'custom';
    urlFieldEl.hidden = !!preset;
    if (preset) {
      badgeEl.textContent = `● ${preset.workers} Worker${preset.workers === 1 ? '' : 'n'}`;
      badgeEl.className = 'worker-badge worker-badge--known';
      badgeEl.title = `Container: ${preset.container}`;
    } else {
      badgeEl.textContent = url ? '● Custom Target' : '● 1 Worker';
      badgeEl.className = 'worker-badge';
      badgeEl.title = url || '';
    }
  }

  selectEl.addEventListener('change', () => {
    if (selectEl.value === 'custom') {
      urlFieldEl.hidden = false;
      urlInputEl.focus();
      badgeEl.textContent = '● Custom Target';
      badgeEl.className = 'worker-badge';
    } else {
      apply(selectEl.value);
    }
  });

  apply(urlInputEl.value);
  return apply;
}

// ── Tabs ──────────────────────────────────────────────────────────────────

const MODE_STORAGE_KEY = 'loadtest-dashboard-tab';
const tabButtons = document.querySelectorAll('.tab');
const panels = { 2: el('mode2'), 1: el('mode1'), 3: el('mode3'), history: el('history') };

function setTab(tab) {
  for (const btn of tabButtons) {
    const active = btn.dataset.mode === String(tab);
    btn.classList.toggle('tab--active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  for (const key of Object.keys(panels)) panels[key].hidden = key !== String(tab);
  localStorage.setItem(MODE_STORAGE_KEY, String(tab));
  if (tab === 'history') loadHistoryList();
}

for (const btn of tabButtons) {
  btn.addEventListener('click', () => setTab(btn.dataset.mode));
}
setTab(localStorage.getItem(MODE_STORAGE_KEY) || '2');

// ── Shared helpers ──────────────────────────────────────────────────────────

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// A pulsing dot doesn't prove anything's still moving through a long silent
// stretch — a docker build with buffered output, the wait between
// login-capacity.sh's step rows, run-loadtest.sh's health-check/seed-check/
// users.csv steps before the first PREFETCH line — a number that keeps
// ticking up does. One of these per widget; start(startedAt) (re)starts the
// 1s tick from that timestamp (server-provided where the runner tracks one,
// so a page reload mid-run resumes at the right count), stop() clears it.
function makeElapsedTicker(targetEl) {
  let intervalId = null;
  return {
    start(startedAt) {
      clearInterval(intervalId);
      const render = () => { targetEl.textContent = `· ${formatElapsed(Date.now() - startedAt)}`; };
      render();
      intervalId = setInterval(render, 1000);
    },
    stop() {
      clearInterval(intervalId);
      intervalId = null;
      targetEl.textContent = '';
    },
  };
}

// "03.08. 13:54:35" — short German date, used by History rows.
function formatHistDate(ts) {
  const d = new Date(Number(ts) * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ═══════════════════════════════ MODE 2 ════════════════════════════════════

const numUsersInput = el('num-users');
const durationInput = el('duration-sec');
const startBtn = el('start-btn');
const stopBtn = el('stop-btn');
const controlError = el('control-error');

const shortfallBanner = el('shortfall-banner');

const prefetchStatusEl = el('prefetch-status');
const prefetchCount = el('prefetch-count');
const prefetchBarFill = el('prefetch-bar-fill');
const prefetchTicker = makeElapsedTicker(el('prefetch-elapsed'));

// Tokens are reused across workers (token_idx = i % AVAILABLE_TOKENS in
// loadtest.sh) — NUM_USERS itself always runs in full now, never silently
// downgraded. This only fires when the token POOL itself came up smaller
// than run-loadtest.sh's own target (~NUM_USERS/10, e.g. a few individual
// prefetch logins failing despite retries — see run-loadtest.sh's seeded-
// user check for the main defense against that). Informational, not an
// error: every requested worker still ran, just reusing a smaller pool of
// accounts than planned.
function showShortfall(shortfall) {
  if (!shortfall) {
    shortfallBanner.classList.add('hidden');
    return false;
  }
  shortfallBanner.textContent = `ⓘ Token-Pool kleiner als geplant: nur ${shortfall.actualTokens} von ${shortfall.poolTarget} vorgesehenen Accounts hatten einen Token. Alle Worker liefen trotzdem — sie teilen sich einen kleineren Pool.`;
  shortfallBanner.classList.remove('hidden');
  return true;
}

const statusbarEl = el('statusbar');
const stateDot = el('state-dot');
const stateText = el('state-text');
const statThroughput = el('stat-throughput');
const statSuccessRate = el('stat-success-rate');
const statRealErrors = el('stat-real-errors');

const healthBarEl = el('health-bar');
const healthLegendEl = el('health-legend');
const healthOk = el('health-ok');
const healthWarn = el('health-warn');
const healthErr = el('health-err');
const healthOkLabel = el('health-ok-label');
const healthWarnLabel = el('health-warn-label');
const healthErrLabel = el('health-err-label');

// Prefetch (logging every virtual user in once, before the load loop
// starts) can take a while for large user counts — without this, the
// dashboard shows nothing moving and looks hung. Shown in the SAME grid
// slot the normal statusbar occupies, swapped in/out rather than shown
// alongside it, so there's no stale "0 req/s" flashing underneath it.
function showPrefetch(loaded, total) {
  prefetchStatusEl.classList.remove('hidden');
  statusbarEl.classList.add('hidden');
  healthBarEl.classList.add('hidden');
  healthLegendEl.classList.add('hidden');
  if (loaded == null || total == null) return;
  prefetchCount.textContent = `${loaded} / ${total}`;
  prefetchBarFill.style.width = total > 0 ? `${Math.min(100, (loaded / total) * 100)}%` : '0%';
}

function hidePrefetch() {
  prefetchStatusEl.classList.add('hidden');
  statusbarEl.classList.remove('hidden');
  healthBarEl.classList.remove('hidden');
  healthLegendEl.classList.remove('hidden');
  prefetchTicker.stop();
}

const chartHistoricalNote = el('chart-historical-note');
const chartThroughput = el('chart-throughput');
const chartP95 = el('chart-p95');
const endpointBody = document.querySelector('#endpoint-table tbody');

const errorsBlock = el('errors-block');
const errorsAnchorTop = el('errors-anchor-top');
const errorsAnchorBottom = el('errors-anchor-bottom');
const errorsClean = el('errors-clean');
const errorsTable = el('errors-table');
const errorsBody = document.querySelector('#errors-table tbody');
const dockerStatsEl = el('docker-stats');

function setRunningUI(active) {
  startBtn.disabled = active;
  stopBtn.disabled = !active;
  numUsersInput.disabled = active;
  durationInput.disabled = active;
}

// status: 'idle' | 'running' | 'finished'. hasError drives the red left
// border + dot tint independently of run status — a finished run with a
// real error still reads red, not grey.
function setState2(status, elapsedMs, hasError) {
  stateDot.className = 'dot' + (status === 'running' ? ' running' : status === 'finished' ? ' finished' : '') + (hasError ? ' errored' : '');
  stateText.textContent = status === 'running' ? `LÄUFT · ${formatElapsed(elapsedMs)}` : status === 'finished' ? 'FERTIG' : 'IDLE';
  statusbarEl.classList.toggle('errored', !!hasError);
  statusbarEl.classList.toggle('idle', status === 'idle');
}

// Big glance numbers + the stacked health bar. throughput is the live
// rolling req/s from the aggregator; for a loaded past run there is no
// rolling window, so pass null and a durationSec to fall back to
// total/durationSec (or null durationSec to show "–").
function updateHealthAndNumbers(categories, total, throughput, durationSecFallback) {
  const c = categories || { success: 0, expectedReject: 0, error: 0 };
  const hasError = (c.error || 0) > 0;
  const successPct = total > 0 ? (c.success / total) * 100 : 0;

  statThroughput.textContent = throughput != null
    ? throughput.toFixed(1)
    : (durationSecFallback ? (total / durationSecFallback).toFixed(1) : '–');
  statThroughput.className = 'num';

  statSuccessRate.textContent = total > 0 ? `${successPct.toFixed(1)}%` : '–';
  statSuccessRate.className = 'num ' + (hasError ? 'err' : 'ok');

  statRealErrors.textContent = String(c.error || 0);
  statRealErrors.className = 'num ' + (hasError ? 'err' : 'ok');

  healthOk.style.flex = String(c.success || 0);
  healthWarn.style.flex = String(c.expectedReject || 0);
  healthErr.style.flex = String(c.error || 0);
  healthOkLabel.textContent = `Success 2xx · ${c.success || 0}`;
  healthWarnLabel.textContent = `Expected reject 4xx · ${c.expectedReject || 0}`;
  healthErrLabel.textContent = `Error 5xx / transport · ${c.error || 0}`;

  return hasError;
}

// Column sort — persists across live ticks (re-render keeps whatever the
// user last clicked) rather than resetting to the p95-desc default every
// second. "Latenz" shares the p95 key since the bar just visualizes p95.
let lastPerPath = {};
let endpointSort = { key: 'p95', dir: 'desc' };
const ENDPOINT_SORT_ACCESSORS = {
  path: (p) => p.toLowerCase(),
  n: (p, s) => s.n,
  p95: (p, s) => s.p95,
  ok: (p, s) => (s.categories ? s.categories.success : 0),
  '4xx': (p, s) => (s.categories ? s.categories.expectedReject : 0),
  err: (p, s) => (s.categories ? s.categories.error : 0),
};

function renderEndpointTable2(perPath) {
  lastPerPath = perPath || {};
  endpointBody.innerHTML = '';
  const accessor = ENDPOINT_SORT_ACCESSORS[endpointSort.key] || ENDPOINT_SORT_ACCESSORS.p95;
  const dirMul = endpointSort.dir === 'asc' ? 1 : -1;
  const paths = Object.entries(lastPerPath).sort((a, b) => {
    const av = accessor(a[0], a[1]);
    const bv = accessor(b[0], b[1]);
    if (av < bv) return -1 * dirMul;
    if (av > bv) return 1 * dirMul;
    return 0;
  });
  const maxP95 = paths.length ? Math.max(...paths.map(([, s]) => s.p95)) : 0;
  for (const [p, s] of paths) {
    const c = s.categories || { success: 0, expectedReject: 0, error: 0 };
    const width = maxP95 > 0 ? (s.p95 / maxP95) * 100 : 0;
    const cell = (value, cls, label) => `<td class="${value === 0 ? 'zero' : cls}" data-label="${label}">${value}</td>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="path" data-label="Path">${p}</td>`
      + `<td data-label="n">${s.n}</td>`
      + `<td data-label="p95">${s.p95}</td>`
      + `<td class="bar-cell" data-label="Latenz"><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></td>`
      + cell(c.success, 'cell-ok', 'ok')
      + cell(c.expectedReject, 'cell-warn', '4xx')
      + cell(c.error, 'cell-err', 'err');
    endpointBody.appendChild(tr);
  }
}

const endpointHeaders = document.querySelectorAll('#endpoint-table thead th[data-sort]');

function updateEndpointSortIndicators() {
  for (const th of endpointHeaders) {
    th.setAttribute('aria-sort', th.dataset.sort === endpointSort.key
      ? (endpointSort.dir === 'asc' ? 'ascending' : 'descending')
      : 'none');
  }
}

function setEndpointSort(key) {
  endpointSort = key === endpointSort.key
    ? { key, dir: endpointSort.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'path' ? 'asc' : 'desc' };
  updateEndpointSortIndicators();
  renderEndpointTable2(lastPerPath);
}

for (const th of endpointHeaders) {
  th.addEventListener('click', () => setEndpointSort(th.dataset.sort));
  th.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      setEndpointSort(th.dataset.sort);
    }
  });
}
updateEndpointSortIndicators();

// Built with textContent (not innerHTML) — unlike the other cells here,
// the error body snippet is real backend response text, not one of our
// own hardcoded strings, so it isn't safe to interpolate as markup.
// Bugs confirmed during the 2026-09-13 capacity session (see
// docs/audit.html) — surfaced here so a 500 in the errors table reads as
// "already diagnosed, here's the file" instead of unexplained noise.
// Both race conditions are check-then-insert without a lock, colliding on
// a DB constraint under concurrent duplicate requests.
function classifyKnownIssue(e) {
  const status = Number(e.status);
  if (status === 500 && e.method === 'POST' && e.path === '/chat/requests') {
    return 'Race: sendContactRequest() — chat.service.ts:46';
  }
  if (status === 500 && e.method === 'PATCH' && /^\/chat\/requests\/[^/]+\/accept$/.test(e.path || '')) {
    return 'Race: ConversationsService.getOrCreate() — conversations.service.ts:18';
  }
  if (e.path === '/admin/media/pending') {
    return 'Known: no pagination — admin.service.ts:184';
  }
  return '';
}

function renderErrorRows(errors, tbody) {
  tbody.innerHTML = '';
  for (const e of [...errors].reverse()) { // newest first
    const tr = document.createElement('tr');
    const cells = [e.timestamp, e.method, e.path, e.status, e.body];
    cells.forEach((value, i) => {
      const td = document.createElement('td');
      if (i === 3) td.className = 'status-cell';
      if (i === 4) td.className = 'body-cell';
      td.textContent = value;
      tr.appendChild(td);
    });
    const issueTd = document.createElement('td');
    const knownIssue = classifyKnownIssue(e);
    if (knownIssue) {
      const badge = document.createElement('span');
      badge.className = 'known-issue-badge';
      badge.textContent = knownIssue;
      issueTd.appendChild(badge);
    }
    tr.appendChild(issueTd);
    tbody.appendChild(tr);
  }
}

// Clean runs show a quiet dashed placeholder; the moment a real error
// shows up the panel turns into a red-bordered table AND physically
// moves up to just under the health bar (errors-anchor-top) instead of
// sitting below the endpoint table (errors-anchor-bottom) — re-parenting
// every render is cheap at the 1s tick rate and keeps this idempotent.
function renderErrorsPanel(errors) {
  const hasErrors = errors && errors.length > 0;
  errorsClean.classList.toggle('hidden', hasErrors);
  errorsTable.classList.toggle('hidden', !hasErrors);
  if (hasErrors) renderErrorRows(errors, errorsBody);
  (hasErrors ? errorsAnchorTop : errorsAnchorBottom).insertAdjacentElement('afterend', errorsBlock);
}

function renderDockerStats(targetEl, docker) {
  targetEl.innerHTML = '';
  for (const d of docker || []) {
    const div = document.createElement('div');
    div.className = 'stat';
    div.innerHTML = `<span class="stat__label">${d.name}</span><span class="stat__value">${d.cpu} / ${d.mem}</span>`;
    targetEl.appendChild(div);
  }
}

startBtn.addEventListener('click', async () => {
  controlError.textContent = '';
  showShortfall(null);
  const numUsers = Number(numUsersInput.value);
  const durationSec = Number(durationInput.value);
  setRunningUI(true);
  try {
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numUsers, durationSec }),
    });
    const body = await res.json();
    if (!res.ok) {
      controlError.textContent = body.error || 'failed to start';
      setRunningUI(false);
      return;
    }
    // Not "running" yet — run-loadtest.sh still has to health-check,
    // build users.csv, and prefetch tokens before the load loop (and
    // LÄUFT) actually starts. showPrefetch(null, null) gets the "Vorbereitung
    // läuft" state on screen immediately; real numbers land once the
    // first PREFETCH line arrives over SSE.
    showPrefetch(null, null);
    prefetchTicker.start(Date.now());
  } catch (err) {
    controlError.textContent = String(err);
    setRunningUI(false);
  }
});

stopBtn.addEventListener('click', async () => {
  controlError.textContent = '';
  stopBtn.disabled = true;
  try {
    const res = await fetch('/api/stop', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) controlError.textContent = body.error || 'failed to stop';
  } catch (err) {
    controlError.textContent = String(err);
  }
});

// Sync button/badge state on load (e.g. after a page refresh mid-run).
fetch('/api/state')
  .then((res) => res.json())
  .then((state) => {
    setRunningUI(state.active);
    setState2(state.active ? 'running' : (state.status || 'idle'), state.startedAt ? Date.now() - state.startedAt : 0, false);
  })
  .catch(() => {});

// ── Charts — small-multiple line charts (throughput, p95) with a hover
// crosshair + tooltip. Kept as two single-axis charts rather than one
// dual-axis chart since the two metrics have unrelated scales. A loaded
// past run has no time series (see loadPastRunIntoMode2), so the charts
// clear and a note explains why. ─────────────────────────────────────────

const MAX_POINTS = 120;
const series = { throughput: [], p95: [] };
const chartTooltip = el('chart-tooltip');

function pushPoint(name, value) {
  const arr = series[name];
  arr.push({ t: Date.now(), v: value });
  if (arr.length > MAX_POINTS) arr.shift();
}

function resetSeries() {
  series.throughput = [];
  series.p95 = [];
}

function drawLineChart(canvas, points, color) {
  canvas._points = points;
  canvas._color = color;
  canvas._geom = null;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (points.length < 2) return;

  const values = points.map((p) => p.v);
  const max = Math.max(...values, 1);
  const stepX = w / (MAX_POINTS - 1);
  const startIdx = MAX_POINTS - points.length;

  ctx.strokeStyle = cssVar('--outline');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h - 0.5);
  ctx.lineTo(w, h - 0.5);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const coords = points.map((p, i) => {
    const x = (startIdx + i) * stepX;
    const y = h - (p.v / max) * (h - 10) - 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    return { x, y, t: p.t, v: p.v };
  });
  ctx.stroke();

  const lastPoint = coords[coords.length - 1];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(lastPoint.x, lastPoint.y, 3, 0, Math.PI * 2);
  ctx.fill();

  canvas._geom = { coords };
}

function attachCrosshair(canvas) {
  canvas.addEventListener('mousemove', (ev) => {
    const geom = canvas._geom;
    if (!geom || !geom.coords.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    let nearest = geom.coords[0];
    let nearestDist = Infinity;
    for (const c of geom.coords) {
      const d = Math.abs(c.x - x);
      if (d < nearestDist) { nearestDist = d; nearest = c; }
    }

    drawLineChart(canvas, canvas._points, canvas._color);
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = cssVar('--on-variant');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(nearest.x, 0);
    ctx.lineTo(nearest.x, canvas.height);
    ctx.stroke();
    ctx.fillStyle = canvas._color;
    ctx.beginPath();
    ctx.arc(nearest.x, nearest.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = cssVar('--surface');
    ctx.stroke();

    const secondsAgo = Math.max(0, Math.round((Date.now() - nearest.t) / 1000));
    chartTooltip.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = String(Math.round(nearest.v * 100) / 100);
    chartTooltip.appendChild(strong);
    chartTooltip.appendChild(document.createTextNode(secondsAgo === 0 ? ' · now' : ` · ${secondsAgo}s ago`));
    chartTooltip.style.display = 'block';
    chartTooltip.style.left = `${ev.clientX + 14}px`;
    chartTooltip.style.top = `${ev.clientY - 12}px`;
  });

  canvas.addEventListener('mouseleave', () => {
    chartTooltip.style.display = 'none';
    if (canvas._points) drawLineChart(canvas, canvas._points, canvas._color);
  });
}

attachCrosshair(chartThroughput);
attachCrosshair(chartP95);

function applyTick2(tick) {
  chartHistoricalNote.classList.add('hidden');
  const elapsedMs = tick.startedAt ? (tick.finishedAt || Date.now()) - tick.startedAt : 0;
  const hasError = updateHealthAndNumbers(tick.categories, tick.total, tick.throughput, tick.durationSec);
  setState2(tick.status, elapsedMs, hasError);

  renderEndpointTable2(tick.perPath);
  renderErrorsPanel(tick.errors);
  renderDockerStats(dockerStatsEl, tick.docker || []);

  pushPoint('throughput', tick.throughput);
  pushPoint('p95', tick.overall ? tick.overall.p95 : 0);
  drawLineChart(chartThroughput, series.throughput, cssVar('--pink-bright'));
  drawLineChart(chartP95, series.p95, cssVar('--on-variant'));
}

const source = new EventSource('/api/events');
source.addEventListener('tick', (ev) => applyTick2(JSON.parse(ev.data)));
source.addEventListener('prefetch', (ev) => {
  const { loaded, total } = JSON.parse(ev.data);
  showPrefetch(loaded, total);
});
source.addEventListener('started', (ev) => {
  setRunningUI(true);
  resetSeries();
  chartHistoricalNote.classList.add('hidden');
  hidePrefetch(); // load loop actually started — phase:"running"
  showShortfall(null);
  setState2(JSON.parse(ev.data).status, 0, false);
});
source.addEventListener('finished', (ev) => {
  const final = JSON.parse(ev.data);
  hidePrefetch();
  applyTick2({ ...final, docker: [] });
  setRunningUI(false);
  // Whether the token pool came up short is only knowable from
  // summary.txt, which loadtest.sh only finishes writing right at the very
  // end — re-fetch this run's own detail (already-parsed by runs.js) rather
  // than re-deriving it here. Informational only — NUM_USERS itself always
  // ran in full, so this doesn't flip the run into an errored state.
  const ts = (final.logDir || '').split('/').filter(Boolean).pop();
  if (ts) {
    fetch(`/api/runs/${ts}`).then((res) => res.json()).then((run) => showShortfall(run.shortfall)).catch(() => {});
  }
  if (!panels.history.hidden) loadHistoryList();
});
source.addEventListener('run-error', (ev) => {
  controlError.textContent = JSON.parse(ev.data).message;
  setRunningUI(false);
  hidePrefetch(); // e.g. the health-check or users.csv step failed before prefetch even began
  setState2('idle', 0, false);
});

// ═══════════════════════════════ MODE 1 ════════════════════════════════════

const capStartRate = el('cap-start-rate');
const capRateStep = el('cap-rate-step');
const capStepSec = el('cap-step-sec');
const capMaxRate = el('cap-max-rate');
const capAutoStop = el('cap-auto-stop');
const capThreshold = el('cap-threshold');
const capBaseUrl = el('cap-base-url');
const capTarget = el('cap-target');
const capBaseUrlField = el('cap-base-url-field');
const capWorkerBadge = el('cap-worker-badge');
const applyCapTarget = wireTargetControl(capTarget, capBaseUrlField, capWorkerBadge);
const capStartBtn = el('cap-start-btn');
const capStopBtn = el('cap-stop-btn');
const capControlError = el('cap-control-error');

const capStatusbarEl = el('cap-statusbar');
const capStateDot = el('cap-state-dot');
const capStateText = el('cap-state-text');
const capTicker = makeElapsedTicker(el('cap-elapsed'));
const capStatLimit = el('cap-stat-limit');
const capStatBcrypt = el('cap-stat-bcrypt');
const capStatKnee = el('cap-stat-knee');

const capTableBody = el('cap-table-body');
const capConsole = el('cap-console');

function setCapRunningUI(active) {
  capStartBtn.disabled = active;
  capStopBtn.disabled = !active;
  for (const input of [capStartRate, capRateStep, capStepSec, capMaxRate, capAutoStop, capThreshold, capBaseUrl, capTarget]) {
    input.disabled = active;
  }
}

function setCapState(status, hasError) {
  capStateDot.className = 'dot' + (status === 'running' ? ' running' : status === 'finished' ? ' finished' : '') + (hasError ? ' errored' : '');
  capStateText.textContent = status === 'running' ? 'LÄUFT' : status === 'finished' ? 'FERTIG' : 'IDLE';
  capStatusbarEl.classList.toggle('errored', !!hasError);
  capStatusbarEl.classList.toggle('idle', status === 'idle');
}

// successPct here is a per-step number, not a traffic-light bucket like
// Mode 2's 2xx/4xx/5xx — amber only applies right at the threshold edge,
// otherwise it's a clean ok/err split (cleared the bar or didn't).
function successClass(successPct, threshold) {
  if (successPct >= threshold) return 'cell-ok';
  if (successPct >= threshold - 10) return 'cell-warn';
  return 'cell-err';
}

function renderCapRow(row, threshold, maxRate) {
  const tr = document.createElement('tr');
  tr.dataset.step = row.step;
  const width = maxRate > 0 ? (row.targetRate / maxRate) * 100 : 0;
  tr.innerHTML = `<td data-label="Target/s">${row.targetRate}/s</td>`
    + `<td data-label="Attempts">${row.attempts}</td>`
    + `<td data-label="Success">${row.successes}</td>`
    + `<td class="${successClass(row.successPct, threshold)}" data-label="Success %">${row.successPct.toFixed(1)}%</td>`
    + `<td class="bar-cell" data-label="Rate"><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></td>`
    + `<td data-label="p95 ms">${row.p95Ms}</td>`;
  return tr;
}

function renderCapTable(rows, tbody) {
  tbody.innerHTML = '';
  const threshold = Number(capThreshold.value || 95);
  const maxRate = rows.reduce((m, r) => Math.max(m, r.targetRate), 0);
  for (const row of rows) tbody.appendChild(renderCapRow(row, threshold, maxRate));
}

// The practical answer to "how many logins/sec can this backend take":
// the highest rate that still cleared the success threshold (limit), and
// the first rate — in ramp order — that fell below it (the knee where
// capacity runs out). A run that never clears the threshold, even at its
// first step, reads as a real error (red statusbar/dot), same as Mode 2.
function computeCapVerdict(rows, threshold) {
  const ordered = [...rows].sort((a, b) => a.step - b.step);
  let best = null;
  let knee = null;
  for (const row of ordered) {
    if (row.successPct >= threshold) best = row;
    else if (knee === null) knee = row;
  }
  return { best, knee };
}

function renderCapSummary(rows) {
  const threshold = Number(capThreshold.value || 95);
  const { best, knee } = computeCapVerdict(rows, threshold);
  const hasError = rows.length > 0 && best === null;

  capStatLimit.textContent = best ? `${best.targetRate}/s` : '–';
  capStatLimit.className = 'num ' + (rows.length ? (best ? 'ok' : 'err') : '');

  capStatBcrypt.textContent = best ? String(best.avgMs) : '–';
  capStatBcrypt.className = 'num';

  capStatKnee.textContent = knee ? `${knee.targetRate}/s` : '–';
  capStatKnee.className = 'num ' + (knee ? 'err' : '');

  return hasError;
}

function appendCapConsoleLine(line) {
  capConsole.textContent += (capConsole.textContent ? '\n' : '') + line;
  capConsole.scrollTop = capConsole.scrollHeight;
}

capStartBtn.addEventListener('click', async () => {
  capControlError.textContent = '';
  const params = {
    startRate: Number(capStartRate.value),
    rateStep: Number(capRateStep.value),
    stepSec: Number(capStepSec.value),
    maxRate: Number(capMaxRate.value),
    autoStop: capAutoStop.checked,
    successThreshold: Number(capThreshold.value),
    baseUrl: capBaseUrl.value.trim() || undefined,
  };
  setCapRunningUI(true);
  try {
    const res = await fetch('/api/capacity/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const body = await res.json();
    if (!res.ok) {
      capControlError.textContent = body.error || 'failed to start';
      setCapRunningUI(false);
      return;
    }
    capTableBody.innerHTML = '';
    capConsole.textContent = '';
    capStatLimit.textContent = '–';
    capStatBcrypt.textContent = '–';
    capStatKnee.textContent = '–';
    setCapState('running', false);
    capTicker.start(Date.now());
  } catch (err) {
    capControlError.textContent = String(err);
    setCapRunningUI(false);
  }
});

capStopBtn.addEventListener('click', async () => {
  capControlError.textContent = '';
  capStopBtn.disabled = true;
  try {
    const res = await fetch('/api/capacity/stop', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) capControlError.textContent = body.error || 'failed to stop';
  } catch (err) {
    capControlError.textContent = String(err);
  }
});

let capRowsByStep = new Map();

fetch('/api/capacity/state')
  .then((res) => res.json())
  .then((state) => {
    capRowsByStep = new Map((state.rows || []).map((r) => [r.step, r]));
    setCapRunningUI(state.active);
    if (state.params && state.params.baseUrl) applyCapTarget(state.params.baseUrl);
    const rows = state.rows || [];
    const hasError = renderCapSummary(rows);
    setCapState(state.active ? 'running' : (state.status || 'idle'), hasError);
    renderCapTable(rows, capTableBody);
    capConsole.textContent = (state.lines || []).join('\n');
    capConsole.scrollTop = capConsole.scrollHeight;
    if (state.active && state.startedAt) capTicker.start(state.startedAt);
  })
  .catch(() => {});

source.addEventListener('capacity-started', (ev) => {
  const state = JSON.parse(ev.data);
  capRowsByStep = new Map();
  setCapRunningUI(true);
  setCapState('running', false);
  if (state.params && state.params.baseUrl) applyCapTarget(state.params.baseUrl);
  capTicker.start(state.startedAt || Date.now());
});
source.addEventListener('capacity-line', (ev) => {
  const { line, row } = JSON.parse(ev.data);
  appendCapConsoleLine(line);
  if (row) {
    // login-capacity.sh reprints its whole table in its own summary —
    // keyed by step, so this both appends new steps and de-dupes the
    // reprint instead of doubling every row.
    capRowsByStep.set(row.step, row);
    const rows = [...capRowsByStep.values()].sort((a, b) => a.step - b.step);
    renderCapTable(rows, capTableBody);
    const hasError = renderCapSummary(rows);
    setCapState('running', hasError);
  }
});
source.addEventListener('capacity-finished', (ev) => {
  const state = JSON.parse(ev.data);
  const rows = state.rows || [];
  capRowsByStep = new Map(rows.map((r) => [r.step, r]));
  setCapRunningUI(false);
  const hasError = renderCapSummary(rows);
  setCapState('finished', hasError);
  renderCapTable(rows, capTableBody);
  capTicker.stop();
  if (!panels.history.hidden) loadHistoryList();
});

// ═══════════════════════════════ MODE 3 ════════════════════════════════════
// Stepped rate ramp (same engine as Mode 1) against a chosen subset of
// Mode 2's endpoints, instead of one fixed endpoint or NUM_USERS-driven
// random traffic — for isolating exactly which endpoint is the
// bottleneck. Reuses Mode 2's health-bar/endpoint-table rendering
// approach (same underlying per-path CSV/aggregator data shape) and Mode
// 1's step-table rendering approach (same row format) rather than a third
// distinct pattern — but as its own set of functions/elements, matching
// how Mode 1 and Mode 2 already don't share DOM, only conventions.

const rateEndpointCheckboxes = document.querySelectorAll('.rate-endpoint-cb');
const rateSelectAllBtn = el('rate-select-all');
const rateSelectNoneBtn = el('rate-select-none');
const rateSelectOneBtn = el('rate-select-one');

const rateStartRate = el('rate-start-rate');
const rateRateStep = el('rate-rate-step');
const rateStepSec = el('rate-step-sec');
const rateMaxRate = el('rate-max-rate');
const rateAutoStop = el('rate-auto-stop');
const rateThreshold = el('rate-threshold');
const rateTokenPool = el('rate-token-pool');
const rateBaseUrl = el('rate-base-url');
const rateTarget = el('rate-target');
const rateBaseUrlField = el('rate-base-url-field');
const rateWorkerBadge = el('rate-worker-badge');
const applyRateTarget = wireTargetControl(rateTarget, rateBaseUrlField, rateWorkerBadge);
const rateDockerStatsEl = el('rate-docker-stats');
const rateStartBtn = el('rate-start-btn');
const rateStopBtn = el('rate-stop-btn');
const rateControlError = el('rate-control-error');

const rateStatusbarEl = el('rate-statusbar');
const rateStateDot = el('rate-state-dot');
const rateStateText = el('rate-state-text');
const rateTicker = makeElapsedTicker(el('rate-elapsed'));
const rateStatThroughput = el('rate-stat-throughput');
const rateStatSuccessRate = el('rate-stat-success-rate');
const rateStatRealErrors = el('rate-stat-real-errors');

const rateHealthOk = el('rate-health-ok');
const rateHealthWarn = el('rate-health-warn');
const rateHealthErr = el('rate-health-err');
const rateHealthOkLabel = el('rate-health-ok-label');
const rateHealthWarnLabel = el('rate-health-warn-label');
const rateHealthErrLabel = el('rate-health-err-label');

const rateTableBody = el('rate-table-body');
const rateEndpointBody = document.querySelector('#rate-endpoint-table tbody');
const rateErrorsClean = el('rate-errors-clean');
const rateErrorsTable = el('rate-errors-table');
const rateErrorsBody = document.querySelector('#rate-errors-table tbody');
const rateConsole = el('rate-console');

function getSelectedEndpoints() {
  return [...rateEndpointCheckboxes].filter((cb) => cb.checked).map((cb) => cb.value);
}

function setSelectedEndpoints(keys) {
  const set = new Set(keys);
  for (const cb of rateEndpointCheckboxes) cb.checked = set.has(cb.value);
}

rateSelectAllBtn.addEventListener('click', () => { for (const cb of rateEndpointCheckboxes) cb.checked = true; });
rateSelectNoneBtn.addEventListener('click', () => { for (const cb of rateEndpointCheckboxes) cb.checked = false; });
rateSelectOneBtn.addEventListener('click', () => {
  const all = [...rateEndpointCheckboxes];
  const pick = all[Math.floor(Math.random() * all.length)];
  for (const cb of all) cb.checked = cb === pick;
});

function setRateRunningUI(active) {
  rateStartBtn.disabled = active;
  rateStopBtn.disabled = !active;
  for (const input of [rateStartRate, rateRateStep, rateStepSec, rateMaxRate, rateAutoStop, rateThreshold, rateTokenPool, rateBaseUrl, rateTarget]) {
    input.disabled = active;
  }
  for (const cb of rateEndpointCheckboxes) cb.disabled = active;
}

function setRateState(status, hasError) {
  rateStateDot.className = 'dot' + (status === 'running' ? ' running' : status === 'finished' ? ' finished' : '') + (hasError ? ' errored' : '');
  rateStateText.textContent = status === 'running' ? 'LÄUFT' : status === 'finished' ? 'FERTIG' : 'IDLE';
  rateStatusbarEl.classList.toggle('errored', !!hasError);
  rateStatusbarEl.classList.toggle('idle', status === 'idle');
}

// Same shape/logic as Mode 2's updateHealthAndNumbers — see that function's
// comment for the reasoning (hasError <=> real 5xx/transport errors only).
function updateRateHealthAndNumbers(categories, total, throughput) {
  const c = categories || { success: 0, expectedReject: 0, error: 0 };
  const hasError = (c.error || 0) > 0;
  const successPct = total > 0 ? (c.success / total) * 100 : 0;

  rateStatThroughput.textContent = throughput != null ? throughput.toFixed(1) : '–';
  rateStatSuccessRate.textContent = total > 0 ? `${successPct.toFixed(1)}%` : '–';
  rateStatSuccessRate.className = 'num ' + (hasError ? 'err' : 'ok');
  rateStatRealErrors.textContent = String(c.error || 0);
  rateStatRealErrors.className = 'num ' + (hasError ? 'err' : 'ok');

  rateHealthOk.style.flex = String(c.success || 0);
  rateHealthWarn.style.flex = String(c.expectedReject || 0);
  rateHealthErr.style.flex = String(c.error || 0);
  rateHealthOkLabel.textContent = `Success 2xx · ${c.success || 0}`;
  rateHealthWarnLabel.textContent = `Expected reject 4xx · ${c.expectedReject || 0}`;
  rateHealthErrLabel.textContent = `Error 5xx / transport · ${c.error || 0}`;

  return hasError;
}

// Own sort state, same click-to-sort mechanism as Mode 2's endpoint table
// (see ENDPOINT_SORT_ACCESSORS) — kept as a separate instance rather than
// shared, since the two tables' data arrives independently.
let rateLastPerPath = {};
let rateEndpointSort = { key: 'p95', dir: 'desc' };

function renderRateEndpointTable(perPath) {
  rateLastPerPath = perPath || {};
  rateEndpointBody.innerHTML = '';
  const accessor = ENDPOINT_SORT_ACCESSORS[rateEndpointSort.key] || ENDPOINT_SORT_ACCESSORS.p95;
  const dirMul = rateEndpointSort.dir === 'asc' ? 1 : -1;
  const paths = Object.entries(rateLastPerPath).sort((a, b) => {
    const av = accessor(a[0], a[1]);
    const bv = accessor(b[0], b[1]);
    if (av < bv) return -1 * dirMul;
    if (av > bv) return 1 * dirMul;
    return 0;
  });
  const maxP95 = paths.length ? Math.max(...paths.map(([, s]) => s.p95)) : 0;
  for (const [p, s] of paths) {
    const c = s.categories || { success: 0, expectedReject: 0, error: 0 };
    const width = maxP95 > 0 ? (s.p95 / maxP95) * 100 : 0;
    const cell = (value, cls, label) => `<td class="${value === 0 ? 'zero' : cls}" data-label="${label}">${value}</td>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="path" data-label="Path">${p}</td>`
      + `<td data-label="n">${s.n}</td>`
      + `<td data-label="p95">${s.p95}</td>`
      + `<td class="bar-cell" data-label="Latenz"><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></td>`
      + cell(c.success, 'cell-ok', 'ok')
      + cell(c.expectedReject, 'cell-warn', '4xx')
      + cell(c.error, 'cell-err', 'err');
    rateEndpointBody.appendChild(tr);
  }
}

const rateEndpointHeaders = document.querySelectorAll('#rate-endpoint-table thead th[data-sort]');

function updateRateSortIndicators() {
  for (const th of rateEndpointHeaders) {
    th.setAttribute('aria-sort', th.dataset.sort === rateEndpointSort.key
      ? (rateEndpointSort.dir === 'asc' ? 'ascending' : 'descending')
      : 'none');
  }
}

function setRateSort(key) {
  rateEndpointSort = key === rateEndpointSort.key
    ? { key, dir: rateEndpointSort.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'path' ? 'asc' : 'desc' };
  updateRateSortIndicators();
  renderRateEndpointTable(rateLastPerPath);
}

for (const th of rateEndpointHeaders) {
  th.addEventListener('click', () => setRateSort(th.dataset.sort));
  th.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      setRateSort(th.dataset.sort);
    }
  });
}
updateRateSortIndicators();

function renderRateErrorsPanel(errors) {
  const hasErrors = errors && errors.length > 0;
  rateErrorsClean.classList.toggle('hidden', hasErrors);
  rateErrorsTable.classList.toggle('hidden', !hasErrors);
  if (hasErrors) renderErrorRows(errors, rateErrorsBody); // shared with Mode 2, fully generic
}

// Step table — same row shape/rendering idea as Mode 1's renderCapRow,
// reusing its successClass() (threshold-relative ok/warn/err) directly.
function renderRateRow(row, threshold, maxRate) {
  const tr = document.createElement('tr');
  const width = maxRate > 0 ? (row.targetRate / maxRate) * 100 : 0;
  tr.innerHTML = `<td data-label="Target/s">${row.targetRate}/s</td>`
    + `<td data-label="Attempts">${row.attempts}</td>`
    + `<td data-label="Success">${row.successes}</td>`
    + `<td class="${successClass(row.successPct, threshold)}" data-label="Success %">${row.successPct.toFixed(1)}%</td>`
    + `<td class="bar-cell" data-label="Rate"><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></td>`
    + `<td data-label="p95 ms">${row.p95Ms}</td>`;
  return tr;
}

function renderRateTable(rows) {
  rateTableBody.innerHTML = '';
  const threshold = Number(rateThreshold.value || 95);
  const maxRate = rows.reduce((m, r) => Math.max(m, r.targetRate), 0);
  for (const row of rows) rateTableBody.appendChild(renderRateRow(row, threshold, maxRate));
}

function appendRateConsoleLine(line) {
  rateConsole.textContent += (rateConsole.textContent ? '\n' : '') + line;
  rateConsole.scrollTop = rateConsole.scrollHeight;
}

rateStartBtn.addEventListener('click', async () => {
  rateControlError.textContent = '';
  const params = {
    endpoints: getSelectedEndpoints(),
    startRate: Number(rateStartRate.value),
    rateStep: Number(rateRateStep.value),
    stepSec: Number(rateStepSec.value),
    maxRate: Number(rateMaxRate.value),
    autoStop: rateAutoStop.checked,
    successThreshold: Number(rateThreshold.value),
    tokenPoolSize: Number(rateTokenPool.value),
    baseUrl: rateBaseUrl.value.trim() || undefined,
  };
  setRateRunningUI(true);
  try {
    const res = await fetch('/api/rate/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const body = await res.json();
    if (!res.ok) {
      rateControlError.textContent = body.error || 'failed to start';
      setRateRunningUI(false);
      return;
    }
    rateTableBody.innerHTML = '';
    rateConsole.textContent = '';
    setRateState('running', false);
    rateTicker.start(Date.now());
  } catch (err) {
    rateControlError.textContent = String(err);
    setRateRunningUI(false);
  }
});

rateStopBtn.addEventListener('click', async () => {
  rateControlError.textContent = '';
  rateStopBtn.disabled = true;
  try {
    const res = await fetch('/api/rate/stop', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) rateControlError.textContent = body.error || 'failed to stop';
  } catch (err) {
    rateControlError.textContent = String(err);
  }
});

let rateRowsByStep = new Map();

fetch('/api/rate/state')
  .then((res) => res.json())
  .then((state) => {
    rateRowsByStep = new Map((state.rows || []).map((r) => [r.step, r]));
    setRateRunningUI(state.active);
    setRateState(state.active ? 'running' : 'idle', false);
    renderRateTable(state.rows || []);
    rateConsole.textContent = (state.lines || []).join('\n');
    rateConsole.scrollTop = rateConsole.scrollHeight;
    if (state.params && state.params.endpoints) setSelectedEndpoints(state.params.endpoints.split(','));
    if (state.params && state.params.baseUrl) applyRateTarget(state.params.baseUrl);
    if (state.live) {
      updateRateHealthAndNumbers(state.live.categories, state.live.total, state.live.throughput);
      renderRateEndpointTable(state.live.perPath);
      renderRateErrorsPanel(state.live.errors);
    }
    if (state.active && state.startedAt) rateTicker.start(state.startedAt);
  })
  .catch(() => {});

source.addEventListener('rate-started', (ev) => {
  const state = JSON.parse(ev.data);
  rateRowsByStep = new Map();
  setRateRunningUI(true);
  setRateState('running', false);
  if (state.params && state.params.baseUrl) applyRateTarget(state.params.baseUrl);
  rateTicker.start(state.startedAt || Date.now());
});
source.addEventListener('rate-line', (ev) => {
  const { line, row } = JSON.parse(ev.data);
  appendRateConsoleLine(line);
  if (row) {
    // endpoint-rate.sh reprints nothing extra, but keyed-by-step still
    // de-dupes safely if it ever did.
    rateRowsByStep.set(row.step, row);
    renderRateTable([...rateRowsByStep.values()].sort((a, b) => a.step - b.step));
  }
});
source.addEventListener('rate-tick', (ev) => {
  const tick = JSON.parse(ev.data);
  const hasError = updateRateHealthAndNumbers(tick.categories, tick.total, tick.throughput);
  setRateState('running', hasError);
  renderRateEndpointTable(tick.perPath);
  renderRateErrorsPanel(tick.errors);
  renderDockerStats(rateDockerStatsEl, tick.docker || []);
});
source.addEventListener('rate-finished', (ev) => {
  const final = JSON.parse(ev.data);
  setRateRunningUI(false);
  const hasError = updateRateHealthAndNumbers(final.categories, final.total, null);
  setRateState('finished', hasError);
  renderRateEndpointTable(final.perPath);
  renderRateErrorsPanel(final.errors);
  if (final.rows) renderRateTable(final.rows);
  rateTicker.stop();
  renderDockerStats(rateDockerStatsEl, []);
  if (!panels.history.hidden) loadHistoryList();
});
source.addEventListener('rate-error', (ev) => {
  rateControlError.textContent = JSON.parse(ev.data).message;
  setRateRunningUI(false);
  setRateState('idle', false);
  rateTicker.stop();
});

// Loads a past Mode 3 run's full detail into the same elements the live
// SSE events drive — same "reuse, don't duplicate a view" approach as
// Mode 2's loadPastRunIntoMode2.
async function loadPastRunIntoMode3(ts) {
  const res = await fetch(`/api/rate/runs/${ts}`);
  if (!res.ok) return;
  const run = await res.json();

  if (run.params) {
    if (run.params.endpoints) setSelectedEndpoints(run.params.endpoints.split(','));
    rateStartRate.value = run.params.startRate;
    rateRateStep.value = run.params.rateStep;
    rateStepSec.value = run.params.stepSec;
    rateMaxRate.value = run.params.maxRate;
    if (run.params.baseUrl) applyRateTarget(run.params.baseUrl);
  }

  const total = run.stats ? run.stats.total : 0;
  const categories = run.stats ? run.stats.categories : null;
  const hasError = updateRateHealthAndNumbers(categories, total, null);
  setRateState('finished', hasError);

  renderRateEndpointTable(run.stats ? run.stats.perPath : {});
  renderRateErrorsPanel(run.errors || []);
  renderRateTable(run.steps || []);
  rateConsole.textContent = run.summaryText || '';
  renderDockerStats(rateDockerStatsEl, []);
}

// ═══════════════════════════════ HISTORY ═══════════════════════════════════

const historyList = el('history-list');

// Loads a past Mode 2 run's full detail into the SAME elements the live
// SSE ticks drive (status bar, health bar, endpoint table, errors panel)
// — this is the "past-run rendering that already exists" the History tab
// reuses, not a separate view. Does not touch start/stop button state:
// if a live run is actually active, its own next tick simply overwrites
// this static snapshot, which is the expected/harmless behavior.
async function loadPastRunIntoMode2(ts) {
  const res = await fetch(`/api/runs/${ts}`);
  if (!res.ok) return;
  const run = await res.json();

  hidePrefetch(); // a past run has no live prefetch phase to show

  if (run.params) {
    numUsersInput.value = run.params.numUsers;
    durationInput.value = run.params.durationSec;
  }

  resetSeries();
  drawLineChart(chartThroughput, [], cssVar('--pink-bright'));
  drawLineChart(chartP95, [], cssVar('--on-variant'));
  chartHistoricalNote.classList.remove('hidden');

  const total = run.stats ? run.stats.total : 0;
  const categories = run.stats ? run.stats.categories : null;
  const durationSec = run.params ? run.params.durationSec : null;
  const hasError = updateHealthAndNumbers(categories, total, null, durationSec);
  showShortfall(run.shortfall); // informational — doesn't affect hasError
  setState2('finished', 0, hasError);

  renderEndpointTable2(run.stats ? run.stats.perPath : {});
  renderErrorsPanel(run.errors || []);
  renderDockerStats(dockerStatsEl, []);
}

// Same idea for Mode 1 — feeds the same stepped-ramp table + status bar
// the live capacity-line SSE events drive.
async function loadPastRunIntoMode1(ts) {
  const res = await fetch(`/api/capacity/runs/${ts}`);
  if (!res.ok) return;
  const run = await res.json();
  const rows = run.rows || [];

  if (run.params) {
    capStartRate.value = run.params.startRate;
    capRateStep.value = run.params.rateStep;
    capStepSec.value = run.params.stepSec;
    capMaxRate.value = run.params.maxRate;
    capAutoStop.checked = !!run.params.autoStop;
    if (run.params.successThreshold !== undefined) capThreshold.value = run.params.successThreshold;
    if (run.params.baseUrl) applyCapTarget(run.params.baseUrl);
  }

  capRowsByStep = new Map(rows.map((r) => [r.step, r]));
  renderCapTable(rows, capTableBody);
  const hasError = renderCapSummary(rows);
  setCapState('finished', hasError);
  capConsole.textContent = (run.lines || []).join('\n');
  capConsole.scrollTop = capConsole.scrollHeight;
}

// The best rate that still cleared the threshold, and the first rate (in
// ramp order) that fell below it — same logic renderCapSummary() uses
// live, reused here so a History row's numbers agree with what its own
// detail view (loadPastRunIntoMode1) will show for the same run.
function historyCapVerdict(rows, threshold) {
  return computeCapVerdict(rows, threshold ?? 95);
}

function renderHistRow(run) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hist-row';

  let healthy;
  let metaText;
  let stats3;
  let miniBarHtml;

  if (run.mode === 2) {
    const stats = run.stats;
    const total = stats ? stats.total : 0;
    const cats = stats ? stats.categories : { success: 0, expectedReject: 0, error: 0 };
    // A token-pool shortfall doesn't affect health — every requested
    // worker still ran (tokens are reused across workers), it just means
    // fewer distinct accounts got shared. Still worth a quiet note on the
    // row, just not a red one.
    healthy = !!stats && cats.error === 0;
    metaText = run.params ? `Mode 2 · ${run.params.numUsers} Users · ${run.params.durationSec}s` : 'Mode 2 · Lauf';
    if (run.shortfall) metaText += ` <span class="hist-shortfall">(ⓘ Pool ${run.shortfall.actualTokens}/${run.shortfall.poolTarget})</span>`;
    const reqS = stats && run.params ? (total / run.params.durationSec).toFixed(1) : '–';
    const successPct = stats && total > 0 ? `${((cats.success / total) * 100).toFixed(1)}%` : '–';
    stats3 = [
      ['req/s', reqS, 'history.reqs'],
      ['Erfolg', successPct, 'history.successRate'],
      ['Fehler', stats ? String(cats.error) : '–', 'history.errors'],
    ];
    miniBarHtml = `<div style="background:var(--ok);flex:${cats.success}"></div>`
      + `<div style="background:var(--warn);flex:${cats.expectedReject}"></div>`
      + `<div style="background:var(--err);flex:${cats.error}"></div>`;
  } else if (run.mode === 1) {
    const rows = run.rows || [];
    const { best, knee } = historyCapVerdict(rows, run.params && run.params.successThreshold);
    healthy = rows.length > 0 && !!best;
    metaText = run.params
      ? `Mode 1 · Login Capacity · ${run.params.startRate}→${run.params.maxRate}/s`
      : 'Mode 1 · Login Capacity';
    stats3 = [
      ['Grenze', best ? `${best.targetRate}/s` : '–', 'mode1.limit'],
      ['bcrypt', best ? `${best.avgMs}ms` : '–', 'mode1.bcrypt'],
      ['Knick', knee ? `${knee.targetRate}/s` : '–', 'mode1.knee'],
    ];
    const totalSuccesses = rows.reduce((s, r) => s + r.successes, 0);
    const totalAttempts = rows.reduce((s, r) => s + r.attempts, 0);
    miniBarHtml = `<div style="background:var(--ok);flex:${totalSuccesses}"></div>`
      + `<div style="background:var(--err);flex:${Math.max(0, totalAttempts - totalSuccesses)}"></div>`;
  } else {
    // Mode 3 — same per-path stats shape as Mode 2 (identical CSV/
    // aggregator), just a rate ramp against a chosen endpoint subset
    // instead of NUM_USERS-driven traffic against all of them.
    const stats = run.stats;
    const total = stats ? stats.total : 0;
    const cats = stats ? stats.categories : { success: 0, expectedReject: 0, error: 0 };
    healthy = !!stats && cats.error === 0;
    const epList = run.params && run.params.endpoints ? run.params.endpoints.split(',') : [];
    const epLabel = epList.length === 0 ? '–' : epList.length === 1 ? epList[0] : `${epList.length} Endpoints`;
    metaText = run.params
      ? `Mode 3 · ${epLabel} · ${run.params.startRate}→${run.params.maxRate}/s`
      : 'Mode 3 · Endpoint Rate';
    const durationSec = run.params && run.steps && run.steps.length ? run.steps.length * run.params.stepSec : null;
    const reqS = stats && durationSec ? (total / durationSec).toFixed(1) : '–';
    const successPct = stats && total > 0 ? `${((cats.success / total) * 100).toFixed(1)}%` : '–';
    stats3 = [
      ['req/s', reqS, 'history.reqs'],
      ['Erfolg', successPct, 'history.successRate'],
      ['Fehler', stats ? String(cats.error) : '–', 'history.errors'],
    ];
    miniBarHtml = `<div style="background:var(--ok);flex:${cats.success}"></div>`
      + `<div style="background:var(--warn);flex:${cats.expectedReject}"></div>`
      + `<div style="background:var(--err);flex:${cats.error}"></div>`;
  }

  // These inner elements deliberately get no tabindex — they sit inside
  // the row <button>, and a nested focusable control would be invalid;
  // hover still shows their tip for mouse users, keyboard users get the
  // row's own Enter-to-open behavior instead.
  const statsHtml = stats3.map(([k, v, tip]) => `<div class="hist-stat"><span class="k" data-tip="${tip}">${k}</span>${v}</div>`).join('');
  btn.innerHTML = `<span class="hist-badge ${healthy ? 'ok' : 'err'}" data-tip="history.dot"></span>`
    + `<div><div class="hist-when">${formatHistDate(run.ts)}</div><div class="hist-meta">${metaText}</div></div>`
    + statsHtml
    + `<div class="hist-mini" data-tip="history.miniBar">${miniBarHtml}</div>`;

  btn.addEventListener('click', () => {
    if (run.mode === 2) { setTab('2'); loadPastRunIntoMode2(run.ts); }
    else if (run.mode === 1) { setTab('1'); loadPastRunIntoMode1(run.ts); }
    else { setTab('3'); loadPastRunIntoMode3(run.ts); }
  });
  return btn;
}

async function loadHistoryList() {
  const [runs2, runs1, runs3] = await Promise.all([
    fetch('/api/runs').then((r) => r.json()).catch(() => []),
    fetch('/api/capacity/runs').then((r) => r.json()).catch(() => []),
    fetch('/api/rate/runs').then((r) => r.json()).catch(() => []),
  ]);
  const combined = [
    ...runs2.map((r) => ({ mode: 2, ...r })),
    ...runs1.map((r) => ({ mode: 1, ...r })),
    ...runs3.map((r) => ({ mode: 3, ...r })),
  ].sort((a, b) => Number(b.ts) - Number(a.ts));

  historyList.innerHTML = '';
  if (!combined.length) {
    historyList.innerHTML = '<div class="hist-empty">Noch keine Läufe.</div>';
    return;
  }
  for (const run of combined) historyList.appendChild(renderHistRow(run));
}

// ── Reset widget ──────────────────────────────────────────────────────────
// Rebuilds + recreates XXX_backend_load (see lib/resetRunner.js). Lives
// outside the tab panels, so its elements/wiring live here at the end
// rather than inside one mode's section.

const resetDot = el('reset-dot');
const resetStateText = el('reset-state-text');
const resetBtn = el('reset-btn');
const resetError = el('reset-error');
const resetConsole = el('reset-console');
const resetTicker = makeElapsedTicker(el('reset-elapsed'));

const RESET_STEP_LABELS = { build: 'Baue Image…', recreate: 'Starte Container neu…' };

function appendResetConsoleLine(line) {
  resetConsole.classList.remove('hidden');
  resetConsole.textContent += (resetConsole.textContent ? '\n' : '') + line;
  resetConsole.scrollTop = resetConsole.scrollHeight;
}

function setResetState(state, stepLabel) {
  resetDot.className = 'dot' + (state === 'running' ? ' running' : state === 'error' ? ' errored' : '');
  resetStateText.textContent = stepLabel
    || (state === 'running' ? 'Reset läuft…' : state === 'error' ? 'Reset fehlgeschlagen' : 'Backend bereit');
  resetBtn.disabled = state === 'running';
}

resetBtn.addEventListener('click', async () => {
  resetError.textContent = '';
  resetConsole.textContent = '';
  setResetState('running');
  resetTicker.start(Date.now());
  try {
    const res = await fetch('/api/reset/start', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) {
      resetError.textContent = body.error || 'Reset fehlgeschlagen';
      setResetState('idle');
      resetTicker.stop();
    }
  } catch (err) {
    resetError.textContent = String(err);
    setResetState('idle');
    resetTicker.stop();
  }
});

fetch('/api/reset/state')
  .then((res) => res.json())
  .then((state) => {
    if (state.active) {
      setResetState('running', RESET_STEP_LABELS[state.step]);
      resetTicker.start(state.startedAt || Date.now());
    }
  })
  .catch(() => {});

source.addEventListener('reset-step', (ev) => {
  const { step, startedAt } = JSON.parse(ev.data);
  setResetState('running', RESET_STEP_LABELS[step]);
  resetTicker.start(startedAt || Date.now());
});
source.addEventListener('reset-line', (ev) => {
  appendResetConsoleLine(JSON.parse(ev.data).line);
});
source.addEventListener('reset-done', () => {
  setResetState('idle');
  resetTicker.stop();
});
source.addEventListener('reset-error', (ev) => {
  const info = JSON.parse(ev.data);
  resetError.textContent = `${info.step} fehlgeschlagen`
    + (info.code !== undefined ? ` (exit ${info.code})` : info.message ? `: ${info.message}` : '');
  setResetState('error');
  resetTicker.stop();
});
