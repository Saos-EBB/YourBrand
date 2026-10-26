# Loadtest

Three independent modes (see each script's header comment for usage/env vars), all runnable directly or via the dashboard:

- **Mode 1 — login capacity:** `login-capacity.sh`. Stepped-ramp test
  against only `POST /auth/login`, to find how many logins/sec the backend
  (bcrypt) sustains. Has its own summary table and is also start/stop-able
  and browsable from the dashboard's "Mode 1" tab.
- **Mode 2 — prefetch + endpoint load:** `generate-users-csv.sh` ->
  `prefetch-tokens.sh` (logs a small token-pool of users in once, writes
  `tokens.csv`) -> `loadtest.sh` (flat random-action loop over all known
  endpoints from `actions.sh`, `NUM_USERS` concurrent workers reusing that
  pool round-robin, no login in the loop). `run-loadtest.sh` orchestrates
  all of this end to end, sizing the token pool at `NUM_USERS/10` and
  gating on enough fake users actually being seeded — this is the
  dashboard's "Mode 2" tab.
- **Mode 3 — endpoint rate:** `endpoint-rate.sh`. Same stepped rate ramp
  as Mode 1, but against a chosen subset of `actions.sh`'s endpoints
  (`ENDPOINTS=discover_deck,media_upload ...`, unset = all) instead of one
  fixed endpoint — for isolating exactly which endpoint becomes the
  bottleneck and at what req/s, independent of user count. Own small
  self-sufficient token pool (`TOKEN_POOL_SIZE`, default 500). Dashboard's
  "Mode 3" tab.

`actions.sh` holds the shared endpoint actions (discover, chat, coin,
media upload, contact requests, admin) that Mode 2 and Mode 3 both fire —
sourced, not duplicated, so they can't drift apart.

All modes go to `http://localhost:3100`, the nginx load balancer
(`nginx-lb.conf`) in front of the fast and heavy backend instances. The
backend lifts throttling, issues long-lived tokens and allows the coin test
purchase only for requests whose `X-Loadtest-Key` header matches
`LOADTEST_KEY` (set in the external load generator). These scripts don't
send that header, so against this stack they run with normal limits.

Run Mode 1 first to find a safe login rate, then pass it to Mode 2's
prefetch step, e.g. `BATCH_SIZE=30 BATCH_PAUSE=1 ./run-loadtest.sh 1000 300`.

## Dashboard

A live view onto all three modes' output — plain Node, no dependencies, no
build step. It does not run the loadtest logic itself; for Mode 2/Mode 3
it tails the run's log directory's `*.csv` rows while the script runs
(same aggregator either way — grouped by path, 2xx/4xx/5xx categorized),
for Mode 1 it parses `login-capacity.sh`'s stdout table live (Mode 3
reuses that same table-row parser on top of its own log tailing) — and
can start/stop any of the three scripts for you.

A **History** tab merges every past run across all three modes into one
timestamp-sorted list (health dot, params, key numbers, mini health bar);
clicking a row loads that run's full detail into its mode's view.

**Start:**

```bash
cd dashboard
npm start
```

**Open:** http://127.0.0.1:4300 (binds to localhost only).

Requirements for the parts you actually use:
- Live docker stats (CPU/Mem for `XXX_backend_load` / `XXX_db_load`) need
  those containers running and the `docker` CLI on `PATH`; if not, that
  panel just stays empty.
- The Start button (Mode 2) runs `run-loadtest.sh <numUsers> <durationSec>`,
  so the loadtest backend stack needs to be up first (same requirement as
  running `run-loadtest.sh` directly — see its own health-check step).
- Modes 2 and 3 need enough fake users seeded in the loadtest DB
  (`SEED_USERS=<n>` on the `XXX_backend_load` container — see the root
  `backend/README.md`'s Load Testing section). Mode 2 checks this up
  front and stops with the exact fix command if there aren't enough;
  Mode 3's smaller fixed pool rarely runs into it.
