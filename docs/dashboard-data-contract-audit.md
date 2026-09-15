# Dashboard Data Contract Audit — 2026-09-15

Phase 1 deliverable of `docs/dashboard-redesign-brief.md`. Written **before** any UI change. Every statement
below is traceable to a file or a live read; nothing is assumed from the obsolete M5/MCP/serial/FTP/
`photoContract` architecture (verified: those terms have **zero hits** in tracked files; live n8n instance
holds no such nodes — `docs/cross-audit-2026-09-15.md` §3).

Sources: `workflows/phytoai.json` (168 nodes, live-verified identical), `docs/PhytoAI.v2.xlsx` (parsed),
`docs/cross-audit-2026-09-15.md`, `docs/flash-light-gating-spec.md`, `docs/SmartPot-Full-Engineering-Spec-PRD.md`,
`firmware/esp32cam_production/esp32cam_production.ino`, `firmware/wroom_production/wroom_production.ino`,
`STATUS.md`, live n8n reads 2026-09-15.

---

## 1. Persisted data (Google Sheets — the database of record)

The dashboard reads these directly with the OAuth'd Sheets API (`spreadsheets.values.get`, CORS-enabled).
`LastUpdated`/`Timestamp` semantics are per column below.

### 1.1 `SystemConfig` (Key | Value | LastUpdated) — 24 rows (v2 export)

| Key | Unit / type | Semantics | Writer |
|---|---|---|---|
| pot_latitude / pot_longitude | ° (number) | Location for sun calc | owner seed |
| last_watered_utc | ISO-8601 UTC | **Provisional** until firmware confirms pump completion (Plan §2.2) | Branch A when watered |
| last_species_guess | string | Most-confident-wins species | Branch A/B |
| species_confidence | 0–1 | Confidence of that guess | Branch A/B |
| current_temp_tolerance_c | °C | Last used tolerance | Branch A |
| next_sunrise_utc / next_sunset_utc | ISO-8601 UTC | Next solar events (self-healing) | Branch E |
| last_tank_empty_alert_sent | ISO-8601 UTC | 12 h alert cooldown anchor | Branch A |
| dry_run_mode | TRUE/FALSE | **Gates all actuation in n8n and firmware** | owner |
| min_rewater_interval_hours | hours | Guardrail interval | owner seed |
| scan_session_active | TRUE/FALSE | Weekly-scan session open | Branch C scheduler/watchdog |
| camera_battery_percent / camera_battery_min_percent | % | **Legacy** — CAM is wired-only (owner 2026-09-15); must not drive UI | Branch C / seed |
| drive_daily_photos_folder_id / drive_scan_photos_folder_id | Drive ID | Image folders | one-time setup |
| push_vapid_public_key | string | Web Push not built; dashboard does not use | manual |
| max_pump_seconds | s | Pump ceiling (resolved into the decision JSON) | owner seed |
| preheat_margin_c / preheat_lead_minutes | °C / min | Preheat context exposed via `GET /config` | owner seed |
| max_water_temp_c | °C | **Policy** target limit (28) — firmware stops at min(target, it) | owner seed |
| heater_hysteresis_c | °C | Documented firmware constant | seed |
| last_lightlevel | raw LDR | **Digital 0/1 in practice** (Q22: module DO on GPIO25; spec assumes 0–4095) | Branch A every event |
| flash_dark_threshold | raw LDR | Threshold for CAM flash (500 default; scale mismatch with digital values — Q22) | owner |
| last_lightlevel_utc | ISO-8601 UTC | **When the light reading was last written — not a transition time** | Branch A |
| perenual_* (7 keys) | mixed | Advisory species cache; `perenual_status` may be `ok`/`not_found`/… | perenual enrichment |

`LastUpdated` = the time n8n wrote the row (scheduler or event time), not sensor-measurement time.

### 1.2 `Events` (25 columns A..Y; **n8n writes A..V only**)

