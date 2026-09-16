# PhytoAI — AI-assisted plant monitoring and climate control

PhytoAI is a DIY smart-pot system: an ESP32-based device senses soil moisture, temperatures, air humidity, pot weight, light and tank level, a self-hosted n8n workflow decides when to water or heat, Google Sheets acts as the plant's database, and a static web dashboard shows the plant's state — with an optional camera and a local image classifier for disease suspicion.

> German description: **PhytoAI: KI-gestützte Pflanzenüberwachung & Klimasteuerung**.
> A German translation of this file is available: **[README.de.md](README.de.md)**.

**Honest one-line status:** the software chain is implemented and tested with simulations and test data; the hardware is bench-tested component by component; a continuous run on a real plant has **not** happened yet. See [Current status](#4-current-status).

---

## 1. Project title and one-sentence explanation

**PhytoAI** monitors a plant around the clock and makes care decisions — watering and water heating — from sensor history instead of a fixed timer, and shows everything in a web dashboard. It was built as a solo project by **Mohammad Abdin** (`MOs`).

## 2. What PhytoAI does — the complete data flow

```
ESP32-WROOM ── sensor JSON ──▶ n8n workflow ── decision JSON ──▶ WROOM (pump / heater)
ESP32-CAM   ── photos      ──▶ n8n workflow ──▶ Google Drive (photos) + AI analysis
n8n         ── reads / writes ──▶ Google Sheets (Events, SystemConfig, DiseaseScans,
                                  Notifications, AgentNotes)
n8n         ── pending rows / answers ──▶ Dashboard (static site, user's Google login)
Dashboard   ── resume-URL callbacks ──▶ n8n (human-in-the-loop answers)
```

1. **Sense:** the WROOM wakes on its schedule, reads all sensors, and POSTs a JSON payload to the workflow (`POST /webhook/core/sensor`).
2. **Decide:** the workflow reads recent history and SystemConfig, an AI agent proposes a decision from the history, and a deterministic guardrails layer (plain code, never AI) enforces the safety rules. The decision JSON goes back in the same HTTP response; the WROOM only executes, it never decides locally.
3. **Store:** every event is appended to the `Events` sheet; photos go to Google Drive; scan verdicts, working notes and configuration live in their own tabs.
4. **Analyse (optional):** a second ESP32-CAM posts daily photos and a weekly scan photo. A vision agent plus a local YOLOv8 classification service produce a verdict; the owner confirms it in the dashboard (human in the loop).
5. **Show:** the dashboard reads Sheets/Drive directly with the user's own Google login and renders status, history, charts, the Plant Doctor and the assistant. Optional in-page browser alerts mirror critical notifications while the tab is open.
6. **Ask the human:** open questions (e.g. “was this watering right?”) are `Notifications` rows with a resume URL; dashboard buttons resume the paused workflow.

## 3. Why it matters

Houseplants usually die from irregular or thoughtless watering, not from the room itself. PhytoAI is meant as a cheap retrofit that watches a plant continuously, reacts in time, and reports problems from anywhere — so plants are not lost silently. The project aims at an affordable end-to-end build rather than a lab setup. (Motivation and use cases in the owner's own words are in [docs/bwki-answers-draft.md](docs/bwki-answers-draft.md).)

## 4. Current status

Legend: **implemented** (code exists and works in tests) · **tested** (verified, with how) · **prototype** (works but rough) · **optional** · **not implemented** · **owner-specific** (only works in this deployment).

| Part | Status |
|---|---|
| n8n workflow (`workflows/phytoai.json`, 224 nodes) | **implemented + tested** via many simulated executions and pinned-data tests. **Owner-specific:** currently deactivated by the owner (can be re-activated anytime); `dry_run_mode` is `TRUE`. |
| Dashboard (`dashboard/`) | **implemented + tested** (headless end-to-end suites: startup requests, charts, assistant, notifications — see `docs/dashboard-ux-v3.md`, `docs/dashboard-notifications.md`); deployed by the owner on a static host. |
| WROOM production firmware | **implemented**; compile-verified only — **not flashed** yet. |
| WROOM calibration/bench sketch | **tested**: flashed and bench-run 2026-09-15 (constants recorded in `docs/hw-bench-2026-09-15.md`). |
| ESP32-CAM production firmware | **implemented**; compile-verified only — **not flashed**; 14-test plan prepared in `firmware/esp32cam_production/PRODUCTION-TESTS.md`. |
| ESP32-CAM test sketch | **tested** on the bench (camera init, Wi-Fi, webhook upload). |
| Local disease classifier (`yolo-service/`) | **implemented + tested**: deployed on the owner's server with the trained model (validation metrics below). |
| In-app notification centre | **implemented + tested** (`docs/dashboard-notifications.md`). |
| Browser alerts while the tab is open | **implemented + tested** (permission requested only on click). |
| Closed-site push notifications | **not implemented** (no service worker, no Web Push). |
| Continuous real-plant operation | **not yet** — first full end-to-end run is still pending. |
| Camera power | **owner-specific:** wired-only; legacy battery fields remain in schema/firmware and are obsolete. |

Measured model result (validation split only): **96.08 % top-1 / 99.955 % top-5**; no separate test set and no training-accuracy measurement, so none is claimed. Details: [Model support](#14-data-model) and [docs/yolo-service-spec.md](docs/yolo-service-spec.md).

## 5. Architecture — who is responsible for what

| Layer | Responsibility |
|---|---|
| **ESP32-WROOM firmware** (`firmware/wroom_production/`) | Reads sensors, POSTs telemetry, executes the decision JSON (pump / heater), enforces hardware safety limits, never decides locally. `GET /webhook/config` supplies sun times, dry-run and preheat context. |
| **Sensors** | Capacitive soil moisture, 2× DS18B20 (soil + water temperature on one bus), DHT22 (air temperature/humidity), 1 kg load cell + HX711 (pot weight), LDR (light), XKC-Y25 tank level. |
| **Camera hardware** (`firmware/esp32cam_production/`) | Static ESP32-CAM; daily photo + weekly scan photo; wired power. |
| **Automation workflow** (n8n, `workflows/phytoai.json`) | The system's brain: orchestrates branches A–E, talks to Sheets/Drive, runs AI agents, HITL waits and guardrails. |
| **Storage** (Google Sheets + Drive) | One spreadsheet (five tabs, see data model) is the database; Drive stores the photos. |
| **AI/ML** | Cloud agents via OpenRouter (`google/gemma-4-26b-a4b-it`, temperature 0.2) for history/decision/vision/treatment; a **local** YOLOv8n-cls classifier (`yolo-service/`, FastAPI + Ultralytics, CPU) gives a low-weighted second opinion for disease scans. |
| **Dashboard** (`dashboard/`) | Read-only UI for humans: status, charts, Plant Doctor, assistant, notification centre; writes only HITL answers. |
| **Notifications** | In-app centre + optional browser alerts while the page is open. Closed-site push is **not** built. |

## 6. What a newcomer can build

| Build level | You need |
|---|---|
| **A. Software-only demonstration** | n8n (Docker), a Google account with the five-tab sheet (seed from `test-data/dashboard-seed/`), an OpenRouter key for the AI branches, and the dashboard served locally/static. No hardware: you can exercise the workflow with test payloads and see real dashboard behaviour. |
| **B. Sensor-enabled build** | Level A + ESP32-WROOM + sensors + relay board + pump + heater (see hardware). Flash `wroom_calibration` first, then `wroom_production`. |
| **C. Complete hardware build** | Level B + ESP32-CAM (wired power) + the camera fins/stand. |
| **D. Optional camera/AI workflow** | Level C + the local classifier service (`yolo-service/`, CPU-only server or VPS) and an optional free Perenual key for the advisory species/pest layer. |
| **E. Optional dashboard deployment** | Serve `dashboard/` from any HTTPS static host (the owner uses a static hosting service). |

Levels are cumulative. Nothing in level A requires the physical device, and nothing in levels B–E is hidden behind a paid service except the OpenRouter key (the AI branches) and your own hosting choices.

## 7. Hardware requirements

From `Hardware/Hardware-list.txt` plus the bench-verified pin map in `docs/hw-bench-2026-09-15.md`:

**Core:** ESP32-WROOM dev board (+ expansion board as in the list) · 5 V 4-channel relay module · DHT22 · capacitive soil moisture sensor · 2× DS18B20 (waterproof, one OneWire bus) · 1 kg load cell + HX711 · 3–5 V submersible pump · 5 V/10 W USB aquarium heater · XKC-Y25 non-contact tank sensor · 5 V USB power supply and wiring.

**Optional:** ESP32-CAM (with its own 5 V supply — never power it from an arbitrary GPIO), LDR module (digital output used), status LED.

**Pins (bench-verified, `firmware/wroom_production/wroom_production.ino`):** pump **13**, heater **16** (both active-low relay), HX711 **DT 26 / SCK 33**, OneWire **4**, soil ADC **34**, tank **27** (LOW = empty), DHT22 **14**, LDR **25**, LED **2**.

**Safety notes (mandatory):** operate the heater **submerged only**; firmware enforces a 40.0 °C cutoff, refuses to start at ≥ 39.5 °C, and caps any continuous actuation at 120 s; relays default OFF at boot. An early brief contained a stale pin map (pump 4, HX711 5/25, OneWire 13, soil 26) — it is superseded; use the map above.

## 8. Software requirements

- **Arduino IDE or arduino-cli** with the **ESP32 core 3.3.11**; libraries: ArduinoJson 7.4.2, HX711 0.7.5, OneWire 2.3.8, DallasTemperature 4.0.6, DHT 1.4.7 (versions from the production build).
- **n8n** (Docker recommended) — the workflow export in `workflows/phytoai.json` is importable.
- **Python 3** for the training scripts and the classifier service (`scripts/requirements` list is in `scripts/README.md`; service deps in `yolo-service/requirements.txt`).
- **A browser** for the dashboard — no build step, no npm dependencies.
- **Optional:** any HTTPS static host for the dashboard; a small CPU server/VPS for `yolo-service` (CPU is enough; the model was trained CPU-only).

## 9. Accounts and external services (you create these yourself)

| Service | Why | Notes |
|---|---|---|
| Google account + Google Cloud project | Sheets + Drive + OAuth login for the dashboard | Enable **Google Sheets API** and **Google Drive API**; create an OAuth **Web** client; add your origins; client **secret is never used or stored** here. |
| Google Sheets spreadsheet | The database | Create the five tabs with the exact headers from the data model, or import the seed CSVs from `test-data/dashboard-seed/`. |
| n8n instance | Runs the workflow | Self-hosted (Docker) or your own server. |
| OpenRouter account + API key | The AI agents (Gemma) | Needed for the AI branches; deterministic assistant intents work without an LLM call. |
| Static host (optional) | Dashboard | Any HTTPS host; the owner uses one too. |
| VPS / small server (optional) | Local classifier (`yolo-service`) | CPU-only, reachable from n8n inside the same Docker network. |
| Perenual API key (optional) | Advisory species/pest reference for scan treatments | Free tier; the workflow degrades gracefully without it. |

## 10. Configuration — templates and what stays private

- **Dashboard:** copy [`dashboard/config.example.js`](dashboard/config.example.js) to `dashboard/config.js` and fill in your client ID, spreadsheet ID and n8n host. The example contains only `<PLACEHOLDER>` values.
- **Firmware:** each sketch has a `secrets.h` section (`SECRET_WIFI_SSID`, `SECRET_WIFI_PASSWORD`, `SECRET_BASE_URL`, `SECRET_WEBHOOK_PREFIX`). `secrets.h` is git-ignored — **never commit it**. For production use the `/webhook` prefix; `/webhook-test` is for the n8n test listener.
- **Workflow:** credentials are referenced **by name only**; create them in the n8n UI (see workflow setup).

**Must stay private:** OAuth client secrets, Wi-Fi credentials, OpenRouter/Perenual API keys, n8n API keys, bearer tokens, personal email addresses, and any production-only IDs you do not want public. This repository intentionally contains **no** secrets; a pre-push key scan is documented in section 19.

## 11. Build order (recommended)

1. **Clone** this repository.
2. **Prepare the hardware** (solder/plug sensors, relay, pump, heater per section 7).
3. **Install dependencies** (Arduino core + libraries, n8n, Python for the service/scripts).
4. **Configure services**: Google Cloud APIs + OAuth client; n8n instance; OpenRouter key.
5. **Create the storage schema**: five tabs with exact headers (or import `test-data/dashboard-seed/*.csv` into a *test* spreadsheet first).
6. **Configure the workflow**: import `workflows/phytoai.json`, create the credentials by name, set your sheet/folder IDs in SystemConfig.
7. **Flash the firmware**: first `firmware/wroom_calibration/` (bench, calibrate, record values), then `firmware/wroom_production/` after filling `secrets.h` and your bench constants.
8. **Test device data**: watch the serial monitor, then confirm rows appear in `Events`.
9. **Deploy the dashboard**: copy config, serve statically, sign in, verify data.
10. **Test notifications**: in-app centre first, then the optional browser alerts in Settings.
11. **Troubleshoot** with section 19.

## 12. Firmware setup

- **Board:** ESP32-WROOM dev module (FQBN `esp32:esp32:esp32` for ESP32 Dev Module in the ESP32 core; the CAM uses `esp32:esp32:esp32cam`).
- **Libraries:** see section 8.
- **Pins:** the table in section 7 (do not use ADC2 pins for analog sensors while Wi-Fi is active — that is why soil is on GPIO34).
- **Wi-Fi / server:** fill `secrets.h`. `SECRET_BASE_URL` is the HTTPS base of your n8n instance (e.g. your tunnel/domain); `SECRET_WEBHOOK_PREFIX` = `/webhook` for production.
- **Calibration (`firmware/wroom_calibration/`):** serial menu at 115200; `t` tares, `w` runs the two-point calibration (empty platform → known grams; factor = offset-compensated raw / grams), `e` runs the bench heater test (submerged only). Measured reference values: scale factor `1068.335`, `SOIL_ADC_DRY 4095`, `SOIL_ADC_WET 1964`, pump flow `9.706 ml/s`, tank LOW = empty, relay active-low. The historical factor `305.070f` was computed with a broken read and **must not be reused**.
- **Safe restart behaviour:** relay OFF at boot; 8 s watchdog; actuator hard cap 120 s; heater 40.0 °C cutoff / 39.5 °C refuse; `dry_run_mode` in SystemConfig zeroes all actuation fields, so a fresh system cannot move anything until you turn it off intentionally.
- **Verify output:** serial log shows Wi-Fi + NTP + sensor values; `Events` rows appear after a sensor cycle; the decision response is printed by the firmware.

## 13. Camera setup

- **Power:** the camera is **wired-only** in the owner's build (owner-verified). Give the ESP32-CAM its own stable 5 V supply; do not try to power it from a spare GPIO or from the WROOM board's regulator. Legacy battery fields (`camera_battery_percent`, `camera_battery_min_percent`, the battery test in `PRODUCTION-TESTS.md`) are leftovers from an earlier design and are obsolete.
- **Optional:** yes — levels A and B of section 6 work without a camera.
- **How images reach the pipeline:** the CAM posts a daily photo to `POST /webhook/core/photo` and a weekly scan photo to `POST /webhook/yolo-scan` (session-gated), then closes the session with `/webhook/yolo-scan/done`. Photos land in Google Drive; the workflow analyses them (vision agent + local YOLO service) and writes the outcome to `DiseaseScans`.
- **Limitations:** one camera cannot see all leaves of a large plant (the owner’s stated weakness); framing is fixed and only manually adjustable; per-photo capture reason and light condition are **not persisted**; the vision verdict is an unverified AI hypothesis until the owner confirms it.

## 14. Data model

One spreadsheet, **five tabs** (headers exactly as in `test-data/dashboard-seed/`):

**`Events`** — one row per sensor/photo event:
`EventID, Timestamp, EventType, MoisturePercent, SoilTempC, WaterTempC, AirTempC, AirHumidityPercent, WeightGrams, LightLevel, TankEmpty, WateringTriggered, WaterDurationSeconds, HeaterUsed, HeaterDurationSeconds, SpeciesGuess, SpeciesConfidence, PhotoFileID, AnomalyDetected, AnomalyDescription, AI_Notes, ReasoningSummary, WateringAborted, FinalWaterTempC, WaterAddedGrams`

**`SystemConfig`** — key/value store. Reference keys (from the seed set): `pot_latitude`, `pot_longitude`, `last_watered_utc`, `last_species_guess`, `species_confidence`, `next_sunrise_utc`, `next_sunset_utc`, `last_tank_empty_alert_sent`, `dry_run_mode`, `min_rewater_interval_hours`, `scan_session_active`, `max_pump_seconds`, `max_water_temp_c`, `preheat_margin_c`, `preheat_lead_minutes`, `heater_hysteresis_c`, `flash_dark_threshold`, plus optional `camera_battery_*`, `drive_*_folder_id`, `push_vapid_public_key` (unused today).

**`DiseaseScans`** — scan results:
`timestamp, drive_links, vision_opinion, yolo_opinion, judge_verdict, judge_reasoning, treatment_plan, user_verdict, treatment_outcome, ai_notes`

**`Notifications`** — the human-in-the-loop queue:
`timestamp, type, title, message, response_options, status, response, resume_url, context_ref` (status: `pending` → `done`/`expired`)

**`AgentNotes`** — agent working memory:
`timestamp, agent, note, context_ref, status`

Full schemas and seeds: `docs/Plan.md` §2 and `test-data/dashboard-seed/`.

## 15. Important semantics

- **Measured vs estimated:** `ml_est` in the dashboard is an **estimate** from pump runtime × calibrated flow (`9.706 ml/s` reference) and is labelled as such. The **measured** weight delta is handled separately; it is currently **device-log only** — the workflow does not persist it, so the `WaterAddedGrams` column deliberately stays empty.
- **NOT-PERSISTED fields:** measured water delta (log only), capture reason and per-photo light condition, and raw resume-URL texts beyond `Notifications.resume_url`.
- **Timestamps:** UTC ISO-8601, all ending in `Z`.
- **Units:** moisture %, temperatures °C, weight g, light raw digital (0/1), durations s, flow ml/s.
- **Calibration values:** scale factor, soil dry/wet ADC, pump flow, DS18B20 addresses, relay polarity, tank level semantics — all measured on the bench (`docs/hw-bench-2026-09-15.md`); recalibrate for your own hardware.
- **Safety boundaries:** firmware hard limits (40.0 °C cutoff, 39.5 °C refuse, 120 s actuator cap, 8 s WDT) are authoritative over everything; the workflow’s guardrails (tank-empty forces watering off, `min_rewater_interval_hours`, `max_pump_seconds`, `max_water_temp_c`, `dry_run_mode`) are authoritative over AI output; the AI is advisory only. No AI output can override the code guardrails.

## 16. Dashboard

- **Deployment:** any static HTTPS host (no build step). Locally: `npx serve dashboard` or `python -m http.server` inside `dashboard/`.
- **Google client:** create a Web OAuth client, add your exact origin, copy the client ID into `config.js` (see `dashboard/config.example.js`).
- **Production vs test sheet:** `?sheet=<SPREADSHEET_ID>` switches the dashboard to a test spreadsheet (remembered in the browser, banner shown, “Back to production sheet” button). See `docs/dashboard-test-data.md`.
- **Routes:** Overview, Timeline, Assistant, Doctor, Photos, Insights, Settings.
- **Browser notification permission:** requested **only** after clicking “Enable browser alerts” in Settings — never on page load. States unsupported / not requested / granted / denied are shown explicitly; denial leaves the in-app centre fully working; permission is never used as backend authorization.
- **In-app centre:** the Timeline screen lists all `Notifications` rows with severity, source, time, plant context and answer buttons. No read/unread state is invented — status comes from the sheet.
- **Visible-tab polling limitation:** notifications are polled once a minute **while the tab is visible**; hidden or closed tabs receive nothing.
- **Closed-site push is not implemented** — there is no service worker and no Web Push. `SystemConfig.push_vapid_public_key` is unused. Details: `docs/dashboard-notifications.md`.

## 17. Workflow setup

1. Import `workflows/phytoai.json` into your n8n instance.
2. Create credentials **in the n8n UI** (the export references them by name only): Google Sheets (OAuth2), Google Drive (OAuth2), an OpenRouter credential for the Gemma nodes, and — optionally — a Perenual Query-Auth credential (parameter name `key`).
3. Set your spreadsheet and folder IDs in `SystemConfig` (`drive_daily_photos_folder_id`, `drive_scan_photos_folder_id`).
4. Point your devices at your own HTTPS base (`secrets.h`) and use the production `/webhook` prefix.
5. Test with the n8n editor/test webhook first (the flows tolerate `dry_run_mode=TRUE` end to end).
6. **Privacy:** the workflow JSON contains no secrets — verify this before sharing any modified export (`Select-String -Path workflows\phytoai.json -Pattern 'key=|api[_-]?key|bearer\s|sk-'`).

## 18. Testing and verification checklist

**Hardware**
- [ ] WROOM boots, serial log shows Wi-Fi + NTP + sensor readings.
- [ ] Sensor values are plausible (compare with a multimeter/reference; soil dry vs wet).
- [ ] Calibration: run `t` and `w`; record your own factor/dry/wet values.
- [ ] Tank sensor: LOW = empty confirmed; relay polarity confirmed (dry-run does not actuate).

**Workflow + storage**
- [ ] A test sensor POST produces a decision response and an `Events` row.
- [ ] `dry_run_mode=TRUE` yields actuation fields zeroed in the response.
- [ ] Guardrails tested (tank empty forces watering off; re-water gap respected).
- [ ] HITL: a `Notifications` row is created and resuming it marks it `done`.

**Dashboard**
- [ ] Loads on your host; sign-in works from your origin.
- [ ] Data appears (no fake rows) and the test-sheet override shows its banner.
- [ ] Charts render at phone and desktop widths.
- [ ] Browser permission asks only after the Settings click; granted/denied/unsupported states render.
- [ ] A new critical notification raises at most one system alert, and never repeats after refresh.
- [ ] Error handling is honest: quota shows a countdown, never fabricated data.

**Camera (optional, after flashing)**
- [ ] Follow `firmware/esp32cam_production/PRODUCTION-TESTS.md` (14 tests; several require hardware and end-to-end).

## 19. Troubleshooting

Confirmed issues and lessons:

- **Sheets nodes created via API can have empty/legacy “Column to match on”** — always verify it visually in the n8n UI after programmatic edits.
- **A stale pin map circulated in an early brief** (pump 4, HX711 5/25, OneWire 13, soil 26). It is wrong; use section 7.
- **The old HX711 factor `305.070f` is invalid** (computed with a broken, non-offset-compensated read). Use your own calibrated factor (reference: `1068.335`).
- **Heater did not work at first** because the relay’s coil supply was insufficient — the owner added a dedicated supply. If your heater stays off, check relay power, polarity and the firmware’s refuse/ cutoff conditions.
- **Frequent HTTPS test calls were blocked by a home router** during development; if device uploads fail while the server is reachable, check your router’s security/DoS settings.
- **Dashboard API calls fail while data exists** — the signed-in Google account must have access to the spreadsheet and the Drive folders; that sharing is the access boundary.
- **Workflow webhook returns 404** — the workflow must be active (or you must use the test listener + `/webhook-test` prefix).
- *Requires verification:* items in `STATUS.md` §5/§6 record open hardware questions (relay board specifics, power supply, free GPIOs); treat those as open until measured on your own build.

## 20. Privacy and security

- **No secrets in this repository.** `secrets.h`, `opencode.json`, `mcp-auth.json`, `.env*`, `client_secret_*.json`, `*.pem`, `*.key` and `yolo-service/models/` are git-ignored.
- **OAuth client ID vs client secret:** the ID is public by design and appears in `config.js`; the secret is never used — the dashboard performs user OAuth only.
- **Spreadsheet sharing:** data access is controlled by sharing the sheet/Drive with the signed-in account; the dashboard cannot read anything you did not share.
- **Webhook URLs:** treat your n8n base URL as private infrastructure. This README uses `<PLACEHOLDER>`s; do not paste live webhook URLs into issues.
- **Personal data:** the system stores plant data, not personal profiles. Avoid putting personal email addresses into public configs (the login hint field ships empty).
- **Test vs production separation:** use a second spreadsheet (`?sheet=` override) for experiments; the seed pack in `test-data/dashboard-seed/` is safe test data.

## 21. Limitations and future work

Known limitations (owner-assessed): Wi-Fi and a server are required; one camera cannot cover very large plants; sensor calibration takes time; the system has not yet run continuously on a live plant; closed-site push is not implemented.

Planned/ideas (owner-selected, not implemented): peristaltic dosing pump for AI-controlled nutrient/treatment dosing · water-cooling module (fan + Peltier) for hot summers · rechargeable battery pack built from discarded vape cells · standalone Wi-Fi variant for locations without internet · multiple ESP32-CAMs for large plants · garden and multi-plant scaling.

## 22. Project documentation (BWKI)

- German BWKI answers (owner-approved draft with exact character counts): [docs/bwki-answers-draft.md](docs/bwki-answers-draft.md).
- Video-pitch outline: [docs/video-pitch-outline.md](docs/video-pitch-outline.md).
- Engineering plan and schemas: `docs/Plan.md`; current state: `STATUS.md`; hardware: `docs/SmartPot-Full-Engineering-Spec-PRD.md`.

## 23. License and attribution

- **License:** MIT — see [LICENSE](LICENSE). © 2026 Mohammad Abdin.
- **Dataset:** PlantVillage color images by spMohanty (`spMohanty/PlantVillage-Dataset`). Check the dataset's own terms before redistribution.
- **Model/library:** Ultralytics YOLOv8 (check Ultralytics' license terms for your use case), FastAPI, n8n, Google APIs — each under its own license.
- **Illustrations:** unDraw SVGs in `dashboard/assets/` (unDraw license).

## 24. Contributing / build your own

This is a solo learning/competition project; it is shared so others can build their own version. Practical ways to help: report reproducible bugs, improve documentation, or adapt the workflow for different plants. Please keep credentials and personal data out of issues and pull requests, and describe which build level (section 6) you used. No support guarantees are given, and nothing here is production-certified.
