'use strict';
// Every hover/focus tooltip in the dashboard, in one place. An element
// opts in with `data-tip="key"` (a key into TOOLTIPS below) instead of
// inlining its explanation in markup — so the wording can be edited here
// without hunting through index.html/app.js. Written for someone with no
// loadtest background: plain language, jargon explained inline where a
// term can't be avoided.
//
// Two trigger styles, both handled by the same engine:
//   - a plain input/control already gets a tooltip on hover/focus, no
//     extra markup needed (it's already interactive);
//   - anything else that isn't otherwise interactive (a header, a label,
//     a dot, a bar) gets a small `<span class="hint" data-tip="…"
//     tabindex="0">ⓘ</span>` glyph next to it, keeping the label itself
//     clean. On touch, tapping that glyph toggles the tip open, since
//     there's no hover to rely on.

const TOOLTIPS = {
  // Reset widget
  'reset.info': "Rebuilds the backend's Docker image and recreates its container, so it picks up code/config changes that a plain restart wouldn't (e.g. a raised connection-pool limit). The database itself is untouched — seeded data survives. Blocked while a test is running; stop it first.",

  // Mode 2 — controls
  'mode2.controlsInfo': "Runs the load test: checks the server is reachable, logs in a pool of temporary test accounts (shared across virtual users — see Users below), then has every virtual user repeatedly perform random actions for the set duration — then prints a summary.",
  'mode2.users': "How many virtual users hit the app at the same time. Each one repeatedly performs random actions (browsing, chatting, etc.) for the whole test.",
  'mode2.duration': "How long the test runs, in seconds. All virtual users work at the same time for this long, then stop.",

  // Mode 2 — prefetch phase
  'mode2.prefetch': "Before the test itself starts, every virtual user has to log in once so it has something to send with each request. This shows how many of those logins are done. It only happens here at the start — once every token is loaded, the actual test begins.",
  'mode2.shortfall': "Virtual users share a smaller pool of logged-in accounts than planned (usually a few individual logins failing during setup). Every user you asked for still ran at full scale — this only means slightly less variety among which account each one reused.",

  // Mode 2 — status bar
  'mode2.state': "Whether a test is running (LÄUFT), has finished (FERTIG), or hasn't started (IDLE). Turns red if this run has had a real server error.",
  'mode2.reqs': "How many requests per second the virtual users are generating right now — the actual load being placed on the server.",
  'mode2.successRate': "The share of requests that got a normal 2xx success response (2xx is the standard code range for \"it worked\"). This doesn't count requests the server correctly refused — see the health bar below — so for real trouble, watch Echte Fehler instead.",
  'mode2.realErrors': "Server failures or dropped connections — requests that broke instead of completing normally. The number that actually matters here. Should stay at 0.",

  // Mode 2 — health bar
  'mode2.healthBar': "Every request in this run, split into three groups: green = success, amber = expected refusal, red = real error. Each color's width shows its share of the total.",
  'mode2.healthOk': "Success (2xx) — requests that completed normally, exactly as expected.",
  'mode2.healthWarn': "Expected reject (4xx) — requests the server correctly refused, e.g. voting twice, or not having enough coins. This is normal, intended behavior, not a bug.",
  'mode2.healthErr': "Error (5xx / transport) — real failures: the server broke, or the connection dropped before finishing. This should stay at 0.",

  // Mode 2 — endpoint table
  'mode2.colN': "How many times this endpoint (a specific page or action, e.g. \"send a chat message\") was called during the test.",
  'mode2.colP95': "95% of requests to this endpoint were faster than this number, in milliseconds. It's a realistic \"worst normal case\" — unlike an average, it isn't skewed by a few rare, unusually slow requests.",
  'mode2.colLatencyBar': "A visual comparison of response time: this bar's length is relative to the slowest endpoint in the table, so the slow ones stand out at a glance.",
  'mode2.colOk': "Requests to this endpoint that got a normal 2xx success response.",
  'mode2.col4xx': "Requests to this endpoint the server correctly refused (e.g. a duplicate action, or not enough coins). Expected — not a bug.",
  'mode2.colErr': "Requests to this endpoint that really failed (a server error, or the connection dropped). Should be 0.",

  // Mode 2 — errors panel
  'mode2.errorsInfo': "Only real failures show up here — a server error, or a connection that never completed. The expected refusals counted above never appear in this list.",

  // Mode 1 — controls
  'mode1.controlsInfo': "Repeatedly tries to log in at an increasing rate to find the highest number of logins per second the server can handle before it starts failing or slowing down. Only the login page is tested — nothing else.",
  'mode1.startRate': "How many login attempts per second the test starts at — its first, gentlest step.",
  'mode1.rateStep': "How much the login rate increases with each step, in logins per second.",
  'mode1.stepSec': "How long each step lasts, in seconds, before the rate increases again.",
  'mode1.maxRate': "The highest login rate the test will try, in logins per second. The ramp stops here even if the server hasn't struggled yet.",
  'mode1.autoStop': "If checked, the test stops itself as soon as one step's success rate drops below the threshold, instead of always running every step up to Max rate.",
  'mode1.threshold': "The success rate (%) a step must reach to count as \"still working\". Used to work out the login limit and the knee below.",
  'mode1.target': "Which backend process the requests are sent to. \"1 Worker\" is the normal single-process backend; \"8-Worker Cluster\" is the multi-process experiment from the 2026-09-13 capacity session (see docs/audit.html) — pick Custom… to type any other address.",
  'mode1.baseUrl': "The web address the login requests are sent to.",

  // Mode 1 — status bar
  'mode1.state': "Whether the ramp is running, has finished, or hasn't started. Turns red if no step ever reached the success threshold.",
  'mode1.limit': "The login limit: the highest rate (logins per second) at which the server still met the success threshold. The practical answer to \"how many logins/sec can it handle\".",
  'mode1.bcrypt': "The average response time, in milliseconds, at the login limit above. Logins are deliberately slow because of bcrypt, a password-scrambling method designed to be hard to crack — some delay here is expected, not a bug.",
  'mode1.knee': "The knee: the first rate where the success rate dropped below the threshold. Past this point the server starts to struggle — logins begin failing or timing out.",

  // Mode 1 — stepped-ramp table
  'mode1.colTargetRate': "The login rate this step tried to sustain, in attempts per second.",
  'mode1.colAttempts': "How many login attempts were actually fired during this step.",
  'mode1.colSuccess': "How many of those attempts got back a valid login.",
  'mode1.colSuccessPct': "Successful logins ÷ attempts. The number to watch — it's the one that collapses once the server hits its limit.",
  'mode1.colRateBar': "A visual comparison of this step's rate against the fastest rate reached in the test.",
  'mode1.colP95': "95% of logins in this step were faster than this number, in milliseconds — a realistic worst normal case, not skewed by a few rare, unusually slow logins.",

  // Mode 3 — controls
  'mode3.controlsInfo': "Fires a stepped ramp of requests/second — same ramp mechanism as Mode 1 — against whichever endpoints you tick below, instead of one fixed endpoint. Lets you isolate exactly which endpoint breaks first and at what rate, without a big user count muddying the picture.",
  'mode3.endpoints': "Which of the app's endpoints get hit. Tick one to test it in isolation, or several/all to see how they behave combined. Requests are split randomly across whichever ones are ticked.",
  'mode3.adminPendingWarning': "Confirmed 2026-09-13: AdminService.getMediaPending() (admin.service.ts:184) has no LIMIT/pagination — it loads every pending media_uploads row on every call. With the loadtest DB's current backlog (~159k rows) it collapsed at just 20 r/s, ~9.2s average latency, 80% timeout. Test it alone, at a low Max rate, unless you're specifically trying to reproduce that.",
  'mode3.startRate': "How many requests per second the test starts at — its first, gentlest step.",
  'mode3.rateStep': "How much the rate increases with each step, in requests per second.",
  'mode3.stepSec': "How long each step lasts, in seconds, before the rate increases again.",
  'mode3.maxRate': "The highest rate the test will try, in requests per second. The ramp stops here even if nothing has broken yet.",
  'mode3.autoStop': "If checked, the test stops itself as soon as one step's success rate drops below the threshold, instead of always running every step up to Max rate.",
  'mode3.threshold': "The success rate (%) a step must reach to count as \"still working\" — only used if Auto-stop is on.",
  'mode3.tokenPool': "How many logged-in test accounts to prepare and reuse. User count doesn't matter here (this mode is about requests/second, not simulated people), so a small pool is enough even at a high rate — accounts just get reused across requests.",
  'mode3.target': "Which backend process the requests are sent to. \"1 Worker\" is the normal single-process backend; \"8-Worker Cluster\" is the multi-process experiment from the 2026-09-13 capacity session (see docs/audit.html) — pick Custom… to type any other address.",
  'mode3.baseUrl': "The web address the requests are sent to.",
  'mode3.state': "Whether the rate ramp is running, has finished, or hasn't started.",
  'mode3.steps': "One row per rate step, same idea as Mode 1's table: shows exactly when (at what rate) things start to break.",
  'mode3.perEndpoint': "Breaks the whole run down by endpoint, sorted slowest first by default (click any header to change) — this is what actually tells you WHICH endpoint is the weak point, as opposed to the Stufen table above which only tells you at what combined rate things broke.",

  // History
  'history.dot': "Green: no real server errors in this run (Mode 2), or it reached its login-capacity threshold (Mode 1). Red: it didn't.",
  'history.miniBar': "A shrunk-down health bar for this run: green = success, amber = expected refusal, red = real error.",
  'history.reqs': "The average requests per second across the whole run (total requests ÷ how long it ran).",
  'history.successRate': "The share of requests in this run that got a normal 2xx success response.",
  'history.errors': "How many real server errors happened during this run.",
};

