(function () {
  'use strict';

  const CFG = window.PHYTOAI_CONFIG || {};
  const TOKEN_KEY = 'phytoai_token';
  const EXPIRY_KEY = 'phytoai_token_expiry';
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files/';

  const state = {
    token: null,
    tokenExpiry: 0,
    tokenClient: null,
    cfg: {},
    events: [],
    notifications: [],
    scans: []
  };

  const $ = function (id) { return document.getElementById(id); };

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function short(value, len) {
    const s = String(value === undefined || value === null ? '' : value);
    return s.length > len ? s.slice(0, len - 1) + '…' : s;
  }

  function fmtTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function fmtUtc(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { timeZoneName: 'short' });
  }

  function truthy(value) {
    return String(value).trim().toLowerCase() === 'true';
  }

  function colLetter(index) {
    let n = index + 1, s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }

  function toRecords(values) {
    if (!values || !values.length) return [];
    const head = values[0];
    return values.slice(1).map(function (row, i) {
      const rec = { _row: i + 2 };
      head.forEach(function (h, j) { rec[h] = row[j] === undefined ? '' : row[j]; });
      return rec;
    });
  }

  function showBanner(message, kind) {
    const el = $('banner');
    if (!message) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.className = 'banner' + (kind ? ' ' + kind : '');
    el.textContent = message;
  }

  function setAuthUi() {
    const connected = !!state.token;
    $('connect-btn').hidden = connected;
    $('refresh-btn').hidden = !connected;
    $('auth-status').textContent = connected ? 'Google connected' : 'Not connected';
    $('auth-status').className = 'auth-status ' + (connected ? 'ok' : 'warn');
  }

  function authHeaders() {
    return { Authorization: 'Bearer ' + state.token };
  }

  async function sheetsGet(range) {
    const url = SHEETS + encodeURIComponent(CFG.spreadsheetId) + '/values/' + encodeURIComponent(range) + '?majorDimension=ROWS';
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('Sheets read failed (' + res.status + ') for ' + range + ': ' + short(await res.text(), 160));
    const data = await res.json();
    return data.values || [];
  }

  async function sheetsUpdate(range, values) {
    const url = SHEETS + encodeURIComponent(CFG.spreadsheetId) + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED';
    const res = await fetch(url, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ range: range, majorDimension: 'ROWS', values: values })
    });
    if (!res.ok) throw new Error('Sheets write failed (' + res.status + '): ' + short(await res.text(), 160));
    return res.json();
  }

  async function loadAll() {
    if (!state.token) return;
    showBanner('Loading…');
    try {
      const results = await Promise.all([
        sheetsGet('SystemConfig!A1:C'),
        sheetsGet('Events!A1:V'),
        sheetsGet('Notifications!A1:I'),
        sheetsGet('DiseaseScans!A1:J')
      ]);
      state.cfg = {};
      toRecords(results[0]).forEach(function (row) { state.cfg[String(row.Key).trim()] = row.Value; });
      state.events = toRecords(results[1]);
      state.notifications = toRecords(results[2]);
      state.scans = toRecords(results[3]);
      showBanner('');
      renderAll();
    } catch (err) {
      showBanner(err.message, 'error');
    }
  }

  function renderAll() {
    renderStatus();
    renderPending();
    renderEvents();
    renderScans();
  }

  function cfgValue(key, fallback) {
    const v = state.cfg[key];
    return v === undefined || v === null || v === '' ? fallback : v;
  }

  function latestEvent() {
    return state.events.length ? state.events[state.events.length - 1] : {};
  }

  function stat(label, value, kind) {
    return '<div class="stat' + (kind ? ' ' + kind : '') + '">' +
      '<div class="stat-label">' + escapeHtml(label) + '</div>' +
      '<div class="stat-value">' + escapeHtml(value) + '</div></div>';
  }

  function renderStatus() {
    const ev = latestEvent();
    const species = cfgValue('last_species_guess', ev.SpeciesGuess || 'unknown');
    const conf = cfgValue('species_confidence', ev.SpeciesConfidence || '');
    const battery = cfgValue('camera_battery_percent', '—');
    const batteryMin = cfgValue('camera_battery_min_percent', '30');
    const moisture = ev.MoisturePercent === undefined || ev.MoisturePercent === '' ? '—' : ev.MoisturePercent + '%';
    const tank = ev.TankEmpty === undefined || ev.TankEmpty === '' ? '—' : (truthy(ev.TankEmpty) ? 'EMPTY' : 'OK');
    const watered = ev.WateringTriggered === undefined || ev.WateringTriggered === '' ? '—' :
      (truthy(ev.WateringTriggered) ? 'yes (' + (ev.WaterDurationSeconds || 0) + 's)' : 'no');

    const html = [
      stat('Species', species + (conf !== '' ? ' (' + conf + '%)' : '')),
      stat('Last watered', fmtUtc(cfgValue('last_watered_utc', ''))),
      stat('Latest moisture', moisture),
      stat('Soil temp', ev.SoilTempC === undefined || ev.SoilTempC === '' ? '—' : ev.SoilTempC + ' °C'),
      stat('Air', (ev.AirTempC === undefined || ev.AirTempC === '' ? '—' : ev.AirTempC + ' °C') +
        (ev.AirHumidityPercent === undefined || ev.AirHumidityPercent === '' ? '' : ' / ' + ev.AirHumidityPercent + '%')),
      stat('Tank', tank, tank === 'EMPTY' ? 'bad' : ''),
      stat('Camera battery', battery + ' % (min ' + batteryMin + '%)',
        battery !== '—' && Number(battery) < Number(batteryMin) ? 'bad' : ''),
      stat('Latest event', fmtTime(ev.Timestamp)),
      stat('Scan session', truthy(cfgValue('scan_session_active', 'false')) ? 'ACTIVE' : 'idle'),
      stat('Dry run mode', truthy(cfgValue('dry_run_mode', 'true')) ? 'ON' : 'OFF'),
      stat('Next sunrise', fmtUtc(cfgValue('next_sunrise_utc', ''))),
      stat('Next sunset', fmtUtc(cfgValue('next_sunset_utc', '')))
    ].join('');

    $('status-card').innerHTML = html;
    $('status-updated').textContent = 'updated ' + new Date().toLocaleTimeString();
  }

  function parseOptions(raw) {
    try {
      const arr = JSON.parse(raw || '[]');
      if (Array.isArray(arr) && arr.length) return arr.map(String);
    } catch (err) {
      return ['✓'];
    }
    return ['✓'];
  }

  function pendingItems() {
    return state.notifications.filter(function (n) {
      return String(n.status || '').trim().toLowerCase() === 'pending';
    }).reverse();
  }

  function renderPending() {
    const items = pendingItems();
    const badge = $('pending-count');
    badge.hidden = items.length === 0;
    badge.textContent = String(items.length);

    if (!items.length) {
      $('pending-list').innerHTML = '<p class="empty">Nothing waiting for you.</p>';
      return;
    }

    $('pending-list').innerHTML = items.map(function (n) {
      const buttons = parseOptions(n.response_options).map(function (opt) {
        return '<button class="btn btn-answer" data-label="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
      }).join('');
      const urgent = /alert_|scan_verdict|scan_position|scan_followup/.test(String(n.type || ''));
      return '<article class="notif' + (urgent ? ' urgent' : '') + '" data-row="' + n._row + '">' +
        '<div class="notif-head"><span class="notif-type">' + escapeHtml(n.type) + '</span><span class="muted">' + escapeHtml(fmtTime(n.timestamp)) + '</span></div>' +
        '<div class="notif-title">' + escapeHtml(n.title) + '</div>' +
        '<div class="notif-msg">' + escapeHtml(n.message) + '</div>' +
        '<div class="notif-actions">' + buttons + '</div>' +
        '<input class="notif-comment" type="text" placeholder="optional comment / correction">' +
        '<div class="notif-feedback" hidden></div>' +
        '</article>';
    }).join('');
  }

  async function callResume(url, label, comment) {
    if (!url || !/^https?:\/\//i.test(url)) return false;
    let target;
    try {
      target = new URL(url);
      target.searchParams.set('response', label);
      if (comment) target.searchParams.set('comment', comment);
    } catch (err) { return false; }
    try {
      await fetch(target.toString(), { mode: 'cors' });
      return true;
    } catch (err) {
      try { await fetch(target.toString(), { mode: 'no-cors' }); return true; } catch (err2) { return false; }
    }
  }

  async function respondToNotification(article, label) {
    const row = Number(article.getAttribute('data-row'));
    const item = state.notifications.find(function (n) { return n._row === row; });
    if (!item) return;
    const comment = (article.querySelector('.notif-comment').value || '').trim();
    const responseText = comment ? label + ' | ' + comment : label;
    const feedback = article.querySelector('.notif-feedback');
    article.querySelectorAll('.btn-answer').forEach(function (b) { b.disabled = true; });

    try {
      const resumed = await callResume(item.resume_url, label, comment);
      const range = 'Notifications!F' + row + ':G' + row;
      await sheetsUpdate(range, [['done', responseText]]);
      item.status = 'done';
      item.response = responseText;
      feedback.hidden = false;
      feedback.className = 'notif-feedback ok';
      feedback.textContent = resumed ? 'Saved and workflow resumed.' : 'Saved (no resume link — feedback recorded).';
      setTimeout(renderPending, 900);
    } catch (err) {
      feedback.hidden = false;
      feedback.className = 'notif-feedback error';
      feedback.textContent = err.message;
      article.querySelectorAll('.btn-answer').forEach(function (b) { b.disabled = false; });
    }
  }

  const EVENT_COLUMNS = [
    ['Timestamp', function (e) { return fmtTime(e.Timestamp); }],
    ['Type', function (e) { return e.EventType; }],
    ['Moisture', function (e) { return e.MoisturePercent === '' ? '—' : e.MoisturePercent + '%'; }],
    ['Soil °C', function (e) { return e.SoilTempC === '' ? '—' : e.SoilTempC; }],
    ['Water °C', function (e) { return e.WaterTempC === '' ? '—' : e.WaterTempC; }],
    ['Air °C', function (e) { return e.AirTempC === '' ? '—' : e.AirTempC; }],
    ['Hum %', function (e) { return e.AirHumidityPercent === '' ? '—' : e.AirHumidityPercent; }],
    ['Watered', function (e) { return truthy(e.WateringTriggered) ? (e.WaterDurationSeconds || 0) + 's' : '—'; }],
    ['Heater', function (e) { return truthy(e.HeaterUsed) ? (e.HeaterDurationSeconds || 0) + 's' : '—'; }],
    ['Species', function (e) { return e.SpeciesGuess; }],
    ['Notes', function (e) { return short(e.AI_Notes || e.AnomalyDescription || '', 70); }]
  ];

  function renderEvents() {
    const events = state.events.slice(-(Number(CFG.eventsLimit) || 30)).reverse();
    $('events-count').textContent = state.events.length + ' total';
    $('events-table').tHead.innerHTML = '<tr>' + EVENT_COLUMNS.map(function (c) { return '<th>' + escapeHtml(c[0]) + '</th>'; }).join('') + '</tr>';
    if (!events.length) {
      $('events-table').tBodies[0].innerHTML = '<tr><td colspan="' + EVENT_COLUMNS.length + '" class="empty">No events yet.</td></tr>';
      return;
    }
    $('events-table').tBodies[0].innerHTML = events.map(function (e) {
      return '<tr title="' + escapeHtml(e.ReasoningSummary || '') + '">' +
        EVENT_COLUMNS.map(function (c) { return '<td>' + escapeHtml(c[1](e)) + '</td>'; }).join('') + '</tr>';
    }).join('');
  }

  function driveId(link) {
    const m = String(link || '').match(/\/d\/([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : '';
  }

  async function loadDriveImage(img) {
    const id = img.getAttribute('data-drive-id');
    if (!id) { img.closest('.scan-media').innerHTML = '<span class="muted">No photo</span>'; return; }
    try {
      const res = await fetch(DRIVE + encodeURIComponent(id) + '?alt=media', { headers: authHeaders() });
      if (!res.ok) throw new Error('drive ' + res.status);
      img.src = URL.createObjectURL(await res.blob());
    } catch (err) {
      img.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w800';
    }
  }

  function renderScans() {
    const scans = state.scans.slice(-(Number(CFG.scansLimit) || 20)).reverse();
    $('scans-count').textContent = state.scans.length + ' total';
    if (!scans.length) {
      $('scans-list').innerHTML = '<p class="empty">No scans yet.</p>';
      return;
    }
    $('scans-list').innerHTML = scans.map(function (s) {
      const id = driveId(s.drive_links);
      const verdict = String(s.judge_verdict || '').trim();
      const clean = /^(no|none|healthy|clean|ok)/i.test(verdict);
      const opinions = [
        s.vision_opinion ? '<details><summary>Vision opinion</summary><pre>' + escapeHtml(prettyJson(s.vision_opinion)) + '</pre></details>' : '',
        s.yolo_opinion ? '<details><summary>YOLO opinion</summary><pre>' + escapeHtml(prettyJson(s.yolo_opinion)) + '</pre></details>' : ''
      ].join('');
      return '<article class="scan">' +
        '<div class="scan-media"><img data-drive-id="' + escapeHtml(id) + '" alt="scan photo" loading="lazy"></div>' +
        '<div class="scan-body">' +
        '<div class="scan-head"><span class="scan-date">' + escapeHtml(fmtTime(s.timestamp)) + '</span>' +
        '<span class="scan-verdict ' + (clean ? 'ok' : 'bad') + '">' + escapeHtml(short(verdict, 60)) + '</span></div>' +
        (s.judge_reasoning ? '<p class="scan-reasoning">' + escapeHtml(s.judge_reasoning) + '</p>' : '') +
        (s.treatment_plan ? '<div class="scan-treatment"><strong>Treatment</strong><p>' + escapeHtml(s.treatment_plan) + '</p></div>' : '') +
        '<div class="scan-feedback">' +
        '<span>Your verdict: <strong>' + escapeHtml(s.user_verdict || '—') + '</strong></span>' +
        '<span>Outcome: <strong>' + escapeHtml(s.treatment_outcome || '—') + '</strong></span>' +
        '</div>' + opinions +
        '</div></article>';
    }).join('');
    $('scans-list').querySelectorAll('img[data-drive-id]').forEach(function (img) { loadDriveImage(img); });
  }

  function prettyJson(raw) {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch (err) { return String(raw); }
  }

  function showConnect() {
    $('connect-btn').hidden = false;
    $('auth-status').textContent = 'Not connected';
  }

  function restoreToken() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const expiry = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
    if (token && Date.now() < expiry) {
      state.token = token;
      state.tokenExpiry = expiry;
      return true;
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
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
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CFG.clientId,
      scope: CFG.scopes,
      callback: function (resp) {
        if (resp && resp.access_token) {
          state.token = resp.access_token;
          state.tokenExpiry = Date.now() + (Number(resp.expires_in || 3600) * 1000) - 60000;
          sessionStorage.setItem(TOKEN_KEY, state.token);
          sessionStorage.setItem(EXPIRY_KEY, String(state.tokenExpiry));
          setAuthUi();
          loadAll();
        } else {
          showBanner('Google sign-in failed. Check the OAuth client ID and authorized origins.', 'error');
        }
      }
    });
    if (restoreToken()) { setAuthUi(); loadAll(); }
    else { showConnect(); }
  }

  function bind() {
    $('connect-btn').addEventListener('click', function () {
      if (!state.tokenClient) { initAuth(); return; }
      state.tokenClient.requestAccessToken({ prompt: '' });
    });
    $('refresh-btn').addEventListener('click', loadAll);
    $('pending-list').addEventListener('click', function (ev) {
      const btn = ev.target.closest('.btn-answer');
      if (!btn) return;
      const article = btn.closest('.notif');
      respondToNotification(article, btn.getAttribute('data-label'));
    });
  }

  window.addEventListener('load', function () {
    bind();
    initAuth();
  });
})();
