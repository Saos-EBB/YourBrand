'use strict';
//
// One-shot `docker stats --no-stream` poll, parsed from --format json
// (one JSON object per line — not a JSON array), never scraped as text.
//

const { execFile } = require('child_process');

// `docker stats <names...>` errors out (and yields nothing for ANY of the
// requested names) the moment a single name doesn't exist — a real risk
// here since CONTAINERS now includes an ephemeral worker-count experiment
// container (created/removed ad hoc, unlike the always-on demo stack).
// Filtering against `docker ps` first means a missing container just
// silently drops out of the results instead of blanking the whole panel.
function listRunningContainers() {
  return new Promise((resolve) => {
    execFile('docker', ['ps', '--format', '{{.Names}}'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(new Set());
        return;
      }
      resolve(new Set(stdout.split('\n').map((s) => s.trim()).filter(Boolean)));
    });
  });
}

async function pollDockerStats(containers) {
  const running = await listRunningContainers();
  const present = containers.filter((c) => running.has(c));
  if (present.length === 0) return [];

  return new Promise((resolve) => {
    execFile(
      'docker',
      ['stats', '--format', '{{json .}}', '--no-stream', ...present],
      { timeout: 5000 },
      (err, stdout) => {
        if (err) {
          resolve([]);
          return;
        }
        const stats = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        resolve(stats.map((s) => ({ name: s.Name, cpu: s.CPUPerc, mem: s.MemUsage })));
      },
    );
  });
}

module.exports = { pollDockerStats };
