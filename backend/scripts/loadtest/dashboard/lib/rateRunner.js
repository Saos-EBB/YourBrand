'use strict';
//
// Process control + stdout parse for Mode 3 (endpoint-rate.sh). A hybrid
// of runner.js (Mode 2 — detached process group, "Logs: <dir>" detection
// so rateLiveState can start tailing step_*.csv for a per-endpoint
// breakdown) and capacityRunner.js (Mode 1 — same step-table row format,
// reuses its parseRow/dedupeRowsByStep directly rather than duplicating
// that regex) — unlike capacityRunner.js this DOES have a log directory
// to discover, and unlike runner.js it keeps parsing every line for the
// whole run (step rows keep appearing until the ramp finishes, not just
// once at the start).
//

const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');
const { parseRow, dedupeRowsByStep } = require('./capacityRunner');

const LOADTEST_DIR = path.join(__dirname, '..', '..');
const STOP_GRACE_MS = 3000;

class RateRunner extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.logDir = null;
    this.params = null;
    this.lines = [];
    this.rowsByStep = new Map();
    this.leftover = '';
    this.startedAt = null;
  }

  isActive() {
    return this.child !== null;
  }

  // params: { endpoints (comma string or ''), startRate, rateStep,
  // stepSec, maxRate, autoStop, successThreshold, baseUrl, tokenPoolSize }
  start(params) {
    if (this.isActive()) throw new Error('An endpoint-rate run is already active');
    for (const key of ['startRate', 'rateStep', 'stepSec', 'maxRate']) {
      const value = params[key];
      if (!Number.isInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`);
    }

    this.logDir = null;
    this.params = params;
    this.lines = [];
    this.rowsByStep = new Map();
    this.leftover = '';
    this.startedAt = Date.now();

    const env = {
      ...process.env,
      START_RATE: String(params.startRate),
      RATE_STEP: String(params.rateStep),
      STEP_SEC: String(params.stepSec),
      MAX_RATE: String(params.maxRate),
      AUTO_STOP: params.autoStop ? 'true' : 'false',
      SUCCESS_THRESHOLD: String(params.successThreshold ?? 95),
    };
    if (params.endpoints) env.ENDPOINTS = params.endpoints;
    if (params.baseUrl) env.BASE_URL = params.baseUrl;
    if (params.tokenPoolSize) env.TOKEN_POOL_SIZE = String(params.tokenPoolSize);

    const child = spawn('./endpoint-rate.sh', [], {
      cwd: LOADTEST_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    this.child = child;

    child.stdout.on('data', (chunk) => this._onData(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));

    child.on('exit', (code) => {
      const hadLogDir = !!this.logDir;
      this.child = null;
      this.emit('exit', { code, hadLogDir });
    });

    this.emit('started', this.getState());
    return child.pid;
  }

  _onData(chunk) {
    process.stdout.write(chunk);
    this.leftover += chunk.toString('utf8');
    const lines = this.leftover.split('\n');
    this.leftover = lines.pop();
    for (const line of lines) {
      this.lines.push(line);

      if (!this.logDir) {
        const logMatch = line.match(/Logs:\s+(\S+)/);
        if (logMatch) {
          this.logDir = path.resolve(LOADTEST_DIR, logMatch[1]);
          this.emit('logdir', this.logDir);
          continue;
        }
      }

      const row = parseRow(line);
      if (row) this.rowsByStep.set(row.step, row);
      this.emit('line', { line, row });
    }
  }

  // SIGTERM the whole process group first, SIGKILL after a grace period —
  // same reasoning as runner.js (curl can be slow to notice a signal).
  stop() {
    if (!this.isActive()) return false;
    const pid = this.child.pid;
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      return false;
    }
    setTimeout(() => {
      try {
        process.kill(-pid, 0);
        process.kill(-pid, 'SIGKILL');
      } catch {
        // group already gone — the common case
      }
    }, STOP_GRACE_MS);
    return true;
  }

  getState() {
    return {
      logDir: this.logDir,
      params: this.params,
      lines: this.lines,
      rows: dedupeRowsByStep([...this.rowsByStep.values()]),
      startedAt: this.startedAt,
    };
  }
}

module.exports = new RateRunner();
