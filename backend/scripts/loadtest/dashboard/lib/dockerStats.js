'use strict';
//
// One-shot `docker stats --no-stream` poll, parsed from --format json
// (one JSON object per line — not a JSON array), never scraped as text.
//

const { execFile } = require('child_process');

// `containers` are name substrings (docker ps --filter name=, OR'd), so
// scaled replicas show up without listing them one by one. An explicit
// name list for `docker stats` would fail as a whole if one were missing.
function listContainers(filters) {
  return new Promise((resolve) => {
    execFile(
      'docker',
      ['ps', '--format', '{{.Names}}', ...filters.flatMap((f) => ['--filter', `name=${f}`])],
      { timeout: 5000 },
      (err, stdout) => resolve(err ? [] : stdout.trim().split('\n').filter(Boolean).sort()),
    );
  });
}

async function pollDockerStats(filters) {
  const containers = await listContainers(filters);
  if (containers.length === 0) return [];
  return new Promise((resolve) => {
    execFile(
      'docker',
      ['stats', '--format', '{{json .}}', '--no-stream', ...containers],
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
        // Compose-Replikas heissen <projekt>--<service>-N — Projektpraefix weg.
        resolve(stats.map((s) => ({ name: s.Name.replace(/^.*--/, ''), cpu: s.CPUPerc, mem: s.MemUsage })));
      },
    );
  });
}

module.exports = { pollDockerStats };
