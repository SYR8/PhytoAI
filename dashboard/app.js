/* PhytoAI dashboard — consumer-first app (v2).
 *
 * Presentation only: the data contract is frozen (docs/dashboard-data-contract-audit.md).
 * - Reads Google Sheets + Drive directly with the user's OAuth token.
 * - Sheet override precedence: ?sheet=<ID> > localStorage > config.js (owner tooling).
 * - ml_est is always tagged as estimated from pump runtime; measured wt_delta_g shows
 *   "Device log only — not saved to history yet" (no persistence path exists).
 * - Dry-run and stale data stay loud and plain-worded.
 */
(function () {
  'use strict';

  var CFG = window.PHYTOAI_CONFIG || {};
  var LIM = CFG.limits || {};
  var TOKEN_KEY = 'phytoai_token';
  var EXPIRY_KEY = 'phytoai_token_expiry';
  var SEEN_KEY = 'phytoai_seen_notification_ts';
  var SHEET_OVERRIDE_KEY = 'phytoai_sheet_override';

  var SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
  var DRIVE = 'https://www.googleapis.com/drive/v3/files/';

  /* Iconify (Phosphor `ph`) — inlined at build time, no runtime token/network. */
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

  var METRICS = [
    { id: 'weight', label: 'Pot weight', unit: 'g', decimals: 1, gauge: false, spark: true, chart: true },
    { id: 'moisture', label: 'Soil moisture', unit: '%', decimals: 0, gauge: true, spark: true, chart: true },
    { id: 'waterC', label: 'Water temperature', unit: '°C', decimals: 1, gauge: true, chart: true },
    { id: 'soilC', label: 'Soil temperature', unit: '°C', decimals: 1, gauge: true, chart: false },
    { id: 'airC', label: 'Air temperature', unit: '°C', decimals: 1, chart: false },
    { id: 'hum', label: 'Air humidity', unit: '%', decimals: 0, chart: false },
    { id: 'light', label: 'Light sensor', unit: '', decimals: 0, chart: false }
  ];
  var RANGES = [ { id: '24h', label: '24 h', ms: 86400e3 }, { id: '7d', label: '7 days', ms: 7 * 86400e3 }, { id: '30d', label: '30 days', ms: 30 * 86400e3 }, { id: 'all', label: 'All', ms: 0 } ];
  var SEVERITY = [ { id: 'critical', label: 'Critical' }, { id: 'warning', label: 'Warnings' }, { id: 'info', label: 'Info' } ];
  var SEVERITY_BY_TYPE = { alert_tank_empty: 'critical', alert_anomaly: 'warning', scan_verdict: 'warning', alert_battery_low: 'warning', scan_scheduled: 'info', scan_postponed: 'info', scan_followup: 'info', watering_feedback: 'info', smoke_test: 'info' };
  var LEGACY_TYPES = { alert_battery_low: true, scan_position: true };

  var state = {
    token: null, tokenExpiry: 0, tokenClient: null, sheetId: null,
    cfg: {}, events: [], notifications: [], scans: [], notes: [], images: [], media: {}, meta: {},
    theme: 'botanical', range: null, imageFilter: 'all', severityFilter: 'all', statusFilter: 'all',
    chartsExpanded: false, timelineExpanded: false, viewerReturnFocus: null, loadErrors: [], revealed: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var reducedMotion = function () { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; };

  /* ------------------------------------------------------------------ utils */
  function escapeHtml(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function icon(name, cls) { return '<span class="' + (cls || '') + '" data-icon-inline="' + name + '"></span>'; }
  function num(v) { if (v === undefined || v === null || String(v).trim() === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function bool(v) { return String(v).trim().toLowerCase() === 'true'; }
  function parseDate(v) { if (!v) return null; var d = new Date(String(v).trim()); return isNaN(d.getTime()) ? null : d; }
  function fmtNum(v, dec) { return v === null || v === undefined || isNaN(v) ? '—' : Number(v).toFixed(dec); }
  function fmtClock(d) { return d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'; }
  function fmtDay(d) { return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'; }
  function fmtWhen(d) {
    if (!d) return 'unknown';
    var now = Date.now();
    var diff = now - d.getTime();
    if (diff < 90e3) return 'just now';
    if (diff < 3600e3) return Math.round(diff / 60e3) + ' min ago';
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var dd = new Date(d.getTime()); dd.setHours(0, 0, 0, 0);
    var days = Math.round((d0 - dd) / 86400e3);
    var part = d.getHours() < 5 ? 'overnight' : d.getHours() < 12 ? 'this morning' : d.getHours() < 17 ? 'this afternoon' : 'this evening';
    if (days === 0) return part;
    if (days === 1) return 'yesterday ' + part.replace('this ', '');
    if (days < 7) return days + ' days ago';
    return fmtDay(d) + ' at ' + fmtClock(d);
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

  /* ------------------------------------------------------- animation helpers */
  var revealObserver = null;
  function observeReveals() {
    var els = document.querySelectorAll('.reveal, .chart-card');
    if (reducedMotion() || !('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('in'); }); return; }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    els.forEach(function (el) { if (!el.classList.contains('in')) revealObserver.observe(el); });
  }
  function countUp(el, to, decimals) {
    if (to === null || to === undefined || isNaN(to)) { el.textContent = '—'; return; }
    var from = Number(el.getAttribute('data-last') || 0);
    el.setAttribute('data-last', String(to));
    if (reducedMotion() || from === to) { el.textContent = Number(to).toFixed(decimals); return; }
    var t0 = null;
    var dur = 650;
    function frame(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (from + (to - from) * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function setRawValue(el, value, decimals) { countUp(el, value, decimals); }

  /* ------------------------------------------------------------------ art */
  function hydrateArt(root) {
    var nodes = (root || document).querySelectorAll('[data-art]');
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.getAttribute('data-art-done')) return;
      var key = el.getAttribute('data-art');
      if (!ART[key]) return;
      fetch(ART[key]).then(function (r) { if (!r.ok) throw new Error('art ' + r.status); return r.text(); }).then(function (svg) {
        var clean = svg.replace(/<\?xml[^>]*\?>/, '')
          .replace(/<svg([^>]*)>/, function (m, attrs) { return '<svg' + attrs.replace(/\s(width|height)="[^"]*"/g, '') + '>'; })
          .replace(/var\(--primary-svg-color,\s*[^)]+\)/g, 'currentColor');
        el.innerHTML = clean;
        el.setAttribute('data-art-done', '1');
        el.classList.remove('art-pending');
      }).catch(function () { el.hidden = true; });
    });
  }
  function paintIcons(root) {
    var nodes = (root || document).querySelectorAll('[data-icon]');
    Array.prototype.forEach.call(nodes, function (el) { if (!el.querySelector('svg')) el.innerHTML = ICONS[el.getAttribute('data-icon')] || ''; });
    var inline = (root || document).querySelectorAll('[data-icon-inline]');
    Array.prototype.forEach.call(inline, function (el) { if (!el.firstChild) el.outerHTML = ICONS[el.getAttribute('data-icon-inline')] || ''; });
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
    var tokenClientCfg = {
      client_id: CFG.clientId,
      scope: CFG.scopes,
      callback: function (resp) {
        if (resp && resp.access_token) {
          state.token = resp.access_token;
          state.tokenExpiry = Date.now() + (Number(resp.expires_in || 3600) * 1000) - 60000;
          sessionStorage.setItem(TOKEN_KEY, state.token);
          sessionStorage.setItem(EXPIRY_KEY, String(state.tokenExpiry));
          setAuthUi(); loadAll();
        } else {
          showBanner('Google sign-in failed. Check the OAuth client ID and the authorized JavaScript origin https://phytoai.edgeone.dev (HTTPS).', 'error');
        }
      },
      error_callback: function (err) {
        showBanner('Google sign-in error (' + ((err && (err.type || err.message)) || 'unknown') + '). Check the OAuth client, the authorized origin, and that access was granted.', 'error');
      }
    };
    var hint = loginHint();
    if (hint) tokenClientCfg.hint = hint;
    state.tokenClient = google.accounts.oauth2.initTokenClient(tokenClientCfg);
    if (restoreToken()) { setAuthUi(); loadAll(); } else { $('connect-btn').hidden = false; }
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
    if (!sheetModeActive()) { el.hidden = true; return; }
    el.hidden = false;
    var label = $('sheet-mode-id');
    if (label) label.textContent = state.sheetId.slice(0, 10) + '…';
  }
  function exitSheetMode() {
    try { localStorage.removeItem(SHEET_OVERRIDE_KEY); } catch (err) { }
    try { history.replaceState(null, '', location.pathname); } catch (err) { }
    location.reload();
  }

  /* ------------------------------------------------------------ data access */
  function authHeaders() { return { Authorization: 'Bearer ' + state.token }; }
  function sheetsGet(range) {
    var url = SHEETS + encodeURIComponent(state.sheetId) + '/values/' + encodeURIComponent(range) + '?majorDimension=ROWS';
    return fetch(url, { headers: authHeaders() }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('Sheets ' + range + ' → ' + res.status + ' ' + String(t).slice(0, 120)); });
      return res.json().then(function (d) { return d.values || []; });
    });
  }
  function sheetsUpdate(range, values) {
    var url = SHEETS + encodeURIComponent(state.sheetId) + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED';
    return fetch(url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify({ range: range, majorDimension: 'ROWS', values: values }) })
      .then(function (res) { if (!res.ok) return res.text().then(function (t) { throw new Error('Sheets write → ' + res.status + ': ' + String(t).slice(0, 120)); }); return res.json(); });
  }
  function driveMeta(id) {
    if (state.meta[id] !== undefined) return Promise.resolve(state.meta[id]);
    var fields = 'id,name,createdTime,imageMediaMetadata(width,height)';
    return fetch(DRIVE + encodeURIComponent(id) + '?fields=' + encodeURIComponent(fields), { headers: authHeaders() })
      .then(function (res) { if (!res.ok) throw new Error('drive meta ' + res.status); return res.json(); })
      .then(function (d) { state.meta[id] = d; return d; })
      .catch(function () { state.meta[id] = null; return null; });
  }
  function driveMedia(id) {
    if (state.media[id]) return Promise.resolve(state.media[id]);
    return fetch(DRIVE + encodeURIComponent(id) + '?alt=media', { headers: authHeaders() })
      .then(function (res) { if (!res.ok) throw new Error('drive media ' + res.status); return res.blob(); })
      .then(function (blob) { var url = URL.createObjectURL(blob); state.media[id] = url; return url; });
  }
  function toRecords(values) {
    if (!values || !values.length) return [];
    var head = values[0];
    return values.slice(1).map(function (row, i) { var rec = { _row: i + 2 }; head.forEach(function (h, j) { rec[h] = row[j] === undefined ? '' : row[j]; }); return rec; });
  }
  function flowMlPerSec() { var v = num(state.cfg['pump_flow_ml_per_sec']); return v !== null && v > 0 ? v : Number(CFG.pumpFlowMlPerSec || 0); }

  function loadAll() {
    if (!state.token) return;
    showBanner('Loading…');
    state.loadErrors = [];
    var jobs = [
      ['cfg', 'SystemConfig!A1:C'], ['events', 'Events!A1:Y'], ['notifications', 'Notifications!A1:I'], ['scans', 'DiseaseScans!A1:J'], ['notes', 'AgentNotes!A1:E']
    ].map(function (j) {
      return sheetsGet(j[1]).then(function (values) {
        if (j[0] === 'events') state.events = toRecords(values).map(normalizeEvent);
        else if (j[0] === 'notifications') state.notifications = toRecords(values).map(normalizeNotification);
        else if (j[0] === 'scans') state.scans = toRecords(values);
        else if (j[0] === 'notes') state.notes = toRecords(values);
        else {
          state.cfg = {};
          toRecords(values).forEach(function (row) { var k = String(row.Key === undefined ? '' : row.Key).trim(); if (k) state.cfg[k] = row.Value; });
        }
      }).catch(function (err) { state.loadErrors.push(err.message); });
    });
    Promise.all(jobs).then(function () {
      if (state.loadErrors.length) showBanner('Some data failed to load: ' + state.loadErrors.join(' · '), 'warn');
      else showBanner('');
      finalizeLoad();
    });
  }
  function finalizeLoad() {
    if (!state.range) state.range = window.matchMedia('(max-width: 719px)').matches ? '24h' : '7d';
    var species = cfgValue('last_species_guess', latestEvent() ? latestEvent().species : '') || 'unknown';
    state.theme = pickTheme(species);
    document.documentElement.setAttribute('data-theme', state.theme);
    deriveImages();
    renderAll();
    fitHero();
    hydrateArt();
    paintIcons();
    observeReveals();
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
      species: String(row.SpeciesGuess || '').trim(), speciesConf: num(row.SpeciesConfidence),
      photoId: String(row.PhotoFileID || '').trim(), anomaly: bool(row.AnomalyDetected),
      anomalyText: String(row.AnomalyDescription || '').trim(), aiNotes: String(row.AI_Notes || '').trim(),
      reasoning: String(row.ReasoningSummary || '').trim(), mlEst: null
    };
    if (e.watered && e.waterSec !== null) e.mlEst = e.waterSec * flowMlPerSec();
    return e;
  }
  function normalizeNotification(row) {
    var type = String(row.type || '').trim();
    var severity = LEGACY_TYPES[type] ? 'legacy' : (SEVERITY_BY_TYPE[type] || 'info');
    var options = [];
    try { options = JSON.parse(row.response_options || '[]').map(String); } catch (err) { options = []; }
    return {
      raw: row, _row: row._row, ts: parseDate(row.timestamp), type: type, severity: severity,
      title: String(row.title || '').trim(), message: String(row.message || '').trim(), options: options,
      status: String(row.status || '').trim().toLowerCase(), response: String(row.response || '').trim(),
      resumeUrl: String(row.resume_url || '').trim(), contextRef: String(row.context_ref || '').trim()
    };
  }
  function cfgValue(key, fallback) { var v = state.cfg[key]; return v === undefined || v === null || String(v).trim() === '' ? fallback : v; }
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
      if (e.photoId) imgs.push({ id: e.photoId, kind: 'daily', label: 'Daily photo', ts: e.ts, species: e.species, light: e.light, aiNotes: e.aiNotes, verdict: null });
    });
    state.scans.forEach(function (s) {
      var id = driveIdFromLink(s.drive_links);
      if (!id) return;
      imgs.push({ id: id, kind: 'scan', label: 'Health scan', ts: parseDate(s.timestamp), species: '', light: null, aiNotes: String(s.ai_notes || '').trim(), verdict: String(s.judge_verdict || '').trim() });
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

  /* -------------------------------------------------------------- derivation */
  function flagsFor(ev) {
    var out = [];
    if (bool(cfgValue('dry_run_mode', 'true'))) out.push({ severity: 'info', icon: 'sliders', title: 'Dry-run mode', text: 'Commands are simulated — the pump and heater stay off until you turn dry-run off.' });
    if (!ev) { out.push({ severity: 'warning', icon: 'warning', title: 'No data yet', text: 'Nothing has been recorded yet, so every panel below stays empty.' }); return out; }
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
    if (cam.quiet) out.push({ severity: 'warning', icon: 'camera', title: 'No photos lately', text: 'The last picture is older than ' + Math.round((CFG.cameraQuietAfterMinutes || 2160) / 60) + ' h — that is expected until the camera runs again.' });
    return out;
  }
  /* Status mapping — presentation only, uses existing persisted fields:
   * critical = tank empty OR a pending critical notification;
   * attention = any warning flag (stale data, invalid reading, anomaly, camera quiet) or pending warning;
   * thriving = no flags AND watered within 7 days AND the newest scan verdict is not "issue";
   * ok = no flags but not enough recent positive signals. */
  function deriveStatus(ev, flags) {
    var species = cfgValue('last_species_guess', '') || 'this plant';
    if (!ev) return { code: 'ok', word: 'Waiting', line: 'Waiting for the first reading', explain: 'Connect Google and let the pot report in — nothing is shown until real data arrives.' };
    var critical = flags.some(function (f) { return f.severity === 'critical'; });
    var attention = flags.some(function (f) { return f.severity === 'warning'; });
    var watered = lastWaterings(1)[0];
    var wateredRecently = watered && watered.ts && (Date.now() - watered.ts.getTime() < 7 * 86400e3);
    var lastScan = state.scans.length ? state.scans[state.scans.length - 1] : null;
    var verdict = lastScan ? String(lastScan.judge_verdict || '').toLowerCase() : '';
    var scanIssue = /issue|problem|disease|pest/.test(verdict);
    if (critical) return { code: 'critical', word: 'Critical', line: 'Your ' + species + ' needs you right now.', explain: 'See the flags below — nothing will be overridden automatically.' };
    if (attention) return { code: 'attention', word: 'Needs attention', line: 'Your ' + species + ' needs a look.', explain: 'Nothing is broken, but the flags below are worth a minute of your time.' };
    if (wateredRecently && !scanIssue) return { code: 'thriving', word: 'Thriving', line: 'Your ' + species + ' is doing well.', explain: 'Watering is recent, no alerts are pending, and the last health check found no issues.' };
    return { code: 'ok', word: 'Looking OK', line: 'Your ' + species + ' looks fine.', explain: 'No alerts right now. The pot is being cared for on its normal rhythm.' };
  }

  /* ------------------------------------------------------------------ render */
  /* Pixel-perfect first screen: the hero fills the rest of the viewport so nothing
   * below the fold competes with it (dvh is unreliable inside embeds/URL bars). */
  function fitHero() {
    var hero = $('hero');
    if (!hero) return;
    var top = hero.getBoundingClientRect().top + window.scrollY;
    var h = window.innerHeight - top - 12;
    if (h > 260) hero.style.minHeight = h + 'px';
  }
  window.addEventListener('resize', fitHero);
  window.addEventListener('orientationchange', fitHero);

  function renderAll() {
    renderChrome();
    renderHero();
    renderVitals();
    renderTimeline();
    renderHistory();
    renderPhotos();
    renderNotifications();
    renderNotes();
    renderSettings();
    renderToasts();
  }
  function renderChrome() {
    var dry = bool(cfgValue('dry_run_mode', 'true'));
    $('dryrun-pill').hidden = !dry;
    var ev = latestEvent();
    var stale = ev ? (Date.now() - ev.ts.getTime()) > (CFG.staleAfterMinutes || 840) * 60000 : true;
    $('stale-pill').hidden = !stale;
  }
  function renderHero() {
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
    var p = plantIdentity();
    $('plant-identity').textContent = p.name + (p.species !== 'unknown' ? ' · ' + p.species : '');
    $('hero-age').textContent = ev ? 'Last reading ' + fmtWhen(ev.ts) + ' · next check follows the sun schedule' : 'No readings yet';
  }
  function plantIdentity() {
    return {
      name: (CFG.profile && CFG.profile.name) || cfgValue('plant_name', '') || 'This plant',
      species: cfgValue('last_species_guess', latestEvent() ? latestEvent().species : '') || 'unknown'
    };
  }

  /* ---------------------------------------------------------- human metrics */
  function gaugeSvg(value, min, max, invert) {
    var pct = 0;
    if (value !== null && max > min) pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
    if (invert) pct = 1 - pct;
    var r = 26, c = 2 * Math.PI * r;
    var dash = (pct * c).toFixed(1) + ' ' + c.toFixed(1);
    return '<svg class="metric-gauge" viewBox="0 0 64 64" aria-hidden="true">' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="7"/>' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + dash + '" transform="rotate(-90 32 32)"/>' +
      '</svg>';
  }
  function sparkSvg(field) {
    var vals = state.events.filter(function (e) { return e.ts && e[field] !== null; }).slice(-24);
    if (vals.length < 2) return '';
    var v = vals.map(function (e) { return e[field]; });
    var min = Math.min.apply(null, v), max = Math.max.apply(null, v), span = (max - min) || 1;
    var pts = v.map(function (x, i) { return ((i / (v.length - 1)) * 100).toFixed(1) + ',' + (26 - ((x - min) / span) * 22 - 2).toFixed(1); }).join(' ');
    return '<svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/></svg>';
  }
  function lastNDays(field, days) {
    var cutoff = Date.now() - days * 86400e3;
    return state.events.filter(function (e) { return e.ts && e.ts.getTime() >= cutoff && e[field] !== null; }).map(function (e) { return e[field]; });
  }
  function metricCard(opts) {
    return '<div class="metric ' + (opts.cls || '') + '" data-metric="' + opts.id + '">' +
      '<div class="metric-head">' + (opts.visual || '') +
      '<div class="metric-body"><p class="metric-sentence">' + opts.sentence + '</p>' +
      '<span class="metric-raw" data-count-to="' + (opts.rawValue === null || opts.rawValue === undefined ? '' : opts.rawValue) + '" data-count-dec="' + (opts.rawDecimals || 0) + '">' + (opts.rawValue === null || opts.rawValue === undefined ? '—' : Number(opts.rawValue).toFixed(opts.rawDecimals || 0)) + '</span>' +
      '<span class="metric-raw"> ' + escapeHtml(opts.rawSuffix || '') + '</span></div></div>' +
      (opts.spark ? '<div class="metric-spark">' + opts.spark + '</div>' : '') + '</div>';
  }
  function renderVitals() {
    var ev = latestEvent();
    var grid = $('vitals-grid');
    if (!ev) { grid.innerHTML = '<p class="empty">No readings yet — the first event will fill this in.</p>'; $('vitals-hint').textContent = ''; return; }
    var cards = [];
    var week = function (field) { return lastNDays(field, 7); };

    // Soil moisture
    var mWeek = week('moisture');
    var mMin = mWeek.length ? Math.min.apply(null, mWeek) : 0, mMax = mWeek.length ? Math.max.apply(null, mWeek) : 100;
    var mTrend = ev.moisture !== null && mWeek.length > 1 ? (ev.moisture >= median(mWeek) ? 'holding around its weekly middle' : 'on the drier side of this week') : 'the first reading in a while';
    cards.push(metricCard({ id: 'moisture', visual: gaugeSvg(ev.moisture, mMin, mMax, false),
      sentence: 'The soil is <strong>' + (ev.moisture === null ? 'unreadable right now' : fmtNum(ev.moisture, 0) + '% moist</strong> — ' + mTrend) + '.',
      rawValue: ev.moisture, rawDecimals: 0, rawSuffix: '% · ' + fmtWhen(ev.ts), spark: sparkSvg('moisture'),
      cls: ev.moisture === null ? 'warn' : '' }));

    // Water temperature
    var wWeek = week('waterC');
    var wMin = wWeek.length ? Math.min.apply(null, wWeek) : 15, wMax = wWeek.length ? Math.max.apply(null, wWeek) : 30;
    cards.push(metricCard({ id: 'waterC', visual: gaugeSvg(ev.waterC, wMin, wMax, false),
      sentence: 'The water sits at <strong>' + (ev.waterC === null ? 'an unknown temperature' : fmtNum(ev.waterC, 1) + ' °C</strong> — ' + (ev.waterC !== null && ev.waterC >= Number(cfgValue('max_water_temp_c', 28)) ? 'at the comfort limit set for this pot' : 'within the comfortable range for watering')) + '.',
      rawValue: ev.waterC, rawDecimals: 1, rawSuffix: '°C', cls: ev.waterC === null ? 'warn' : '' }));

    // Pot weight (gross) with trend
    var prev = state.events.filter(function (e) { return e.ts && ev.ts && e.ts < ev.ts && e.weight !== null; });
    var prevW = prev.length ? prev[prev.length - 1].weight : null;
    var wDelta = ev.weight !== null && prevW !== null ? Math.round((ev.weight - prevW) * 10) / 10 : null;
    cards.push(metricCard({ id: 'weight', visual: '<span class="metric-icon-lg">' + ICONS.leaf + '</span>',
      sentence: 'The whole pot weighs <strong>' + (ev.weight === null ? 'unknown' : fmtNum(ev.weight / 1000, 2) + ' kg</strong> gross' + (wDelta === null ? '' : ' — ' + (wDelta < 0 ? 'down' : 'up') + ' ' + Math.abs(wDelta).toFixed(0) + ' g since the previous reading')) + '.',
      rawValue: ev.weight, rawDecimals: 1, rawSuffix: 'g', spark: sparkSvg('weight'), cls: ev.weight === null ? 'warn' : '' }));

    // Soil temp
    cards.push(metricCard({ id: 'soilC', visual: gaugeSvg(ev.soilC, 10, 35, false),
      sentence: 'Root-zone soil is ' + (ev.soilC === null ? 'unreadable' : '<strong>' + fmtNum(ev.soilC, 1) + ' °C</strong>'),
      rawValue: ev.soilC, rawDecimals: 1, rawSuffix: '°C', cls: ev.soilC === null ? 'warn' : '' }));

    // Air
    cards.push(metricCard({ id: 'airC', visual: '<span class="metric-icon-lg">' + ICONS.thermometer + '</span>',
      sentence: 'The room is <strong>' + (ev.airC === null ? 'unknown' : fmtNum(ev.airC, 1) + ' °C</strong> and ' + (ev.hum === null ? 'unknown humidity' : fmtNum(ev.hum, 0) + '% humid')) + '.',
      rawValue: ev.airC, rawDecimals: 1, rawSuffix: '°C · ' + (ev.hum === null ? '—' : fmtNum(ev.hum, 0) + '%'), cls: ev.airC === null ? 'warn' : '' }));

    // Light
    cards.push(metricCard({ id: 'light', visual: '<span class="metric-icon-lg">' + ICONS.sun + '</span>',
      sentence: 'The light sensor reads <strong>' + (ev.light === null ? 'nothing' : fmtNum(ev.light, 0)) + '</strong> (0/1 digital — the analog scale is still an open question).',
      rawValue: ev.light, rawDecimals: 0, rawSuffix: 'raw' }));

    // Tank + last actions
    var cam = cameraStatus();
    cards.push(metricCard({ id: 'tank', visual: '<span class="metric-icon-lg">' + ICONS.drop + '</span>',
      sentence: ev.tankEmpty === null ? 'Tank state is unknown.' : (ev.tankEmpty ? '<strong>The tank is empty</strong> — watering is paused.' : 'The tank <strong>has water</strong> — nothing to do.'),
      rawValue: null, rawSuffix: fmtWhen(ev.ts), cls: ev.tankEmpty ? 'bad' : '' }));
    var lw = lastWaterings(1)[0];
    cards.push(metricCard({ id: 'watered', visual: '<span class="metric-icon-lg">' + ICONS.chart + '</span>',
      sentence: lw ? 'Last watering: <strong>' + (lw.waterSec || 0) + ' s</strong> ' + fmtWhen(lw.ts) + ' · <strong>' + fmtNum(lw.mlEst, 0) + ' ml</strong><span class="est-tag">ESTIMATE</span> from pump runtime.' : 'No watering recorded yet.',
      rawValue: null, rawSuffix: 'scale delta: device log only — not saved to history yet', cls: 'warn' }));
    cards.push(metricCard({ id: 'camera', visual: '<span class="metric-icon-lg">' + ICONS.camera + '</span>',
      sentence: cam.ageMs === null ? 'No photos yet — the pot will add them once the camera runs.' : 'Last photo ' + fmtAge(cam.ageMs) + ' ago.',
      rawValue: null, rawSuffix: 'camera is wired — there is no battery to watch', cls: cam.quiet ? 'warn' : '' }));

    grid.innerHTML = cards.join('');
    Array.prototype.forEach.call(grid.querySelectorAll('[data-count-to]'), function (el) {
      var to = el.getAttribute('data-count-to');
      if (to !== '') setRawValue(el, Number(to), Number(el.getAttribute('data-count-dec') || 0));
    });
    $('vitals-hint').textContent = 'one sentence per reading';
  }

  /* --------------------------------------------------------------- timeline */
  function timelineEntries() {
    var out = [];
    state.events.forEach(function (e) {
      if (!e.ts) return;
      if (e.watered) out.push({ ts: e.ts, icon: 'drop', cls: '', text: 'Watered for <strong>' + (e.waterSec || 0) + ' s</strong> (~' + fmtNum(e.mlEst, 0) + ' ml estimated from runtime).' });
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
  function renderTimeline() {
    var entries = timelineEntries();
    var show = state.timelineExpanded ? entries : entries.slice(0, 8);
    $('timeline').innerHTML = entries.length ? show.map(function (t) {
      return '<li class="reveal"><span class="tl-icon ' + (t.cls || '') + '">' + (ICONS[t.icon] || ICONS.bell) + '</span>' +
        '<div class="tl-text">' + t.text + '<span class="tl-when">' + escapeHtml(fmtWhen(t.ts)) + '</span></div></li>';
    }).join('') : '<li class="empty">Nothing has happened yet.</li>';
    var more = $('timeline-more');
    more.hidden = entries.length <= 8 || state.timelineExpanded;
    $('timeline-hint').textContent = entries.length ? entries.length + ' moments' : '';
    observeReveals();
  }

  /* ----------------------------------------------------------------- charts */
  function rangeEvents() {
    var r = RANGES.filter(function (x) { return x.id === state.range; })[0] || RANGES[1];
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
  function chartCard(metric, evs) {
    var pts = evs.filter(function (e) { return e[metric.id] !== null && e[metric.id] !== undefined; });
    var card = document.createElement('div');
    card.className = 'chart-card reveal';
    card.setAttribute('data-metric', metric.id);
    if (pts.length < 2) {
      card.innerHTML = '<div class="chart-head"><span class="chart-title">' + escapeHtml(metric.label) + '</span></div><p class="empty">Not enough readings in this range yet.</p>';
      return card;
    }
    var W = 900, H = 300, padL = 52, padR = 14, padT = 16, padB = 30;
    var t0 = pts[0].ts.getTime(), t1 = pts[pts.length - 1].ts.getTime(), span = t1 - t0 || 1;
    var vals = pts.map(function (e) { return e[metric.id]; });
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
    parts.push('<defs><linearGradient id="grad-' + metric.id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.32"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/></linearGradient></defs>');
    [0, 0.5, 1].forEach(function (f) {
      var gv = min + f * (max - min), gy = y(gv);
      parts.push('<line class="grid-line" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"/>');
      parts.push('<text x="' + (padL - 8) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(fmtNum(gv, metric.decimals)) + '</text>');
    });
    parts.push('<text x="' + padL + '" y="' + (H - 8) + '">' + escapeHtml(fmtDay(new Date(t0)) + ' ' + fmtClock(new Date(t0))) + '</text>');
    parts.push('<text x="' + (W - padR) + '" y="' + (H - 8) + '" text-anchor="end">' + escapeHtml(fmtDay(new Date(t1)) + ' ' + fmtClock(new Date(t1))) + '</text>');
    segments.forEach(function (seg) {
      if (seg.length < 1) return;
      var sp = seg.map(function (e) { var p = [x(e.ts.getTime()), y(e[metric.id])]; return p; });
      if (sp.length > 1) {
        var line = smoothPath(sp);
        var area = 'M' + padL + ',' + (H - padB) + ' L' + line.slice(1) + ' L' + sp[sp.length - 1][0].toFixed(1) + ',' + (H - padB) + ' Z';
        parts.push('<path class="series-area" d="' + area + '" fill="url(#grad-' + metric.id + ')"/>');
        parts.push('<path class="series-line" d="' + line + '"/>');
      }
    });
    var gapCount = 0;
    for (var k = 1; k < pts.length; k++) {
      if (pts[k].ts.getTime() - pts[k - 1].ts.getTime() > gapMs) {
        gapCount++;
        var gx = (x(pts[k - 1].ts.getTime()) + x(pts[k].ts.getTime())) / 2;
        parts.push('<rect class="gap-badge" x="' + (gx - 16).toFixed(1) + '" y="' + padT + '" width="32" height="16" rx="8"/>');
        parts.push('<text x="' + gx.toFixed(1) + '" y="' + (padT + 11.5) + '" text-anchor="middle">gap</text>');
      }
    }
    pts.forEach(function (e) {
      var cx = x(e.ts.getTime());
      if (e.watered) parts.push('<rect x="' + (cx - 3).toFixed(1) + '" y="' + (H - padB - 4) + '" width="6" height="6" fill="var(--info)"/>');
      if (e.heater) parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + (H - padB - 10) + '" r="3.4" fill="var(--warn)"/>');
      if (e.tankEmpty === true) parts.push('<path d="M' + (cx - 4).toFixed(1) + ' ' + (H - padB - 16) + ' l8 8 M' + (cx + 4).toFixed(1) + ' ' + (H - padB - 16) + ' l-8 8" stroke="var(--bad)" stroke-width="2.4"/>');
    });
    var last = pts[pts.length - 1];
    card.innerHTML = '<div class="chart-head"><span class="chart-title">' + escapeHtml(metric.label) + '</span><span class="chart-now">now ' + escapeHtml(fmtNum(last[metric.id], metric.decimals)) + ' ' + escapeHtml(metric.unit) + '</span></div>' +
      '<div class="chart-wrap"><svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeHtml(metric.label) + ' over time' + (gapCount ? ' with ' + gapCount + ' data gap' + (gapCount > 1 ? 's' : '') : '') + '"></svg><div class="chart-tip" hidden></div></div>';
    card.querySelector('.chart').innerHTML = parts.join('');
    // Draw-in lengths + pointer tooltips
    Array.prototype.forEach.call(card.querySelectorAll('.series-line'), function (p) {
      try { p.style.setProperty('--draw', String(p.getTotalLength())); } catch (err) { }
    });
    var svg = card.querySelector('.chart');
    var tip = card.querySelector('.chart-tip');
    function showTip(clientX) {
      var rect = svg.getBoundingClientRect();
      var px = ((clientX - rect.left) / rect.width) * W;
      var nearest = pts[0], best = Infinity;
      pts.forEach(function (e) { var d = Math.abs(x(e.ts.getTime()) - px); if (d < best) { best = d; nearest = e; } });
      tip.hidden = false;
      tip.innerHTML = escapeHtml(fmtNum(nearest[metric.id], metric.decimals)) + ' ' + escapeHtml(metric.unit) + ' · ' + escapeHtml(fmtWhen(nearest.ts));
      tip.style.left = ((x(nearest.ts.getTime()) / W) * rect.width) + 'px';
      tip.style.top = ((y(nearest[metric.id]) / H) * rect.height) + 'px';
    }
    svg.addEventListener('pointermove', function (ev) { showTip(ev.clientX); });
    svg.addEventListener('pointerdown', function (ev) { showTip(ev.clientX); });
    svg.addEventListener('pointerleave', function () { tip.hidden = true; });
    return card;
  }
  function renderHistory() {
    var ranges = $('range-select');
    if (!ranges.children.length) {
      ranges.innerHTML = RANGES.map(function (r) { return '<button type="button" data-range="' + r.id + '" aria-pressed="' + (state.range === r.id) + '">' + r.label + '</button>'; }).join('');
      ranges.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-range]'); if (!b) return;
        state.range = b.getAttribute('data-range'); renderHistory();
      });
    } else {
      Array.prototype.forEach.call(ranges.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-range') === state.range)); });
    }
    var evs = rangeEvents();
    var chartMetrics = METRICS.filter(function (m) { return m.chart; });
    var visible = state.chartsExpanded ? chartMetrics : chartMetrics.slice(0, 3);
    var host = $('charts');
    host.innerHTML = '';
    visible.forEach(function (m) { host.appendChild(chartCard(m, evs)); });
    var more = $('charts-more');
    more.hidden = state.chartsExpanded || chartMetrics.length <= 3;
    $('history-hint').textContent = evs.length ? evs.length + ' readings in view' : 'no readings in this range';
    renderWateringSummary();
    observeReveals();
  }
  function renderWateringSummary() {
    var list = lastWaterings(4);
    var el = $('watering-summary');
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = list.map(function (e) {
      return '<div class="watering-row">' +
        '<span class="v">' + escapeHtml(fmtWhen(e.ts)) + ' · ' + (e.waterSec === null ? '?' : e.waterSec + ' s') + ' · ~' + fmtNum(e.mlEst, 0) + ' ml<span class="est-tag">ESTIMATE</span></span>' +
        '<span class="v device-only">Scale delta: device log only — not saved to history yet</span></div>';
    }).join('');
  }

  /* ----------------------------------------------------------------- photos */
  function emptyState(artKey, msg) { return '<div class="media-state"><span class="art" data-art="' + artKey + '" aria-hidden="true"></span><span>' + msg + '</span></div>'; }
  function renderPhotos() {
    var cam = cameraStatus();
    $('photos-hint').textContent = state.images.length ? 'last ' + (cam.ageMs === null ? 'unknown' : fmtAge(cam.ageMs) + ' ago') : 'none yet';
    var filters = $('image-filter');
    if (!filters.children.length) {
      filters.innerHTML = ['all', 'daily', 'scan'].map(function (f) { return '<button type="button" data-filter="' + f + '" aria-pressed="' + (state.imageFilter === f) + '">' + (f === 'all' ? 'All' : f === 'daily' ? 'Daily' : 'Scans') + '</button>'; }).join('');
      filters.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-filter]'); if (!b) return;
        state.imageFilter = b.getAttribute('data-filter'); renderPhotos();
      });
    } else {
      Array.prototype.forEach.call(filters.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === state.imageFilter)); });
    }
    var list = state.images.filter(function (i) { return state.imageFilter === 'all' || i.kind === state.imageFilter; });
    var latest = list[0];
    var el = $('latest-image');
    if (!latest) {
      el.innerHTML = '<div class="latest-media">' + emptyState('images', 'No photos yet — when the camera takes its first picture it will appear here. Nothing is faked.') + '</div>' +
        '<div class="latest-meta"><h3>Latest photo</h3><p class="muted">Photos arrive through the daily and weekly capture jobs; until then this stays empty on purpose.</p></div>';
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
        driveMeta(latest.id).then(function (meta) {
          if (meta && meta.imageMediaMetadata && meta.imageMediaMetadata.width) {
            var p = document.createElement('p');
            p.className = 'muted small';
            p.textContent = 'Drive: ' + meta.imageMediaMetadata.width + '×' + meta.imageMediaMetadata.height + (meta.createdTime ? ' · added ' + fmtWhen(parseDate(meta.createdTime)) : '');
            el.querySelector('.latest-meta').appendChild(p);
          }
        });
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
    hydrateArt(el);
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
      $('viewer-meta').textContent = item.label + ' · ' + fmtWhen(item.ts) + (item.verdict ? ' · verdict: ' + item.verdict : '');
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

  /* ---------------------------------------------------- notes & alerts */
  function renderNotifications() {
    var sev = $('severity-filter');
    if (!sev.children.length) {
      sev.innerHTML = '<button type="button" data-sev="all" aria-pressed="true">All</button>' + SEVERITY.map(function (s) { return '<button type="button" data-sev="' + s.id + '" aria-pressed="false">' + s.label + '</button>'; }).join('');
      sev.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-sev]'); if (!b) return;
        state.severityFilter = b.getAttribute('data-sev'); renderNotifications();
      });
      $('status-filter').addEventListener('change', function () { state.statusFilter = $('status-filter').value; renderNotifications(); });
    }
    Array.prototype.forEach.call(sev.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sev') === state.severityFilter)); });
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
    var pending = pendingNotifications();
    var badge = $('pending-count');
    badge.hidden = pending.length === 0;
    badge.textContent = pending.length + ' waiting on you';
    $('notes-hint').textContent = pending.length ? pending.length + ' waiting' : state.notifications.length + ' notes';
    if (!items.length) {
      $('notification-list').innerHTML = state.notifications.length
        ? '<p class="empty">No notes match this filter.</p>'
        : '<div class="media-state"><span class="art" data-art="notifications" aria-hidden="true"></span><span>Nothing needs you right now — alerts and questions will land here.</span></div>';
      hydrateArt($('notification-list'));
      return;
    }
    $('notification-list').innerHTML = items.map(function (n) {
      var actions = n.status === 'pending' && n.options.length ? n.options.map(function (opt) {
        return '<button type="button" class="btn btn-answer" data-label="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
      }).join('') : '';
      var feedback = n.status === 'pending'
        ? '<input class="notif-comment" type="text" placeholder="optional comment / correction"><div class="notif-feedback" hidden></div>'
        : (n.response ? '<div class="notif-meta"><span>your answer: ' + escapeHtml(n.response) + '</span></div>' : '');
      return '<article class="notif sev-' + n.severity + '" data-row="' + n._row + '">' +
        '<div class="notif-head"><span class="notif-type">' + escapeHtml(n.type || 'note') + '</span>' +
        '<span class="notif-meta"><span>' + escapeHtml(fmtWhen(n.ts)) + '</span><span>' + escapeHtml(n.status || '—') + '</span>' + (n.severity === 'legacy' ? '<span>legacy</span>' : '') + '</span></div>' +
        '<div class="notif-title">' + escapeHtml(n.title) + '</div><div class="notif-msg">' + escapeHtml(n.message) + '</div>' +
        (actions ? '<div class="notif-actions">' + actions + '</div>' : '') + feedback +
        '<details><summary>Raw row (debug)</summary><pre>' + escapeHtml(JSON.stringify(n.raw, null, 1)) + '</pre></details></article>';
    }).join('');
  }
  function renderNotes() {
    var ev = latestEvent();
    if (ev) {
      var bits = [];
      if (ev.reasoning) bits.push('<div><strong>Why the last decision:</strong> ' + escapeHtml(ev.reasoning) + '</div>');
      if (ev.aiNotes) bits.push('<div><strong>AI note:</strong> ' + escapeHtml(ev.aiNotes) + '</div>');
      if (!bits.length) bits.push('<span class="muted">The latest event has no saved AI text.</span>');
      $('latest-decision').innerHTML = '<span class="ai-badge">SAVED AI OUTPUT</span> ' + escapeHtml(fmtWhen(ev.ts)) + bits.join('');
    } else {
      $('latest-decision').innerHTML = '<span class="muted">Nothing saved yet.</span>';
    }
    var notes = state.notes.slice(-(LIM.notes || 80)).reverse();
    $('notes-list').innerHTML = notes.length ? notes.map(function (n) {
      return '<div class="note"><div class="note-head"><span>' + escapeHtml(n.agent || 'agent') + ' · ' + escapeHtml(fmtWhen(parseDate(n.timestamp))) + '</span><span>' + escapeHtml(String(n.context_ref || '').slice(0, 24)) + '</span></div>' + escapeHtml(n.note || '') + '</div>';
    }).join('') + '<p class="muted small">AgentNotes are past guesses — unverified, never ground truth.</p>' : '<p class="empty">No AI notes yet.</p>';
  }
  function callResume(url, label, comment) {
    if (!url || !/^https?:\/\//i.test(url)) return Promise.resolve(false);
    var target;
    try { target = new URL(url); target.searchParams.set('response', label); if (comment) target.searchParams.set('comment', comment); } catch (err) { return Promise.resolve(false); }
    return fetch(target.toString(), { mode: 'cors' }).then(function () { return true; })
      .catch(function () { return fetch(target.toString(), { mode: 'no-cors' }).then(function () { return true; }).catch(function () { return false; }); });
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
        renderNotifications();
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
  function toast(severity, title, message) {
    var wrap = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast sev-' + severity;
    el.innerHTML = '<button type="button" aria-label="Dismiss">✕</button><div class="t-title">' + escapeHtml(title) + '</div><div>' + escapeHtml(message) + '</div>';
    el.querySelector('button').addEventListener('click', function () { el.remove(); });
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 15000);
  }

  /* --------------------------------------------------------------- settings */
  function renderSettings() {
    var kv = [
      ['Dry-run', cfgValue('dry_run_mode', '—')],
      ['Max water temp (policy)', cfgValue('max_water_temp_c', '—') + ' °C'],
      ['Max pump run', cfgValue('max_pump_seconds', '—') + ' s'],
      ['Min re-water gap', cfgValue('min_rewater_interval_hours', '—') + ' h'],
      ['Preheat margin', cfgValue('preheat_margin_c', '—') + ' °C'],
      ['Preheat lead', cfgValue('preheat_lead_minutes', '—') + ' min'],
      ['Heater firmware cutoff', '40.0 °C'], ['Heater firmware refuse', '≥ 39.5 °C'], ['Actuator hard cap', '120 s'],
      ['Flash dark threshold', cfgValue('flash_dark_threshold', '—')],
      ['Last light reading', cfgValue('last_lightlevel', '—') + ' · ' + fmtWhen(parseDate(cfgValue('last_lightlevel_utc', '')))],
      ['Next sunrise', fmtWhen(parseDate(cfgValue('next_sunrise_utc', '')))],
      ['Next sunset', fmtWhen(parseDate(cfgValue('next_sunset_utc', '')))],
      ['Scan session', bool(cfgValue('scan_session_active', 'false')) ? 'active' : 'idle'],
      ['Location', cfgValue('pot_latitude', '—') + ', ' + cfgValue('pot_longitude', '—')],
      ['Species on record', cfgValue('last_species_guess', '—')],
      ['Perenual reference', cfgValue('perenual_status', 'not seeded')]
    ];
    $('system-grid').innerHTML = kv.map(function (r) {
      return '<div class="kv-cell"><span class="k">' + escapeHtml(r[0]) + '</span><b>' + escapeHtml(String(r[1])) + '</b></div>';
    }).join('');
  }

  /* ------------------------------------------------------------------ wiring */
  function bind() {
    $('connect-btn').addEventListener('click', requestSignIn);
    $('signin-btn').addEventListener('click', requestSignIn);
    $('refresh-btn').addEventListener('click', loadAll);
    $('sheet-mode-exit').addEventListener('click', exitSheetMode);
    $('notification-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('.btn-answer'); if (!btn) return;
      respondToNotification(btn.closest('.notif'), btn.getAttribute('data-label'));
    });
    $('charts-more').addEventListener('click', function () { state.chartsExpanded = true; renderHistory(); });
    $('timeline-more').addEventListener('click', function () { state.timelineExpanded = true; renderTimeline(); });
    document.addEventListener('click', function (ev) {
      var closer = ev.target.closest ? ev.target.closest('[data-action="close-viewer"]') : null;
      if (closer) { closeViewer(); return; }
      if (ev.target === $('viewer')) closeViewer();
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !$('viewer').hidden) closeViewer(); });
  }
  function start() {
    state.sheetId = resolveSheetId();
    renderSheetBanner();
    paintIcons();
    if (!restoreToken()) $('signin-panel').hidden = false;
    bind();
    initAuth();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