| Col | Field | Unit / type | Semantics | Written? |
|---|---|---|---|---|
| A | EventID | string | `wroom-<epoch>` (sensor) / `cam-<YYYYMMDD>` (photo) | ✓ |
| B | Timestamp | ISO-8601 (local offset in sheet) | **Row-created time (`$now` at decision)** — not the device's capture time | ✓ (sensor) / ✗ (photo rows — gap G1) |
| C | EventType | string | `sunrise`/`sunset`/`sensor`; photo rows empty (gap G1) | ✓ / ✗ |
| D | MoisturePercent | % 0–100 | Capacitive soil (calibrated map 4095→0 %, 1964→100 %) | ✓ |
| E | SoilTempC | °C | DS18B20 soil | ✓ |
| F | WaterTempC | °C | DS18B20 water | ✓ |
| G | AirTempC | °C | DHT22 | ✓ |
| H | AirHumidityPercent | % | DHT22 | ✓ |
| I | WeightGrams | g (gross) | HX711, **gross platform weight** once the production firmware's offset policy is in force (plant+soil+tray+plumbing+water) | ✓ |
| J | LightLevel | raw LDR | Digital 0/1 in practice (Q22) | ✓ |
| K | TankEmpty | bool | LOW = empty (owner-confirmed) | ✓ |
| L | WateringTriggered | bool | Executed watering (false in dry-run) | ✓ |
| M | WaterDurationSeconds | s | **Commanded** pump seconds (not measured flow) | ✓ |
| N | HeaterUsed | bool | Executed heating | ✓ |
| O | HeaterDurationSeconds | s | Commanded heater seconds | ✓ |
| P | SpeciesGuess | string | Species at event time | ✓ |
| Q | SpeciesConfidence | 0–1 | | ✓ |
| R | PhotoFileID | Drive ID | Daily photo linked to that row | ✓ (via photo upsert) |
| S | AnomalyDetected | bool | Persisted AI result | ✓ |
| T | AnomalyDescription | string | Persisted AI result | ✓ |
| U | AI_Notes | string | Persisted AI text | ✓ |
| V | ReasoningSummary | string | Decision reasoning (persisted AI text) | ✓ |
| W | WateringAborted | bool | **Never written** | ✗ |
| X | FinalWaterTempC | °C | **Never written** | ✗ |
| Y | WaterAddedGrams | g | **Never written — the measured `wt_delta_g` has no persistence path** (gap G2) | ✗ |

### 1.3 `Notifications` (9 columns)

`timestamp` (ISO), `type` (string), `title`, `message`, `response_options` (JSON array string), `status`
(`pending`/`done`/`expired`), `response` (string), `resume_url` (n8n wait-resume URL), `context_ref`.
**Persisted statuses = read/unread; responses persisted by the dashboard's Sheets write.** Types currently
emitted: `watering_feedback`, `scan_scheduled`, `scan_verdict`, `scan_followup`, `alert_tank_empty`,
`alert_battery_low` (legacy, wired-only CAM), `alert_anomaly`, `scan_postponed`, `smoke_test`.
Severity is **not a column** — deterministic mapping (§6).

### 1.4 `DiseaseScans` (10 columns)

`timestamp` (device capture time — truthful), `drive_links` (Drive URL), `vision_opinion` (JSON string),
`yolo_opinion` (JSON string), `judge_verdict`, `judge_reasoning`, `treatment_plan`, `user_verdict`,
`treatment_outcome`, `ai_notes`. All scan AI content here is **persisted, real output** — safe to display
labelled as generated analysis.

### 1.5 `AgentNotes` (5 columns)

`timestamp`, `agent` (History Analyst / Decision Agent / Vision Analyst / Judge / Treatment Advisor /
Perenual), `note`, `context_ref`, `status`. Persisted, explicitly **unverified hypotheses** by design.

### 1.6 `PushSubscriptions` (7 columns)

Not used by the dashboard (Web Push not built). Documented, not rendered.

## 2. Live-only data (never persisted — must not be shown as history)

- WROOM decision JSON returned to the device (12 fields, `Build Decision Response`, `phytoai.json` L327/L405):
  `event_id, needs_watering, water_duration_seconds, heater_on, temperature_tolerance_c,
  max_heater_seconds, water_warmer_than_soil_action, species_guess, ai_notes, dry_run, recheck_hours,
  max_pump_seconds`. Only its **derived** effects land in `Events`.
- WROOM production firmware serial telemetry: `wt_before_g`, `wt_after_g`, `wt_delta_g`, `ml_est`,
  completions with `"simulated"` — **log-only** (no ack endpoint exists; verified in the decision schema).
  The dashboard must not pretend these exist.
- `GET /config` response (sun times, dry-run, lat/lng, `last_lightlevel`, `flash_dark_threshold`,
  `last_lightlevel_utc`, `preheat_margin_c`, `preheat_lead_minutes`) — live device context; the same values
  are readable from SystemConfig.

## 3. Images

- **Daily photos:** `Events.PhotoFileID` (Drive ID) on the upserted `cam-YYYYMMDD` row.
- **Scan photos:** `DiseaseScans.drive_links` (a `https://drive.google.com/file/d/<id>/view` URL).
- **Metadata available per file (Drive API `files.get`, real fields):** `id`, `name`, `createdTime`,
  `mimeType`, `imageMediaMetadata.width/height`. Requires `drive.readonly` (already in scopes).
- **Not available anywhere:** capture reason, per-image light condition, camera model/exposure, camera
  battery (wired-only), heartbeat.

## 4. Endpoints (device-facing) and dashboard access