(function initTooltips() {
  const bubble = document.createElement('div');
  bubble.className = 'tip-bubble';
  bubble.setAttribute('role', 'tooltip');
  document.body.appendChild(bubble);

  let pinnedTrigger = null; // opened via tap/click — needs an explicit dismiss
  let currentTrigger = null;

  function place(trigger) {
    const rect = trigger.getBoundingClientRect();
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    let top = rect.top - bh - 8;
    if (top < 8) top = rect.bottom + 8; // not enough room above — flip below
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function show(trigger) {
    const text = TOOLTIPS[trigger.dataset.tip];
    if (!text) return;
    bubble.textContent = text;
    currentTrigger = trigger;
    place(trigger);
    bubble.classList.add('tip-bubble--visible');
  }

  function hide() {
    bubble.classList.remove('tip-bubble--visible');
    currentTrigger = null;
  }

  document.addEventListener('mouseover', (ev) => {
    const trigger = ev.target.closest('[data-tip]');
    if (trigger) show(trigger);
  });
  document.addEventListener('mouseout', (ev) => {
    const trigger = ev.target.closest('[data-tip]');
    if (!trigger || trigger.contains(ev.relatedTarget)) return;
    if (trigger === currentTrigger && trigger !== pinnedTrigger) hide();
  });
  document.addEventListener('focusin', (ev) => {
    const trigger = ev.target.closest('[data-tip]');
    if (trigger) show(trigger);
  });
  document.addEventListener('focusout', (ev) => {
    const trigger = ev.target.closest('[data-tip]');
    if (!trigger || (ev.relatedTarget && trigger.contains(ev.relatedTarget))) return;
    if (trigger === currentTrigger && trigger !== pinnedTrigger) hide();
  });

  // Tap/click-to-toggle — only for .hint glyphs. Plain inputs already
  // get their tooltip for free from focus/blur above and don't need a
  // second trigger. Capture phase + stopPropagation so tapping a glyph
  // inside a History row (itself a <button>) opens its tip instead of
  // also navigating the row.
  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest('.hint[data-tip]');
    if (!trigger) {
      if (pinnedTrigger) { pinnedTrigger = null; hide(); }
      return;
    }
    ev.stopPropagation();
    if (pinnedTrigger === trigger) {
      pinnedTrigger = null;
      hide();
    } else {
      pinnedTrigger = trigger;
      show(trigger);
    }
  }, true);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && (pinnedTrigger || currentTrigger)) {
      pinnedTrigger = null;
      hide();
    }
  });

  window.addEventListener('scroll', () => { if (currentTrigger) place(currentTrigger); }, true);
  window.addEventListener('resize', () => { if (currentTrigger) place(currentTrigger); });
})();
