# Dashboard test data — throwaway spreadsheet guide (2026-09-15)

Owner tooling: load the dashboard against a **throwaway test spreadsheet**, then return to the
production sheet with **zero code changes**. The switch is a URL parameter that is remembered locally in
the browser; the code default (`dashboard/config.js` → `spreadsheetId`) stays the production sheet.

Precedence: **`?sheet=<ID>` in the URL  >  browser localStorage override  >  `config.js` production ID.**
Only a spreadsheet-**ID shape** is accepted (`[A-Za-z0-9_-]{20,}`); the dashboard never fetches arbitrary
URLs. Sign-in and scopes are unchanged.

---

## 1. Files in the seed pack

`test-data/dashboard-seed/` — one CSV per tab, matching `docs/dashboard-data-contract-audit.md`:

| File | Tab it must become | Shape |
|---|---|---|
| `SystemConfig.csv` | `SystemConfig` | `Key,Value,LastUpdated` — the 24 audited keys plus `last_lightlevel_utc` and `perenual_status` |
| `Events.csv` | `Events` | all 25 columns A..Y, 59 rows over 14 days, 3 waterings, 2 heating events (one hitting the 40.0 °C cutoff), a tank-empty window, a 35.5 h data gap and one sensor-invalid row |
| `Notifications.csv` | `Notifications` | 9 columns, 10 rows across info/warning/critical |
| `DiseaseScans.csv` | `DiseaseScans` | 10 columns, 3 rows |
| `AgentNotes.csv` | `AgentNotes` | 5 columns, 3 rows |

Everything AI-generated is prefixed **`SAMPLE DATA`**. Photo/folder IDs and `resume_url`s are left
**empty on purpose** (no invented Drive IDs or webhook URLs), so image cards show the genuine empty state.

## 2. Import into a new blank spreadsheet

1. Open <https://sheets.new> (creates a blank spreadsheet in your Google account).
2. For **each CSV**, one import: `File > Import > Upload` → pick the file → Import location:
   **“Insert new sheet(s)”** → `Import data`.
   “Insert new sheet(s)” creates a new tab **named after the file** (e.g. `Events.csv` → tab `Events`).
   The file names already match the tab names the dashboard expects — if a tab comes out differently,
   rename it (double-click the tab) so the names are exactly:
   `SystemConfig`, `Events`, `Notifications`, `DiseaseScans`, `AgentNotes`
   (case matters; no extra spaces; delete the default `Sheet1` if it remains).
3. Optional sanity check: the `Events` tab must show 25 header cells (last column `WaterAddedGrams`).

## 3. Get the spreadsheet ID and open the dashboard

1. Copy the ID from the address bar — it is the long token between `/d/` and `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`<SPREADSHEET_ID>`**`/edit`
2. Open the dashboard with the override (replace `<ID>`):
   **https://phytoai.edgeone.dev/?sheet=\<ID\>**
3. Sign in with the Google account that owns the test sheet (any account that owns the sheet works;
   the login hint field in `config.js` is intentionally empty in the public repository).
4. A banner appears: **“Test sheet active … Back to production sheet.”** — that confirms the override.
   The override is remembered in this browser (localStorage) until you exit.

You can also pass the parameter with the plain origin (the path is irrelevant): `?sheet=<ID>` is read from
the query string. An invalid value is ignored (the production sheet stays selected).

## 4. What should render (verification checklist)

- **Overview:** Monstera identity + confidence, gross weight with trend, moisture/soil/water/air/humidity,
  light raw value, tank state, last pump/heater state, data age, dry-run pill (test pack has
  `dry_run_mode=TRUE`).
- **Warnings area:** the test pack deliberately includes a tank-empty history, an anomaly row and an
  invalid sensor row, so warnings and the **STALE DATA** pill may appear (see §6).
- **History:** pick 7 d / All — weight and moisture curves with **watering markers**, heat markers and a
  **“gap” badge** for the 35.5 h data outage; water temperature shows a single **40.0 °C cutoff** row
  (labelled SAMPLE DATA in the notes) — everything else stays within 18–26 °C.
- **Watering summary:** 3 rows; `ml_est` carries the **EST** tag; measured delta shows **“not persisted”**
  (correct — see the audit’s P1 gap).
- **Notifications:** critical (tank empty), warning (anomaly, scan verdict) and info rows; pending items
  have answer buttons and the detail view exposes the raw row. Answering one writes `done` + your response
  into the **test** sheet (and tries the resume URL only if one exists — the test pack has none).
- **Images:** **empty state everywhere** — the pack contains no Drive files. “No images available yet” is
  the correct behaviour; nothing is fabricated. (Camera last-seen stays empty for the same reason.)
- **AI notes / latest decision:** persisted sample reasoning + the three AgentNotes with the
  “unverified hypotheses” label.
- **Events table:** 59 rows, 25-column-derived values, `ml_est` estimates visible, `wt_delta_g` never shown.
- **System & thresholds:** the read-only grid populated from the test sheet (max water 28 °C, max pump 60 s,
  preheat 2 °C / 25 min, flash threshold 500 …).

## 5. Return to the production sheet

Click **“Back to production sheet”** in the banner. That clears the stored override, removes `?sheet=`
from the URL and reloads — the dashboard reads the real spreadsheet again with no code changes. (Manual
equivalent: remove `?sheet=` from the URL and clear the browser’s localStorage key
`phytoai_sheet_override`.)

When you are done testing, simply delete the throwaway spreadsheet — nothing else to clean up.

## 6. Known, intentional test-pack characteristics

- **Timestamps are a fixed snapshot** (2026-09-01 → 2026-09-15). Viewed later, the dashboard will show the
  **STALE DATA** pill and the “no new data” warning — that is the honest state of a static pack, not a bug.
- **The 40.0 °C water row** exists only to exercise the heater-cutoff story; it is labelled SAMPLE DATA.
- **No images / no Drive links** → empty states (§4).
- **Legacy battery rows are absent on purpose** (camera is wired-only).
- Answers to pending notifications modify the test sheet only — the production sheet is never touched while
  the override is active.

## 7. Regenerating the pack

The CSVs were generated as a deterministic 14-day scenario. If you need the same demo with **fresh
timestamps** (no stale pill), ask the maintainer/session to regenerate the pack — the generator recreates
all five CSVs with the same counts and flags.