| Endpoint | Caller | Dashboard uses? |
|---|---|---|
| `POST /webhook/core/sensor` | WROOM → n8n | No (device-only) |
| `POST /webhook/core/photo` | CAM → n8n (multipart incl. `event_id`, `event_type="photo"`, `captured_at_utc`, `battery_percent`) | No |
| `POST /webhook/yolo-scan` + `/yolo-scan/done` | CAM → n8n | No |
| `GET /webhook/config` | devices | No (mirror data is in SystemConfig) |
| `Notifications.resume_url` (per row) | dashboard (user action) | **Yes — data-driven URL from the sheet; CORS unverified → `no-cors` fallback + persistence via Sheets write** |

**There is no dashboard-facing API endpoint.** The dashboard reads Google APIs directly:
`sheets.googleapis.com/v4/spreadsheets/{id}/values/...` and `www.googleapis.com/drive/v3/files/{id}`.
No n8n credentials or webhook secrets are used in the browser.

## 5. Required UI fields → source mapping

| UI need | Source | Status |
|---|---|---|
| Plant name / variety / type / theme | optional owner-seeded SystemConfig rows (`plant_name`, `plant_variety`, `plant_type`, `plant_theme`) + client profile config (presentation only) | available after seeding; fallback = species guess + default theme |
| Species + confidence | SystemConfig `last_species_guess`/`species_confidence` | ✓ |
| Current status explanation | derived from latest Events row + SystemConfig (dry-run, tank, staleness, pending alerts) | deterministic (client) |
| Gross weight + trend | Events `WeightGrams` (gross) | ✓ |
| Soil moisture / soil temp | Events `MoisturePercent`, `SoilTempC` | ✓ |
| Water temp | Events `WaterTempC` | ✓ |
| Air temp / humidity | Events `AirTempC`, `AirHumidityPercent` | ✓ |
| Light state / last reading | Events `LightLevel`, SystemConfig `last_lightlevel` + `last_lightlevel_utc` (**raw only** — Q22) | ✓ raw; semantics unverified |
| Tank empty | Events `TankEmpty`, SystemConfig `scan_*`/alerts | ✓ |
| Pump + heater state | Events `WateringTriggered`/`WaterDurationSeconds`, `HeaterUsed`/`HeaterDurationSeconds` (last event = state; not a live GPIO read) | ✓ as last-known |
| Dry-run | SystemConfig `dry_run_mode` | ✓ |
| Device last-update / staleness | max Events `Timestamp` vs expected cadence (sunrise/sunset ≈ 12 h) | derived, labelled |
| Camera last-seen | latest image row timestamp (G1) / Drive `createdTime` | ✓ after G1 |
| Latest decision/recommendation | Events `ReasoningSummary`, `AI_Notes`, `WateringTriggered` | ✓ (persisted AI text, labelled) |
| Warnings / critical alerts | Notifications rows + tank/dry-run/staleness derivations | ✓ |
| History charts (weight/moisture/temps/humidity) | Events rows (ranges 24 h / 7 d / 30 d / all) | ✓ |
| Event markers (water/heater/tank) | Events flags | ✓ |
| Connectivity/sensor-validity gaps | timestamp deltas + empty cells | derived |
| Watering ml_est | `WaterDurationSeconds × calibrated flow (9.706 ml/s, hw-bench 2026-09-15)` | computed **estimate**, label enforced |
| Watering wt_delta_g | **nowhere persisted** | **gap G2 — show "not persisted"** |
| Image history / latest image / viewer | Events.PhotoFileID + DiseaseScans.drive_links + Drive metadata | ✓ (G1 improves timestamps) |
| AI results per image | DiseaseScans opinions; Events AnomalyDetected/Description/AI_Notes | ✓ only where persisted |
| Notification center (severity, filters, ack) | Notifications rows; severity client-mapped; ack = Sheets write + resume best-effort | ✓ |
| AI notes panel | AgentNotes | ✓ labelled unverified |
| Thresholds (safety, read-only) | SystemConfig: `max_water_temp_c`, `max_pump_seconds`, `min_rewater_interval_hours`, `preheat_*`, `flash_dark_threshold` | ✓ backend-driven; themes cannot change them |

## 6. Notification severity mapping (deterministic, client-side)

| type | severity |
|---|---|
| `alert_tank_empty` | critical |
| `alert_anomaly`, `scan_verdict` | warning |
| `alert_battery_low` (legacy) | warning (dimmed/legacy tag — CAM is wired-only) |
| `scan_scheduled`, `scan_postponed`, `scan_followup`, `watering_feedback`, `smoke_test` | info |
| unknown type | info + raw type shown |

`status=pending` → unread/actionable; `done`/`expired` → history. Raw row is always available in the detail
view (debug), per the brief's adapter requirement.

