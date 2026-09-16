/* PhytoAI dashboard — client configuration.
 *
 * No secrets live in this file. The OAuth client ID is public by design; the
 * spreadsheet ID is an identifier, not a credential. Safety thresholds and all
 * measurements come from SystemConfig at runtime — themes and profile values
 * below are presentation-only and must never alter safety behaviour.
 *
 * EdgeOne: add EXACTLY this origin to the OAuth client's "Authorized JavaScript
 * origins" (Google matches scheme + host exactly — no trailing slash, no path):
 *     https://phytoai.edgeone.dev
 * Keep the site on HTTPS and serve these files statically as-is. The client ID
 * below must belong to that same Google Cloud OAuth client.
 */
window.PHYTOAI_CONFIG = {
  /* Public by design (OAuth Web client ID); client secrets never belong here. */
  clientId: '515418269010-ensbsq2skmsrsk3npg9quupqt76rboc2.apps.googleusercontent.com',
  /* login suggestion only — Google account chooser still decides; users can select a different account.
     Empty/absent = the hint parameter is omitted entirely. */
  GOOGLE_LOGIN_HINT: 'zibrahimzaki7@gmail.com',
  /* Spreadsheet of record (production). Owner-tooling override precedence:
   *   1) ?sheet=<SPREADSHEET_ID> in the URL (ID shape validated, then remembered)
   *   2) localStorage key 'phytoai_sheet_override' (set by the URL parameter)
   *   3) this value (production sheet)
   * Only a spreadsheet-ID shape is accepted — arbitrary URLs are never fetched.
   * See docs/dashboard-test-data.md for the throwaway test-sheet workflow. */
  spreadsheetId: '10a3YXWBN4-hFJQQT4sLERmyu8D2TxYKNkXW-k3QRyLI',
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

  /* ml_est basis ONLY: calibrated pump flow from docs/hw-bench-2026-09-15.md
   * (PUMP_FLOW_ML_PER_SEC = 9.706). Used to show "estimated" millilitres from
   * the commanded duration; never presented as measured water. A SystemConfig
   * row pump_flow_ml_per_sec, if seeded, overrides this. */
  pumpFlowMlPerSec: 9.706,

  /* Staleness is derived from the newest persisted event timestamp. These are
   * presentation thresholds for the "data age" indicator only — they are not
   * safety limits and do not change workflow behaviour. */
  staleAfterMinutes: 14 * 60,     // ~ one sun-event cycle + margin
  cameraQuietAfterMinutes: 36 * 60,

  /* Public assistant endpoints (n8n via the named tunnel). No tokens live here:
   * the dashboard sends the signed-in user's Google access token and the workflow
   * verifies it server-side (audience + expiry) before answering. The endpoints
   * only exist while the workflow is ACTIVE. */
  assistantBase: 'https://n8n.mnsof.me',
  assistantRoutes: {
    ask: '/webhook/dashboard/ask',
    overview: '/webhook/dashboard/overview',
    detection: '/webhook/dashboard/detection'
  },
  /* Client patience must outlast real workflow time: an AI synthesis can take
   * 20-60 s (agent + parser + bounded context). The browser used to abort at
   * 15 s while n8n kept working - the execution succeeded and the UI showed an
   * error. These are hard caps, not targets. */
  assistantTimeouts: { ask: 60000, overview: 25000, detection: 25000 },
  /* Failures throttle retries so a refresh storm cannot hammer Sheets reads.
   * `busy` applies to rate-limit/'temporarily busy' responses. */
  assistantCooldownMs: { failure: 15000, busy: 60000 },
  plantId: 'default'
};
