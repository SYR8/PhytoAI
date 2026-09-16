/* PhytoAI dashboard — client configuration TEMPLATE.
 *
 * Copy this file to `config.js` and fill in YOUR OWN values. `config.js` is
 * what the page actually loads; this example exists so no real identifiers
 * ever need to live in a public repository.
 *
 * No secrets live in either file. The OAuth client ID is public by design; the
 * spreadsheet ID is an identifier, not a credential. Safety thresholds and all
 * measurements come from your SystemConfig sheet at runtime — the values below
 * are presentation-only and must never alter safety behaviour.
 *
 * Google Cloud / OAuth setup:
 *   1. Create a Google Cloud project, enable the Google Sheets API and the
 *      Google Drive API.
 *   2. Create an OAuth Client ID of type "Web application".
 *   3. Add your site origin to "Authorized JavaScript origins" (scheme + host
 *      exactly, no trailing slash): e.g. https://YOUR-SITE.example and
 *      http://localhost:8000 for local testing.
 *   4. Add yourself as a test user while the consent screen is in Testing mode.
 *   5. Put the client ID in `config.js`. NEVER put the client secret anywhere
 *      in this repository — the dashboard uses user OAuth only.
 */
window.PHYTOAI_CONFIG = {
  /* OAuth Web client ID — public by design. Client secrets never belong here. */
  clientId: 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
  /* Optional login suggestion; leave empty in a public repository. */
  GOOGLE_LOGIN_HINT: '',
  /* Your own spreadsheet (create the five tabs per docs/Plan.md §2):
   *   1) ?sheet=<SPREADSHEET_ID> in the URL (shape-checked, then remembered)
   *   2) localStorage key 'phytoai_sheet_override' (set by the URL parameter)
   *   3) this value
   * Only a spreadsheet-ID shape is accepted — arbitrary URLs are never fetched.
   * See docs/dashboard-test-data.md for the test-sheet workflow. */
  spreadsheetId: 'YOUR_SPREADSHEET_ID',
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
  ].join(' '),

  limits: {
    events: 1000,        // newest rows kept in memory for charts/tables
    notifications: 250,
    scans: 100,
    notes: 80,
    chartPoints: 320     // downsample target per chart
  },

  /* Optional display profile. Empty values fall back to SystemConfig rows
   * (plant_name / plant_variety / plant_type / plant_theme) and then to the
   * species guess + default theme. Purely cosmetic labels — no safety meaning. */
  profile: {
    name: '',
    variety: '',
    type: '',
    theme: ''            // '', 'auto', or a theme id from THEMES in app.js
  },

  /* ml_est basis ONLY: your own calibrated pump flow (see the bench procedure
   * in docs/hw-bench-2026-09-15.md; the reference build measured 9.706 ml/s).
   * Used to show "estimated" millilitres from the commanded duration; never
   * presented as measured water. A SystemConfig row pump_flow_ml_per_sec, if
   * seeded, overrides this. */
  pumpFlowMlPerSec: 9.706,

  /* Presentation thresholds for the "data age" indicator only — not safety
   * limits and not workflow behaviour. */
  staleAfterMinutes: 14 * 60,     // ~ one sun-event cycle + margin
  cameraQuietAfterMinutes: 36 * 60,

  /* Your n8n webhook base (the named tunnel or your own domain). No tokens
   * live here: the dashboard sends the signed-in user's Google access token
   * and the workflow verifies it server-side before answering. The endpoints
   * only exist while the workflow is ACTIVE. */
  assistantBase: 'https://YOUR-N8N-HOST',
  assistantRoutes: {
    ask: '/webhook/dashboard/ask',
    overview: '/webhook/dashboard/overview',
    detection: '/webhook/dashboard/detection'
  },
  /* Client patience must outlast real workflow time: an AI synthesis can take
   * 20-60 s. These are hard caps, not targets. */
  assistantTimeouts: { ask: 60000, overview: 25000, detection: 25000 },
  /* Failures throttle retries so a refresh storm cannot hammer Sheets reads. */
  assistantCooldownMs: { failure: 15000, busy: 60000 },
  plantId: 'default',

  /* Request scheduler: every data request (Sheets, Drive, assistant, artwork)
   * goes through one serialized pipeline. maxConcurrent stays 1 so concurrent
   * screens can never exhaust the Sheets per-minute quota; TTL caches keep
   * route changes from refetching, and a quota response opens a cooldown gate
   * (quotaCooldownMs) that nothing retries automatically. */
  scheduler: {
    maxConcurrent: 1,
    configTtlMs: 300000,
    sheetsTtlMs: 45000,
    overviewTtlMs: 45000,
    detectionTtlMs: 45000,
    driveTtlMs: 86400000,
    artTtlMs: 86400000,
    quotaCooldownMs: 60000
  },

  /* Browser alerts (while the page is open) + notification polling.
   * Permission is NEVER requested on page load — only from the explicit
   * "Enable browser alerts" control in Settings. Browser permission is a
   * display affordance, not backend authorization: every row still comes from
   * Sheets reads authenticated with the user's Google token. */
  notifications: {
    pollMs: 60000,
    alertFreshHours: 24,
    alertWarningTypes: ['alert_anomaly', 'scan_verdict']
  }
};
