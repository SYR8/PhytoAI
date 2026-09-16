/* PhytoAI dashboard application.
 *
 * Data contract: docs/dashboard-data-contract-audit.md
 * - Reads ONLY Google Sheets values + Drive file metadata/media with the user's OAuth token.
 * - Never invents endpoints, fields, history, image URLs, health scores, or AI conclusions.
 * - ml_est is always labelled an estimate; measured wt_delta_g is shown as "not persisted".
 * - Camera is wired-only: no battery UI anywhere.
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

  /* Presentation themes: palettes live in styles.css ([data-theme]); these
   * values are labels + species hints only. Never safety data. */
  var THEMES = {
    botanical: { label: 'Botanical', tagline: 'Calm care console', hints: [] },
    monstera: { label: 'Monstera', tagline: 'Tropical statement foliage', hints: ['monstera'] },
    pothos: { label: 'Pothos', tagline: 'Trailing evergreen', hints: ['pothos', 'epipremnum'] },
    rose: { label: 'Rose', tagline: 'Blooming care', hints: ['rose', 'rosa'] },
    succulent: { label: 'Succulent', tagline: 'Dry-adapted resilience', hints: ['succulent', 'echeveria', 'aloe', 'cactus', 'crassula', 'sedum'] },
    citrus: { label: 'Citrus', tagline: 'Bright fruiting', hints: ['citrus', 'lemon', 'orange', 'lime'] },
    fern: { label: 'Fern', tagline: 'Shade-loving fronds', hints: ['fern', 'nephrolepis', 'asplenium'] }
  };

  var METRICS = [
    { id: 'WeightGrams', field: 'weight', label: 'Gross weight (g)', unit: 'g', decimals: 1 },
    { id: 'MoisturePercent', field: 'moisture', label: 'Soil moisture (%)', unit: '%', decimals: 0 },
    { id: 'SoilTempC', field: 'soilC', label: 'Soil temp (°C)', unit: '°C', decimals: 1 },
    { id: 'WaterTempC', field: 'waterC', label: 'Water temp (°C)', unit: '°C', decimals: 1 },
    { id: 'AirTempC', field: 'airC', label: 'Air temp (°C)', unit: '°C', decimals: 1 },
    { id: 'AirHumidityPercent', field: 'hum', label: 'Humidity (%)', unit: '%', decimals: 0 },
    { id: 'LightLevel', field: 'light', label: 'Light (raw LDR)', unit: 'raw', decimals: 0 }
  ];

  var RANGES = [
    { id: '24h', label: '24 h', ms: 24 * 3600e3 },
    { id: '7d', label: '7 days', ms: 7 * 86400e3 },
    { id: '30d', label: '30 days', ms: 30 * 86400e3 },
    { id: 'all', label: 'All', ms: 0 }
  ];

  var SEVERITY = [
    { id: 'critical', label: 'Critical' },
    { id: 'warning', label: 'Warning' },
    { id: 'info', label: 'Info' }
  ];

  var SEVERITY_BY_TYPE = {
    alert_tank_empty: 'critical',
    alert_anomaly: 'warning',
    scan_verdict: 'warning',
    alert_battery_low: 'warning',
    scan_scheduled: 'info',
    scan_postponed: 'info',
    scan_followup: 'info',
    watering_feedback: 'info',
    smoke_test: 'info'
  };
  var LEGACY_TYPES = { alert_battery_low: true, scan_position: true };

  var state = {
    token: null,
    tokenExpiry: 0,
    tokenClient: null,
    sheetId: null,          // resolved per precedence: URL ?sheet > localStorage > config.js
    cfg: {},
    events: [],
    notifications: [],
    scans: [],
    notes: [],
    images: [],
    media: {},
    meta: {},
    theme: 'botanical',
    range: '7d',
    metric: 'WeightGrams',
    imageFilter: 'all',
    severityFilter: 'all',
    statusFilter: 'all',
    loadErrors: []
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------------ utils */
  function escapeHtml(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function short(v, len) {
    var s = String(v === undefined || v === null ? '' : v);
    return s.length > len ? s.slice(0, len - 1) + '…' : s;
  }
  function num(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function bool(v) { return String(v).trim().toLowerCase() === 'true'; }
  function parseDate(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    var d = new Date(String(v).trim());
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtTime(d) { return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  function fmtAge(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    var s = Math.round(ms / 1000);
    if (s < 90) return s + ' s ago';
    var m = Math.round(s / 60);
    if (m < 120) return m + ' min ago';
    var h = Math.round(m / 60 * 10) / 10;
    if (h < 72) return h + ' h ago';
    return Math.round(h / 24) + ' days ago';
  }
  function fmtNum(v, dec) { return v === null || v === undefined || isNaN(v) ? '—' : Number(v).toFixed(dec); }
  function colLetter(index) {
    var n = index + 1, s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }
  function toRecords(values) {
    if (!values || !values.length) return [];
    var head = values[0];
    return values.slice(1).map(function (row, i) {
      var rec = { _row: i + 2 };
      head.forEach(function (h, j) { rec[h] = row[j] === undefined ? '' : row[j]; });
      return rec;
    });
  }
  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* ------------------------------------------------------------------ banner/toasts */
  function showBanner(message, kind) {
    var el = $('banner');
    if (!message) { el.hidden = true; el.textContent = ''; el.className = 'banner'; return; }
    el.hidden = false;
    el.className = 'banner' + (kind ? ' ' + kind : '');
    el.textContent = message;
  }
  function toast(severity, title, message) {
    var wrap = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast sev-' + severity;
    el.innerHTML = '<button aria-label="Dismiss">✕</button><div class="t-title">' + escapeHtml(title) + '</div><div>' + escapeHtml(message) + '</div>';
    el.querySelector('button').addEventListener('click', function () { el.remove(); });
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 15000);
  }

  /* ------------------------------------------------------------------ auth */
  function setAuthUi() {
    var connected = !!state.token;
    $('connect-btn').hidden = connected;
    $('refresh-btn').hidden = !connected;
    var panel = $('signin-panel');
    if (panel) panel.hidden = connected;      // auth is mandatory; the panel never pretends otherwise
    var el = $('auth-status');
    el.textContent = connected ? 'Google connected' : 'Not connected';
    el.className = 'auth-status ' + (connected ? 'ok' : 'warn');
  }
  function loginHint() {
    return String(CFG.GOOGLE_LOGIN_HINT || '').trim();
  }
  function requestSignIn() {
    if (!state.tokenClient) { initAuth(); return; }
    var req = { prompt: '' };                 // prompt:'' keeps the normal chooser flow — no forced account
    var hint = loginHint();
    if (hint) req.hint = hint;                // GIS merges request overrides with the init config (verified)
    state.tokenClient.requestAccessToken(req);
  }
  function authHeaders() { return { Authorization: 'Bearer ' + state.token }; }

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
      if ((attempt || 0) < 20) {
        $('auth-status').textContent = 'Loading Google sign-in…';
        setTimeout(function () { initAuth((attempt || 0) + 1); }, 300);
        return;
      }
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
          showBanner('Google sign-in failed. Check the OAuth client ID and the authorized JavaScript origins (EdgeOne domain, HTTPS).', 'error');
        }
      },
      error_callback: function (err) {
        // Authentication errors are never hidden.
        showBanner('Google sign-in error (' + ((err && (err.type || err.message)) || 'unknown') + '). Check the OAuth client ID, the authorized JavaScript origin https://phytoai.edgeone.dev, and that access was granted.', 'error');
      }
    };
    var hint = loginHint();
    if (hint) tokenClientCfg.hint = hint;    // login suggestion only; the account chooser still decides
    state.tokenClient = google.accounts.oauth2.initTokenClient(tokenClientCfg);
    if (restoreToken()) { setAuthUi(); loadAll(); } else { $('connect-btn').hidden = false; }
  }

  /* ------------------------------------------------------------------ data access */
  function sheetsGet(range) {
    var url = SHEETS + encodeURIComponent(state.sheetId) + '/values/' + encodeURIComponent(range) + '?majorDimension=ROWS';
    return fetch(url, { headers: authHeaders() }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('Sheets ' + range + ' → ' + res.status + ' ' + short(t, 120)); });
      return res.json().then(function (d) { return d.values || []; });
    });
  }
  function sheetsUpdate(range, values) {
    var url = SHEETS + encodeURIComponent(state.sheetId) + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED';
    return fetch(url, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ range: range, majorDimension: 'ROWS', values: values })
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('Sheets write → ' + res.status + ': ' + short(t, 120)); });
      return res.json();
    });
  }
  function driveMeta(id) {
    if (state.meta[id]) return Promise.resolve(state.meta[id]);
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

  function loadAll() {
    if (!state.token) return;
    showBanner('Loading…');
    state.loadErrors = [];
    var jobs = [
      ['cfg', 'SystemConfig!A1:C'],
      ['events', 'Events!A1:Y'],
      ['notifications', 'Notifications!A1:I'],
      ['scans', 'DiseaseScans!A1:J'],
      ['notes', 'AgentNotes!A1:E']
    ].map(function (j) {
      return sheetsGet(j[1]).then(function (values) {
        if (j[0] === 'events') state.events = toRecords(values).map(normalizeEvent);
        else if (j[0] === 'notifications') state.notifications = toRecords(values).map(normalizeNotification);
        else if (j[0] === 'scans') state.scans = toRecords(values);
        else if (j[0] === 'notes') state.notes = toRecords(values);
        else {
          state.cfg = {};
          toRecords(values).forEach(function (row) {
            var k = String(row.Key === undefined ? '' : row.Key).trim();
            if (k) state.cfg[k] = row.Value;
          });
        }
      }).catch(function (err) { state.loadErrors.push(err.message); });
    });
    Promise.all(jobs).then(function () {
      if (state.loadErrors.length) showBanner('Some data failed to load: ' + state.loadErrors.join(' · '), 'warn');
      else showBanner('');
      buildDerived();
      renderAll();
    });
  }

  /* ------------------------------------------------------------- normalization */
  function normalizeEvent(row) {
    var ts = parseDate(row.Timestamp);
    var e = {
      raw: row, row: row._row,
      ts: ts,
      type: String(row.EventType || '').trim(),
      moisture: num(row.MoisturePercent),
      soilC: num(row.SoilTempC),
      waterC: num(row.WaterTempC),
      airC: num(row.AirTempC),
      hum: num(row.AirHumidityPercent),
      weight: num(row.WeightGrams),
      light: num(row.LightLevel),
      tankEmpty: String(row.TankEmpty).trim() === '' ? null : bool(row.TankEmpty),
      watered: bool(row.WateringTriggered),
      waterSec: num(row.WaterDurationSeconds),
      heater: bool(row.HeaterUsed),
      heaterSec: num(row.HeaterDurationSeconds),
      species: String(row.SpeciesGuess || '').trim(),
      speciesConf: num(row.SpeciesConfidence),
      photoId: String(row.PhotoFileID || '').trim(),
      anomaly: bool(row.AnomalyDetected),
      anomalyText: String(row.AnomalyDescription || '').trim(),
      aiNotes: String(row.AI_Notes || '').trim(),
      reasoning: String(row.ReasoningSummary || '').trim(),
      mlEst: null
    };
    if (e.watered && e.waterSec !== null) e.mlEst = e.waterSec * flowMlPerSec();
    return e;
  }
  function flowMlPerSec() {
    var fromCfg = num(state.cfg['pump_flow_ml_per_sec']);
    return fromCfg !== null && fromCfg > 0 ? fromCfg : Number(CFG.pumpFlowMlPerSec || 0);
  }
  function normalizeNotification(row) {
    var type = String(row.type || '').trim();
    var severity = LEGACY_TYPES[type] ? 'legacy' : (SEVERITY_BY_TYPE[type] || 'info');
    var options = [];
    try { options = JSON.parse(row.response_options || '[]').map(String); } catch (err) { options = []; }
    return {
      raw: row, row: row._row, ts: parseDate(row.timestamp), type: type,
      severity: severity, title: String(row.title || '').trim(), message: String(row.message || '').trim(),
      options: options, status: String(row.status || '').trim().toLowerCase(),
      response: String(row.response || '').trim(), resumeUrl: String(row.resume_url || '').trim(),
      contextRef: String(row.context_ref || '').trim()
    };
  }

  /* ------------------------------------------------------------- derivations */
  function latestEvent() {
    var out = null;
    state.events.forEach(function (e) { if (e.ts && (!out || e.ts > out.ts)) out = e; });
    return out;
  }
  function newestEventTs() { var e = latestEvent(); return e ? e.ts : null; }
  function pendingNotifications() {
    return state.notifications.filter(function (n) { return n.status === 'pending'; });
  }
  function deriveImages() {
    var imgs = [];
    state.events.forEach(function (e) {
      if (e.photoId) imgs.push({ id: e.photoId, kind: 'daily', label: 'Daily photo', ts: e.ts, event: e, species: e.species, light: e.light, aiNotes: e.aiNotes, anomalyText: e.anomalyText });
    });
    state.scans.forEach(function (s) {
      var id = driveIdFromLink(s.drive_links);
      if (!id) return;
      imgs.push({
        id: id, kind: 'scan', label: 'Disease scan', ts: parseDate(s.timestamp), scan: s,
        species: '', light: null, aiNotes: String(s.ai_notes || '').trim(),
        verdict: String(s.judge_verdict || '').trim()
      });
    });
    imgs.sort(function (a, b) { return (b.ts ? b.ts.getTime() : 0) - (a.ts ? a.ts.getTime() : 0); });
    state.images = imgs;
  }
  function driveIdFromLink(link) {
    var m = String(link || '').match(/\/d\/([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    m = String(link || '').match(/^[A-Za-z0-9_-]{20,}$/);
    return m ? m[0] : '';
  }
  function buildDerived() {
    deriveImages();
    var species = cfgValue('last_species_guess', latestEvent() ? latestEvent().species : '') || 'unknown';
    state.theme = pickTheme(species);
    applyTheme(state.theme);
  }
  function pickTheme(species) {
    var explicit = (CFG.profile && CFG.profile.theme) || cfgValue('plant_theme', '');
    if (explicit && THEMES[explicit]) return explicit;
    var s = String(species || '').toLowerCase();
    var match = 'botanical';
    Object.keys(THEMES).forEach(function (id) {
      THEMES[id].hints.forEach(function (h) { if (s.indexOf(h) >= 0 && match === 'botanical') match = id; });
    });
    return match;
  }
  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
  }
  function cfgValue(key, fallback) {
    var v = state.cfg[key];
    return v === undefined || v === null || String(v).trim() === '' ? fallback : v;
  }
  function plantIdentity() {
    var species = cfgValue('last_species_guess', latestEvent() ? latestEvent().species : '') || 'unknown';
    var conf = cfgValue('species_confidence', '');
    return {
      name: (CFG.profile && CFG.profile.name) || cfgValue('plant_name', '') || 'This plant',
      species: species,
      variety: (CFG.profile && CFG.profile.variety) || cfgValue('plant_variety', ''),
      type: (CFG.profile && CFG.profile.type) || cfgValue('plant_type', ''),
      confidence: conf === '' ? null : num(conf),
      theme: state.theme
    };
  }
  function derivedWarnings() {
    var out = [];
    var dry = bool(cfgValue('dry_run_mode', 'true'));
    if (dry) out.push({ severity: 'info', title: 'Dry-run mode is ON', text: 'Commands are simulated; no pump or heater actuation happens.' });
    var ev = latestEvent();
    if (!ev) {
      out.push({ severity: 'warning', title: 'No persisted events', text: 'The dashboard has no event rows yet — all history and status panels stay empty until the workflow runs.' });
      return out;
    }
    var ageMs = Date.now() - ev.ts.getTime();
    if (ageMs > (CFG.staleAfterMinutes || 840) * 60000) {
      out.push({ severity: 'warning', title: 'Stale data', text: 'Newest event is ' + fmtAge(ageMs) + ' old (expected within about one sun-event cycle). Treat live values as last-known.' });
    }
    if (ev.tankEmpty === true) out.push({ severity: 'critical', title: 'Tank empty', text: 'The tank sensor reports empty — watering is blocked until refilled.' });
    var missing = [];
    if (ev.moisture === null) missing.push('soil moisture');
    if (ev.soilC === null) missing.push('soil temperature');
    if (ev.waterC === null) missing.push('water temperature');
    if (ev.airC === null) missing.push('air temperature');
    if (ev.hum === null) missing.push('humidity');
    if (ev.weight === null) missing.push('weight');
    if (missing.length) out.push({ severity: 'warning', title: 'Invalid or missing sensor readings', text: 'Latest event lacks: ' + missing.join(', ') + '. The WROOM blocks actuation on invalid safety state.' });
    pendingNotifications().forEach(function (n) {
      if (n.severity === 'critical') out.push({ severity: 'critical', title: n.title || n.type, text: n.message || 'Pending notification requires attention.' });
    });
    var cam = cameraStatus();
    if (cam.quiet) out.push({ severity: 'warning', title: 'Camera quiet', text: 'No image since ' + fmtAge(cam.ageMs) + ' — expected within ' + Math.round((CFG.cameraQuietAfterMinutes || 2160) / 60) + ' h when scans/photos run.' });
    return out;
  }
  function cameraStatus() {
    var newest = state.images.length ? state.images[0] : null;
    if (!newest || !newest.ts) return { quiet: state.images.length === 0, ageMs: null, label: state.images.length ? 'timestamp unavailable' : 'no images yet' };
    var ageMs = Date.now() - newest.ts.getTime();
    return { quiet: ageMs > (CFG.cameraQuietAfterMinutes || 2160) * 60000, ageMs: ageMs, label: fmtAge(ageMs) };
  }

  /* ------------------------------------------------------------------ render */
  function renderAll() {
    renderChrome();
    renderPlantCard();
    renderSummary();
    renderWarnings();
    renderMetrics();
    renderChartControls();
    renderChart();
    renderWateringSummary();
    renderImages();
    renderNotificationControls();
    renderNotifications();
    renderAi();
    renderEventsTable();
    renderSystem();
    renderToasts();
  }

  function renderChrome() {
    var dry = bool(cfgValue('dry_run_mode', 'true'));
    $('dryrun-pill').hidden = !dry;
    var ev = latestEvent();
    var stale = ev ? (Date.now() - ev.ts.getTime()) > (CFG.staleAfterMinutes || 840) * 60000 : true;
    $('stale-pill').hidden = !stale;
    $('status-updated').textContent = ev ? 'last data ' + fmtAge(Date.now() - ev.ts.getTime()) : 'no data yet';
    $('flow-note').textContent = flowMlPerSec().toFixed(3) + ' ml/s';
  }

  function renderPlantCard() {
    var p = plantIdentity();
    var t = THEMES[p.theme] || THEMES.botanical;
    $('plant-identity').textContent = p.name + (p.species && p.species !== 'unknown' ? ' · ' + p.species : '');
    var badges = [
      '<span class="tag accent">' + escapeHtml(t.label) + ' theme</span>',
      p.variety ? '<span class="tag">' + escapeHtml(p.variety) + '</span>' : '',
      p.type ? '<span class="tag">' + escapeHtml(p.type) + '</span>' : '',
      p.confidence !== null ? '<span class="tag">species confidence ' + (p.confidence <= 1 ? Math.round(p.confidence * 100) : Math.round(p.confidence)) + '%</span>' : ''
    ].filter(Boolean).join('');
    $('plant-card').innerHTML = '<div class="plant-name">' + escapeHtml(p.name) + '</div>' +
      '<div class="plant-line">' + escapeHtml(p.species) + (p.confidence !== null ? ' · confidence ' + (p.confidence <= 1 ? p.confidence : p.confidence / 100) : '') + '</div>' +
      '<div class="plant-line">' + escapeHtml(t.tagline) + '</div>' +
      '<div class="plant-badges">' + badges + '</div>';
  }

  function renderSummary() {
    var ev = latestEvent();
    var el = $('status-summary');
    if (!ev) { el.innerHTML = 'No persisted events yet. Connect and run the workflow to populate the console.'; return; }
    var parts = [];
    var ageMs = Date.now() - ev.ts.getTime();
    parts.push('<span class="hl">Last update</span> ' + fmtAge(ageMs) + ' (' + fmtTime(ev.ts) + ')');
    if (ev.moisture !== null) parts.push('soil moisture <span class="hl">' + fmtNum(ev.moisture, 0) + '%</span>');
    if (ev.waterC !== null) parts.push('water <span class="hl">' + fmtNum(ev.waterC, 1) + ' °C</span>');
    if (ev.weight !== null) parts.push('gross weight <span class="hl">' + fmtNum(ev.weight, 1) + ' g</span>');
    if (ev.tankEmpty !== null) parts.push(ev.tankEmpty ? '<span class="hl">tank EMPTY</span>' : 'tank OK');
    parts.push(ev.watered ? 'last event <span class="hl">watered</span> for ' + ev.waterSec + ' s' : 'last event <span class="hl">no watering</span>');
    var html = parts.join(' · ');
    var recentWater = lastWaterings(1)[0];
    if (recentWater && recentWater.ts) html += '<br>Last watering: ' + fmtTime(recentWater.ts) + ' · ' + (recentWater.waterSec || 0) + ' s commanded · ml_est ' + fmtNum(recentWater.mlEst, 0) + ' ml <span class="est-tag">ESTIMATE</span>';
    if (ev.reasoning) html += '<br><span class="muted">Latest decision note:</span> ' + escapeHtml(short(ev.reasoning, 220));
    $('status-summary').innerHTML = html;
  }

  function renderWarnings() {
    var items = derivedWarnings();
    $('warnings').innerHTML = items.map(function (w) {
      return '<div class="warning-chip ' + w.severity + '"><div><div class="w-title">' + escapeHtml(w.title) + '</div><div>' + escapeHtml(w.text) + '</div></div></div>';
    }).join('');
  }

  function metricCard(label, value, sub, cls, sparkSvg, stateOn) {
    return '<div class="metric ' + (cls || '') + '">' +
      (stateOn === undefined ? '' : '<span class="state-dot ' + (stateOn ? 'on' : '') + '"></span>') +
      '<div class="metric-label"><span>' + escapeHtml(label) + '</span></div>' +
      '<div class="metric-value">' + value + '</div>' +
      (sub ? '<div class="metric-sub">' + sub + '</div>' : '') +
      (sparkSvg || '') + '</div>';
  }
  function renderMetrics() {
    var ev = latestEvent();
    if (!ev) { $('overview-metrics').innerHTML = '<p class="empty">No events yet — metrics appear after the first persisted decision cycle.</p>'; return; }
    var conf = cfgValue('species_confidence', '');
    var evPrev = previousEvent(ev);
    var trendArrow = function (cur, prev, unit) {
      if (cur === null || !prev || prev === null) return '';
      var d = cur - prev;
      if (Math.abs(d) < 0.05) return 'stable';
      return (d > 0 ? '▲ +' : '▼ ') + fmtNum(d, 1) + ' ' + unit + ' vs prev';
    };
    var cards = [];
    cards.push(metricCard('Gross weight', ev.weight === null ? '—' : fmtNum(ev.weight, 1) + ' g', trendArrow(ev.weight, evPrev ? evPrev.weight : null, 'g'), '', sparkSvg('weight')));
    cards.push(metricCard('Soil moisture', ev.moisture === null ? '—' : fmtNum(ev.moisture, 0) + ' %', trendArrow(ev.moisture, evPrev ? evPrev.moisture : null, '%'), '', sparkSvg('moisture')));
    cards.push(metricCard('Soil temp', ev.soilC === null ? '—' : fmtNum(ev.soilC, 1) + ' °C', ''));
    cards.push(metricCard('Water temp', ev.waterC === null ? '—' : fmtNum(ev.waterC, 1) + ' °C', ''));
    cards.push(metricCard('Air temp', ev.airC === null ? '—' : fmtNum(ev.airC, 1) + ' °C', ''));
    cards.push(metricCard('Humidity', ev.hum === null ? '—' : fmtNum(ev.hum, 0) + ' %', ''));
    cards.push(metricCard('Light (raw)', ev.light === null ? '—' : fmtNum(ev.light, 0), 'digital LDR reading — semantics pending (Q22)'));
    cards.push(metricCard('Tank', ev.tankEmpty === null ? '—' : (ev.tankEmpty ? 'EMPTY' : 'OK'), '', ev.tankEmpty ? 'bad' : ''));
    cards.push(metricCard('Pump (last event)', ev.watered ? 'ON ' + (ev.waterSec || 0) + ' s' : 'idle', '', ''));
    cards.push(metricCard('Heater (last event)', ev.heater ? 'ON ' + (ev.heaterSec || 0) + ' s' : 'idle', '', ''));
    var ageMs = Date.now() - ev.ts.getTime();
    cards.push(metricCard('Data age', fmtAge(ageMs), 'persisted row time, not device capture time', ageMs > (CFG.staleAfterMinutes || 840) * 60000 ? 'warn' : ''));
    var cam = cameraStatus();
    cards.push(metricCard('Camera last-seen', cam.ageMs === null ? '—' : fmtAge(cam.ageMs), 'wired camera · latest image', cam.quiet ? 'warn' : ''));
    cards.push(metricCard('Dry-run', bool(cfgValue('dry_run_mode', 'true')) ? 'ON' : 'OFF', 'backend gate for all actuation'));
    $('overview-metrics').innerHTML = cards.join('');

    var thresholds = [
      ['max_water_temp_c', 'Max water temp (policy)'],
      ['max_pump_seconds', 'Max pump seconds'],
      ['min_rewater_interval_hours', 'Min re-water interval (h)'],
      ['preheat_margin_c', 'Preheat margin (°C)'],
      ['preheat_lead_minutes', 'Preheat lead (min)'],
      ['flash_dark_threshold', 'Flash dark threshold (raw)']
    ];
    var safety = '<h3>Safety limits — backend driven</h3>' + thresholds.map(function (t) {
      var v = cfgValue(t[0], '—');
      return '<div class="kv"><span>' + escapeHtml(t[1]) + '</span><b>' + escapeHtml(String(v)) + '</b></div>';
    }).join('') +
      '<div class="kv"><span>Heater firmware cutoff</span><b>40.0 °C</b></div>' +
      '<div class="kv"><span>Heater firmware refuse</span><b>≥ 39.5 °C</b></div>' +
      '<div class="kv"><span>Actuator hard cap (firmware)</span><b>120 s</b></div>' +
      '<p class="muted small">These values come from SystemConfig / firmware constants. Themes and dashboard config never alter them.</p>';
    $('safety-card').innerHTML = safety;
  }
  function previousEvent(ev) {
    var before = null;
    state.events.forEach(function (e) {
      if (!e.ts || !ev.ts || e.ts >= ev.ts) return;
      if (!before || e.ts > before.ts) before = e;
    });
    return before;
  }

  function sparkSvg(field) {
    var evs = state.events.filter(function (e) { return e.ts && e[field] !== null && e[field] !== undefined; });
    var last = evs.slice(-24);
    if (last.length < 2) return '';
    var vals = last.map(function (e) { return e[field]; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var span = (max - min) || 1;
    var pts = vals.map(function (v, i) {
      var x = (i / (vals.length - 1)) * 100;
      var y = 24 - ((v - min) / span) * 22 - 1;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg class="spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.85"/></svg>';
  }

  /* ------------------------------------------------------------------ charts */
  function renderChartControls() {
    if (!$('range-select').children.length) {
      $('range-select').innerHTML = RANGES.map(function (r) {
        return '<button data-range="' + r.id + '" aria-pressed="' + (state.range === r.id) + '">' + r.label + '</button>';
      }).join('');
      $('range-select').addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-range]'); if (!b) return;
        state.range = b.getAttribute('data-range'); renderChartControls(); renderChart();
      });
    } else {
      Array.prototype.forEach.call($('range-select').children, function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-range') === state.range));
      });
    }
    if (!$('metric-select').children.length) {
      $('metric-select').innerHTML = METRICS.map(function (m) {
        return '<option value="' + m.id + '">' + escapeHtml(m.label) + '</option>';
      }).join('');
      $('metric-select').value = state.metric;
      $('metric-select').addEventListener('change', function () { state.metric = $('metric-select').value; renderChart(); });
    }
  }
  function rangeEvents() {
    var r = RANGES.filter(function (x) { return x.id === state.range; })[0] || RANGES[1];
    var cutoff = r.ms ? Date.now() - r.ms : 0;
    return state.events.filter(function (e) { return e.ts && e.ts.getTime() >= cutoff; });
  }
  function renderChart() {
    var svg = $('chart');
    var metric = METRICS.filter(function (m) { return m.id === state.metric; })[0] || METRICS[0];
    var events = rangeEvents().filter(function (e) { return e[metric.field] !== null && e[metric.field] !== undefined; });
    var empty = $('chart-empty');
    if (events.length < 2) {
      svg.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    var W = 900, H = 320, padL = 54, padR = 16, padT = 18, padB = 34;
    var t0 = events[0].ts.getTime(), t1 = events[events.length - 1].ts.getTime();
    var span = t1 - t0 || 1;
    var vals = events.map(function (e) { return e[metric.field]; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min -= 1; max += 1; }
    var padv = (max - min) * 0.08; min -= padv; max += padv;
    var x = function (t) { return padL + ((t - t0) / span) * (W - padL - padR); };
    var y = function (v) { return padT + (1 - (v - min) / (max - min)) * (H - padT - padB); };

    var ivs = [];
    for (var i = 1; i < events.length; i++) ivs.push(events[i].ts.getTime() - events[i - 1].ts.getTime());
    var med = median(ivs) || 0;
    var gapMs = Math.max(med * 2.5, 45 * 60000);

    var segments = [];
    var cur = [events[0]];
    for (var j = 1; j < events.length; j++) {
      if (events[j].ts.getTime() - events[j - 1].ts.getTime() > gapMs) { segments.push(cur); cur = []; }
      cur.push(events[j]);
    }
    segments.push(cur);

    var parts = [];
    parts.push('<defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35"/>' +
      '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/></linearGradient></defs>');

    for (var g = 0; g <= 4; g++) {
      var gv = min + (g / 4) * (max - min);
      var gy = y(gv);
      parts.push('<line class="grid-line" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"/>');
      parts.push('<text x="' + (padL - 8) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(fmtNum(gv, metric.decimals)) + '</text>');
    }
    parts.push('<text x="' + padL + '" y="' + (H - 10) + '">' + escapeHtml(fmtDateShort(new Date(t0))) + '</text>');
    parts.push('<text x="' + (W - padR) + '" y="' + (H - 10) + '" text-anchor="end">' + escapeHtml(fmtDateShort(new Date(t1))) + '</text>');

    segments.forEach(function (seg) {
      if (seg.length < 2) return;
      var line = seg.map(function (e) { return x(e.ts.getTime()).toFixed(1) + ',' + y(e[metric.field]).toFixed(1); }).join(' ');
      var area = padL + ',' + (H - padB) + ' ' + line + ' ' + x(seg[seg.length - 1].ts.getTime()).toFixed(1) + ',' + (H - padB);
      parts.push('<polygon class="series-area" points="' + area + '"/>');
      parts.push('<polyline class="series-line" points="' + line + '"/>');
    });

    var gapCount = 0;
    for (var k = 1; k < events.length; k++) {
      if (events[k].ts.getTime() - events[k - 1].ts.getTime() > gapMs) {
        gapCount++;
        var gx = (x(events[k - 1].ts.getTime()) + x(events[k].ts.getTime())) / 2;
        parts.push('<rect class="gap-badge" x="' + (gx - 16).toFixed(1) + '" y="' + padT + '" width="32" height="16" rx="8"/>');
        parts.push('<text x="' + gx.toFixed(1) + '" y="' + (padT + 11.5) + '" text-anchor="middle">gap</text>');
      }
    }

    events.forEach(function (e) {
      var cx = x(e.ts.getTime());
      if (e.watered) parts.push('<rect class="marker" x="' + (cx - 3).toFixed(1) + '" y="' + (H - padB - 3) + '" width="6" height="6" fill="var(--info)"/>');
      if (e.heater) parts.push('<circle class="marker" cx="' + cx.toFixed(1) + '" cy="' + (H - padB - 10) + '" r="3.4" fill="var(--warn)"/>');
      if (e.tankEmpty === true) parts.push('<path class="marker" d="M' + (cx - 4).toFixed(1) + ' ' + (H - padB - 16) + ' l8 8 M' + (cx + 4).toFixed(1) + ' ' + (H - padB - 16) + ' l-8 8" stroke="var(--bad)" stroke-width="2.4"/>');
    });
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = parts.join('');
    svg.setAttribute('aria-label', metric.label + ' history with watering, heating and tank markers; ' + gapCount + ' data gap(s)');
  }
  function fmtDateShort(d) {
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function lastWaterings(n) {
    return state.events.filter(function (e) { return e.watered; })
      .sort(function (a, b) { return (b.ts ? b.ts.getTime() : 0) - (a.ts ? a.ts.getTime() : 0); })
      .slice(0, n);
  }
  function renderWateringSummary() {
    var list = lastWaterings(6);
    var el = $('watering-summary');
    if (!list.length) { el.innerHTML = '<p class="empty">No watering events in the persisted history.</p>'; return; }
    el.innerHTML = list.map(function (e) {
      return '<div class="watering-row">' +
        '<div><div class="k">When</div><div class="v">' + escapeHtml(fmtTime(e.ts)) + '</div></div>' +
        '<div><div class="k">Commanded</div><div class="v">' + (e.waterSec === null ? '—' : e.waterSec + ' s') + '</div></div>' +
        '<div><div class="k">ml_est</div><div class="v">' + fmtNum(e.mlEst, 0) + ' ml<span class="est-tag">EST</span></div></div>' +
        '<div><div class="k">Measured delta</div><div class="v gap-tag">not persisted</div></div>' +
        '<div><div class="k">Dry-run</div><div class="v">' + escapeHtml(String(e.raw.dry_run_mode === undefined ? cfgValue('dry_run_mode', '?') : e.raw.dry_run_mode)) + '</div></div>' +
        '</div>';
    }).join('') + '<p class="muted small">Measured <code>wt_delta_g</code> is logged on the WROOM only (no ack endpoint exists in the decision schema); it is not stored in Sheets, so it cannot be shown as history. Backend task P1 in the audit adds the persistence path.</p>';
  }

  /* ------------------------------------------------------------------ images */
  function renderImages() {
    var cam = cameraStatus();
    $('camera-status').textContent = state.images.length ? 'last image ' + (cam.ageMs === null ? 'timestamp unavailable' : fmtAge(cam.ageMs)) : 'no images yet';
    if (!$('image-filter').children.length) {
      $('image-filter').innerHTML = ['all', 'daily', 'scan'].map(function (f) {
        return '<button data-filter="' + f + '" aria-pressed="' + (state.imageFilter === f) + '">' + (f === 'all' ? 'All' : f === 'daily' ? 'Daily' : 'Scans') + '</button>';
      }).join('');
      $('image-filter').addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-filter]'); if (!b) return;
        state.imageFilter = b.getAttribute('data-filter'); renderImages();
      });
    } else {
      Array.prototype.forEach.call($('image-filter').children, function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === state.imageFilter));
      });
    }

    var list = state.images.filter(function (i) { return state.imageFilter === 'all' || i.kind === state.imageFilter; });
    var latest = list[0];
    var el = $('latest-image');
    if (!latest) {
      el.innerHTML = '<div class="latest-media"><div class="media-state">No images available yet.<br>Daily photos arrive via <code>POST /core/photo</code>; scans via <code>POST /yolo-scan</code> and land in <code>DiseaseScans</code>.</div></div>' +
        '<div class="latest-meta"><h3>Latest image</h3><p class="muted">Nothing persisted for this filter. Images are never fabricated.</p></div>';
    } else {
      el.innerHTML = '<div class="latest-media"><div class="media-state" id="latest-state">Loading image…</div><img id="latest-img" alt="Latest ' + escapeHtml(latest.label) + '" hidden></div>' +
        '<div class="latest-meta"><h3>' + escapeHtml(latest.label) + '</h3>' +
        '<div class="kv"><span>Captured / row time</span><b>' + escapeHtml(fmtTime(latest.ts)) + '</b></div>' +
        '<div class="kv"><span>Kind</span><b>' + escapeHtml(latest.kind === 'daily' ? 'Daily photo (Branch B)' : 'Disease scan (Branch C)') + '</b></div>' +
        (latest.species ? '<div class="kv"><span>Plant identifier at capture</span><b>' + escapeHtml(latest.species) + '</b></div>' : '') +
        (latest.kind === 'scan' && latest.verdict ? '<div class="kv"><span>Judge verdict</span><b>' + escapeHtml(latest.verdict) + '</b></div>' : '') +
        (latest.aiNotes ? '<div class="kv"><span>AI note <span class="ai-badge">GENERATED</span></span></div><div class="muted small">' + escapeHtml(short(latest.aiNotes, 260)) + '</div>' : '') +
        '<p class="muted small">Capture reason and per-image light condition are not persisted by the backend (audit gap G4).</p>' +
        '</div>';
      var img = $('latest-img');
      var st = $('latest-state');
      img.addEventListener('click', function () { openViewer(latest); });
      driveMedia(latest.id).then(function (url) {
        img.src = url; img.hidden = false; st.hidden = true;
        enhanceImageMeta(latest);
      }).catch(function () {
        st.textContent = 'Image unavailable — file not accessible with this account, or removed from Drive.';
      });
    }

    var gallery = list.slice(latest ? 1 : 0, 1 + (LIM.galleryMax || 48));
    $('image-gallery').innerHTML = gallery.length ? gallery.map(function (i, idx) {
      return '<div class="thumb" data-idx="' + idx + '" role="button" tabindex="0" aria-label="Open ' + escapeHtml(i.label) + ' from ' + escapeHtml(fmtTime(i.ts)) + '">' +
        '<div class="thumb-state">loading…</div><span class="thumb-tag">' + escapeHtml(i.kind === 'daily' ? 'daily' : 'scan') + '</span></div>';
    }).join('') : '';
    Array.prototype.forEach.call($('image-gallery').children, function (node) {
      var item = gallery[Number(node.getAttribute('data-idx'))];
      var imgEl = document.createElement('img');
      imgEl.alt = item.label + ' — ' + fmtTime(item.ts);
      imgEl.loading = 'lazy';
      driveMedia(item.id).then(function (url) {
        imgEl.src = url;
        var stEl = node.querySelector('.thumb-state'); if (stEl) stEl.remove();
        node.insertBefore(imgEl, node.firstChild);
      }).catch(function () { node.querySelector('.thumb-state').textContent = 'unavailable'; });
      var open = function () { openViewer(item); };
      node.addEventListener('click', open);
      node.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
    });
  }
  function enhanceImageMeta(item) {
    driveMeta(item.id).then(function (meta) {
      if (!meta) return;
      var el = $('latest-image');
      if (!el) return;
      var bits = [];
      if (meta.createdTime) bits.push('Drive created ' + fmtTime(parseDate(meta.createdTime)));
      if (meta.imageMediaMetadata && meta.imageMediaMetadata.width) bits.push(meta.imageMediaMetadata.width + '×' + meta.imageMediaMetadata.height);
      if (!bits.length) return;
      var p = document.createElement('p');
      p.className = 'muted small';
      p.textContent = 'Drive: ' + bits.join(' · ');
      var host = el.querySelector('.latest-meta');
      if (host) host.appendChild(p);
    });
  }
  function openViewer(item) {
    var v = $('viewer');
    var img = $('viewer-img');
    var meta = $('viewer-meta');
    img.removeAttribute('src');
    meta.textContent = item.label + ' · ' + fmtTime(item.ts) + ' · loading…';
    state.viewerReturnFocus = document.activeElement;
    v.hidden = false;
    document.body.classList.add('modal-open');
    $('viewer-close').focus();
    driveMedia(item.id).then(function (url) {
      img.src = url;
      img.alt = item.label + ' from ' + fmtTime(item.ts);
      driveMeta(item.id).then(function (m) {
        var bits = [item.label, fmtTime(item.ts)];
        if (m && m.name) bits.push(m.name);
        if (m && m.imageMediaMetadata && m.imageMediaMetadata.width) bits.push(m.imageMediaMetadata.width + '×' + m.imageMediaMetadata.height);
        if (item.kind === 'scan' && item.verdict) bits.push('verdict: ' + item.verdict);
        meta.textContent = bits.join(' · ');
      });
    }).catch(function () { meta.textContent = item.label + ' · image unavailable'; });
  }

  /* ----------------------------------------------------------- notifications */
  function renderNotificationControls() {
    if (!$('severity-filter').children.length) {
      $('severity-filter').innerHTML = '<button data-sev="all" aria-pressed="true">All</button>' + SEVERITY.map(function (s) {
        return '<button data-sev="' + s.id + '" aria-pressed="false">' + s.label + '</button>';
      }).join('');
      $('severity-filter').addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-sev]'); if (!b) return;
        state.severityFilter = b.getAttribute('data-sev'); renderNotifications();
      });
      $('status-filter').addEventListener('change', function () { state.statusFilter = $('status-filter').value; renderNotifications(); });
    }
    Array.prototype.forEach.call($('severity-filter').children, function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-sev') === state.severityFilter));
    });
  }
  function renderNotifications() {
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
    badge.textContent = String(pending.length);

    if (!items.length) { $('notification-list').innerHTML = '<p class="empty">No notifications for this filter.</p>'; return; }
    $('notification-list').innerHTML = items.map(function (n) {
      var actions = n.status === 'pending' && n.options.length ? n.options.map(function (opt) {
        return '<button class="btn btn-answer" data-label="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
      }).join('') : '';
      var feedback = n.status === 'pending'
        ? '<input class="notif-comment" type="text" placeholder="optional comment / correction"><div class="notif-feedback" hidden></div>'
        : (n.response ? '<div class="notif-meta"><span>response: ' + escapeHtml(n.response) + '</span></div>' : '');
      return '<article class="notif sev-' + n.severity + '" data-row="' + n.row + '">' +
        '<div class="notif-head"><span class="notif-type">' + escapeHtml(n.type || 'unknown') + '</span>' +
        '<span class="notif-meta"><span>' + escapeHtml(fmtTime(n.ts)) + '</span><span>status: ' + escapeHtml(n.status || '—') + '</span>' +
        (n.contextRef ? '<span>ctx: ' + escapeHtml(short(n.contextRef, 24)) + '</span>' : '') +
        (n.severity === 'legacy' ? '<span>legacy (wired-only camera)</span>' : '') + '</span></div>' +
        '<div class="notif-title">' + escapeHtml(n.title) + '</div>' +
        '<div class="notif-msg">' + escapeHtml(n.message) + '</div>' +
        (actions ? '<div class="notif-actions">' + actions + '</div>' : '') + feedback +
        '<details><summary>Raw source row (debug)</summary><pre>' + escapeHtml(JSON.stringify(n.raw, null, 1)) + '</pre></details>' +
        '</article>';
    }).join('');
  }
  function callResume(url, label, comment) {
    if (!url || !/^https?:\/\//i.test(url)) return Promise.resolve(false);
    var target;
    try {
      target = new URL(url);
      target.searchParams.set('response', label);
      if (comment) target.searchParams.set('comment', comment);
    } catch (err) { return Promise.resolve(false); }
    return fetch(target.toString(), { mode: 'cors' }).then(function () { return true; })
      .catch(function () { return fetch(target.toString(), { mode: 'no-cors' }).then(function () { return true; }).catch(function () { return false; }); });
  }
  function respondToNotification(article, label) {
    var row = Number(article.getAttribute('data-row'));
    var item = state.notifications.filter(function (n) { return n.row === row; })[0];
    if (!item) return;
    var comment = (article.querySelector('.notif-comment') || { value: '' }).value.trim();
    var responseText = comment ? label + ' | ' + comment : label;
    var feedback = article.querySelector('.notif-feedback');
    Array.prototype.forEach.call(article.querySelectorAll('.btn-answer'), function (b) { b.disabled = true; });
    callResume(item.resumeUrl, label, comment).then(function (resumed) {
      return sheetsUpdate('Notifications!F' + row + ':G' + row, [['done', responseText]]).then(function () {
        item.status = 'done'; item.response = responseText;
        feedback.hidden = false; feedback.className = 'notif-feedback ok';
        feedback.textContent = resumed ? 'Saved and workflow resume requested.' : 'Saved to the sheet (no resume link or resume blocked by CORS).';
        renderNotifications();
      });
    }).catch(function (err) {
      feedback.hidden = false; feedback.className = 'notif-feedback error';
      feedback.textContent = err.message;
      Array.prototype.forEach.call(article.querySelectorAll('.btn-answer'), function (b) { b.disabled = false; });
    });
  }
  function renderToasts() {
    var seen = Number(sessionStorage.getItem(SEEN_KEY) || 0);
    // First visit: only surface the last 24 h of severe items, not the whole archive.
    var floor = seen === 0 ? Date.now() - 86400e3 : seen;
    var newest = seen;
    state.notifications.forEach(function (n) {
      if (!n.ts) return;
      var t = n.ts.getTime();
      if (t > floor && (n.severity === 'critical' || n.severity === 'warning')) toast(n.severity, n.title || n.type, short(n.message, 200));
      if (t > newest) newest = t;
    });
    if (newest > seen) sessionStorage.setItem(SEEN_KEY, String(newest));
  }

  /* ------------------------------------------------------------------ AI/notes */
  function renderAi() {
    var ev = latestEvent();
    if (ev) {
      var bits = [];
      if (ev.reasoning) bits.push('<div><b>Decision reasoning:</b> ' + escapeHtml(ev.reasoning) + '</div>');
      if (ev.aiNotes) bits.push('<div><b>AI notes:</b> ' + escapeHtml(ev.aiNotes) + '</div>');
      if (ev.anomaly) bits.push('<div class="gap-tag">Anomaly flagged: ' + escapeHtml(ev.anomalyText || '(no description)') + '</div>');
      if (!bits.length) bits.push('<span class="muted">The latest event has no persisted AI text.</span>');
      $('latest-decision').innerHTML = '<div><b>' + escapeHtml(fmtTime(ev.ts)) + '</b> <span class="ai-badge">PERSISTED AI OUTPUT</span></div>' + bits.join('');
    } else {
      $('latest-decision').innerHTML = '<span class="muted">No decision has been persisted yet.</span>';
    }
    var notes = state.notes.slice(-(LIM.notes || 80)).reverse();
    $('notes-list').innerHTML = notes.length ? notes.map(function (n) {
      return '<div class="note"><div class="note-head"><span>' + escapeHtml(n.agent || 'agent') + ' · ' + escapeHtml(fmtTime(parseDate(n.timestamp))) + '</span><span>' + escapeHtml(short(n.context_ref || '', 28)) + '</span></div>' +
        escapeHtml(n.note || '') + '</div>';
    }).join('') + '<p class="muted small">AgentNotes are persisted hypotheses from previous runs — unverified context, never ground truth.</p>'
      : '<p class="empty">No AI notes persisted yet.</p>';
  }

  /* ------------------------------------------------------------------ events table */
  var EVENT_COLS = [
    ['Time', function (e) { return fmtTime(e.ts); }, ''],
    ['Type', function (e) { return e.type || '—'; }, ''],
    ['Moist%', function (e) { return e.moisture === null ? '—' : fmtNum(e.moisture, 0); }, 'num'],
    ['Soil°C', function (e) { return e.soilC === null ? '—' : fmtNum(e.soilC, 1); }, 'num'],
    ['Water°C', function (e) { return e.waterC === null ? '—' : fmtNum(e.waterC, 1); }, 'num'],
    ['Air°C', function (e) { return e.airC === null ? '—' : fmtNum(e.airC, 1); }, 'num'],
    ['Hum%', function (e) { return e.hum === null ? '—' : fmtNum(e.hum, 0); }, 'num'],
    ['Weight g', function (e) { return e.weight === null ? '—' : fmtNum(e.weight, 1); }, 'num'],
    ['Light', function (e) { return e.light === null ? '—' : fmtNum(e.light, 0); }, 'num'],
    ['Tank', function (e) { return e.tankEmpty === null ? '—' : (e.tankEmpty ? 'EMPTY' : 'OK'); }, ''],
    ['Watered', function (e) { return e.watered ? (e.waterSec === null ? 'yes' : e.waterSec + ' s · ' + fmtNum(e.mlEst, 0) + ' ml est') : '—'; }, ''],
    ['Heater', function (e) { return e.heater ? (e.heaterSec === null ? 'yes' : e.heaterSec + ' s') : '—'; }, ''],
    ['Species', function (e) { return e.species || '—'; }, ''],
    ['Notes', function (e) { return short(e.reasoning || e.aiNotes || e.anomalyText || '', 60); }, '']
  ];
  function renderEventsTable() {
    var rows = state.events.filter(function (e) { return e.ts; })
      .sort(function (a, b) { return b.ts.getTime() - a.ts.getTime(); })
      .slice(0, LIM.events || 1000);
    $('events-count').textContent = state.events.length + ' rows persisted';
    var thead = $('events-table').tHead;
    thead.innerHTML = '<tr>' + EVENT_COLS.map(function (c) { return '<th class="' + c[2] + '">' + escapeHtml(c[0]) + '</th>'; }).join('') + '</tr>';
    var tbody = $('events-table').tBodies[0];
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="' + EVENT_COLS.length + '" class="empty">No events yet.</td></tr>'; return; }
    tbody.innerHTML = rows.map(function (e) {
      return '<tr title="' + escapeHtml(e.reasoning || '') + '">' + EVENT_COLS.map(function (c) {
        return '<td class="' + c[2] + '">' + escapeHtml(c[1](e)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  /* ------------------------------------------------------------------ system grid */
  function renderSystem() {
    var kv = [
      ['Dry-run mode', cfgValue('dry_run_mode', '—'), 'ACTUATION GATE'],
      ['Max water temp (policy)', cfgValue('max_water_temp_c', '—'), ''],
      ['Max pump seconds', cfgValue('max_pump_seconds', '—'), ''],
      ['Min re-water interval (h)', cfgValue('min_rewater_interval_hours', '—'), ''],
      ['Preheat margin (°C)', cfgValue('preheat_margin_c', '—'), ''],
      ['Preheat lead (min)', cfgValue('preheat_lead_minutes', '—'), ''],
      ['Flash dark threshold', cfgValue('flash_dark_threshold', '—'), 'raw LDR — see Q22'],
      ['Last light reading', cfgValue('last_lightlevel', '—'), 'raw value'],
      ['Last light reading time', fmtTime(parseDate(cfgValue('last_lightlevel_utc', ''))), ''],
      ['Next sunrise (UTC)', fmtTime(parseDate(cfgValue('next_sunrise_utc', ''))), ''],
      ['Next sunset (UTC)', fmtTime(parseDate(cfgValue('next_sunset_utc', ''))), ''],
      ['Scan session', bool(cfgValue('scan_session_active', 'false')) ? 'ACTIVE' : 'idle', ''],
      ['Last watered (provisional)', fmtTime(parseDate(cfgValue('last_watered_utc', ''))), 'awaits firmware pump-completion feedback'],
      ['Species guess', cfgValue('last_species_guess', '—'), ''],
      ['Species confidence', cfgValue('species_confidence', '—'), ''],
      ['Location', cfgValue('pot_latitude', '—') + ', ' + cfgValue('pot_longitude', '—'), ''],
      ['Perenual cache', cfgValue('perenual_status', 'not seeded'), 'advisory species reference']
    ];
    $('system-grid').innerHTML = kv.map(function (r) {
      return '<div class="kv-cell"><span class="k">' + escapeHtml(r[0]) + (r[2] ? '<br><small>' + escapeHtml(r[2]) + '</small>' : '') + '</span><b>' + escapeHtml(String(r[1])) + '</b></div>';
    }).join('');
  }

  function closeViewer() {
    var v = $('viewer');
    if (!v || v.hidden) return;
    v.hidden = true;
    document.body.classList.remove('modal-open');
    if (state.viewerReturnFocus && state.viewerReturnFocus.focus) {
      try { state.viewerReturnFocus.focus(); } catch (err) { /* ignore */ }
    }
    state.viewerReturnFocus = null;
  }

  /* ------------------------------------------------------------------ wiring */
  function bind() {
    $('connect-btn').addEventListener('click', requestSignIn);
    $('signin-btn').addEventListener('click', requestSignIn);
    $('refresh-btn').addEventListener('click', loadAll);
    $('sheet-mode-exit').addEventListener('click', exitSheetMode);
    $('notification-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('.btn-answer');
      if (!btn) return;
      respondToNotification(btn.closest('.notif'), btn.getAttribute('data-label'));
    });
    // Delegated close: works for the static button id, the data-action marker and any future markup.
    document.addEventListener('click', function (ev) {
      var closer = ev.target.closest ? ev.target.closest('[data-action="close-viewer"]') : null;
      if (closer) { closeViewer(); return; }
      if (ev.target === $('viewer')) closeViewer();   // backdrop click — safe: the viewer holds no state
    });
    // Escape closes the viewer (auth state is never affected).
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !$('viewer').hidden) closeViewer();
    });
  }

  /* ------------------------------------------------------- sheet override (owner tooling)
   * Precedence: URL ?sheet=<id> > localStorage override > config.js default.
   * Only a spreadsheet-ID shape is accepted; arbitrary URLs are never fetched. */
  function validSheetId(id) {
    return /^[A-Za-z0-9_-]{20,}$/.test(String(id || ''));
  }
  function resolveSheetId() {
    var fromUrl = '';
    try { fromUrl = (new URLSearchParams(location.search).get('sheet') || '').trim(); } catch (err) { fromUrl = ''; }
    if (fromUrl && validSheetId(fromUrl)) {
      try { localStorage.setItem(SHEET_OVERRIDE_KEY, fromUrl); } catch (err) { /* ignore */ }
      return fromUrl;
    }
    var stored = '';
    try { stored = localStorage.getItem(SHEET_OVERRIDE_KEY) || ''; } catch (err) { stored = ''; }
    if (stored && validSheetId(stored)) return stored;
    return String(CFG.spreadsheetId || '');
  }
  function sheetModeActive() {
    return !!state.sheetId && state.sheetId !== String(CFG.spreadsheetId || '');
  }
  function renderSheetBanner() {
    var el = $('sheet-mode-banner');
    if (!el) return;
    if (!sheetModeActive()) { el.hidden = true; return; }
    el.hidden = false;
    var label = $('sheet-mode-id');
    if (label) label.textContent = state.sheetId.slice(0, 10) + '…';
  }
  function exitSheetMode() {
    try { localStorage.removeItem(SHEET_OVERRIDE_KEY); } catch (err) { /* ignore */ }
    try { history.replaceState(null, '', location.pathname); } catch (err) { /* ignore */ }
    location.reload();
  }

  function start() {
    state.sheetId = resolveSheetId();
    renderSheetBanner();
    if (!restoreToken()) $('signin-panel').hidden = false;   // auth is mandatory; never faked
    bind();
    initAuth();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
