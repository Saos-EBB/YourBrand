'use strict';
//
// Reads past (and the current) endpoint-rate-logs/<ts>/ runs — the Mode 3
// sibling of runs.js. Structurally close to a Mode 2 run (_all_rows.csv in
// the same row format, summary.txt, errors.log — computeStats() works
// unchanged), plus the step-ramp table, which is re-parsed straight out
// of summary.txt's persisted "-- Stufen --" block using the exact same
// row regex capacityRunner.js (Mode 1) already has, since both scripts
// print the identical printf format — no separate per-run rows file to
// keep in sync.
//

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { parseRow, computeStats } = require('./aggregator');
const { parseErrorLine, capRecent } = require('./errorTailer');
const { parseRow: parseStepRow, dedupeRowsByStep } = require('./capacityRunner');

const LOADTEST_DIR = path.join(__dirname, '..', '..');
const LOGS_DIR = path.join(LOADTEST_DIR, 'endpoint-rate-logs');
const RUN_ID_RE = /^\d+$/;

// summary.txt's params line looks like:
//   ENDPOINTS=discover_deck,media_upload START_RATE=5 RATE_STEP=5 STEP_SEC=10 MAX_RATE=50 BASE_URL=...
// Graceful fallback (null), same shape as runs.js's parseParamsFromSummary
// — an older/malformed summary shows the run without params rather than
// dropping the row.
function parseParamsFromSummary(summaryText) {
  if (!summaryText) return null;
  const endpoints = /ENDPOINTS=(\S*)/.exec(summaryText);
  const startRate = /START_RATE=(\d+)/.exec(summaryText);
  const rateStep = /RATE_STEP=(\d+)/.exec(summaryText);
  const stepSec = /STEP_SEC=(\d+)/.exec(summaryText);
  const maxRate = /MAX_RATE=(\d+)/.exec(summaryText);
  const baseUrl = /BASE_URL=(\S+)/.exec(summaryText);
  if (!startRate || !rateStep || !stepSec || !maxRate) return null;
  return {
    endpoints: endpoints ? endpoints[1] : '',
    startRate: Number(startRate[1]),
    rateStep: Number(rateStep[1]),
    stepSec: Number(stepSec[1]),
    maxRate: Number(maxRate[1]),
    baseUrl: baseUrl ? baseUrl[1] : undefined,
  };
}

function parseStepsFromSummary(summaryText) {
  if (!summaryText) return [];
  const rows = summaryText.split('\n').map(parseStepRow).filter(Boolean);
  return dedupeRowsByStep(rows);
}

async function readRunFiles(ts) {
  const dir = path.join(LOGS_DIR, ts);
  const [allRowsRaw, summaryText, errorsRaw] = await Promise.all([
    fsp.readFile(path.join(dir, '_all_rows.csv'), 'utf8').catch(() => null),
    fsp.readFile(path.join(dir, 'summary.txt'), 'utf8').catch(() => null),
    fsp.readFile(path.join(dir, 'errors.log'), 'utf8').catch(() => null),
  ]);
  return { allRowsRaw, summaryText, errorsRaw };
}

async function listRuns() {
  const entries = await fsp.readdir(LOGS_DIR, { withFileTypes: true }).catch(() => []);
  const ids = entries
    .filter((e) => e.isDirectory() && RUN_ID_RE.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => Number(b) - Number(a));

  return Promise.all(
    ids.map(async (ts) => {
      const { allRowsRaw, summaryText, errorsRaw } = await readRunFiles(ts);
      const stats = allRowsRaw
        ? computeStats(allRowsRaw.split('\n').slice(1).map(parseRow).filter(Boolean))
        : null;
      const errorCount = errorsRaw ? errorsRaw.split('\n').map(parseErrorLine).filter(Boolean).length : 0;
      return {
        ts,
        hasSummary: summaryText !== null,
        hasErrors: errorCount > 0,
        params: parseParamsFromSummary(summaryText),
        steps: parseStepsFromSummary(summaryText),
        // Only total + categories, same reasoning as runs.js: a History
        // row's health dot/mini-bar must agree with the detail view, so
        // it's computed via the same computeStats() as getRun() below,
        // not a separate cheaper path.
        stats: stats ? { total: stats.total, categories: stats.categories } : null,
      };
    }),
  );
}

async function getRun(ts) {
  if (!RUN_ID_RE.test(ts)) throw new Error('invalid run id');
  const { allRowsRaw, summaryText, errorsRaw } = await readRunFiles(ts);

  if (allRowsRaw === null && summaryText === null) return null;

  const stats = allRowsRaw
    ? computeStats(allRowsRaw.split('\n').slice(1).map(parseRow).filter(Boolean))
    : null;
  const errors = errorsRaw
    ? capRecent(errorsRaw.split('\n').map(parseErrorLine).filter(Boolean))
    : [];

  return {
    ts,
    stats,
    summaryText,
    params: parseParamsFromSummary(summaryText),
    steps: parseStepsFromSummary(summaryText),
    errors,
  };
}

module.exports = { listRuns, getRun };