## 7. Missing data and remedies

| # | Missing | Remedy class | Decision |
|---|---|---|---|
| G1 | Daily-photo rows have no `Timestamp`/`EventType` → image timestamps/ordering impossible | **deterministic n8n transformation** | **Implement now** — `Build Photo Update Row` carries `Timestamp` (webhook `captured_at_utc`, fallback `$now`) + `EventType` (`photo`); `Update Event Row` maps both |
| G2 | Measured `wt_delta_g` (and persisted `ml_est`) — firmware logs only | **API change (firmware completion POST) + n8n persistence** | Document only (firmware is out of scope for this task). Target: WROOM completion POST → n8n → `Events.WaterAddedGrams` (+ optional `FinalWaterTempC`). UI shows "not persisted" until then |
| G3 | Image dimensions | none needed | Drive API `imageMediaMetadata` (client) |
| G4 | Capture reason / per-image light condition | persistence (optional column) / image metadata endpoint | Optional; not fabricated. Classified: persistence |
| G5 | Plant name/variety/type/theme | persistence (optional owner-seeded SystemConfig rows) | Supported read-only; no workflow change needed |
| G6 | Device heartbeat / true online state | persistence (heartbeat row) or deterministic derivation | Derived staleness only; labelled as age, never "online" |
| G7 | Light/dark derivation | documentation/measurement (Q22) | Out of scope; show raw value + caveat |
| G8 | Trend explanation / image-diff description | optional AI interpretation | **No AI node added** — no proven need; existing persisted AI text is shown instead |
| G9 | Notification read/unread per user | already persisted (`status`) | ✓ |

## 8. Authentication and CORS for EdgeOne

- **Auth:** Google Identity Services token flow (`google.accounts.oauth2.initTokenClient`) with scopes
  `spreadsheets` + `drive.readonly`; token kept in `sessionStorage`; no secrets in browser files (the OAuth
  client ID is public by design; the VAPID **private** key never appears — only the public key row exists).
- **EdgeOne requirements:** add the EdgeOne site origin to the OAuth client's *Authorized JavaScript
  origins* (and the client ID is already configured in `dashboard/config.js`); HTTPS is required by GIS.
- **CORS:** Google Sheets/Drive REST APIs send permissive CORS headers and accept `Authorization: Bearer`;
  Drive media fetch (`?alt=media`) also works with the token. n8n `resume_url` calls are best-effort:
  the dashboard POSTs/GETs with `no-cors` fallback when CORS headers are absent and **always persists the
  response in the sheet**, so no workflow data is lost if the resume fails.
- **Failure modes:** token expiry → re-connect prompt; API 401/403/429 → banner with retry; offline →
  cached last render + explicit "stale" banner. No server-side rendering, no build step, plain static files.

## 9. Fields/conclusions the dashboard must never claim

- Absorbed/retained/measured water (`ml_est` is an estimate; `wt_delta_g` is not persisted yet).
- Plant health scores, growth predictions, disease-free guarantees — none exist.
- Camera battery / charging state (wired-only camera, owner 2026-09-15).
- True device online/offline or heartbeat (only data age).
- Light/dark transitions or lux values (raw digital readings only; scale mismatch open as Q22).
- Per-image capture reason or light condition (not persisted).
- Any M5/MCP/serial/FTP/`photoContract` concept.
- Safety thresholds from themes or client config (thresholds are backend/config values only).

## 10. Changes applied as a result of this audit

1. **n8n (required, deterministic):** `Build Photo Update Row` + `Update Event Row` now persist
   `Timestamp` + `EventType` for daily-photo rows (G1). Applied through the existing MCP pipeline, repo
   export updated, live re-verified.
2. **Dashboard:** rebuilt `dashboard/` (index/app/styles/config) strictly against §5 mapping; no invented
   endpoints/fields/history; no AI node.
3. **Not changed (deliberately):** firmware (out of scope), Workflow decision logic, Sheets schema/headers,
   SystemConfig seed values, and all safety thresholds.

## 11. Remaining backend tasks (explicit, not hidden)

- **P1 (persistence, needed for measured-water history):** WROOM completion POST with `wt_delta_g` /
  `ml_est` → n8n → `Events.WaterAddedGrams` (columns already exist). Until then the UI renders
  "measured delta: not persisted (backend gap)".
- **P2 (optional):** image metadata columns (capture reason, ambient light) or a per-image metadata
  endpoint; background/lens metadata via Drive is already used.
- **P3 (optional):** device heartbeat row for true connectivity (today: data-age derivation only).
- **P4 (optional, Q22):** decide the LDR scale fix (analog LDR on ADC1 vs status-quo digital + updated
  threshold semantics) before the dashboard labels light states.
