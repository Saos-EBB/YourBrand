#!/usr/bin/env node
'use strict';
//
// High-throughput replacement for endpoint-rate.sh's bash ramp loop.
// endpoint-rate.sh still does all the setup (endpoint selection, token
// pool bootstrap, log dir creation) then `exec`s into this script for the
// actual ramp — same actions as actions.sh, same log format (step_N.csv /
// _all_rows.csv / errors.log / summary.txt, same step-table row shape
// dashboard/lib/capacityRunner.js's ROW_RE already parses), so the
// dashboard needed zero changes for this.
//
// Why this exists: the bash version fires one `curl` subprocess per
// request (via a forked bash function per request). That's fine up to a
// few hundred r/s, but process-fork overhead itself becomes the
// bottleneck well before the backend does — confirmed in the 2026-09-13
// capacity session (see docs/audit.html): asking for 1000+ r/s produced
// ~200-250 r/s of real completions, healthy backend latency throughout,
// and step wall-clock time ballooning to ~9x the configured STEP_SEC,
// while the backend itself (once put on a multi-worker cluster) held
// 1000-2000 r/s cleanly. This script fires requests from a single Node
// process using keep-alive HTTP connections and async scheduling instead
// of a new OS process per request, which is what's actually needed to
// reach five-figure request rates.
//
// Env vars (all set by endpoint-rate.sh before exec'ing in):
//   BASE_URL, LOG_DIR, ERRORS_FILE, TOKENS_FILE, TEST_PHOTO,
//   ENDPOINT_KEYS (comma-separated action keys, no "action_" prefix),
//   START_RATE, RATE_STEP, STEP_SEC, MAX_RATE, AUTO_STOP, SUCCESS_THRESHOLD

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const LOG_DIR = process.env.LOG_DIR;
const ERRORS_FILE = process.env.ERRORS_FILE || path.join(LOG_DIR, 'errors.log');
const TOKENS_FILE = process.env.TOKENS_FILE || './tokens.csv';
const TEST_PHOTO = process.env.TEST_PHOTO;
const ENDPOINT_KEYS = (process.env.ENDPOINT_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
const START_RATE = parseInt(process.env.START_RATE || '5', 10);
const RATE_STEP = parseInt(process.env.RATE_STEP || '5', 10);
const STEP_SEC = parseInt(process.env.STEP_SEC || '10', 10);
const MAX_RATE = parseInt(process.env.MAX_RATE || '2000', 10);
const AUTO_STOP = process.env.AUTO_STOP === 'true';
const SUCCESS_THRESHOLD = parseFloat(process.env.SUCCESS_THRESHOLD || '95');

if (!LOG_DIR) {
  console.error('Fehler: LOG_DIR nicht gesetzt (rate-gen.js wird von endpoint-rate.sh aufgerufen, nicht direkt).');
  process.exit(1);
}
if (ENDPOINT_KEYS.length === 0) {
  console.error('Fehler: ENDPOINT_KEYS ist leer.');
  process.exit(1);
}

// ── target + connection pool ────────────────────────────────────────────
const base = new URL(BASE_URL);
const isHttps = base.protocol === 'https:';
const httpMod = isHttps ? https : http;
// Sized for throughput = concurrency / avg_latency: at ~10,000 r/s and
// ~200-400ms observed avg latency, ~2000-4000 requests are in flight at
// once — keep-alive means that reuses a bounded set of real TCP
// connections rather than one per request.
const agent = new (isHttps ? https.Agent : http.Agent)({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 4096,
  maxFreeSockets: 4096,
});

// ── token pool (email,token per line — same file prefetch-tokens.sh writes)
const tokenLines = fs.readFileSync(TOKENS_FILE, 'utf8').trim().split('\n').filter(Boolean);
if (tokenLines.length === 0) {
  console.error(`Fehler: ${TOKENS_FILE} ist leer.`);
  process.exit(1);
}
const tokens = tokenLines.map((line) => line.slice(line.indexOf(',') + 1));
let tokenCursor = 0;
function nextToken() {
  const t = tokens[tokenCursor % tokens.length];
  tokenCursor++;
  return t;
}

function isErrorStatus(status) {
  return status === '000' || (Number.isFinite(Number(status)) && Number(status) >= 500);
}

// ── logging (shared mutable state, also used by the SIGTERM handler for a
// best-effort summary.txt if the run is stopped mid-ramp) ────────────────
let stepStream = null;
const allRows = []; // { ts, method, path, status, durationMs } — every completed request, whole run
const errorLines = [];
const stepResults = []; // formatted "-- Stufen --" rows, one per completed step

function logRow(method, reqPath, status, durationMs, body) {
  const ts = new Date().toISOString();
  stepStream.write(`${ts},${method},${reqPath},${status},${durationMs}\n`);
  allRows.push({ ts, method, path: reqPath, status: String(status), durationMs });
  if (isErrorStatus(status)) {
    const snippet = (body || '').slice(0, 500).replace(/\n/g, ' ').replace(/\t/g, ' ');
    errorLines.push(`${ts}\t${method}\t${reqPath}\t${status}\t${snippet}\n`);
  }
}

// ── HTTP helpers — never throw; a network failure/timeout resolves as
// status "000", exactly like actions.sh's do_request() treating a dead
// curl the same way. ────────────────────────────────────────────────────
function request(method, reqPath, token, jsonBody) {
  return new Promise((resolve) => {
    const started = Date.now();
    const headers = { Authorization: `Bearer ${token}` };
    let payload;
    if (jsonBody !== undefined) {
      payload = JSON.stringify(jsonBody);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = httpMod.request(
      {
        hostname: base.hostname,
        port: base.port || (isHttps ? 443 : 80),
        path: base.pathname.replace(/\/$/, '') + reqPath,
        method,
        headers,
        agent,
        timeout: 10000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), durationMs: Date.now() - started }));
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ status: '000', body: '', durationMs: Date.now() - started }));
    if (payload) req.write(payload);
    req.end();
  });
}

