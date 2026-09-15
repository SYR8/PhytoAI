/* PhytoAI dashboard — client configuration.
 *
 * No secrets live in this file. The OAuth client ID is public by design; the
 * spreadsheet ID is an identifier, not a credential. Safety thresholds and all
 * measurements come from SystemConfig at runtime — themes and profile values
 * below are presentation-only and must never alter safety behaviour.
 *
 * EdgeOne: add this site's origin to the OAuth client's "Authorized JavaScript
 * origins", keep the site on HTTPS, and serve these files statically as-is.
 */
window.PHYTOAI_CONFIG = {
  clientId: 'REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
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
  cameraQuietAfterMinutes: 36 * 60
};
