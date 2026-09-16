/* PhytoAI dashboard — v3 app (navigation + themes + plant doctor + assistant).
 * Presentation only; data contract frozen (docs/dashboard-data-contract-audit.md).
 * The assistant runs through n8n with the user's Google token verified server-side;
 * no model keys or n8n secrets ever live in the browser. */
(function () {
  'use strict';

  var CFG = window.PHYTOAI_CONFIG || {};
  var LIM = CFG.limits || {};
  var TOKEN_KEY = 'phytoai_token';
  var EXPIRY_KEY = 'phytoai_token_expiry';
  var SEEN_KEY = 'phytoai_seen_notification_ts';
  var SHEET_OVERRIDE_KEY = 'phytoai_sheet_override';
  var MODE_KEY = 'phytoai_mode';
  var ALERTS_KEY = 'phytoai_browser_alerts';       // 'on' | 'off' (explicit opt-in)
  var NOTIFIED_KEY = 'phytoai_notified_keys';      // bounded dedupe list

  var SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
  var DRIVE = 'https://www.googleapis.com/drive/v3/files/';

  var PH = '<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false">';
  var ICONS = {
    leaf: PH + '<path fill="currentColor" d="M223.45 40.07a8 8 0 0 0-7.52-7.52C139.8 28.08 78.82 51 52.82 94a87.1 87.1 0 0 0-12.76 49c.57 15.92 5.21 32 13.79 47.85l-19.51 19.5a8 8 0 0 0 11.32 11.32l19.5-19.51C81 210.73 97.09 215.37 113 215.94q1.67.06 3.33.06A86.93 86.93 0 0 0 162 203.18c43-26 65.93-86.97 61.45-163.11m-69.7 149.43c-22.75 13.78-49.68 14-76.71.77l88.63-88.62a8 8 0 0 0-11.32-11.32L65.73 179c-13.19-27-13-54 .77-76.71c22.09-36.47 74.6-56.44 141.31-54.06c2.39 66.66-17.59 119.18-54.06 141.27"/></svg>',
    drop: PH + '<path fill="currentColor" d="M174 47.75a254.2 254.2 0 0 0-41.45-38.3a8 8 0 0 0-9.18 0A254.2 254.2 0 0 0 82 47.75C54.51 79.32 40 112.6 40 144a88 88 0 0 0 176 0c0-31.4-14.51-64.68-42-96.25M128 216a72.08 72.08 0 0 1-72-72c0-57.23 55.47-105 72-118c16.53 13 72 60.75 72 118a72.08 72.08 0 0 1-72 72m55.89-62.66a57.6 57.6 0 0 1-46.56 46.55a9 9 0 0 1-1.33.11a8 8 0 0 1-1.32-15.89c16.57-2.79 30.63-16.85 33.44-33.45a8 8 0 0 1 15.78 2.68Z"/></svg>',
    thermometer: PH + '<path fill="currentColor" d="M212 56a28 28 0 1 0 28 28a28 28 0 0 0-28-28m0 40a12 12 0 1 1 12-12a12 12 0 0 1-12 12m-84 57V88a8 8 0 0 0-16 0v65a32 32 0 1 0 16 0m-8 47a16 16 0 1 1 16-16a16 16 0 0 1-16 16m40-66V48a40 40 0 0 0-80 0v86a64 64 0 1 0 80 0m-40 98a48 48 0 0 1-27.42-87.4A8 8 0 0 0 96 138V48a24 24 0 0 1 48 0v90a8 8 0 0 0 3.42 6.56A48 48 0 0 1 120 232"/></svg>',
    sun: PH + '<path fill="currentColor" d="M120 40V16a8 8 0 0 1 16 0v24a8 8 0 0 1-16 0m72 88a64 64 0 1 1-64-64a64.07 64.07 0 0 1 64 64m-16 0a48 48 0 1 0-48 48a48.05 48.05 0 0 0 48-48M58.34 69.66a8 8 0 0 0 11.32-11.32l-16-16a8 8 0 0 0-11.32 11.32Zm0 116.68l-16 16a8 8 0 0 0 11.32 11.32l16-16a8 8 0 0 0-11.32-11.32M192 72a8 8 0 0 0 5.66-2.34l16-16a8 8 0 0 0-11.32-11.32l-16 16A8 8 0 0 0 192 72m5.66 114.34a8 8 0 0 0-11.32 11.32l16 16a8 8 0 0 0 11.32-11.32ZM48 128a8 8 0 0 0-8-8H16a8 8 0 0 0 0 16h24a8 8 0 0 0 8-8m80 80a8 8 0 0 0-8 8v24a8 8 0 0 0 16 0v-24a8 8 0 0 0-8-8m112-88h-24a8 8 0 0 0 0 16h24a8 8 0 0 0 0-16"/></svg>',
    bell: PH + '<path fill="currentColor" d="M221.8 175.94c-5.55-9.56-13.8-36.61-13.8-71.94a80 80 0 1 0-160 0c0 35.34-8.26 62.38-13.81 71.94A16 16 0 0 0 48 200h40.81a40 40 0 0 0 78.38 0H208a16 16 0 0 0 13.8-24.06M128 216a24 24 0 0 1-22.62-16h45.24A24 24 0 0 1 128 216m-80-32c7.7-13.24 16-43.92 16-80a64 64 0 1 1 128 0c0 36.05 8.28 66.73 16 80Z"/></svg>',
    chart: PH + '<path fill="currentColor" d="M232 208a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8V48a8 8 0 0 1 16 0v94.37L90.73 98a8 8 0 0 1 10.07-.38l58.81 44.11L218.73 90a8 8 0 1 1 10.54 12l-64 56a8 8 0 0 1-10.07.38l-58.81-44.09L40 163.63V200h184a8 8 0 0 1 8 8"/></svg>',
    warning: PH + '<path fill="currentColor" d="M236.8 188.09L149.35 36.22a24.76 24.76 0 0 0-42.7 0L19.2 188.09a23.51 23.51 0 0 0 0 23.72A24.35 24.35 0 0 0 40.55 224h174.9a24.35 24.35 0 0 0 21.33-12.19a23.51 23.51 0 0 0 .02-23.72m-13.87 15.71a8.5 8.5 0 0 1-7.48 4.2H40.55a8.5 8.5 0 0 1-7.48-4.2a7.59 7.59 0 0 1 0-7.72l87.45-151.87a8.75 8.75 0 0 1 15 0l87.45 151.87a7.59 7.59 0 0 1-.04 7.72M120 144v-40a8 8 0 0 1 16 0v40a8 8 0 0 1-16 0m20 36a12 12 0 1 1-12-12a12 12 0 0 1 12 12"/></svg>',
    sliders: PH + '<path fill="currentColor" d="M64 105V40a8 8 0 0 0-16 0v65a32 32 0 0 0 0 62v49a8 8 0 0 0 16 0v-49a32 32 0 0 0 0-62m-8 47a16 16 0 1 1 16-16a16 16 0 0 1-16 16m80-95V40a8 8 0 0 0-16 0v17a32 32 0 0 0 0 62v97a8 8 0 0 0 16 0v-97a32 32 0 0 0 0-62m-8 47a16 16 0 1 1 16-16a16 16 0 0 1-16 16m104 64a32.06 32.06 0 0 0-24-31V40a8 8 0 0 0-16 0v97a32 32 0 0 0 0 62v17a8 8 0 0 0 16 0v-17a32.06 32.06 0 0 0 24-31m-32 16a16 16 0 1 1 16-16a16 16 0 0 1-16 16"/></svg>',
    camera: PH + '<path fill="currentColor" d="M208 56h-27.72l-13.63-20.44A8 8 0 0 0 160 32H96a8 8 0 0 0-6.65 3.56L75.71 56H48a24 24 0 0 0-24 24v112a24 24 0 0 0 24 24h160a24 24 0 0 0 24-24V80a24 24 0 0 0-24-24m8 136a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8V80a8 8 0 0 1 8-8h32a8 8 0 0 0 6.66-3.56L100.28 48h55.43l13.63 20.44A8 8 0 0 0 176 72h32a8 8 0 0 1 8 8ZM128 88a44 44 0 1 0 44 44a44.05 44.05 0 0 0-44-44m0 72a28 28 0 1 1 28-28a28 28 0 0 1-28 28"/></svg>',
    plug: PH + '<path fill="currentColor" d="M237.66 66.34a8 8 0 0 0-11.32 0L192 100.69L155.31 64l34.35-34.34a8 8 0 1 0-11.32-11.32L144 52.69l-26.34-26.35a8 8 0 0 0-11.32 11.32l6.35 6.34l-53 53a40 40 0 0 0 0 56.57l15.71 15.71l-49.06 49.06a8 8 0 0 0 11.32 11.32l49.09-49.09l15.71 15.71a40 40 0 0 0 56.57 0l53-53l6.34 6.35a8 8 0 0 0 11.32-11.32L203.31 112l34.35-34.34a8 8 0 0 0 0-11.32M147.72 185a24 24 0 0 1-33.95 0L71 142.23a24 24 0 0 1 0-33.95l53-53L200.69 132Z"/></svg>',
    list: PH + '<path fill="currentColor" d="M224 128a8 8 0 0 1-8 8H40a8 8 0 0 1 0-16h176a8 8 0 0 1 8 8M40 72h176a8 8 0 0 0 0-16H40a8 8 0 0 0 0 16m176 112H40a8 8 0 0 0 0 16h176a8 8 0 0 0 0-16"/></svg>',
    chat: PH + '<path fill="currentColor" d="M140 128a12 12 0 1 1-12-12a12 12 0 0 1 12 12m-56-12a12 12 0 1 0 12 12a12 12 0 0 0-12-12m88 0a12 12 0 1 0 12 12a12 12 0 0 0-12-12m60 12a104 104 0 0 1-152.88 91.82l-34.05 11.35a16 16 0 0 1-20.24-20.24l11.35-34.05A104 104 0 1 1 232 128m-16 0a88 88 0 1 0-164.19 44.06a8 8 0 0 1 .66 6.54L40 216l37.4-12.47a7.9 7.9 0 0 1 2.53-.42a8 8 0 0 1 4 1.08A88 88 0 0 0 216 128"/></svg>',
    send: PH + '<path fill="currentColor" d="M227.32 28.68a16 16 0 0 0-15.66-4.08h-.15L19.57 82.84a16 16 0 0 0-2.49 29.8L102 154l41.3 84.87a15.86 15.86 0 0 0 14.44 9.13q.69 0 1.38-.06a15.88 15.88 0 0 0 14-11.51l58.2-191.94v-.15a16 16 0 0 0-4-15.66m-69.49 203.17l-.05.14v-.07l-40.06-82.3l48-48a8 8 0 0 0-11.31-11.31l-48 48l-82.33-40.06h-.07h.14L216 40Z"/></svg>',
    caret: PH + '<path fill="currentColor" d="m213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32"/></svg>'
  };

  var THEMES = {
    botanical: { label: 'Botanical', tagline: 'Calm green care', hints: [] },
    monstera: { label: 'Monstera', tagline: 'Tropical statement foliage', hints: ['monstera'] },
    pothos: { label: 'Pothos', tagline: 'Trailing evergreen', hints: ['pothos', 'epipremnum'] },
    rose: { label: 'Rose', tagline: 'Blooming care', hints: ['rose', 'rosa'] },
    succulent: { label: 'Succulent', tagline: 'Dry-adapted resilience', hints: ['succulent', 'echeveria', 'aloe', 'cactus', 'crassula', 'sedum'] },
    citrus: { label: 'Citrus', tagline: 'Bright fruiting', hints: ['citrus', 'lemon', 'orange', 'lime'] },
    fern: { label: 'Fern', tagline: 'Shade-loving fronds', hints: ['fern', 'nephrolepis', 'asplenium'] }
  };

  var ART = { gardening: 'assets/undraw-gardening.svg', images: 'assets/undraw-images.svg', notifications: 'assets/undraw-notifications.svg', login: 'assets/undraw-login.svg' };

  var ROUTES = [
    { id: 'overview', label: 'Overview', icon: 'leaf' },
    { id: 'timeline', label: 'Timeline', icon: 'list' },
    { id: 'assistant', label: 'Assistant', icon: 'chat' },
    { id: 'doctor', label: 'Doctor', icon: 'warning' },
    { id: 'photos', label: 'Photos', icon: 'camera' },
    { id: 'insights', label: 'Insights', icon: 'chart' },
    { id: 'settings', label: 'Settings', icon: 'sliders' }
  ];
  var PRIMARY = ['overview', 'assistant', 'doctor', 'photos'];
  var MORE = ['timeline', 'insights', 'settings'];
  var METRICS = [
    { id: 'moisture', field: 'moisture', label: 'Soil moisture', unit: '%', decimals: 0, chart: true, blurb: 'How wet the soil is at each sensor cycle.' },
    { id: 'weight', field: 'weight', label: 'Pot weight', unit: 'g', decimals: 1, chart: true, blurb: 'Gross scale reading at each cycle (device log).' },
    { id: 'waterC', field: 'waterC', label: 'Water temperature', unit: '°C', decimals: 1, chart: true, blurb: 'Tank water temperature from the DS18B20 probe.' },
    { id: 'soilC', field: 'soilC', label: 'Soil temperature', unit: '°C', decimals: 1, chart: true, blurb: 'Soil probe temperature at each cycle.' },
    { id: 'airC', field: 'airC', label: 'Air temperature', unit: '°C', decimals: 1, chart: false },
    { id: 'hum', field: 'hum', label: 'Air humidity', unit: '%', decimals: 0, chart: false }
  ];
  var RANGES = [ { id: '24h', label: '24 h', ms: 86400e3 }, { id: '7d', label: '7 days', ms: 7 * 86400e3 }, { id: '30d', label: '30 days', ms: 30 * 86400e3 }, { id: 'all', label: 'All', ms: 0 } ];
  var SEVERITY = [ { id: 'critical', label: 'Critical' }, { id: 'warning', label: 'Warnings' }, { id: 'info', label: 'Info' } ];
  var SEVERITY_BY_TYPE = { alert_tank_empty: 'critical', alert_anomaly: 'warning', scan_verdict: 'warning', alert_battery_low: 'warning', scan_scheduled: 'info', scan_postponed: 'info', scan_followup: 'info', watering_feedback: 'info', smoke_test: 'info' };
  var LEGACY_TYPES = { alert_battery_low: true, scan_position: true };
  /* Presentation-only labels: which workflow flow authored this notification
   * type. Nothing here changes data or behaviour. */
  var SOURCE_BY_TYPE = {
    alert_tank_empty: 'Tank safety check',
    alert_anomaly: 'Daily photo check',
    alert_battery_low: 'Camera check (legacy)',
    scan_verdict: 'Weekly scan verdict',
    scan_followup: 'Scan follow-up',
    scan_scheduled: 'Weekly scan schedule',
    scan_postponed: 'Weekly scan',
    watering_feedback: 'Watering decision',
    smoke_test: 'Notifications smoke test'
  };

  var state = {
    token: null, tokenExpiry: 0, tokenClient: null, sheetId: null,
    cfg: {}, events: [], notifications: [], scans: [], notes: [], images: [], media: {}, meta: {},
    theme: 'botanical', route: 'overview', range: null, imageFilter: 'all', severityFilter: 'all', statusFilter: 'all',
    chartsExpanded: false, timelineExpanded: false, viewerReturnFocus: null, loadErrors: [], chatSending: false, askCooldownUntil: 0,
    chat: [], chatSeq: 0, pendingAsk: null, quotaUntil: 0, quotaTimer: null,
    pollTimer: null, pollInFlight: false, lastPollAt: 0, notifSig: '', alertRequesting: false,
    ai: { overview: null, overviewAi: null, detection: null, loading: {}, loaded: {} }
  };

  var $ = function (id) { return document.getElementById(id); };
  var reducedMotion = function () { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; };

  /* ------------------------------------------------------------------ utils */
  function escapeHtml(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { if (v === undefined || v === null || String(v).trim() === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function bool(v) { return String(v).trim().toLowerCase() === 'true'; }
  function parseDate(v) { if (!v) return null; var d = new Date(String(v).trim()); return isNaN(d.getTime()) ? null : d; }
  function fmtNum(v, dec) { return v === null || v === undefined || isNaN(v) ? '—' : Number(v).toFixed(dec); }
  function fmtWhen(d) {
    if (!d) return 'unknown';
    var diff = Date.now() - d.getTime();
    if (diff < 90e3) return 'just now';
    if (diff < 3600e3) return Math.round(diff / 60e3) + ' min ago';
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var dd = new Date(d.getTime()); dd.setHours(0, 0, 0, 0);
    var days = Math.round((d0 - dd) / 86400e3);
    var part = d.getHours() < 5 ? 'overnight' : d.getHours() < 12 ? 'this morning' : d.getHours() < 17 ? 'this afternoon' : 'this evening';
    if (days === 0) return part;
    if (days === 1) return 'yesterday ' + part.replace('this ', '');
    if (days < 7) return days + ' days ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function fmtAge(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    var s = Math.round(ms / 1000);
    if (s < 90) return s + ' seconds';
    var m = Math.round(s / 60);
    if (m < 120) return m + ' minutes';
    var h = Math.round(m / 6) / 10;
    if (h < 72) return h + ' hours';
    return Math.round(h / 24) + ' days';
  }
  function median(arr) { if (!arr.length) return null; var s = arr.slice().sort(function (a, b) { return a - b; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function humanList(arr) { return arr.length ? arr.map(function (x) { return escapeHtml(x); }).join('<br>') : '—'; }

  /* ------------------------------------------------------------- scheduler
   * One serialized request pipeline for every dashboard data call (Sheets,
   * Drive, assistant, artwork). at most CFG.scheduler.maxConcurrent requests
   * run at once; identical pending requests share one promise; TTL caches keep
   * route changes from refetching; a quota (429) response opens a cooldown gate
   * so nothing auto-retries. Assistant calls get priority over background work
   * but never cancel an in-flight request. Only safe labels are ever logged. */
  var SCHED = CFG.scheduler || {};
  var sched = {
    hi: [], lo: [], activeCount: 0,
    pending: {}, cache: {}, busyUntil: {},
    stats: {
      started: 0, cacheHits: 0, coalesced: 0, peakConcurrent: 0, byLabel: {},
      startupRequests: 0, routeRequests: {}, activeRoute: null, bootPhase: 'auth_pending',
      netLog: []
    }
  };
  window.PHYTOAI_STATS = sched.stats;
  var boot = { phase: 'auth_pending', counting: false };
  function bootSetPhase(p) {
    if (boot.phase === p) return;
    boot.phase = p;
    sched.stats.bootPhase = p;
    dlog('boot ' + p);
  }
  function dlog(label) {
    try { if (/[?&]debug=1/.test(location.search) && window.console) console.debug('[phytoai] ' + label); } catch (err) { }
  }
  function schedPushNet(entry) {
    entry.t = Date.now();
    entry.phase = boot.phase;
    sched.stats.netLog.push(entry);
    if (sched.stats.netLog.length > 200) sched.stats.netLog.shift();
  }
  function notifyQuota(ms) {
    state.quotaUntil = Math.max(Number(state.quotaUntil || 0), Date.now() + Number(ms || SCHED.quotaCooldownMs || 60000));
    renderQuotaState();
  }
  function busyUntilFor(key) {
    var t = Number(sched.busyUntil[key] || 0);
    var prefix = String(key).split(':')[0];
    if (prefix === 'assistant' || prefix === 'sheets') t = Math.max(t, Number(sched.busyUntil[prefix] || 0));
    return t;
  }
  function markBusy(key, ms) {
    var until = Date.now() + Number(ms || SCHED.quotaCooldownMs || 60000);
    sched.busyUntil[key] = until;
    var prefix = String(key).split(':')[0];
    if (prefix === 'assistant' || prefix === 'sheets') sched.busyUntil[prefix] = until;
    dlog('quota-gate ' + prefix);
    notifyQuota(until - Date.now());
  }
  function quotaError(label) {
    var e = new Error('Plant data is temporarily busy. Please try again in about a minute.');
    e.quota = true; e.label = label;
    return e;
  }
  function schedPump() {
    var max = Number(SCHED.maxConcurrent || 1);
    while (sched.activeCount < max && (sched.hi.length || sched.lo.length)) {
      var task = sched.hi.length ? sched.hi.shift() : sched.lo.shift();
      sched.activeCount++;
      if (sched.activeCount > sched.stats.peakConcurrent) sched.stats.peakConcurrent = sched.activeCount;
      (function (t) {
        sched.stats.started++;
        sched.stats.byLabel[t.label] = (sched.stats.byLabel[t.label] || 0) + 1;
        if (boot.counting && t.route) sched.stats.startupRequests++;
        if (t.route) sched.stats.routeRequests[t.route] = (sched.stats.routeRequests[t.route] || 0) + 1;
        schedPushNet({ why: t.label, route: t.route || null, path: t.netPath || null, coalesced: false });
        dlog('start ' + t.label + ' (active ' + sched.activeCount + ')');
        Promise.resolve().then(t.run).then(function (v) {
          if (t.ttlMs) sched.cache[t.key] = { at: Date.now(), value: v };
          sched.activeCount--;
          dlog('done ' + t.label);
          t.resolve(v); schedPump();
        }, function (e) {
          if (e && e.quota) markBusy(t.key, t.cooldown);
          sched.activeCount--;
          dlog('fail ' + t.label);
          t.reject(e); schedPump();
        });
      })(task);
    }
  }
  function schedRun(key, opts, run) {
    opts = opts || {};
    var ttl = Number(opts.ttlMs || 0);
    if (ttl && !opts.fresh) {
      var c = sched.cache[key];
      if (c && Date.now() - c.at < ttl) {
        sched.stats.cacheHits++;
        schedPushNet({ why: opts.label || key, route: opts.route || null, path: opts.netPath || null, coalesced: true, kind: 'cache' });
        dlog('cache ' + (opts.label || key));
        return Promise.resolve(c.value);
      }
    }
    var blocked = busyUntilFor(key);
    if (blocked > Date.now() && opts.userGesture !== true) {
      var be = new Error('Plant data is temporarily busy. Please try again in about a minute.');
      be.busy = true; be.retryAfterMs = blocked - Date.now();
      schedPushNet({ why: opts.label || key, route: opts.route || null, path: opts.netPath || null, coalesced: true, kind: 'blocked' });
      notifyQuota(be.retryAfterMs);
      return Promise.reject(be);
    }
    if (sched.pending[key]) {
      sched.stats.coalesced++;
      schedPushNet({ why: opts.label || key, route: opts.route || null, path: opts.netPath || null, coalesced: true, kind: 'pending' });
      dlog('coalesce ' + (opts.label || key));
      return sched.pending[key];
    }
    var p = new Promise(function (resolve, reject) {
      var task = { key: key, label: opts.label || key, ttlMs: ttl, cooldown: opts.busyCooldownMs, route: opts.route, netPath: opts.netPath, run: run, resolve: resolve, reject: reject };
      (opts.priority ? sched.hi : sched.lo).push(task);
    });
    sched.pending[key] = p;
    p.then(function () { if (sched.pending[key] === p) delete sched.pending[key]; },
      function () { if (sched.pending[key] === p) delete sched.pending[key]; });
    schedPump();
    return p;
  }

  /* ------------------------------------------------------- animation helpers */
  var revealObserver = null;
  function observeReveals(root) {
    var host = root || document;
    var els = host.querySelectorAll('.reveal, .chart-card');
    if (reducedMotion() || !('IntersectionObserver' in window)) { Array.prototype.forEach.call(els, function (el) { el.classList.add('in'); }); return; }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    Array.prototype.forEach.call(els, function (el) { if (!el.classList.contains('in')) revealObserver.observe(el); });
    // Content must never stay invisible just because a browser throttles or
    // drops IntersectionObserver callbacks (background tabs, embeddings).
    setTimeout(function () {
      Array.prototype.forEach.call(els, function (el) { if (!el.classList.contains('in')) el.classList.add('in'); });
    }, 1500);
  }
  function countUp(el, to, decimals) {
    if (to === null || to === undefined || isNaN(to)) { el.textContent = '—'; return; }
    var from = Number(el.getAttribute('data-last') || 0);
    el.setAttribute('data-last', String(to));
    if (reducedMotion() || from === to) { el.textContent = Number(to).toFixed(decimals); return; }
    var t0 = null, dur = 650;
    function frame(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (from + (to - from) * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ art/icons */
  function hydrateArt(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-art]'), function (el) {
      if (el.getAttribute('data-art-done')) return;
      var key = el.getAttribute('data-art');
      if (!ART[key]) return;
      schedRun('art:' + key, { label: 'art:' + key, ttlMs: Number(SCHED.artTtlMs || 86400000) }, function () {
        return fetch(ART[key]).then(function (r) { if (!r.ok) throw new Error('art ' + r.status); return r.text(); });
      }).then(function (svg) {
        el.innerHTML = svg.replace(/<\?xml[^>]*\?>/, '')
          .replace(/<svg([^>]*)>/, function (m, a) { return '<svg' + a.replace(/\s(width|height)="[^"]*"/g, '') + '>'; })
          .replace(/var\(--primary-svg-color,\s*[^)]+\)/g, 'currentColor');
        el.setAttribute('data-art-done', '1');
      }).catch(function () { el.hidden = true; });
    });
  }
  function paintIcons(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-icon]'), function (el) {
      if (!el.querySelector('svg')) el.innerHTML = ICONS[el.getAttribute('data-icon')] || '';
    });
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-icon-inline]'), function (el) {
      if (!el.firstChild) el.outerHTML = ICONS[el.getAttribute('data-icon-inline')] || '';
    });
  }

  /* ------------------------------------------------------------------ auth */
  function loginHint() { return String(CFG.GOOGLE_LOGIN_HINT || '').trim(); }
  function setAuthUi() {
    var connected = !!state.token;
    $('connect-btn').hidden = connected;
    $('refresh-btn').hidden = !connected;
    var panel = $('signin-panel');
    if (panel) panel.hidden = connected;
    var el = $('auth-status');
    el.textContent = connected ? 'Google connected' : 'Not connected';
    el.className = 'auth-status ' + (connected ? 'ok' : 'warn');
  }
  function requestSignIn() {
    if (!state.tokenClient) { initAuth(); return; }
    var req = { prompt: '' };
    var hint = loginHint();
    if (hint) req.hint = hint;
    state.tokenClient.requestAccessToken(req);
  }
  function restoreToken() {
    var token = sessionStorage.getItem(TOKEN_KEY);
    var expiry = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
    if (token && Date.now() < expiry) { state.token = token; state.tokenExpiry = expiry; return true; }
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(EXPIRY_KEY);
    return false;
  }
  function initAuth(attempt) {
    if (state.tokenClient) return;
    if (!(window.google && google.accounts && google.accounts.oauth2)) {
      if ((attempt || 0) < 20) { $('auth-status').textContent = 'Loading Google sign-in…'; setTimeout(function () { initAuth((attempt || 0) + 1); }, 300); return; }
      $('connect-btn').hidden = false;
      $('auth-status').textContent = 'Google sign-in unavailable (offline?)';
      return;
    }
    var cfg = {
      client_id: CFG.clientId,
      scope: CFG.scopes,
      callback: function (resp) {
        if (resp && resp.access_token) {
          state.token = resp.access_token;
          state.tokenExpiry = Date.now() + (Number(resp.expires_in || 3600) * 1000) - 60000;
          sessionStorage.setItem(TOKEN_KEY, state.token);
          sessionStorage.setItem(EXPIRY_KEY, String(state.tokenExpiry));
          setAuthUi(); bootStart();
        } else {
          showBanner('Google sign-in failed. Check the OAuth client ID and the authorized JavaScript origin https://phytoai.edgeone.dev (HTTPS).', 'error');
        }
      },
      error_callback: function (err) {
        showBanner('Google sign-in error (' + ((err && (err.type || err.message)) || 'unknown') + '). Check the OAuth client, the authorized origin, and that access was granted.', 'error');
      }
    };
    var hint = loginHint();
    if (hint) cfg.hint = hint;
    state.tokenClient = google.accounts.oauth2.initTokenClient(cfg);
    if (restoreToken()) { setAuthUi(); bootStart(); } else { $('connect-btn').hidden = false; }
  }

  /* ------------------------------------------------------- sheet override */
  function validSheetId(id) { return /^[A-Za-z0-9_-]{20,}$/.test(String(id || '')); }
  function resolveSheetId() {
    var fromUrl = '';
    try { fromUrl = (new URLSearchParams(location.search).get('sheet') || '').trim(); } catch (err) { fromUrl = ''; }
    if (fromUrl && validSheetId(fromUrl)) { try { localStorage.setItem(SHEET_OVERRIDE_KEY, fromUrl); } catch (err) { } return fromUrl; }
    var stored = '';
    try { stored = localStorage.getItem(SHEET_OVERRIDE_KEY) || ''; } catch (err) { stored = ''; }
    if (stored && validSheetId(stored)) return stored;
    return String(CFG.spreadsheetId || '');
  }
  function sheetModeActive() { return !!state.sheetId && state.sheetId !== String(CFG.spreadsheetId || ''); }
  function renderSheetBanner() {
    var el = $('sheet-mode-banner');
    if (!el) return;
    el.hidden = !sheetModeActive();
    if (!el.hidden) $('sheet-mode-id').textContent = state.sheetId.slice(0, 10) + '…';
  }
  function exitSheetMode() {
    try { localStorage.removeItem(SHEET_OVERRIDE_KEY); } catch (err) { }
    try { history.replaceState(null, '', location.pathname); } catch (err) { }
    location.reload();
  }

  /* ------------------------------------------------------------- data access */
  function authHeaders() { return { Authorization: 'Bearer ' + state.token }; }
  function sheetKind(range) {
    if (/SystemConfig/i.test(range)) return 'config';
    if (/Notifications/i.test(range)) return 'notifications';
    if (/DiseaseScans/i.test(range)) return 'scans';
    if (/AgentNotes/i.test(range)) return 'notes';
    return 'events';
  }
  function sheetsGet(range, fresh, routeTag) {
    var kind = sheetKind(range);
    var ttl = kind === 'config' ? Number(SCHED.configTtlMs || 300000) : Number(SCHED.sheetsTtlMs || 45000);
    var url = SHEETS + encodeURIComponent(state.sheetId) + '/values/' + encodeURIComponent(range) + '?majorDimension=ROWS';
    return schedRun('sheets:' + String(state.sheetId || '') + ':' + kind, { label: 'sheets:' + kind, ttlMs: ttl, fresh: !!fresh, route: routeTag || null, netPath: '/v4/spreadsheets/*/values', busyCooldownMs: Number(SCHED.quotaCooldownMs || 60000) }, function () {
      return fetch(url, { headers: authHeaders() }).then(function (res) {
        if (res.status === 429 || res.status === 403) {
          return res.text().then(function (t) {
            if (res.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(t)) throw quotaError('sheets:' + kind);
            throw new Error('Sheets ' + range + ' → ' + res.status + ' ' + String(t).slice(0, 120));
          });
        }
        if (!res.ok) return res.text().then(function (t) { throw new Error('Sheets ' + range + ' → ' + res.status + ' ' + String(t).slice(0, 120)); });
        return res.json().then(function (d) { return d.values || []; });
      });
    });
  }
  function sheetsUpdate(range, values) {
    var url = SHEETS + encodeURIComponent(state.sheetId) + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED';
    return schedRun('sheets:write:' + String(state.sheetId || '') + ':' + range, { label: 'sheets:write', userGesture: true, netPath: '/v4/spreadsheets/*/values' }, function () {
      return fetch(url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify({ range: range, majorDimension: 'ROWS', values: values }) })
        .then(function (res) { if (!res.ok) return res.text().then(function (t) { throw new Error('Sheets write → ' + res.status + ': ' + String(t).slice(0, 120)); }); return res.json(); });
    });
  }
  function driveMeta(id) {
    if (state.meta[id] !== undefined) return Promise.resolve(state.meta[id]);
    var fields = 'id,name,createdTime,imageMediaMetadata(width,height)';
    return schedRun('drive:meta:' + id, { label: 'drive:meta', netPath: '/drive/v3/files/*' }, function () {
      return fetch(DRIVE + encodeURIComponent(id) + '?fields=' + encodeURIComponent(fields), { headers: authHeaders() })
        .then(function (res) { if (!res.ok) throw new Error('drive meta ' + res.status); return res.json(); })
        .then(function (d) { state.meta[id] = d; return d; })
        .catch(function () { state.meta[id] = null; return null; });
    });
  }
  function driveMedia(id) {
    if (state.media[id]) return Promise.resolve(state.media[id]);
    return schedRun('drive:media:' + id, { label: 'drive:media', ttlMs: Number(SCHED.driveTtlMs || 86400000), netPath: '/drive/v3/files/*' }, function () {
      return fetch(DRIVE + encodeURIComponent(id) + '?alt=media', { headers: authHeaders() })
        .then(function (res) { if (!res.ok) throw new Error('drive media ' + res.status); return res.blob(); })
        .then(function (blob) { var url = URL.createObjectURL(blob); state.media[id] = url; return url; });
    });
  }
  function toRecords(values) {
    if (!values || !values.length) return [];
    var head = values[0];
    return values.slice(1).map(function (row, i) { var rec = { _row: i + 2 }; head.forEach(function (h, j) { rec[h] = row[j] === undefined ? '' : row[j]; }); return rec; });
  }
  function flowMlPerSec() { var v = num(state.cfg['pump_flow_ml_per_sec']); return v !== null && v > 0 ? v : Number(CFG.pumpFlowMlPerSec || 0); }
  function cfgValue(key, fallback) { var v = state.cfg[key]; return v === undefined || v === null || String(v).trim() === '' ? fallback : v; }
  function plantName() { return (CFG.profile && CFG.profile.name) || cfgValue('plant_name', '') || 'This plant'; }

  /* ---------------------------------------------------------- data bootstrap
   * One hard refresh performs exactly one Sheets bootstrap request
   * (values:batchGet for the five persisted tabs) and then loads only the
   * active route's panel data. Nothing else is fetched in the background. */
  var SHEET_TABS = [
    ['cfg', 'SystemConfig!A1:C'], ['events', 'Events!A1:Y'], ['notifications', 'Notifications!A1:I'], ['scans', 'DiseaseScans!A1:J'], ['notes', 'AgentNotes!A1:E']
  ];
  function applySheet(kind, values) {
    if (kind === 'events') state.events = toRecords(values).map(normalizeEvent);
    else if (kind === 'notifications') state.notifications = toRecords(values).map(normalizeNotification);
    else if (kind === 'scans') state.scans = toRecords(values);
    else if (kind === 'notes') state.notes = toRecords(values);
    else {
      state.cfg = {};
      toRecords(values).forEach(function (row) { var k = String(row.Key === undefined ? '' : row.Key).trim(); if (k) state.cfg[k] = row.Value; });
    }
  }
  function loadBootstrap(force, routeTag) {
    if (!state.token) return Promise.resolve(null);
    showBanner('Loading…');
    state.loadErrors = [];
    var ranges = SHEET_TABS.map(function (j) { return j[1]; });
    var url = SHEETS + encodeURIComponent(state.sheetId) + '/values:batchGet?majorDimension=ROWS&' +
      ranges.map(function (r) { return 'ranges=' + encodeURIComponent(r); }).join('&');
    return schedRun('sheets:' + String(state.sheetId || '') + ':bootstrap', {
      label: 'sheets:bootstrap', ttlMs: Number(SCHED.sheetsTtlMs || 45000), fresh: !!force,
      route: routeTag || 'boot', netPath: '/v4/spreadsheets/*/values:batchGet',
      busyCooldownMs: Number(SCHED.quotaCooldownMs || 60000)
    }, function () {
      return fetch(url, { headers: authHeaders() }).then(function (res) {
        if (res.status === 429 || res.status === 403) {
          return res.text().then(function (t) {
            if (res.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(t)) throw quotaError('sheets:bootstrap');
            throw new Error('Sheets bootstrap → ' + res.status + ' ' + String(t).slice(0, 120));
          });
        }
        if (!res.ok) return res.text().then(function (t) { throw new Error('Sheets bootstrap → ' + res.status + ' ' + String(t).slice(0, 120)); });
        return res.json().then(function (d) { return d.valueRanges || []; });
      });
    }).then(function (valueRanges) {
      SHEET_TABS.forEach(function (j, i) {
        var vr = valueRanges[i];
        applySheet(j[0], vr ? (vr.values || []) : []);
      });
      finishBootstrap();
    }).catch(function (err) {
      if (err && (err.busy || err.quota)) {
        state.loadErrors.push(err);
        finishBootstrap();
        return null;
      }
      // A missing/renamed tab must not blank the whole app: degrade to
      // per-tab reads (still serialized, still one active request at a time).
      return Promise.all(SHEET_TABS.map(function (j) {
        return sheetsGet(j[1], true, routeTag || 'boot').then(function (values) { applySheet(j[0], values); })
          .catch(function (e) { state.loadErrors.push(e); });
      })).then(function () { finishBootstrap(); });
    });
  }
  function finishBootstrap() {
    var failed = state.loadErrors.filter(function (e) { return !e.busy && !e.quota; });
    var blocked = state.loadErrors.some(function (e) { return e.busy || e.quota; });
    if (blocked) renderQuotaState();
    else if (failed.length) showBanner('Some data failed to load: ' + failed.map(function (e) { return e.message; }).join(' · '), 'warn');
    else { showBanner(''); noteDataOk(); }
    state.ai = { overview: null, overviewAi: null, detection: null, loading: {}, loaded: {} };
    if (!state.range) state.range = window.matchMedia('(max-width: 719px)').matches ? '24h' : '7d';
    var species = cfgValue('last_species_guess', latestEvent() ? latestEvent().species : '') || 'unknown';
    state.theme = pickTheme(species);
    document.documentElement.setAttribute('data-theme', state.theme);
    deriveImages();
    maybeBrowserAlerts();
  }
  /* Route-scoped panel loading: only the screen in front of the user may ask
   * the workflow for data — Overview, Insights, Doctor are never prefetched. */
  function ensureRouteData(id, force) {
    // While a quota countdown is running, do not launch further requests —
    // one quota state, one manual retry, never an automatic follow-up.
    if (!force && Number(state.quotaUntil || 0) > Date.now()) return [Promise.resolve(null)];
    if (id === 'overview') return [fetchOverviewData(false, force, id)];
    if (id === 'insights') return [fetchOverviewData(true, force, id)];
    if (id === 'doctor') return [fetchDetectionData(force, id)];
    return [];
  }

  /* --------------------------------------------------------- normalization */
  function normalizeEvent(row) {
    var e = {
      raw: row, ts: parseDate(row.Timestamp), type: String(row.EventType || '').trim(),
      moisture: num(row.MoisturePercent), soilC: num(row.SoilTempC), waterC: num(row.WaterTempC),
      airC: num(row.AirTempC), hum: num(row.AirHumidityPercent), weight: num(row.WeightGrams),
      light: num(row.LightLevel), tankEmpty: String(row.TankEmpty).trim() === '' ? null : bool(row.TankEmpty),
      watered: bool(row.WateringTriggered), waterSec: num(row.WaterDurationSeconds),
      heater: bool(row.HeaterUsed), heaterSec: num(row.HeaterDurationSeconds),
      species: String(row.SpeciesGuess || '').trim(), photoId: String(row.PhotoFileID || '').trim(),
      anomaly: bool(row.AnomalyDetected), anomalyText: String(row.AnomalyDescription || '').trim(),
      aiNotes: String(row.AI_Notes || '').trim(), reasoning: String(row.ReasoningSummary || '').trim(), mlEst: null
    };
    if (e.watered && e.waterSec !== null) e.mlEst = e.waterSec * flowMlPerSec();
    return e;
  }
  function normalizeNotification(row) {
    var type = String(row.type || '').trim();
    var options = [];
    try { options = JSON.parse(row.response_options || '[]').map(String); } catch (err) { options = []; }
    return {
      raw: row, _row: row._row, ts: parseDate(row.timestamp), type: type,
      severity: LEGACY_TYPES[type] ? 'legacy' : (SEVERITY_BY_TYPE[type] || 'info'),
      title: String(row.title || '').trim(), message: String(row.message || '').trim(), options: options,
      status: String(row.status || '').trim().toLowerCase(), response: String(row.response || '').trim(),
      resumeUrl: String(row.resume_url || '').trim(), contextRef: String(row.context_ref || '').trim()
    };
  }
  function latestEvent() { var out = null; state.events.forEach(function (e) { if (e.ts && (!out || e.ts > out.ts)) out = e; }); return out; }
  function pickTheme(species) {
    var explicit = (CFG.profile && CFG.profile.theme) || cfgValue('plant_theme', '');
    if (explicit && THEMES[explicit]) return explicit;
    var s = String(species || '').toLowerCase();
    var match = 'botanical';
    Object.keys(THEMES).forEach(function (id) { THEMES[id].hints.forEach(function (h) { if (s.indexOf(h) >= 0 && match === 'botanical') match = id; }); });
    return match;
  }
  function driveIdFromLink(link) { var m = String(link || '').match(/\/d\/([A-Za-z0-9_-]{10,})/); if (m) return m[1]; m = String(link || '').match(/^[A-Za-z0-9_-]{20,}$/); return m ? m[0] : ''; }
  function deriveImages() {
    var imgs = [];
    state.events.forEach(function (e) {
      if (e.photoId) imgs.push({ id: e.photoId, kind: 'daily', label: 'Daily photo', ts: e.ts, species: e.species, aiNotes: e.aiNotes, verdict: null });
    });
    state.scans.forEach(function (s) {
      var id = driveIdFromLink(s.drive_links);
      if (!id) return;
      imgs.push({ id: id, kind: 'scan', label: 'Health scan', ts: parseDate(s.timestamp), species: '', aiNotes: String(s.ai_notes || '').trim(), verdict: String(s.judge_verdict || '').trim() });
    });
    imgs.sort(function (a, b) { return (b.ts ? b.ts.getTime() : 0) - (a.ts ? a.ts.getTime() : 0); });
    state.images = imgs;
  }
  function pendingNotifications() { return state.notifications.filter(function (n) { return n.status === 'pending'; }); }
  function lastWaterings(n) { return state.events.filter(function (e) { return e.watered; }).sort(function (a, b) { return (b.ts ? b.ts.getTime() : 0) - (a.ts ? a.ts.getTime() : 0); }).slice(0, n); }
  function cameraStatus() {
    var newest = state.images.length ? state.images[0] : null;
    if (!newest || !newest.ts) return { quiet: state.images.length === 0, ageMs: null };
    var ageMs = Date.now() - newest.ts.getTime();
    return { quiet: ageMs > (CFG.cameraQuietAfterMinutes || 2160) * 60000, ageMs: ageMs };
  }
  function flagsFor(ev) {
    var out = [];
    if (bool(cfgValue('dry_run_mode', 'true'))) out.push({ severity: 'info', icon: 'sliders', title: 'Dry-run mode', text: 'Commands are simulated — the pump and heater stay off until you turn dry-run off.' });
    if (!ev) { out.push({ severity: 'warning', icon: 'warning', title: 'No data yet', text: 'Nothing has been recorded yet, so every screen stays empty on purpose.' }); return out; }
    var ageMs = Date.now() - ev.ts.getTime();
    if (ageMs > (CFG.staleAfterMinutes || 840) * 60000) out.push({ severity: 'warning', icon: 'warning', title: 'No new data', text: 'The newest reading is ' + fmtAge(ageMs) + ' old — treat everything as last-known, not live.' });
    if (ev.tankEmpty === true) out.push({ severity: 'critical', icon: 'drop', title: 'Tank is empty', text: 'Watering is paused until the tank is refilled.' });
    var missing = [];
    if (ev.moisture === null) missing.push('soil moisture');
    if (ev.waterC === null) missing.push('water temperature');
    if (ev.airC === null) missing.push('air temperature');
    if (ev.weight === null) missing.push('weight');
    if (missing.length) out.push({ severity: 'warning', icon: 'warning', title: 'A sensor did not answer', text: 'Missing on the latest reading: ' + missing.join(', ') + '. The pot refuses to act on unknown values.' });
    if (ev.anomaly) out.push({ severity: 'warning', icon: 'warning', title: 'Something looked off', text: ev.anomalyText || 'An anomaly was flagged in the latest check.' });
    pendingNotifications().forEach(function (n) { if (n.severity === 'critical') out.push({ severity: 'critical', icon: 'bell', title: n.title || n.type, text: n.message }); });
    var cam = cameraStatus();
    if (cam.quiet && ev) out.push({ severity: 'info', icon: 'camera', title: 'No photos lately', text: 'Expected until the camera runs again — photos are never fabricated.' });
    return out;
  }
  function deriveStatus(ev, flags) {
    var species = cfgValue('last_species_guess', '') || 'this plant';
    if (!ev) return { code: 'ok', word: 'Waiting', line: 'Waiting for the first reading', explain: 'Connect Google and let the pot report in — nothing is shown until real data arrives.' };
    var critical = flags.some(function (f) { return f.severity === 'critical'; });
    var attention = flags.some(function (f) { return f.severity === 'warning'; });
    var watered = lastWaterings(1)[0];
    var wateredRecently = watered && watered.ts && (Date.now() - watered.ts.getTime() < 7 * 86400e3);
    var lastScan = state.scans.length ? state.scans[state.scans.length - 1] : null;
    var verdict = lastScan ? String(lastScan.judge_verdict || '').toLowerCase() : '';
    if (critical) return { code: 'critical', word: 'Critical', line: 'Your ' + species + ' needs you right now.', explain: 'See the flags below — nothing will be overridden automatically.' };
    if (attention) return { code: 'attention', word: 'Needs attention', line: 'Your ' + species + ' needs a look.', explain: 'Nothing is broken, but the flags below are worth a minute of your time.' };
    if (wateredRecently && !/issue|problem|disease|pest/.test(verdict)) return { code: 'thriving', word: 'Thriving', line: 'Your ' + species + ' is doing well.', explain: 'Watering is recent, no alerts are pending, and the last health check found no issues.' };
    return { code: 'ok', word: 'Looking OK', line: 'Your ' + species + ' looks fine.', explain: 'No alerts right now. The pot is being cared for on its normal rhythm.' };
  }
  function recommendedAction(ev, flags) {
    if (!ev) return 'Connect Google so the pot can report in.';
    if (ev.tankEmpty === true) return 'Refill the water tank — watering is paused while it is empty.';
    var pending = pendingNotifications();
    if (pending.length) return 'Answer the ' + pending.length + ' waiting item' + (pending.length > 1 ? 's' : '') + ' — open Timeline.';
    var ageMs = Date.now() - ev.ts.getTime();
    if (ageMs > (CFG.staleAfterMinutes || 840) * 60000) return 'Check the pot\'s power and connection — no data for ' + fmtAge(ageMs) + '.';
    if (flags.some(function (f) { return f.title === 'A sensor did not answer'; })) return 'One sensor missed the last cycle — worth a look on the Settings screen.';
    return 'Nothing needed right now — the next check follows the sun schedule.';
  }

  /* ------------------------------------------------------------------- mode */
  function currentMode() { var m = ''; try { m = localStorage.getItem(MODE_KEY) || 'system'; } catch (err) { m = 'system'; } return m === 'light' || m === 'dark' ? m : 'system'; }
  function effectiveMode() {
    var m = currentMode();
    if (m !== 'system') return m;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  function applyMode() {
    document.documentElement.setAttribute('data-mode', effectiveMode());
    var seg = $('mode-select');
    if (seg) Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === currentMode())); });
  }
  function setMode(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (err) { }
    applyMode();
  }
  function cycleMode() { var order = ['system', 'light', 'dark']; setMode(order[(order.indexOf(currentMode()) + 1) % order.length]); }
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var mqHandler = function () { if (currentMode() === 'system') applyMode(); };
    if (mq.addEventListener) mq.addEventListener('change', mqHandler); else if (mq.addListener) mq.addListener(mqHandler);
  }

  /* ------------------------------------------------------------------ router */
  function currentRoute() {
    var h = String(location.hash || '').replace(/^#\/?/, '');
    return ROUTES.some(function (r) { return r.id === h; }) ? h : 'overview';
  }
  function goto(id, opts) {
    if (currentRoute() === id) { renderRoute(); if (opts && opts.focus) opts.focus(); return; }
    location.hash = '#/' + id;
  }
  function renderNav(active) {
    var tabs = $('tabs');
    if (!tabs.children.length) {
      tabs.innerHTML = ROUTES.map(function (r) { return '<button type="button" data-route="' + r.id + '">' + escapeHtml(r.label) + '</button>'; }).join('');
    }
    Array.prototype.forEach.call(tabs.children, function (b) {
      var on = b.getAttribute('data-route') === active;
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var bn = $('bottomnav');
    if (!bn.children.length) {
      bn.innerHTML = PRIMARY.map(function (id) {
        var r = ROUTES.filter(function (x) { return x.id === id; })[0];
        return '<button type="button" data-route="' + id + '">' + ICONS[r.icon] + '<span>' + escapeHtml(r.label) + '</span></button>';
      }).join('') + '<button type="button" data-more="1">' + ICONS.list + '<span>More</span></button>';
      paintIcons(bn);
    }
    Array.prototype.forEach.call(bn.children, function (b) {
      var id = b.getAttribute('data-route');
      if (id === active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      if (b.getAttribute('data-more') && MORE.indexOf(active) >= 0) b.setAttribute('aria-current', 'page');
    });
    var ml = $('more-links');
    if (!ml.children.length) {
      ml.innerHTML = MORE.map(function (id) {
        var r = ROUTES.filter(function (x) { return x.id === id; })[0];
        return '<button type="button" class="btn" data-route="' + id + '">' + escapeHtml(r.label) + '</button>';
      }).join('');
    }
  }
  function renderRoute(forceRoute) {
    var id = currentRoute();
    state.route = id;
    sched.stats.activeRoute = { id: id, since: Date.now() };
    ROUTES.forEach(function (r) { var el = $('screen-' + r.id); if (el) el.hidden = r.id !== id; });
    renderNav(id);
    if (!state.token) return [];
    renderScreen(id);
    var pending = ensureRouteData(id, forceRoute);
    fitHero();
    window.scrollTo(0, 0);
    return pending;
  }
  function renderScreen(id) {
    if (id === 'overview') renderOverview();
    else if (id === 'timeline') renderTimeline();
    else if (id === 'assistant') renderAssistant();
    else if (id === 'doctor') renderDoctor();
    else if (id === 'photos') renderPhotos();
    else if (id === 'insights') renderInsights();
    else if (id === 'settings') renderSettingsScreen();
    paintIcons();
  }

  /* ------------------------------------------------------------ assistant API */
  function assistantUrl(route) {
    var base = String(CFG.assistantBase || '').replace(/\/$/, '');
    var path = (CFG.assistantRoutes || {})[route];
    return base && path ? base + path : null;
  }
  function assistantTimeoutMs(route) {
    var per = (CFG.assistantTimeouts || {})[route];
    return Number(per || CFG.assistantTimeoutMs || 60000);
  }
  function assistantCacheKey(route, opts) {
    return 'assistant:' + route + ':' + String(state.sheetId || '') + ':' + (opts.qs || '') +
      (opts.body && opts.body.question ? ':' + String(opts.body.question) : '');
  }
  function assistantTtlMs(route) {
    if (route === 'overview') return Number(SCHED.overviewTtlMs || 45000);
    if (route === 'detection') return Number(SCHED.detectionTtlMs || 45000);
    return 0; // ask: never cached — each question is its own request
  }
  function assistantBusyResult(r) {
    if (!r) return false;
    if (r.error === 'busy') return true;
    var w = (r.json && Array.isArray(r.json.warnings)) ? r.json.warnings : [];
    return w.indexOf('rate_limited') >= 0 || w.indexOf('sheets_rate_limited') >= 0;
  }
  function assistantFetch(route, opts) {
    var url = assistantUrl(route);
    if (!url) return Promise.resolve({ ok: false, error: 'not_configured' });
    if (!state.token) return Promise.resolve({ ok: false, error: 'not_signed_in' });
    var key = assistantCacheKey(route, opts);
    var netPath = null;
    try { netPath = new URL(url).pathname; } catch (err) { netPath = null; }
    return schedRun(key, { label: 'assistant:' + route, priority: true, ttlMs: assistantTtlMs(route), fresh: !!opts.fresh, route: opts.route || route, netPath: netPath, busyCooldownMs: Number(SCHED.quotaCooldownMs || 60000) }, function () {
      return assistantFetchNet(route, url, opts).then(function (r) {
        if (assistantBusyResult(r)) { r.quota = true; markBusy(key, Number(SCHED.quotaCooldownMs || 60000)); }
        return r;
      });
    }).catch(function (e) {
      // Scheduler busy gate (quota cooldown): classified, never retried here.
      if (e && e.busy) return { ok: false, error: 'busy', status: 0, quota: true };
      return { ok: false, error: 'blocked', status: 0 };
    });
  }
  function assistantFetchNet(route, url, opts) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, assistantTimeoutMs(route));
    var init = {
      method: opts.method,
      headers: Object.assign({ Authorization: 'Bearer ' + state.token }, opts.body ? { 'Content-Type': 'application/json' } : null),
      signal: ctrl ? ctrl.signal : undefined
    };
    if (opts.body) init.body = JSON.stringify(opts.body);
    return fetch(url + (opts.qs || ''), init).then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (txt) {
        var json = null;
        var parsed = true;
        try { json = JSON.parse(txt); } catch (err) { parsed = false; json = null; }
        var st = res.status;
        if (st === 401 || st === 403) return { ok: false, error: 'auth', status: st, json: json };
        if (st === 404) return { ok: false, error: 'inactive', status: st };
        if (st === 429) return { ok: false, error: 'busy', status: st, json: json };
        if (st >= 500) return { ok: false, error: 'server', status: st, json: json };
        if (st < 200 || st >= 300) return { ok: false, error: 'http_' + st, status: st, json: json };
        if (!parsed || json === null) return { ok: false, error: 'bad_json', status: st };
        if (Array.isArray(json) || typeof json !== 'object') return { ok: false, error: 'bad_shape', status: st };
        // Documented per-endpoint shapes (docs/dashboard-ux-v3.md): ask has answer,
        // overview has summary, detection carries a detection field (null is valid).
        var shapeOk = typeof json.ok === 'boolean';
        if (shapeOk && route === 'ask') shapeOk = typeof json.answer === 'string';
        else if (shapeOk && route === 'overview') shapeOk = typeof json.summary === 'string';
        else if (shapeOk && route === 'detection') shapeOk = json.ok === false || Object.prototype.hasOwnProperty.call(json, 'detection');
        if (!shapeOk) return { ok: false, error: 'bad_shape', status: st, json: json };
        return Object.assign({ ok: json.ok, error: null, status: st, json: json }, json);
      });
    }).catch(function (err) {
      clearTimeout(timer);
      var aborted = err && (err.name === 'AbortError' || err.code === 20);
      return { ok: false, error: aborted ? 'timeout' : 'blocked' };
    });
  }
  /* The workflow returns 2xx JSON with ok:false for denied/rate-limited calls
   * (contract unchanged) — classify those by their warnings. */
  function classifyDeny(json) {
    var w = (json && Array.isArray(json.warnings)) ? json.warnings : [];
    if (w.indexOf('missing_authorization') >= 0 || w.indexOf('wrong_audience') >= 0 || w.indexOf('token_expired_or_invalid') >= 0 || w.indexOf('insufficient_scope') >= 0) return 'auth';
    if (w.indexOf('rate_limited') >= 0 || w.indexOf('sheets_rate_limited') >= 0) return 'busy';
    if (w.indexOf('token_verification_unavailable') >= 0) return 'verify_unavailable';
    return null;
  }
  function assErrorText(r, route) {
    var e = r && r.error;
    if (e === 'inactive') return 'The assistant workflow is not published at this endpoint.';
    if (e === 'auth') return 'Your Google session expired — reconnect to continue.';
    if (e === 'busy') return 'Plant data is temporarily busy. Please try again in about a minute.';
    if (e === 'server') return 'The assistant workflow failed; see the workflow execution for details.';
    if (e === 'bad_json' || e === 'bad_shape') return 'The assistant replied in an unexpected format.';
    if (e === 'timeout') return 'The assistant is still working (longer than ' + Math.round(assistantTimeoutMs(route || 'ask') / 1000) + ' s). The reply may already exist in the workflow execution — try again.';
    if (e === 'blocked') return 'Browser could not access the endpoint.';
    if (e === 'not_signed_in') return 'Sign in with Google to use the assistant.';
    if (e === 'not_configured') return 'No assistant endpoint is configured for this deployment.';
    if (e === 'verify_unavailable') return 'The workflow could not verify your session just now — try again.';
    if (e && String(e).indexOf('http_') === 0) return 'The assistant returned an unexpected HTTP status (' + String(e).slice(5) + ').';
    return 'The assistant could not answer right now — try again.';
  }
  function askPlant(question, route) {
    return assistantFetch('ask', { method: 'POST', body: { plant_id: CFG.plantId || 'default', question: question, context: { route: route || 'overview', client_time_utc: new Date().toISOString() } } });
  }

  /* -------------------------------------------------------- browser alerts
   * Opt-in only: Notification.requestPermission() runs exclusively from the
   * Settings control below - never on load. Permission is a display
   * affordance, never backend authorization: each alert mirrors a row that was
   * already read with the user's Google token. */
  function alertSupported() { try { return typeof window.Notification === 'function'; } catch (err) { return false; } }
  function alertPermission() {
    try { return alertSupported() ? String(window.Notification.permission || 'default') : 'unsupported'; } catch (err) { return 'unsupported'; }
  }
  function alertsOptedIn() { try { return localStorage.getItem(ALERTS_KEY) === 'on'; } catch (err) { return false; } }
  function setAlertsOptedIn(on) { try { localStorage.setItem(ALERTS_KEY, on ? 'on' : 'off'); } catch (err) { } }
  function alertsActive() { return alertSupported() && alertPermission() === 'granted' && alertsOptedIn(); }
  function renderAlertControl() {
    var btn = $('alert-btn');
    var stateEl = $('alert-state');
    if (!btn || !stateEl) return;
    var perm = alertPermission();
    if (perm === 'unsupported') {
      stateEl.textContent = 'unsupported in this browser';
      stateEl.className = 'alert-state warn';
      btn.disabled = true;
      btn.textContent = 'Enable browser alerts';
      return;
    }
    if (perm === 'denied') {
      stateEl.textContent = 'denied — allow notifications for this site in your browser settings, then reload';
      stateEl.className = 'alert-state bad';
      btn.disabled = true;
      btn.textContent = 'Enable browser alerts';
      return;
    }
    var on = perm === 'granted' && alertsOptedIn();
    stateEl.textContent = on
      ? 'on — critical alerts and selected warnings, while this page is open'
      : (perm === 'granted' ? 'allowed in the browser — not enabled here yet' : (state.alertRequesting ? 'asking the browser…' : 'not requested'));
    stateEl.className = 'alert-state ' + (on ? 'ok' : (perm === 'default' ? '' : 'warn'));
    btn.disabled = false;
    btn.textContent = on ? 'Turn off alerts here' : 'Enable browser alerts';
  }
  function requestAlerts() {
    if (!alertSupported() || state.alertRequesting) return;
    var perm = alertPermission();
    if (perm === 'denied') { renderAlertControl(); return; }
    if (perm === 'default') {
      state.alertRequesting = true;
      renderAlertControl();
      var req = window.Notification.requestPermission();
      Promise.resolve(req).then(function (result) {
        state.alertRequesting = false;
        if (result === 'granted') setAlertsOptedIn(true);
        renderAlertControl();
        if (result === 'granted') maybeBrowserAlerts();
      }, function () { state.alertRequesting = false; renderAlertControl(); });
      return;
    }
    setAlertsOptedIn(!alertsOptedIn());
    renderAlertControl();
    if (alertsActive()) maybeBrowserAlerts();
  }
  function notificationKey(n) {
    var ts = n.ts ? n.ts.toISOString() : String((n.raw && n.raw.timestamp) || '');
    return [String(n.contextRef || ''), ts, String(n.type || ''), String(n.title || '')].join('|');
  }
  function notifiedKeySet() {
    try {
      var arr = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (err) { return []; }
  }
  function pushNotifiedKey(key) {
    var arr = notifiedKeySet();
    if (arr.indexOf(key) < 0) arr.push(key);
    while (arr.length > 200) arr.shift();
    try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr)); } catch (err) { }
  }
  function alertRouteFor(type) { return (type === 'scan_verdict' || type === 'scan_followup') ? '#/doctor' : '#/timeline'; }
  function browserAlertCandidates() {
    var cfg = CFG.notifications || {};
    var warnTypes = cfg.alertWarningTypes || [];
    var cutoff = Date.now() - Number(cfg.alertFreshHours || 24) * 3600e3;
    return state.notifications.filter(function (n) {
      if (n.status !== 'pending') return false;
      if (n.severity !== 'critical' && !(n.severity === 'warning' && warnTypes.indexOf(n.type) >= 0)) return false;
      if (!n.ts || n.ts.getTime() < cutoff) return false;
      return true;
    });
  }
  function maybeBrowserAlerts() {
    if (!alertsActive()) return 0;
    var seen = notifiedKeySet();
    var sent = 0;
    browserAlertCandidates().forEach(function (n) {
      var key = notificationKey(n);
      if (seen.indexOf(key) >= 0) return;
      pushNotifiedKey(key); // mark first: one system notification per row, ever
      try {
        var note = new window.Notification(n.title || n.type, {
          body: String(n.message || '').slice(0, 180),
          tag: key
        });
        note.onclick = function () {
          try { window.focus(); } catch (err) { }
          try { location.hash = alertRouteFor(n.type); } catch (err2) { }
          try { note.close(); } catch (err3) { }
        };
        sent++;
      } catch (err) { /* constructor may fail (revoked permission); it is already marked */ }
    });
    return sent;
  }

  /* ------------------------------------------------- notification polling
   * One serialized Notifications-tab read per minute, only while the page is
   * visible, only after boot, and never while a quota countdown runs. Route
   * changes never trigger notification fetches. */
  function startNotificationPolling() {
    if (state.pollTimer || !state.token) return;
    var every = Number((CFG.notifications || {}).pollMs || 60000);
    state.pollTimer = setInterval(function () { pollNotifications(false); }, every);
  }
  function pollNotifications() {
    if (!state.token || state.pollInFlight) return;
    if (typeof document.visibilityState === 'string' && document.visibilityState !== 'visible') return;
    if (Number(state.quotaUntil || 0) > Date.now()) return;
    state.pollInFlight = true;
    state.lastPollAt = Date.now();
    sheetsGet('Notifications!A1:I', true, 'poll').then(function (values) {
      state.pollInFlight = false;
      applySheet('notifications', values);
      noteDataOk();
      maybeBrowserAlerts();
      renderNotificationBits();
    }, function () {
      state.pollInFlight = false;
    });
  }
  function renderNotificationBits() {
    var badge = $('pending-count');
    var pending = pendingNotifications();
    if (badge) { badge.hidden = pending.length === 0; badge.textContent = pending.length + ' waiting on you'; }
    var sig = pending.map(function (n) { return n._row + ':' + n.status; }).join(',');
    if (sig === state.notifSig) return;
    state.notifSig = sig;
    if (state.route === 'timeline') {
      var list = $('notification-list');
      var typing = document.activeElement && list && list.contains(document.activeElement) &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT');
      if (!typing) renderTimeline();
    }
  }
  function fetchOverviewData(ai, force, routeTag) {
    var key = ai ? 'overviewAi' : 'overview';
    if (!force && (state.ai.loaded[key] || state.ai.loading[key])) return Promise.resolve(null);
    state.ai.loading[key] = true;
    var r = assistantFetch('overview', { method: 'GET', fresh: !!force, route: routeTag || (ai ? 'insights' : 'overview'), qs: '?plant_id=' + encodeURIComponent(CFG.plantId || 'default') + (ai ? '&ai=1' : '') });
    return r.then(function (res) {
      state.ai.loading[key] = false;
      state.ai.loaded[key] = true;
      state.ai[key] = res;
      if (res && res.quota) renderQuotaState(); else noteDataOk();
      if (state.route === 'overview') renderOverviewAi();
      if (state.route === 'insights') renderInsights();
      if (state.route === 'overview') renderActionLine();
      return res;
    });
  }
  function fetchDetectionData(force, routeTag) {
    if (!force && (state.ai.loaded.detection || state.ai.loading.detection)) return Promise.resolve(null);
    state.ai.loading.detection = true;
    return assistantFetch('detection', { method: 'GET', fresh: !!force, route: routeTag || 'doctor', qs: '?plant_id=' + encodeURIComponent(CFG.plantId || 'default') }).then(function (res) {
      state.ai.loading.detection = false;
      state.ai.loaded.detection = true;
      state.ai.detection = res;
      if (res && res.quota) renderQuotaState(); else noteDataOk();
      if (state.route === 'doctor') renderDoctor();
      return res;
    });
  }

  /* --------------------------------------------------------------- ask bar
   * Ask bars on Overview / Insights / Doctor are shortcuts: they hand the
   * question to the Assistant screen, which owns the only chat implementation
   * and sends it exactly once. */
  function askTemplate(hostId, placeholder) {
    return '<label class="visually-hidden" for="' + hostId + '-input">Ask about your plant</label>' +
      '<input id="' + hostId + '-input" class="ask-input" type="text" maxlength="500" placeholder="' + escapeHtml(placeholder) + '">' +
      '<button class="btn btn-primary ask-go" type="button" data-ask="' + hostId + '">Ask</button>' +
      '<p class="ask-hint muted small">Opens the Assistant and sends your question once.</p>';
  }
  function askRender(hostId, placeholder, routeName) {
    var host = $(hostId);
    if (!host) return;
    host.innerHTML = askTemplate(hostId, placeholder);
    host.setAttribute('data-route-name', routeName);
    askBusy(hostId);
  }
  function askBusy(hostId) {
    var host = $(hostId);
    if (!host) return;
    var btn = host.querySelector('.ask-go');
    var input = $(hostId + '-input');
    var busy = !!state.chatSending;
    if (btn) { btn.disabled = busy; btn.textContent = busy ? 'Asking…' : 'Ask'; }
    if (input) input.disabled = busy;
  }
  function cooldownLeftMs() { return Math.max(0, (state.askCooldownUntil || 0) - Date.now()); }
  function askSubmit(hostId) {
    var host = $(hostId);
    if (!host || state.chatSending) return;
    var input = $(hostId + '-input');
    state.pendingAsk = { question: input ? String(input.value || '').trim() : '', route: host.getAttribute('data-route-name') || 'overview' };
    if (input) input.value = '';
    if (currentRoute() === 'assistant') renderAssistant(); else location.hash = '#/assistant';
  }

  /* -------------------------------------------------------------- assistant
   * Session-only chat. One question at a time; failures are classified and
   * shown, never hidden; quota responses are never auto-retried. */
  var CHAT_SUGGESTS = [
    'When was the last watering?',
    'What changed since the last reading?',
    'What do the latest sensor numbers mean?',
    'Any warnings I should know about?',
    'What did the last health scan show?',
    'Show me the most recent photo'
  ];
  function chatNote(text) {
    var el = $('chat-note');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
  }
  function renderChatSuggest() {
    var host = $('chat-suggest');
    if (!host || host.children.length) return;
    host.innerHTML = CHAT_SUGGESTS.map(function (q) {
      return '<button type="button" class="chat-chip" data-chat-suggest="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>';
    }).join('');
  }
  function updateChatControls() {
    var busy = !!state.chatSending;
    var send = $('chat-send');
    var input = $('chat-input');
    var clear = $('chat-clear');
    if (send) { send.disabled = busy; send.textContent = busy ? 'Sending…' : 'Send'; }
    if (input) input.disabled = busy;
    if (clear) clear.disabled = busy;
    Array.prototype.forEach.call(document.querySelectorAll('[data-ask]'), function (b) { b.disabled = busy; });
    Array.prototype.forEach.call(document.querySelectorAll('.ask-input'), function (i) { i.disabled = busy; });
  }
  function chatMsgHtml(msg) {
    var when = escapeHtml(fmtWhen(new Date(msg.ts)));
    if (msg.role === 'user') {
      return '<div class="msg msg-user"><div class="msg-body">' + escapeHtml(msg.text) + '</div>' +
        '<div class="msg-meta"><span>You</span><span>' + when + '</span></div></div>';
    }
    if (msg.pending) {
      return '<div class="msg msg-assistant pending"><div class="msg-body"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span> Thinking…</div>' +
        '<div class="msg-meta"><span>Assistant</span><span>' + when + '</span></div></div>';
    }
    if (msg.ok) {
      var j = msg.json || {};
      var meta = (j.answer_type === 'ai_summary' ? 'AI summary (unverified)' : j.answer_type === 'deterministic' ? 'Direct from your data' : 'Unavailable') +
        ' · confidence ' + (typeof j.confidence === 'number' ? Math.round(j.confidence * 100) + '%' : '—') +
        ' · data as of ' + (j.data_as_of_utc ? escapeHtml(fmtWhen(parseDate(j.data_as_of_utc))) : '—');
      var warnings = Array.isArray(j.warnings) && j.warnings.length ? '<div class="ask-warnings">Notes: ' + j.warnings.map(escapeHtml).join(', ') + '</div>' : '';
      var evidence = Array.isArray(j.evidence) && j.evidence.length
        ? '<details class="evidence"><summary>Evidence (' + j.evidence.length + ')</summary><ul>' + j.evidence.map(function (e) { return '<li>' + escapeHtml(e.source) + ' — ' + escapeHtml(e.label || e.id || '') + '</li>'; }).join('') + '</ul></details>' : '';
      return '<div class="msg msg-assistant"><div class="msg-body msg-answer">' + escapeHtml(String(j.answer)) + '</div>' +
        '<div class="msg-meta"><span>' + escapeHtml(meta) + '</span><span>' + when + '</span></div>' + warnings + evidence + '</div>';
    }
    var retry = msg.retrySafe ? '<button type="button" class="btn msg-retry" data-retry="' + msg.id + '">Try again</button>' : '';
    var wnote = Array.isArray(msg.warnings) && msg.warnings.length ? '<div class="ask-warnings">workflow note: ' + msg.warnings.map(escapeHtml).join(', ') + '</div>' : '';
    return '<div class="msg msg-assistant msg-failed"><div class="msg-body">' + escapeHtml(assErrorText({ error: msg.error }, 'ask')) + '</div>' + wnote + retry +
      '<div class="msg-meta"><span>Assistant</span><span>' + when + '</span></div></div>';
  }
  function renderChatLog() {
    var log = $('chat-log');
    if (!log) return;
    if (!state.chat.length) {
      log.innerHTML = '<div class="chat-empty media-state"><span class="art" data-art="gardening" aria-hidden="true"></span>' +
        '<span>Ask anything about your plant\'s data — watering, sensors, warnings, scans or photos. This conversation lives in this browser session only.</span></div>';
      hydrateArt(log);
      paintIcons(log);
      return;
    }
    log.innerHTML = state.chat.map(chatMsgHtml).join('');
    log.scrollTop = log.scrollHeight;
  }
  function renderAssistant() {
    renderChatSuggest();
    renderChatLog();
    updateChatControls();
    if (state.pendingAsk) {
      var p = state.pendingAsk;
      state.pendingAsk = null;
      if (String(p.question || '').trim().length >= 3) chatSend(p.question, p.route);
      else {
        var input = $('chat-input');
        if (input) { input.value = String(p.question || ''); growChatInput(); }
        chatNote('Ask at least a few words so the assistant has something to work with.');
      }
    }
  }
  function chatSend(question, contextRoute) {
    var q = String(question || '').trim();
    if (state.chatSending) return;
    if (q.length < 3) { chatNote('Ask at least a few words so the assistant has something to work with.'); return; }
    var left = cooldownLeftMs();
    if (left > 0) { chatNote('Cooling down — try again in ' + Math.ceil(left / 1000) + ' s.'); return; }
    chatNote('');
    var botMsg = { id: ++state.chatSeq, role: 'assistant', pending: true, ts: Date.now(), q: q, context: contextRoute || 'assistant' };
    state.chat.push({ id: ++state.chatSeq, role: 'user', text: q, ts: Date.now() }, botMsg);
    state.chatSending = true;
    renderChatLog();
    updateChatControls();
    askPlant(q, botMsg.context).then(function (r) {
      state.chatSending = false;
      botMsg.pending = false;
      var denyKind = (r.status >= 200 && r.status < 300 && r.json && r.json.ok === false) ? classifyDeny(r.json) : null;
      if (r.ok && typeof r.answer === 'string') { botMsg.ok = true; botMsg.json = r; }
      else if (denyKind) {
        var denyCooldown = denyKind === 'busy' ? (CFG.assistantCooldownMs || {}).busy : (CFG.assistantCooldownMs || {}).failure;
        state.askCooldownUntil = Date.now() + Number(denyCooldown || 15000);
        botMsg.ok = false; botMsg.error = denyKind; botMsg.retrySafe = false;
        botMsg.warnings = (r.json && Array.isArray(r.json.warnings)) ? r.json.warnings : [];
        if (denyKind === 'busy') chatNote('Plant data is temporarily busy. Please try again in about a minute.');
      } else {
        var cooldownMs = r.error === 'busy' ? (CFG.assistantCooldownMs || {}).busy
          : r.error === 'timeout' ? 0
          : (CFG.assistantCooldownMs || {}).failure;
        if (cooldownMs) state.askCooldownUntil = Date.now() + Number(cooldownMs);
        botMsg.ok = false; botMsg.error = r.error || 'unknown';
        botMsg.retrySafe = ['timeout', 'server', 'blocked', 'bad_json', 'bad_shape', 'verify_unavailable'].indexOf(botMsg.error) >= 0 ||
          String(botMsg.error).indexOf('http_') === 0;
      }
      renderChatLog();
      updateChatControls();
    });
  }
  function growChatInput() {
    var input = $('chat-input');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 132) + 'px';
  }

  /* ------------------------------------------------------------ boot states
   * auth pending → authenticated → bootstrapping → routing → ready.
   * Each transition happens once per page load; a hashchange during boot is
   * ignored, and the initial-hash normalization uses history.replaceState so
   * it cannot trigger a second route load. */
  function bootStart() {
    if (boot.phase !== 'auth_pending') return;
    bootSetPhase('authenticated');
    boot.counting = true;
    bootSetPhase('bootstrapping');
    loadBootstrap(false, 'boot').then(routeLoad, routeLoad);
  }
  function routeLoad() {
    if (boot.phase === 'routing' || boot.phase === 'ready') return;
    bootSetPhase('routing');
    var pending = renderAll(false) || [];
    hydrateArt();
    paintIcons();
    Promise.all(pending).then(bootDone, bootDone);
  }
  function bootDone() {
    if (boot.phase === 'ready') return;
    bootSetPhase('ready');
    boot.counting = false;
    setAuthUi();
    startNotificationPolling();
  }
  function normalizeInitialHash() {
    var h = String(location.hash || '');
    var id = h.replace(/^#\/?/, '');
    if (ROUTES.some(function (r) { return r.id === id; })) return;
    try { history.replaceState(null, '', location.pathname + location.search + '#/' + currentRoute()); } catch (err) { }
  }

  /* --------------------------------------------------------------- overview */
  function renderAll(forceRoute) {
    applyMode();
    renderChrome();
    var pending = renderRoute(forceRoute);
    renderToasts();
    return pending;
  }
  function renderChrome() {
    $('dryrun-pill').hidden = !bool(cfgValue('dry_run_mode', 'true'));
    var ev = latestEvent();
    var stale = ev ? (Date.now() - ev.ts.getTime()) > (CFG.staleAfterMinutes || 840) * 60000 : true;
    $('stale-pill').hidden = !stale;
  }
  function renderOverview() {
    var hero = $('hero');
    var ev = latestEvent();
    var flags = flagsFor(ev);
    var st = deriveStatus(ev, flags);
    hero.setAttribute('data-state', st.code);
    $('hero-state-icon').innerHTML = ICONS.leaf;
    $('hero-word').textContent = st.word;
    $('hero-line').textContent = st.line;
    $('hero-explain').textContent = st.explain;
    $('hero-flags').innerHTML = flags.slice(0, 3).map(function (f) {
      return '<div class="warning-chip ' + f.severity + '"><span class="chip-icon">' + (ICONS[f.icon] || ICONS.warning) + '</span><div><span class="w-title">' + escapeHtml(f.title) + '</span> — ' + escapeHtml(f.text) + '</div></div>';
    }).join('');
    var species = cfgValue('last_species_guess', ev ? ev.species : '') || 'unknown';
    var name = plantName();
    $('plant-identity').textContent = name + (species !== 'unknown' ? ' · ' + species : '');
    $('hero-age').textContent = ev ? 'Last reading ' + fmtWhen(ev.ts) + ' · next check follows the sun schedule' : 'No readings yet';

    renderActionLine();
    renderTrendCard();

    var chips = [];
    var chip = function (k, v, cls) { return '<div class="chip ' + (cls || '') + '"><span class="chip-k">' + escapeHtml(k) + '</span><span class="chip-v">' + escapeHtml(v) + '</span></div>'; };
    if (ev) {
      chips.push(chip('Soil moisture', ev.moisture === null ? '—' : fmtNum(ev.moisture, 0) + ' %'));
      chips.push(chip('Water temp', ev.waterC === null ? '—' : fmtNum(ev.waterC, 1) + ' °C'));
      chips.push(chip('Tank', ev.tankEmpty === null ? '—' : ev.tankEmpty ? 'EMPTY' : 'OK', ev.tankEmpty ? 'bad' : ''));
    } else chips.push('<p class="empty">No readings yet.</p>');
    $('quick-vitals').innerHTML = chips.join('');

    $('latest-event').innerHTML = ev ? (escapeHtml(fmtWhen(ev.ts)) + ' — ' + (ev.watered ? 'watered ' + (ev.waterSec || 0) + ' s' : ev.heater ? 'heated ' + (ev.heaterSec || 0) + ' s' : 'routine reading')) : '—';
    var newest = state.notifications.filter(function (n) { return n.ts; }).sort(function (a, b) { return b.ts - a.ts; })[0];
    $('latest-alert').innerHTML = newest ? ('<span class="' + (newest.severity === 'critical' ? 'sev-chip sev-possible_issue' : newest.severity === 'warning' ? 'sev-chip sev-monitor' : '') + '">' + escapeHtml(newest.title || newest.type) + '</span> ' + escapeHtml(fmtWhen(newest.ts))) : 'Nothing on record yet.';

    var thumb = $('latest-thumb');
    if (!state.images.length) {
      thumb.innerHTML = '<span class="muted small">No photos yet — nothing is faked.</span>';
    } else {
      thumb.innerHTML = '<div class="media-state small"><span>loading…</span></div>';
      driveMedia(state.images[0].id).then(function (url) {
        var img = document.createElement('img');
        img.alt = state.images[0].label + ' — ' + fmtWhen(state.images[0].ts);
        img.src = url;
        img.addEventListener('click', function () { openViewer(state.images[0]); });
        thumb.innerHTML = '';
        thumb.appendChild(img);
      }).catch(function () { thumb.innerHTML = '<span class="muted small">Latest photo unavailable to this account.</span>'; });
    }

    renderOverviewAi();
    askRender('ask-overview', 'Ask about your plant…', 'overview');
    $('overview-links').innerHTML = ['timeline', 'doctor', 'photos', 'insights'].map(function (id) {
      var r = ROUTES.filter(function (x) { return x.id === id; })[0];
      return '<button type="button" class="btn" data-route="' + id + '">' + escapeHtml(r.label) + '</button>';
    }).join('');
    observeReveals($('screen-overview'));
  }
  function renderActionLine() {
    var ev = latestEvent();
    var r = state.ai.overview;
    var line = null;
    if (r && r.ok && Array.isArray(r.json.what_to_check) && r.json.what_to_check.length) line = r.json.what_to_check[0];
    if (!line) line = recommendedAction(ev, flagsFor(ev));
    $('action-line').textContent = line;
  }
  function renderOverviewAi() {
    var el = $('overview-ai-text');
    var meta = $('overview-ai-meta');
    if (!el) return;
    var r = state.ai.overview;
    if (!state.ai.loaded.overview || state.ai.loading.overview) { el.textContent = 'Assistant overview loading…'; meta.textContent = ''; return; }
    if (r && r.ok && r.json.summary) {
      el.textContent = String(r.json.summary);
      var asOf = r.json.data_as_of_utc ? fmtWhen(parseDate(r.json.data_as_of_utc)) : '—';
      meta.textContent = (r.json.answer_type === 'ai_summary' ? 'AI summary (unverified)' : 'from your data') + ' · data ' + asOf;
    } else {
      el.textContent = assErrorText(r || { error: 'blocked' }, 'overview');
      meta.textContent = '';
    }
  }

  /* --------------------------------------------------------------- timeline */
  function renderTimeline() {
    var entries = timelineEntries();
    var show = state.timelineExpanded ? entries : entries.slice(0, 10);
    $('timeline').innerHTML = entries.length ? show.map(function (t) {
      return '<li class="reveal"><span class="tl-icon ' + (t.cls || '') + '">' + (ICONS[t.icon] || ICONS.bell) + '</span>' +
        '<div class="tl-text">' + t.text + '<span class="tl-when">' + escapeHtml(fmtWhen(t.ts)) + '</span></div></li>';
    }).join('') + '' : '<li class="empty">Nothing has happened yet.</li>';
    $('timeline-more').hidden = entries.length <= 10 || state.timelineExpanded;
    $('timeline-hint').textContent = entries.length ? entries.length + ' moments' : '';
    renderNotifications();
    observeReveals($('screen-timeline'));
  }
  function timelineEntries() {
    var out = [];
    state.events.forEach(function (e) {
      if (!e.ts) return;
      if (e.watered) out.push({ ts: e.ts, icon: 'drop', cls: '', text: 'Watered for <strong>' + (e.waterSec || 0) + ' s</strong> (~' + fmtNum(e.mlEst, 0) + ' ml estimated from pump runtime).' });
      if (e.heater) out.push({ ts: e.ts, icon: 'thermometer', cls: 'warn', text: 'Heater warmed the water for <strong>' + (e.heaterSec || 0) + ' s</strong>.' });
      if (e.tankEmpty === true) out.push({ ts: e.ts, icon: 'drop', cls: 'bad', text: 'Tank reported <strong>empty</strong>.' });
      if (e.anomaly) out.push({ ts: e.ts, icon: 'warning', cls: 'warn', text: 'A check flagged: ' + escapeHtml(e.anomalyText || 'possible issue') + '.' });
      if (e.moisture === null && e.weight === null) out.push({ ts: e.ts, icon: 'warning', cls: 'warn', text: 'Sensors did not report during this cycle.' });
    });
    state.notifications.forEach(function (n) {
      if (!n.ts) return;
      out.push({ ts: n.ts, icon: 'bell', cls: n.severity === 'critical' ? 'bad' : n.severity === 'warning' ? 'warn' : '', text: '<strong>' + escapeHtml(n.title || n.type) + '</strong> — ' + escapeHtml(n.message) });
    });
    return out.sort(function (a, b) { return b.ts - a.ts; });
  }
  function notifSeverityChip(n) {
    var cls = n.severity === 'critical' ? 'sev-possible_issue' : n.severity === 'warning' ? 'sev-monitor' : 'sev-unknown';
    var label = n.severity === 'critical' ? 'Critical' : n.severity === 'warning' ? 'Warning' : n.severity === 'legacy' ? 'Legacy' : 'Info';
    return '<span class="sev-chip ' + cls + '">' + label + '</span>';
  }
  function renderNotifications() {
    var host = $('notification-list');
    if (!host) return;
    var sev = $('severity-filter');
    var pending = pendingNotifications();
    var badge = $('pending-count');
    if (badge) { badge.hidden = pending.length === 0; badge.textContent = pending.length + ' waiting on you'; }
    var ctx = $('notif-context');
    if (ctx) {
      var ev = latestEvent();
      var species = cfgValue('last_species_guess', ev ? ev.species : '') || 'unknown';
      ctx.textContent = 'About ' + plantName() + (species !== 'unknown' ? ' (' + species + ')' : '') +
        ' · ' + state.notifications.length + ' record' + (state.notifications.length === 1 ? '' : 's') +
        ' · status (pending / done / expired) is written by the workflow — this app keeps no separate read state.';
    }
    if (sev && !sev.children.length) {
      sev.innerHTML = '<button type="button" data-sev="all" aria-pressed="true">All</button>' + SEVERITY.map(function (s) { return '<button type="button" data-sev="' + s.id + '" aria-pressed="false">' + s.label + '</button>'; }).join('');
    }
    if (sev) Array.prototype.forEach.call(sev.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sev') === state.severityFilter)); });
    var items = state.notifications.filter(function (n) {
      if (state.severityFilter === 'critical' && n.severity !== 'critical') return false;
      if (state.severityFilter === 'warning' && n.severity !== 'warning') return false;
      if (state.severityFilter === 'info' && !(n.severity === 'info' || n.severity === 'legacy')) return false;
      if (state.statusFilter !== 'all' && n.status !== state.statusFilter) return false;
      return true;
    }).sort(function (a, b) {
      var ap = a.status === 'pending' ? 0 : 1, bp = b.status === 'pending' ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (b.ts ? b.ts.getTime() : 0) - (a.ts ? a.ts.getTime() : 0);
    });
    if (!items.length) {
      host.innerHTML = state.notifications.length
        ? '<p class="empty">No notes match this filter.</p>'
        : '<div class="media-state"><span class="art" data-art="notifications" aria-hidden="true"></span><span>Nothing needs you right now — alerts and questions will land here.</span></div>' +
          '<p class="muted small notif-hint">Want a system notification while this page is open? Enable browser alerts in Settings — critical alerts and selected warnings only.</p>';
      hydrateArt(host);
      return;
    }
    host.innerHTML = items.map(function (n) {
      var actions = n.status === 'pending' && n.options.length ? n.options.map(function (opt) {
        return '<button type="button" class="btn btn-answer" data-label="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
      }).join('') : '';
      var feedback = n.status === 'pending'
        ? '<input class="notif-comment" type="text" placeholder="optional comment / correction"><div class="notif-feedback" hidden></div>'
        : (n.response ? '<div class="notif-meta"><span>your answer: ' + escapeHtml(n.response) + '</span></div>' : '');
      var source = SOURCE_BY_TYPE[n.type] || 'Workflow notification';
      return '<article class="notif sev-' + n.severity + '" data-row="' + n._row + '">' +
        '<div class="notif-head"><span class="notif-type">' + escapeHtml(n.type || 'note') + '</span>' + notifSeverityChip(n) +
        '<span class="notif-meta"><span>' + escapeHtml(fmtWhen(n.ts)) + '</span><span>' + escapeHtml(n.status || '—') + '</span></span></div>' +
        '<div class="notif-title">' + escapeHtml(n.title) + '</div><div class="notif-msg">' + escapeHtml(n.message) + '</div>' +
        '<div class="notif-source muted small">Source: ' + escapeHtml(source) +
        (n.contextRef ? ' · ref ' + escapeHtml(String(n.contextRef).slice(0, 40)) : '') +
        ' · plant ' + escapeHtml(plantName()) + '</div>' +
        (actions ? '<div class="notif-actions">' + actions + '</div>' : '') + feedback +
        '<details><summary>Raw row (debug)</summary><pre>' + escapeHtml(JSON.stringify(n.raw, null, 1)) + '</pre></details></article>';
    }).join('');
  }
  function renderChartsBlock() {
    var host = $('charts');
    if (!host) return;
    var ranges = $('range-select');
    if (ranges && !ranges.children.length) {
      ranges.innerHTML = RANGES.map(function (r) { return '<button type="button" data-range="' + r.id + '" aria-pressed="' + (state.range === r.id) + '">' + r.label + '</button>'; }).join('');
    }
    if (ranges) Array.prototype.forEach.call(ranges.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-range') === state.range)); });
    var evs = rangeEvents();
    var rangeLabel = (RANGES.filter(function (r) { return r.id === state.range; })[0] || RANGES[1]).label;
    var chartMetrics = METRICS.filter(function (m) { return m.chart; });
    host.innerHTML = '';
    chartMetrics.forEach(function (m) { host.appendChild(chartCard(m, evs, { rangeLabel: rangeLabel })); });
    observeReveals(host);
    var more = $('charts-more');
    if (more) more.hidden = true;
  }
  function renderTrendCard() {
    var host = $('trend-chart');
    if (!host) return;
    var evs = eventsInRange('7d');
    var prefs = ['moisture', 'weight', 'waterC', 'soilC'];
    var pick = null;
    for (var i = 0; i < prefs.length && !pick; i++) {
      var m = METRICS.filter(function (x) { return x.id === prefs[i]; })[0];
      if (!m) continue;
      var pts = evs.filter(function (e) { return e[m.field] !== null && e[m.field] !== undefined; });
      if (pts.length >= 2) pick = m;
    }
    var hint = $('trend-hint');
    var caption = $('trend-caption');
    if (pick) {
      if (hint) hint.textContent = pick.label + ' · last 7 days';
      if (caption) caption.textContent = 'One point per sensor cycle, straight from your Events sheet — no invented values.';
      host.innerHTML = '';
      host.appendChild(chartCard(pick, evs, { rangeLabel: 'the last 7 days' }));
    } else {
      if (hint) hint.textContent = 'last 7 days';
      if (caption) caption.textContent = 'The line appears once at least two sensor cycles have been recorded.';
      host.innerHTML = '<div class="chart-empty"><span class="chart-empty-icon" data-icon="chart" aria-hidden="true"></span>' +
        '<p class="chart-empty-text">No trend yet — at least <b>two readings</b> in the last 7 days are needed. Nothing is invented to fill the gap.</p></div>';
      paintIcons(host);
    }
  }
  function rangeEvents() {
    return eventsInRange(state.range);
  }
  function eventsInRange(rangeId) {
    var r = RANGES.filter(function (x) { return x.id === rangeId; })[0] || RANGES[1];
    var cutoff = r.ms ? Date.now() - r.ms : 0;
    return state.events.filter(function (e) { return e.ts && e.ts.getTime() >= cutoff; });
  }
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  }
  function chartLegendHtml(metric) {
    return '<div class="chart-legend">' +
      '<span class="legend-item"><span class="dot dot-line"></span>' + escapeHtml(metric.label) + ' (' + escapeHtml(metric.unit) + ')</span>' +
      '<span class="legend-item"><span class="dot dot-water"></span>watering</span>' +
      '<span class="legend-item"><span class="dot dot-heat"></span>heating</span>' +
      '<span class="legend-item"><span class="legend-x">✕</span>tank empty</span>' +
      '</div>';
  }
  function chartEmptyCard(metric, rangeLabel) {
    var card = document.createElement('div');
    card.className = 'chart-card reveal';
    card.setAttribute('data-metric', metric.id);
    card.innerHTML = '<div class="chart-head"><span class="chart-title">' + escapeHtml(metric.label) + '</span><span class="chart-now muted">waiting for readings</span></div>' +
      '<div class="chart-empty"><span class="chart-empty-icon" data-icon="chart" aria-hidden="true"></span>' +
      '<p class="chart-empty-text">At least <b>two readings</b> in ' + escapeHtml(rangeLabel) + ' are needed before a line appears. Nothing is invented or smoothed over.</p></div>' +
      '<div class="chart-caption">' + escapeHtml(metric.blurb || '') + '</div>';
    paintIcons(card);
    return card;
  }
  function chartCard(metric, evs, opts) {
    opts = opts || {};
    var rangeLabel = opts.rangeLabel || 'this window';
    var pts = evs.filter(function (e) { return e[metric.field] !== null && e[metric.field] !== undefined; });
    var card = document.createElement('div');
    card.className = 'chart-card reveal';
    card.setAttribute('data-metric', metric.id);
    if (pts.length < 2) return chartEmptyCard(metric, rangeLabel);
    var W = 900, H = 300, padL = 54, padR = 16, padT = 18, padB = 34;
    var t0 = pts[0].ts.getTime(), t1 = pts[pts.length - 1].ts.getTime(), span = t1 - t0 || 1;
    var vals = pts.map(function (e) { return e[metric.field]; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.1; min -= pad; max += pad;
    var x = function (t) { return padL + ((t - t0) / span) * (W - padL - padR); };
    var y = function (v) { return padT + (1 - (v - min) / (max - min)) * (H - padT - padB); };
    var ivs = [];
    for (var i = 1; i < pts.length; i++) ivs.push(pts[i].ts.getTime() - pts[i - 1].ts.getTime());
    var gapMs = Math.max((median(ivs) || 0) * 2.5, 45 * 60000);
    var segments = []; var cur = [pts[0]];
    for (var j = 1; j < pts.length; j++) { if (pts[j].ts.getTime() - pts[j - 1].ts.getTime() > gapMs) { segments.push(cur); cur = []; } cur.push(pts[j]); }
    segments.push(cur);
    var parts = [];
    parts.push('<defs><linearGradient id="grad-' + metric.id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.38"/>' +
      '<stop offset="55%" stop-color="var(--accent-2)" stop-opacity="0.14"/>' +
      '<stop offset="100%" stop-color="var(--accent-2)" stop-opacity="0.02"/></linearGradient></defs>');
    [0, 0.5, 1].forEach(function (f) {
      var gv = min + f * (max - min), gy = y(gv);
      parts.push('<line class="grid-line" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"/>');
      parts.push('<text x="' + (padL - 8) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(fmtNum(gv, metric.decimals)) + '</text>');
    });
    parts.push('<text x="' + padL + '" y="' + (H - 8) + '">' + escapeHtml(fmtWhen(new Date(t0))) + '</text>');
    parts.push('<text x="' + (W - padR) + '" y="' + (H - 8) + '" text-anchor="end">' + escapeHtml(fmtWhen(new Date(t1))) + '</text>');
    segments.forEach(function (seg) {
      var sp = seg.map(function (e) { return [x(e.ts.getTime()), y(e[metric.field])]; });
      if (sp.length > 1) {
        var line = smoothPath(sp);
        var area = 'M' + padL + ',' + (H - padB) + ' L' + line.slice(1) + ' L' + sp[sp.length - 1][0].toFixed(1) + ',' + (H - padB) + ' Z';
        parts.push('<path class="series-area" d="' + area + '" fill="url(#grad-' + metric.id + ')"/>');
        parts.push('<path class="series-line" d="' + line + '"/>');
      }
    });
    pts.forEach(function (e) {
      var cx = x(e.ts.getTime());
      if (e.watered) parts.push('<g class="marker marker-water"><rect x="' + (cx - 3.5).toFixed(1) + '" y="' + (H - padB - 5) + '" width="7" height="7" rx="2"/></g>');
      if (e.heater) parts.push('<g class="marker marker-heat"><circle cx="' + cx.toFixed(1) + '" cy="' + (H - padB - 12) + '" r="3.8"/></g>');
      if (e.tankEmpty === true) parts.push('<g class="marker marker-tank"><path d="M' + (cx - 4.5).toFixed(1) + ' ' + (H - padB - 22) + ' l9 9 M' + (cx + 4.5).toFixed(1) + ' ' + (H - padB - 22) + ' l-9 9"/></g>');
    });
    var last = pts[pts.length - 1];
    parts.push('<circle class="last-dot" cx="' + x(last.ts.getTime()).toFixed(1) + '" cy="' + y(last[metric.field]).toFixed(1) + '" r="4.5"/>');
    card.innerHTML = '<div class="chart-head"><span class="chart-title">' + escapeHtml(metric.label) + '</span><span class="chart-now">now <b>' + escapeHtml(fmtNum(last[metric.field], metric.decimals)) + '</b> ' + escapeHtml(metric.unit) + '</span></div>' +
      '<div class="chart-wrap"><svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeHtml(metric.label) + ' over ' + escapeHtml(rangeLabel) + ', latest ' + escapeHtml(fmtNum(last[metric.field], metric.decimals)) + ' ' + escapeHtml(metric.unit) + '"></svg><div class="chart-tip" hidden></div></div>' +
      chartLegendHtml(metric) +
      '<div class="chart-caption">' + escapeHtml(metric.blurb || '') + '</div>';
    card.querySelector('.chart').innerHTML = parts.join('');
    Array.prototype.forEach.call(card.querySelectorAll('.series-line'), function (p) { try { p.style.setProperty('--draw', String(p.getTotalLength())); } catch (err) { } });
    var svg = card.querySelector('.chart');
    var tip = card.querySelector('.chart-tip');
    function showTip(clientX) {
      var rect = svg.getBoundingClientRect();
      var px = ((clientX - rect.left) / rect.width) * W;
      var nearest = pts[0], best = Infinity;
      pts.forEach(function (e) { var d = Math.abs(x(e.ts.getTime()) - px); if (d < best) { best = d; nearest = e; } });
      tip.hidden = false;
      tip.textContent = fmtNum(nearest[metric.field], metric.decimals) + ' ' + metric.unit + ' · ' + fmtWhen(nearest.ts);
      tip.style.left = ((x(nearest.ts.getTime()) / W) * rect.width) + 'px';
      tip.style.top = ((y(nearest[metric.field]) / H) * rect.height) + 'px';
    }
    svg.addEventListener('pointermove', function (ev) { showTip(ev.clientX); });
    svg.addEventListener('pointerdown', function (ev) { showTip(ev.clientX); });
    svg.addEventListener('pointerleave', function () { tip.hidden = true; });
    return card;
  }

  /* --------------------------------------------------------------- doctor */
  function renderDoctor() {
    var host = $('detection-card');
    var status = $('doctor-status');
    var r = state.ai.detection;
    askRender('ask-doctor', 'Ask about this detection…', 'doctor');
    if (!state.ai.loaded.detection || state.ai.loading.detection) {
      status.textContent = '';
      host.innerHTML = '<p class="ask-state">Loading the latest detection…</p>';
      return;
    }
    if (!r || !r.ok) {
      status.textContent = 'assistant unavailable';
      host.innerHTML = '<p class="ask-state">' + escapeHtml(assErrorText(r || { error: 'blocked' }, 'overview')) + '</p>' +
        '<p class="muted small">Detections come from persisted DiseaseScans rows through the workflow — nothing is faked while the endpoint is off.</p>';
      renderDetectionHistory([]);
      return;
    }
    var d = r.json.detection;
    if (!d) {
      status.textContent = 'no detections';
      host.innerHTML = '<div class="media-state"><span class="art" data-art="images" aria-hidden="true"></span><span>No detection data available yet — the weekly scan has not produced a result.</span></div>';
      hydrateArt(host);
      renderDetectionHistory(r.json.history || []);
      return;
    }
    var sev = 'sev-' + (d.status || 'unknown');
    var label = d.status === 'possible_issue' ? 'Possible issue detected' : d.status === 'monitor' ? 'Worth monitoring' : d.status === 'clear' ? 'Clear' : 'Unknown';
    var confPct = d.confidence ? Math.round(Number(d.confidence) * 100) + '%' : '—';
    host.innerHTML = '<div class="detection">' +
      '<div class="detection-media" id="detection-media"><div class="media-state"><span>No linked image</span></div></div>' +
      '<div class="detection-head"><span class="detection-label">' + escapeHtml(label) + '</span><span class="sev-chip ' + sev + '">' + escapeHtml(String(d.status || 'unknown')) + '</span></div>' +
      '<div class="detection-grid">' +
      '<div class="kv"><span>Label</span><b>' + escapeHtml(d.label || '—') + '</b></div>' +
      '<div class="kv"><span>Confidence</span><b>' + escapeHtml(confPct) + '</b></div>' +
      '<div class="kv"><span>Detected</span><b>' + escapeHtml(fmtWhen(parseDate(d.detected_at_utc))) + '</b></div>' +
      '<div class="kv"><span>Verification</span><b>' + (d.is_verified ? 'owner-verified' : 'unverified AI hypothesis') + '</b></div>' +
      '<div class="kv"><span>Resolved</span><b>' + (d.resolved ? 'yes' : 'no') + '</b></div>' +
      '</div>' +
      '<p>' + escapeHtml(d.observation || '') + '</p>' +
      (Array.isArray(d.recommended_actions) && d.recommended_actions.length ? '<div><strong>Suggested next steps</strong><ul class="detection-actions">' + d.recommended_actions.map(function (a) { return '<li>' + escapeHtml(a) + '</li>'; }).join('') + '</ul></div>' : '') +
      (Array.isArray(d.recommendation_basis) && d.recommendation_basis.length ? '<details class="evidence"><summary>Why these suggestions</summary><ul>' + d.recommendation_basis.map(function (a) { return '<li>' + escapeHtml(a) + '</li>'; }).join('') + '</ul></details>' : '') +
      (Array.isArray(d.supporting_evidence) && d.supporting_evidence.length ? '<details class="evidence"><summary>Evidence</summary><ul>' + d.supporting_evidence.map(function (e) { return '<li>' + escapeHtml(e.source) + ' — ' + escapeHtml(e.label || e.id || '') + '</li>'; }).join('') + '</ul></details>' : '') +
      (Array.isArray(d.data_warnings) && d.data_warnings.length ? '<div class="ask-warnings">Notes: ' + d.data_warnings.map(escapeHtml).join(', ') + '</div>' : '') +
      '</div>';
    var media = $('detection-media');
    if (d.image_url && d.image_id) {
      driveMedia(d.image_id).then(function (url) {
        var img = document.createElement('img');
        img.alt = 'Detection image from ' + fmtWhen(parseDate(d.detected_at_utc));
        img.src = url;
        img.addEventListener('click', function () { openViewer({ id: d.image_id, label: 'Detection image', ts: parseDate(d.detected_at_utc), kind: 'scan' }); });
        media.innerHTML = '';
        media.appendChild(img);
      }).catch(function () { media.innerHTML = '<div class="media-state"><span>The linked image is not accessible to this account.</span></div>'; });
    }
    renderDetectionHistory(r.json.history || []);
    paintIcons(host);
  }
  function renderDetectionHistory(history) {
    var host = $('detection-history');
    var list = Array.isArray(history) ? history.slice().reverse() : [];
    if (!list.length && state.scans.length) {
      list = state.scans.slice(-5).reverse().map(function (s) {
        var y = null;
        try { y = JSON.parse(s.yolo_opinion || 'null'); } catch (err) { }
        return { detected_at_utc: s.timestamp, label: (y && (y.label_simple || y.label)) || s.judge_verdict || 'unknown', status: String(s.judge_verdict || '').toLowerCase().indexOf('issue') >= 0 ? 'possible_issue' : String(s.judge_verdict || '').toLowerCase().indexOf('monitor') >= 0 ? 'monitor' : 'clear', has_image: !!driveIdFromLink(s.drive_links) };
      });
    }
    host.innerHTML = list.length ? '<div class="history-list">' + list.map(function (h) {
      return '<div class="history-row"><span>' + escapeHtml(fmtWhen(parseDate(h.detected_at_utc))) + '</span><span>' + escapeHtml(h.label || 'unknown') + '</span>' +
        '<span class="sev-chip sev-' + escapeHtml(h.status || 'unknown') + '">' + escapeHtml(String(h.status || 'unknown')) + '</span>' +
        '<span class="muted small">' + (h.has_image ? 'image linked' : 'no image') + '</span></div>';
    }).join('') + '</div>' : '<p class="empty">No earlier detections recorded.</p>';
  }

  /* ------------------------------------------------------------------ photos */
  function renderPhotos() {
    var cam = cameraStatus();
    $('photos-hint').textContent = state.images.length ? 'last ' + (cam.ageMs === null ? 'unknown' : fmtAge(cam.ageMs) + ' ago') : 'none yet';
    var filters = $('image-filter');
    if (!filters.children.length) {
      filters.innerHTML = ['all', 'daily', 'scan'].map(function (f) { return '<button type="button" data-filter="' + f + '" aria-pressed="' + (state.imageFilter === f) + '">' + (f === 'all' ? 'All' : f === 'daily' ? 'Daily' : 'Scans') + '</button>'; }).join('');
    }
    Array.prototype.forEach.call(filters.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === state.imageFilter)); });
    var list = state.images.filter(function (i) { return state.imageFilter === 'all' || i.kind === state.imageFilter; });
    var latest = list[0];
    var el = $('latest-image');
    if (!latest) {
      el.innerHTML = '<div class="latest-media"><div class="media-state"><span class="art" data-art="images" aria-hidden="true"></span><span>No photos yet — when the camera takes its first picture it will appear here. Nothing is faked.</span></div></div>' +
        '<div class="latest-meta"><h3>Latest photo</h3><p class="muted">Photos arrive through the daily and weekly capture jobs; until then this stays empty on purpose.</p></div>';
      hydrateArt(el);
    } else {
      el.innerHTML = '<div class="latest-media"><div class="media-state" id="latest-state">Loading photo…</div></div>' +
        '<div class="latest-meta"><h3>' + escapeHtml(latest.label) + '</h3>' +
        '<div class="kv"><span>Taken / recorded</span><b>' + escapeHtml(fmtWhen(latest.ts)) + '</b></div>' +
        (latest.species ? '<div class="kv"><span>Plant at capture</span><b>' + escapeHtml(latest.species) + '</b></div>' : '') +
        (latest.verdict ? '<div class="kv"><span>Health verdict</span><b>' + escapeHtml(latest.verdict) + '</b></div>' : '') +
        (latest.aiNotes ? '<div class="kv"><span>AI note<span class="ai-badge">GENERATED</span></span></div><div class="muted small">' + escapeHtml(latest.aiNotes.slice(0, 240)) + '</div>' : '') +
        '<p class="muted small">Capture reason and per-photo light are not saved by the backend yet.</p></div>';
      var st = $('latest-state');
      driveMedia(latest.id).then(function (url) {
        var img = document.createElement('img');
        img.alt = latest.label + ' — ' + fmtWhen(latest.ts);
        img.src = url;
        img.addEventListener('click', function () { openViewer(latest); });
        st.replaceWith(img);
      }).catch(function () { st.textContent = 'Photo unavailable — the file is not accessible with this account or was removed.'; });
    }
    var gallery = list.filter(function (i) { return i !== latest; }).slice(0, 48);
    $('image-gallery').innerHTML = gallery.length ? gallery.map(function (i, idx) {
      return '<div class="thumb" data-idx="' + idx + '" role="button" tabindex="0" aria-label="Open ' + escapeHtml(i.label) + ' from ' + escapeHtml(fmtWhen(i.ts)) + '">' +
        '<div class="thumb-state">loading…</div><span class="thumb-tag">' + escapeHtml(i.kind === 'daily' ? 'daily' : 'scan') + '</span></div>';
    }).join('') : '';
    Array.prototype.forEach.call($('image-gallery').children, function (node) {
      var item = gallery[Number(node.getAttribute('data-idx'))];
      driveMedia(item.id).then(function (url) {
        var img = document.createElement('img');
        img.alt = item.label + ' — ' + fmtWhen(item.ts);
        img.src = url;
        node.insertBefore(img, node.firstChild);
        var s = node.querySelector('.thumb-state'); if (s) s.remove();
      }).catch(function () { var s = node.querySelector('.thumb-state'); if (s) s.textContent = 'unavailable'; });
      var open = function () { openViewer(item); };
      node.addEventListener('click', open);
      node.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
    });
  }
  function openViewer(item) {
    var v = $('viewer');
    state.viewerReturnFocus = document.activeElement;
    $('viewer-img').removeAttribute('src');
    $('viewer-meta').textContent = item.label + ' · ' + fmtWhen(item.ts) + ' · loading…';
    v.hidden = false;
    document.body.classList.add('modal-open');
    $('viewer-close').focus();
    driveMedia(item.id).then(function (url) {
      $('viewer-img').src = url;
      $('viewer-img').alt = item.label + ' from ' + fmtWhen(item.ts);
      $('viewer-meta').textContent = item.label + ' · ' + fmtWhen(item.ts);
    }).catch(function () { $('viewer-meta').textContent = item.label + ' · photo unavailable'; });
  }
  function closeViewer() {
    var v = $('viewer');
    if (!v || v.hidden) return;
    v.hidden = true;
    document.body.classList.remove('modal-open');
    if (state.viewerReturnFocus && state.viewerReturnFocus.focus) { try { state.viewerReturnFocus.focus(); } catch (err) { } }
    state.viewerReturnFocus = null;
  }

  /* --------------------------------------------------------------- insights */
  function renderInsights() {
    var summary = $('insights-summary');
    var r = state.ai.overviewAi;
    if (!state.ai.loaded.overviewAi || state.ai.loading.overviewAi) {
      summary.textContent = 'Assistant overview loading…';
      $('insights-changed').textContent = '—'; $('insights-check').textContent = '—'; $('insights-freshness').textContent = '';
      $('insights-evidence-wrap').hidden = true;
    } else if (!r || !r.ok || !r.json.summary) {
      summary.innerHTML = '<span class="ask-state">' + escapeHtml(assErrorText(r || { error: 'blocked' }, 'overview')) + '</span>';
      $('insights-changed').innerHTML = '—'; $('insights-check').innerHTML = '—';
      $('insights-freshness').textContent = '';
      $('insights-evidence-wrap').hidden = true;
    } else {
      summary.innerHTML = '<span class="ai-badge">' + escapeHtml(r.json.answer_type === 'ai_summary' ? 'AI GENERATED — UNVERIFIED' : 'FROM YOUR DATA') + '</span> <span id="insights-text"></span>';
      $('insights-text').textContent = String(r.json.summary);
      $('insights-changed').innerHTML = humanList(r.json.what_changed || []);
      $('insights-check').innerHTML = humanList(r.json.what_to_check || []);
      $('insights-freshness').textContent = 'Generated ' + fmtWhen(parseDate(r.json.generated_at_utc)) + ' · data as of ' + (r.json.data_as_of_utc ? fmtWhen(parseDate(r.json.data_as_of_utc)) : '—') + ' · status ' + String(r.json.status || 'unknown');
      var ev = Array.isArray(r.json.evidence) ? r.json.evidence : [];
      $('insights-evidence-wrap').hidden = !ev.length;
      $('insights-evidence').innerHTML = ev.map(function (e) { return '<li>' + escapeHtml(e.source) + ' — ' + escapeHtml(e.label || e.id || '') + '</li>'; }).join('');
      if (Array.isArray(r.json.warnings) && r.json.warnings.length) $('insights-freshness').textContent += ' · notes: ' + r.json.warnings.join(', ');
    }
    askRender('ask-insights', 'Ask about a change, a sensor or the last scan…', 'insights');
    renderChartsBlock();
    observeReveals($('screen-insights'));
  }

  /* --------------------------------------------------------------- settings */
  function renderSettingsScreen() {
    var modes = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
    var seg = $('mode-select');
    if (seg && !seg.children.length) {
      seg.innerHTML = modes.map(function (m) { return '<button type="button" data-mode="' + m[0] + '" aria-pressed="' + (currentMode() === m[0]) + '">' + m[1] + '</button>'; }).join('');
    }
    applyMode();
    renderAlertControl();
    var t = THEMES[state.theme] || THEMES.botanical;
    $('theme-label').textContent = t.label + ' — ' + t.tagline + ' (presentation only)';
    var r = state.ai.overview;
    var rows = [
      ['Assistant endpoint', assistantUrl('ask') || 'not configured'],
      ['Access check', (state.ai.loaded.overview ? (r && r.ok ? 'reachable' : assErrorText(r || { error: 'blocked' }, 'overview')) : 'checked when Overview or Insights is open')],
      ['Auth model', 'your Google token, verified server-side (no keys in the browser)'],
      ['Workflow', 'phytoai — endpoints live only while the workflow is active']
    ];
    $('assistant-status').innerHTML = rows.map(function (x) { return '<div class="kv-cell"><span class="k">' + escapeHtml(x[0]) + '</span><b>' + escapeHtml(String(x[1])) + '</b></div>'; }).join('');
    var kv = [
      ['Dry-run', cfgValue('dry_run_mode', '—')],
      ['Max water temp (policy)', cfgValue('max_water_temp_c', '—') + ' °C'],
      ['Max pump run', cfgValue('max_pump_seconds', '—') + ' s'],
      ['Min re-water gap', cfgValue('min_rewater_interval_hours', '—') + ' h'],
      ['Preheat margin', cfgValue('preheat_margin_c', '—') + ' °C'],
      ['Preheat lead', cfgValue('preheat_lead_minutes', '—') + ' min'],
      ['Heater firmware cutoff', '40.0 °C'],
      ['Heater firmware refuse', '≥ 39.5 °C'],
      ['Actuator hard cap', '120 s'],
      ['Flash dark threshold', cfgValue('flash_dark_threshold', '—')],
      ['Next sunrise', fmtWhen(parseDate(cfgValue('next_sunrise_utc', '')))],
      ['Next sunset', fmtWhen(parseDate(cfgValue('next_sunset_utc', '')))],
      ['Scan session', bool(cfgValue('scan_session_active', 'false')) ? 'active' : 'idle'],
      ['Species on record', cfgValue('last_species_guess', '—')],
      ['Perenual reference', cfgValue('perenual_status', 'not seeded')]
    ];
    $('system-grid').innerHTML = kv.map(function (x) { return '<div class="kv-cell"><span class="k">' + escapeHtml(x[0]) + '</span><b>' + escapeHtml(String(x[1])) + '</b></div>'; }).join('');
  }

  /* --------------------------------------------------------------- plumbing */
  function callResume(url, label, comment) {
    if (!url || !/^https?:\/\//i.test(url)) return Promise.resolve(false);
    var target;
    try { target = new URL(url); target.searchParams.set('response', label); if (comment) target.searchParams.set('comment', comment); } catch (err) { return Promise.resolve(false); }
    return schedRun('resume:' + target.toString(), { label: 'resume', userGesture: true }, function () {
      return fetch(target.toString(), { mode: 'cors' }).then(function () { return true; })
        .catch(function () { return fetch(target.toString(), { mode: 'no-cors' }).then(function () { return true; }).catch(function () { return false; }); });
    });
  }
  function respondToNotification(article, label) {
    var row = Number(article.getAttribute('data-row'));
    var item = state.notifications.filter(function (n) { return n._row === row; })[0];
    if (!item) return;
    var commentEl = article.querySelector('.notif-comment');
    var comment = commentEl ? commentEl.value.trim() : '';
    var responseText = comment ? label + ' | ' + comment : label;
    var feedback = article.querySelector('.notif-feedback');
    Array.prototype.forEach.call(article.querySelectorAll('.btn-answer'), function (b) { b.disabled = true; });
    callResume(item.resumeUrl, label, comment).then(function (resumed) {
      return sheetsUpdate('Notifications!F' + row + ':G' + row, [['done', responseText]]).then(function () {
        item.status = 'done'; item.response = responseText;
        if (feedback) { feedback.hidden = false; feedback.className = 'notif-feedback ok'; feedback.textContent = resumed ? 'Saved and the workflow was pinged.' : 'Saved to the sheet.'; }
        renderNotifications(); renderTimeline();
      });
    }).catch(function (err) {
      if (feedback) { feedback.hidden = false; feedback.className = 'notif-feedback error'; feedback.textContent = err.message; }
      Array.prototype.forEach.call(article.querySelectorAll('.btn-answer'), function (b) { b.disabled = false; });
    });
  }
  function renderToasts() {
    var seen = Number(sessionStorage.getItem(SEEN_KEY) || 0);
    var floor = seen === 0 ? Date.now() - 86400e3 : seen;
    var newest = seen;
    state.notifications.forEach(function (n) {
      if (!n.ts) return;
      var t = n.ts.getTime();
      if (t > floor && (n.severity === 'critical' || n.severity === 'warning')) toast(n.severity, n.title || n.type, String(n.message).slice(0, 180));
      if (t > newest) newest = t;
    });
    if (newest > seen) sessionStorage.setItem(SEEN_KEY, String(newest));
  }
  function showBanner(message, kind) {
    var el = $('banner');
    if (!message) { el.hidden = true; el.textContent = ''; el.className = 'banner'; return; }
    el.hidden = false; el.className = 'banner' + (kind ? ' ' + kind : ''); el.textContent = message;
  }
  /* One quota state per session: visible while the retry-after countdown runs,
   * then a "try again now" affordance. Nothing retries on its own. */
  function noteDataOk() {
    if (!state.quotaUntil) return;
    state.quotaUntil = 0;
    renderQuotaState();
  }
  function renderQuotaState() {
    var el = $('quota-state');
    if (!el) return;
    var until = Number(state.quotaUntil || 0);
    if (!until) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'quota-state';
      if (state.quotaTimer) { clearInterval(state.quotaTimer); state.quotaTimer = null; }
      var rb = $('refresh-btn');
      if (rb) rb.classList.remove('quota-ready');
      return;
    }
    var left = until - Date.now();
    el.hidden = false;
    if (left > 0) {
      el.className = 'quota-state warn';
      el.innerHTML = '<span class="quota-icon" aria-hidden="true"></span><span>Plant data is temporarily busy. Please try again in about a minute — retry available in <b>' + Math.ceil(left / 1000) + ' s</b>.</span>';
    } else {
      el.className = 'quota-state ready';
      el.innerHTML = '<span class="quota-icon" aria-hidden="true"></span><span>Plant data was busy — you can try again now with <b>Refresh</b>.</span>';
    }
    var rbtn = $('refresh-btn');
    if (rbtn) { if (left <= 0) rbtn.classList.add('quota-ready'); else rbtn.classList.remove('quota-ready'); }
    var tick = function () {
      var u = Number(state.quotaUntil || 0);
      if (!u || Date.now() >= u) {
        if (state.quotaTimer) { clearInterval(state.quotaTimer); state.quotaTimer = null; }
      }
      renderQuotaState();
    };
    if (left > 0 && !state.quotaTimer) state.quotaTimer = setInterval(tick, 1000);
  }
  function toast(severity, title, message) {
    var wrap = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast sev-' + severity;
    el.innerHTML = '<button type="button" aria-label="Dismiss">✕</button><div class="t-title">' + escapeHtml(title) + '</div><div>' + escapeHtml(message) + '</div>';
    el.querySelector('button').addEventListener('click', function () { el.remove(); });
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 15000);
  }
  function fitHero() {
    var hero = $('hero');
    if (!hero || state.route !== 'overview') return;
    var top = hero.getBoundingClientRect().top + window.scrollY;
    var h = window.innerHeight - top - 12;
    if (h > 260) hero.style.minHeight = h + 'px';
  }
  window.addEventListener('resize', fitHero);
  window.addEventListener('orientationchange', fitHero);

  /* ------------------------------------------------------------------ wiring */
  function bind() {
    $('connect-btn').addEventListener('click', requestSignIn);
    $('signin-btn').addEventListener('click', requestSignIn);
    $('refresh-btn').addEventListener('click', function () {
      if (!state.token) return;
      if (Number(state.quotaUntil || 0) > Date.now()) { renderQuotaState(); return; }
      showBanner('Refreshing…');
      loadBootstrap(true, 'refresh').then(function () {
        var blocked = Number(state.quotaUntil || 0) > Date.now();
        renderAll(!blocked);
        hydrateArt();
        paintIcons();
      });
    });
    $('sheet-mode-exit').addEventListener('click', exitSheetMode);
    $('mode-btn').addEventListener('click', cycleMode);
    var alertBtn = $('alert-btn');
    if (alertBtn) alertBtn.addEventListener('click', requestAlerts);
    document.addEventListener('visibilitychange', function () {
      if (typeof document.visibilityState === 'string' && document.visibilityState !== 'visible') return;
      var due = Number((CFG.notifications || {}).pollMs || 60000);
      if (Date.now() - Number(state.lastPollAt || 0) >= due) pollNotifications();
    });
    $('timeline-more').addEventListener('click', function () { state.timelineExpanded = true; renderTimeline(); });
    $('charts-more').addEventListener('click', function () { state.chartsExpanded = true; renderChartsBlock(); });
    var trendFull = $('trend-full');
    if (trendFull) trendFull.addEventListener('click', function () { state.range = '7d'; goto('insights'); });
    $('more-close').addEventListener('click', function () { $('more-sheet').hidden = true; });
    var chatForm = $('chat-form');
    function submitChat() {
      if (state.chatSending) return;
      var input = $('chat-input');
      var q = input ? input.value : '';
      if (input) { input.value = ''; growChatInput(); }
      chatSend(q, 'assistant');
    }
    if (chatForm) chatForm.addEventListener('submit', function (ev) { ev.preventDefault(); submitChat(); });
    var chatInput = $('chat-input');
    if (chatInput) {
      chatInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submitChat(); }
      });
      chatInput.addEventListener('input', growChatInput);
    }
    var chatClear = $('chat-clear');
    if (chatClear) chatClear.addEventListener('click', function () {
      if (state.chatSending) return;
      state.chat = [];
      chatNote('');
      renderChatLog();
      updateChatControls();
      var input = $('chat-input');
      if (input) input.focus();
    });
    document.addEventListener('click', function (ev) {
      var routeBtn = ev.target.closest ? ev.target.closest('[data-route]') : null;
      if (routeBtn) { $('more-sheet').hidden = true; goto(routeBtn.getAttribute('data-route')); return; }
      if (ev.target.closest && ev.target.closest('[data-more]')) { $('more-sheet').hidden = false; return; }
      var askBtn = ev.target.closest ? ev.target.closest('[data-ask]') : null;
      if (askBtn) { askSubmit(askBtn.getAttribute('data-ask')); return; }
      var chip = ev.target.closest ? ev.target.closest('[data-chat-suggest]') : null;
      if (chip) { chatSend(chip.getAttribute('data-chat-suggest'), 'assistant'); return; }
      var retryBtn = ev.target.closest ? ev.target.closest('[data-retry]') : null;
      if (retryBtn) {
        var rid = Number(retryBtn.getAttribute('data-retry'));
        var idx = -1;
        state.chat.forEach(function (m, i) { if (m.id === rid) idx = i; });
        if (idx >= 0 && state.chat[idx].q && !state.chatSending) {
          var failed = state.chat[idx];
          state.chat.splice(idx, 1);
          chatSend(failed.q, failed.context);
        }
        return;
      }
      var closer = ev.target.closest ? ev.target.closest('[data-action="close-viewer"]') : null;
      if (closer) { closeViewer(); return; }
      if (ev.target === $('viewer')) closeViewer();
      if (ev.target === $('more-sheet')) $('more-sheet').hidden = true;
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target && ev.target.classList && ev.target.classList.contains('ask-input')) {
        var host = ev.target.closest('.ask');
        if (host) askSubmit(host.id);
      }
      if (ev.key === 'Escape' && !$('viewer').hidden) closeViewer();
    });
    $('notification-list') && $('notification-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('.btn-answer'); if (!btn) return;
      respondToNotification(btn.closest('.notif'), btn.getAttribute('data-label'));
    });
    var sev = $('severity-filter');
    if (sev) sev.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-sev]'); if (!b) return;
      state.severityFilter = b.getAttribute('data-sev'); renderNotifications();
    });
    var status = $('status-filter');
    if (status) status.addEventListener('change', function () { state.statusFilter = status.value; renderNotifications(); });
    var modeSel = $('mode-select');
    if (modeSel) modeSel.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-mode]'); if (!b) return;
      setMode(b.getAttribute('data-mode'));
    });
    var ranges = $('range-select');
    if (ranges) ranges.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-range]'); if (!b) return;
      state.range = b.getAttribute('data-range'); renderChartsBlock();
    });
    var filters = $('image-filter');
    if (filters) filters.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-filter]'); if (!b) return;
      state.imageFilter = b.getAttribute('data-filter'); renderPhotos();
    });
    window.addEventListener('hashchange', function () {
      if (boot.phase === 'auth_pending' || boot.phase === 'authenticated' || boot.phase === 'bootstrapping') return;
      renderRoute();
    });
  }
  function start() {
    state.sheetId = resolveSheetId();
    normalizeInitialHash();
    renderSheetBanner();
    applyMode();
    paintIcons();
    renderQuotaState();
    if (!restoreToken()) $('signin-panel').hidden = false;
    bind();
    initAuth();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