let photoBuf = null;
function uploadPhoto(token) {
  if (!photoBuf) photoBuf = fs.readFileSync(TEST_PHOTO);
  return new Promise((resolve) => {
    const started = Date.now();
    const boundary = `----ratelboundary${Math.random().toString(16).slice(2)}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(TEST_PHOTO)}"\r\nContent-Type: image/jpeg\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, photoBuf, tail]);
    const req = httpMod.request(
      {
        hostname: base.hostname,
        port: base.port || (isHttps ? 443 : 80),
        path: base.pathname.replace(/\/$/, '') + '/media/upload/profile-photo',
        method: 'POST',
        agent,
        timeout: 10000,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), durationMs: Date.now() - started }));
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ status: '000', body: '', durationMs: Date.now() - started }));
    req.end(body);
  });
}

function extractFirstId(body) {
  try {
    const data = JSON.parse(body);
    if (Array.isArray(data) && data.length > 0 && data[0].id) return data[0].id;
  } catch { /* not JSON / not an array — no id to extract */ }
  return null;
}
function extractUserIds(body) {
  try {
    const data = JSON.parse(body);
    if (Array.isArray(data)) return data.map((x) => x.user_id).filter(Boolean);
  } catch { /* ditto */ }
  return [];
}

// ── actions — one per actions.sh action_*, same request chains ─────────
const ACTIONS = {
  async discover_deck(token) {
    const r = await request('GET', '/discover/deck', token);
    logRow('GET', '/discover/deck', r.status, r.durationMs, r.body);
  },
  async discover_matches(token) {
    const r = await request('GET', '/discover/matches', token);
    logRow('GET', '/discover/matches', r.status, r.durationMs, r.body);
  },
  async coin_balance(token) {
    const r = await request('GET', '/hidden/coin/balance', token);
    logRow('GET', '/hidden/coin/balance', r.status, r.durationMs, r.body);
  },
  async coin_test_purchase(token) {
    const r = await request('POST', '/hidden/coin/test-purchase', token);
    logRow('POST', '/hidden/coin/test-purchase', r.status, r.durationMs, r.body);
  },
  async media_upload(token) {
    const r = await uploadPhoto(token);
    logRow('POST', '/media/upload/profile-photo', r.status, r.durationMs, r.body);
  },
  async chat_conversations_list(token) {
    const r = await request('GET', '/chat/conversations', token);
    logRow('GET', '/chat/conversations', r.status, r.durationMs, r.body);
  },
  async chat_messages_list(token) {
    const r1 = await request('GET', '/chat/conversations', token);
    logRow('GET', '/chat/conversations', r1.status, r1.durationMs, r1.body);
    const id = extractFirstId(r1.body);
    if (id) {
      const r2 = await request('GET', `/chat/conversations/${id}/messages`, token);
      logRow('GET', `/chat/conversations/${id}/messages`, r2.status, r2.durationMs, r2.body);
    }
  },
  async chat_messages_post(token) {
    const r1 = await request('GET', '/chat/conversations', token);
    logRow('GET', '/chat/conversations', r1.status, r1.durationMs, r1.body);
    const id = extractFirstId(r1.body);
    if (id) {
      const nonce = `${Date.now()}${Math.random().toString(16).slice(2)}`;
      const r2 = await request('POST', `/chat/conversations/${id}/messages`, token, { content: `loadtest message ${nonce}` });
      logRow('POST', `/chat/conversations/${id}/messages`, r2.status, r2.durationMs, r2.body);
    }
  },
  async contact_request_send(token) {
    const r1 = await request('GET', '/discover/deck', token);
    logRow('GET', '/discover/deck', r1.status, r1.durationMs, r1.body);
    const ids = extractUserIds(r1.body);
    if (ids.length > 0) {
      const target = ids[Math.floor(Math.random() * ids.length)];
      const r2 = await request('POST', '/chat/requests', token, { receiver_id: target });
      logRow('POST', '/chat/requests', r2.status, r2.durationMs, r2.body);
    }
  },
  async contact_request_incoming(token) {
    const r = await request('GET', '/chat/requests/incoming', token);
    logRow('GET', '/chat/requests/incoming', r.status, r.durationMs, r.body);
  },
  async contact_request_accept(token) {
    const r1 = await request('GET', '/chat/requests/incoming', token);
    logRow('GET', '/chat/requests/incoming', r1.status, r1.durationMs, r1.body);
    const id = extractFirstId(r1.body);
    if (id) {
      const r2 = await request('PATCH', `/chat/requests/${id}/accept`, token);
      logRow('PATCH', `/chat/requests/${id}/accept`, r2.status, r2.durationMs, r2.body);
    }
  },
  async admin_pending(token) {
    const r = await request('GET', '/admin/media/pending', token);
    logRow('GET', '/admin/media/pending', r.status, r.durationMs, r.body);
  },
};

for (const key of ENDPOINT_KEYS) {
  if (!ACTIONS[key]) {
    console.error(`Fehler: unbekannter Endpoint-Key '${key}'. Verfuegbar: ${Object.keys(ACTIONS).join(' ')}`);
    process.exit(1);
  }
}

// ── step-table formatting — whitespace-tolerant, matches
// dashboard/lib/capacityRunner.js's ROW_RE
// (/^(\d+)\s+(\d+)\/s\s+(\d+)\s+(\d+)\s+([\d.]+)%\s+(\d+)\s+(\d+)\s+(\d+)\s*$/)
function pad(v, n) { return String(v).padEnd(n); }
function headerRow() {
  return [pad('step', 6), pad('target/s', 12), pad('attempts', 10), pad('success', 10), pad('success%', 10), pad('avg_ms', 8), pad('p95_ms', 8), pad('max_ms', 8)].join(' ');
}
function formatStepRow(step, rate, agg) {
  return [pad(step, 6), pad(`${rate}/s`, 12), pad(agg.attempts, 10), pad(agg.successes, 10), pad(`${agg.successPct.toFixed(1)}%`, 10), pad(agg.avg, 8), pad(agg.p95, 8), pad(agg.max, 8)].join(' ');
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function runStep(rate, stepNum) {
  const stepFile = path.join(LOG_DIR, `step_${stepNum}.csv`);
  stepStream = fs.createWriteStream(stepFile, { flags: 'w' });
  stepStream.write('timestamp,method,path,status,duration_ms\n');
  const startIdx = allRows.length;

  const pending = [];
  for (let sec = 0; sec < STEP_SEC; sec++) {
    const tickStart = Date.now();
    for (let r = 0; r < rate; r++) {
      const token = nextToken();
      const key = ENDPOINT_KEYS[Math.floor(Math.random() * ENDPOINT_KEYS.length)];
      pending.push(ACTIONS[key](token).catch(() => {}));
    }
    const elapsed = Date.now() - tickStart;
    const remaining = 1000 - elapsed;
    if (remaining > 0) await sleep(remaining);
  }
  // Step duration is up, but individual requests can still be in flight
  // (that's exactly what we're measuring) — wait for all of them, same
  // reasoning as the bash version's final `wait` on every forked pid.
  await Promise.all(pending);

  await new Promise((resolve) => stepStream.end(resolve));
  stepStream = null;

  const stepRows = allRows.slice(startIdx);
  const durations = [];
  let successes = 0;
  for (const row of stepRows) {
    if (!isErrorStatus(row.status)) {
      successes++;
      durations.push(row.durationMs);
    }
  }
  durations.sort((a, b) => a - b);
  const n = durations.length;
  let avg = 0, p95 = 0, max = 0;
  if (n > 0) {
    avg = Math.round(durations.reduce((a, b) => a + b, 0) / n);
    let p95idx = Math.floor(n * 0.95);
    if (p95idx >= n) p95idx = n - 1;
    p95 = durations[p95idx];
    max = durations[n - 1];
  }
  const attempts = stepRows.length;
  const successPct = attempts > 0 ? (successes / attempts) * 100 : 0;
  return { attempts, successes, successPct, avg, p95, max };
}

async function writeSummary() {
  const summaryPath = path.join(LOG_DIR, 'summary.txt');
  const allRowsPath = path.join(LOG_DIR, '_all_rows.csv');

  const allRowsStream = fs.createWriteStream(allRowsPath);
  allRowsStream.write('timestamp,method,path,status,duration_ms\n');
  for (const row of allRows) allRowsStream.write(`${row.ts},${row.method},${row.path},${row.status},${row.durationMs}\n`);
  await new Promise((resolve) => allRowsStream.end(resolve));

  if (errorLines.length > 0) fs.writeFileSync(ERRORS_FILE, errorLines.join(''));

  const statusDist = new Map();
  const pathDist = new Map();
  const pathDurations = new Map();
  for (const row of allRows) {
    statusDist.set(row.status, (statusDist.get(row.status) || 0) + 1);
    pathDist.set(row.path, (pathDist.get(row.path) || 0) + 1);
    let arr = pathDurations.get(row.path);
    if (!arr) { arr = []; pathDurations.set(row.path, arr); }
    arr.push(row.durationMs);
  }

  const lines = [];
  lines.push('=== YourBrand Endpoint-Rate Summary ===');
  lines.push(`Zeitpunkt: ${new Date().toISOString()}`);
  lines.push(`ENDPOINTS=${ENDPOINT_KEYS.join(',')} START_RATE=${START_RATE} RATE_STEP=${RATE_STEP} STEP_SEC=${STEP_SEC} MAX_RATE=${MAX_RATE} BASE_URL=${BASE_URL}`);
  lines.push('');
  lines.push('-- Stufen --');
  lines.push(headerRow());
  lines.push(...stepResults);
  lines.push('');
  lines.push(`Requests gesamt: ${allRows.length}`);
  lines.push('');
  lines.push('-- Status-Code-Verteilung --');
  for (const [status, count] of [...statusDist.entries()].sort((a, b) => b[1] - a[1])) lines.push(`  ${count} ${status}`);
  lines.push('');
  lines.push('-- Requests pro Pfad --');
  for (const [p, count] of [...pathDist.entries()].sort((a, b) => b[1] - a[1])) lines.push(`  ${count} ${p}`);
  lines.push('');
  lines.push('-- Latenz pro Pfad (avg / p95 / max, ms) --');
  for (const [p, arr] of pathDurations.entries()) {
    arr.sort((a, b) => a - b);
    const n = arr.length;
    const avg = Math.round(arr.reduce((a, b) => a + b, 0) / n);
    let p95idx = Math.floor(n * 0.95);
    if (p95idx >= n) p95idx = n - 1;
    lines.push(`${p.padEnd(30)} avg=${avg} p95=${arr[p95idx]} max=${arr[n - 1]} n=${n}`);
  }

  const summaryText = lines.join('\n') + '\n';
  fs.writeFileSync(summaryPath, summaryText);
  process.stdout.write(summaryText);
  console.log('');
  console.log(`Zusammenfassung gespeichert in: ${summaryPath}`);
}

let stopping = false;
async function stopGracefully() {
  if (stopping) return;
  stopping = true;
  if (stepStream) await new Promise((resolve) => stepStream.end(resolve));
  try { await writeSummary(); } catch { /* best effort on a forced stop */ }
  process.exit(0);
}
process.on('SIGTERM', stopGracefully);
process.on('SIGINT', stopGracefully);

async function main() {
  console.log(headerRow());
  let rate = START_RATE;
  let stepNum = 0;
  while (rate <= MAX_RATE) {
    stepNum++;
    const agg = await runStep(rate, stepNum);
    const row = formatStepRow(stepNum, rate, agg);
    console.log(row);
    stepResults.push(row);

    if (AUTO_STOP && agg.successPct < SUCCESS_THRESHOLD) {
      console.log('');
      console.log(`AUTO_STOP: success% (${agg.successPct.toFixed(1)}) fiel unter SUCCESS_THRESHOLD (${SUCCESS_THRESHOLD}) bei ${rate}/s — Ramp gestoppt.`);
      break;
    }
    rate += RATE_STEP;
  }
  console.log('');
  console.log('Fertig. Aggregiere Ergebnisse...');
  await writeSummary();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
