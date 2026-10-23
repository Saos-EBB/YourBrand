'use strict';
//
// "Reset backend" button support: rebuilds and recreates XXX_backend_load
// (plus its replicas and the nginx LB in front of them)
// so it picks up code/config changes (Dockerfile, database.config.ts,
// env vars added to docker-compose.loadtest.yml, ...). `docker compose up
// -d` alone does NOT do this — an already-built image is left as-is and a
// container is only recreated if its own config changed, not the image
// content. So this always runs `build` then `up -d --force-recreate`
// explicitly, as two spawned steps so the dashboard can show which one is
// in flight. DB volume is untouched; docker-entrypoint.sh's seeds are
// idempotent, so recreation is safe to run at any time no test is active.
//

const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const COMPOSE_ARGS = ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.loadtest.yml'];
const SERVICE = 'XXX_backend_load';
// Replikas laufen `node dist/main` ohne Watch (dist/ baut XXX_backend_load),
// nginx loest ihre IPs nur beim Start auf — beide muessen mit neu starten.
const RECREATE_SERVICES = [SERVICE, 'XXX_backend_load_replica', 'XXX_lb_load'];

class ResetRunner extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.step = null; // 'build' | 'recreate'
  }

  isActive() {
    return this.child !== null;
  }

  start() {
    if (this.isActive()) throw new Error('Ein Reset laeuft schon');
    this._runStep('build', ['build', SERVICE], () => {
      this._runStep('recreate', ['up', '-d', '--force-recreate', ...RECREATE_SERVICES], () => {
        this.child = null;
        this.step = null;
        this.emit('done');
      });
    });
  }

  _runStep(step, args, onSuccess) {
    this.step = step;
    this.emit('step', step);
    const child = spawn('docker', [...COMPOSE_ARGS, ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    const onData = (chunk) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.trim()) this.emit('line', line);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('exit', (code) => {
      if (code === 0) {
        onSuccess();
      } else {
        this.child = null;
        this.step = null;
        this.emit('error', { step, code });
      }
    });
    child.on('error', (err) => {
      this.child = null;
      this.step = null;
      this.emit('error', { step, message: err.message });
    });
  }
}

module.exports = new ResetRunner();
