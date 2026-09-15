# PhytoAI Smart Pot

An autonomous, AI-driven plant care device. Two ESP32s live in the pot: an **ESP32 WROOM** (the "body") reads soil moisture, soil/water/air temperature, air humidity, pot weight, light level, and tank level, and executes the watering and heating commands it receives; a **static, battery-powered ESP32-CAM** (the "eye") sits in a charging dock at the pot edge, its default view framing the plant, manually movable for close-ups, with a manual capture button. All thinking happens in a single n8n workflow (**`phytoai`**, running via Docker on the main PC) with **Google Sheets as the plant's database**. The **dashboard is the only user interface** — Telegram has been removed. Routine results are never pushed anywhere; the dashboard reads them directly from the database. The whole system stays **INACTIVE** and in `dry_run_mode=true` until the owner has tested it.

## Data flow at a glance

```
WROOM ──sensor JSON──► n8n "phytoai" ──decision JSON──► WROOM (pump/heater)
CAM  ──photos + battery_percent──► n8n "phytoai"
n8n  ◄──reads/writes──► Google Sheets (memory, HITL queue, config)
n8n  ──photos──► Google Drive
n8n  ──pending Notifications──► dashboard (GitHub Pages) ──resume-URL calls──► n8n
n8n  ──Web Push──► dashboard service worker (urgent events only)
```

## Architecture: the council pattern

The system is organized so that judgment and physics never share a path:

- **AI specialists think freely** — *History Analyst*, *Core Decision Agent*, *Vision Analyst*, *Judge*, *Treatment Advisor* (and later a weekly *Plant Profile Agent*). They reason with history and context, never decide from a snapshot alone, and may hold hypotheses in AgentNotes.
- **Deterministic code guards physics** — a Code-only Safety Guardrails layer that no AI output can ever override:
  - tank-empty → watering forced off;
  - `min_rewater_interval_hours=6` blocks premature rewatering (unless the AI returns high confidence *and* cites evidence the previous watering failed — blocked attempts are logged either way);
  - hard caps: max pump seconds, `max_heater_seconds=600`, maximum water temperature;
  - `dry_run_mode` zeroes all physical actuation fields.
- **Humans verify via the dashboard** — every human-in-the-loop moment is a pending `Notifications` row carrying an n8n resume URL; the workflow pauses on a Wait node and the dashboard's buttons resume it (with a timeout → expired → documented fallback path).
- **The database remembers** — every event, opinion, verdict, and outcome lands in Google Sheets.

## The three memory layers

1. **`Events` — episodic history.** One raw row per sensor/photo event; everything the plant has ever experienced, with `ReasoningSummary` for audits.
2. **`AgentNotes` — working memory.** Each agent keeps short, status-tracked notes (`active` / `promoted` / `expired`). Its own last ~10 active notes are injected into its future contexts explicitly labeled **UNVERIFIED HYPOTHESES** — useful context, never ground truth (prevents self-confirmation loops). Each run may append 1–3 short notes.
3. **`SystemConfig` profile — distilled long-term knowledge.** Key/value facts like species + confidence, `last_watered_utc`, sun times, camera battery level, and tunable guardrails. The future weekly **Plant Profile Agent** acts as the memory janitor: it reviews recent notes + events + scans + user feedback, promotes validated insights into the profile (e.g. "this plant dries in ~5 days in summer"), and marks stale or disproven notes expired.

## Hardware summary

- **ESP32 WROOM — the body.** Sensors: capacitive soil moisture, 2× DS18B20 (soil + water temperature on one OneWire bus), DHT22 (air temperature + humidity), 1 kg load cell + HX711 (pot weight), LDR (light level), XKC-Y25 non-contact tank-level sensor. Actuators: 3 V submersible water pump and 10 W aquarium heater via relays. Firmware reports data and executes commands; it never decides locally.
- **ESP32-CAM — the eye.** Static, battery-powered, in a charging dock at the pot edge. Default view = the plant; manually movable for close-ups; manual capture button triggers capture + upload. The system **never commands movement and never knows its position** — per-image quality/framing is assessed by the vision AI instead.
- **Battery monitoring.** Two-resistor voltage divider from the battery to an ADC1-capable GPIO (**GPIO33**; ADC2 conflicts with Wi-Fi), sized so 4.2 V full charge reads under 3.3 V, calibrated against a multimeter. Firmware maps ADC → `battery_percent` and includes it in every CAM webhook payload; the latest value is stored in SystemConfig.
- **Removed in the redesign:** all servos, pan/tilt mechanics, GT2 belt, and YOLO-for-aiming — gone everywhere (workflow, schemas, docs).

## Workflow branches (`phytoai`)

**Branch A — daily watering (multi-agent + code guardrails).**

1. Sensor webhook (`POST /core/sensor`, synchronous decision response) → payload normalization.
2. Read SystemConfig + recent event history.
3. **Build Context** (pure Code, no AI): hours since last successful watering, watering counts last 7/30 days, moisture/weight trends, effect of last watering (moisture delta), current species + confidence, and sensor sanity flags — impossible values are flagged as anomalies *before* any AI sees them.
4. **History Analyst** — strict, tiny JSON over the computed facts + compacted history + its own AgentNotes: `trend_reading`, `watering_effectiveness`, `concerns`, `confidence`. The schema is validated; its output cannot smuggle instructions.
5. **Core Decision Agent** — live sensors + facts + History Analyst interpretation + own notes. Prompt rules: never decide from the snapshot alone; no fixed thresholds; no fixed calendar; must cite concrete historical values in `reasoning_summary`; insufficient or contradictory evidence → `needs_watering=false` + `recheck_hours`.
6. **Safety Guardrails** (Code, never AI-overridable — see council pattern above).
7. Respond to the WROOM → append the `Events` row → update SystemConfig (`last_watered_utc` stays **provisional** until firmware confirms pump completion; species most-confident-wins).
8. A 👍/👎 `watering_feedback` notification row is created (with `context_ref` = the event's `EventID`) so the owner can grade the decision.

**Branch B — daily photo (single multimodal call).**

The CAM posts one photo + `battery_percent` (`POST /core/photo`, fire-and-forget). One single multimodal call analyzes the photo together with today's event row, history, species, and last-watered time: refine species, detect visual anomalies, review whether today's watering decision still looks reasonable. Photo → Drive (`SmartPot/DailyPhotos/`); event + species + `camera_battery_percent` upserted; urgent visual anomalies create an `alert_anomaly` notification.

**Branch C — weekly disease-scan panel (autonomous since 2026-09-14).**

1. Battery check: latest `camera_battery_percent` below `camera_battery_min_percent` → `alert_battery_low` ("charge camera") notification + `scan_postponed`; otherwise the scheduler opens the scan session itself (`scan_session_active=true`, `scan_session_opened_utc`) and appends an informational `scan_scheduled` row — **no dashboard confirmation required**.
2. The CAM takes the photo on its local Monday 06:00 UTC schedule and posts it to `POST /yolo-scan` (session-gated; retries `no_active_session` for up to 90 min). A watchdog (every 2 h) force-closes sessions older than 6 h with an informational `scan_postponed`.
3. Photo → Drive (`SmartPot/ScanPhotos/`) → two analyses **in parallel**: **Vision Analyst** (framing/quality, symptoms, suspected issues, confidence, affected areas) and **YOLO Analyst** (local inference service `yolo-service/`; degrades to `not_yet_trained` when unavailable).
4. **Judge** — weighting: vision model provides symptom reasoning; YOLO = label + confidence from a model still learning this environment → **low weight until fine-tuned**. Output: final verdict, reasoning, recommended action. On `issue` verdicts the free-tier **Perenual** species/pest reference (cached; advisory only, never overrides history) is added to the Treatment Advisor prompt.
5. Real issue → **Treatment Advisor** with full plant context (species, conditions, watering history, past diseases/treatments/outcomes, relevant AgentNotes): disease name, severity, plant-specific step-by-step treatment, and product guidance as **active ingredients/categories only, never brand names**, plus an explicit low-confidence statement when uncertain, and why the advice fits *this* plant's data.
6. Owner verdict HITL: Confirmed / Wrong / Not sure + free text → `user_verdict`; later a follow-up "did it resolve?" HITL → `treatment_outcome`.
7. Close: `POST /yolo-scan/done` sets `scan_session_active=false` (no return-camera notification anymore); the verdict, treatment and outcomes land in the `DiseaseScans` row.

**Branch E — scheduler.**

Daily NOAA solar-position computation in Code (no external API, no keys) stores next sunrise/sunset UTC in SystemConfig (daily 00:10 UTC refresh); `GET /config` serves sun times + location + `dry_run_mode` + flash/preheat context to both devices and self-heals by recomputing stale values. A weekly **Plant Profile Agent** trigger exists as a **disabled placeholder** for the memory-janitor build.

**Status:** the workflow stays **INACTIVE** and `dry_run_mode=true` until the owner tests; contracts and schemas are fixed now, firmware comes later.

## Webhook contracts

All device traffic enters `phytoai` through webhooks on the **persistent named Cloudflare tunnel** (base URL = firmware config, never hardcoded):

| Endpoint | Caller | Purpose |
|---|---|---|
| `POST /core/sensor` | WROOM | Sensor payload → synchronous watering decision (≥120 s timeout tolerated for AI latency) |
| `POST /core/photo` | CAM | Daily photo (multipart JPEG + `battery_percent`), fire-and-forget static ack |
| `POST /yolo-scan` | CAM | Weekly scan photo (legacy path kept for firmware compatibility), gated by `scan_session_active` |
| `POST /yolo-scan/done` | CAM | Close scan session → `scan_session_active=false` |
| `GET /config` | either | Sun times, location, `dry_run_mode`, flash context (`last_lightlevel`, `flash_dark_threshold`), preheat values (`preheat_margin_c`, `preheat_lead_minutes`) — self-healing recompute |

Full request/response JSON for every endpoint is in `Plan.md` §4.

## AI model & prompts

Every agent node shares one wiring: Gemma via OpenRouter (OpenRouter Chat Model subnode, Responses API disabled, temperature 0.2) with a per-agent strict-JSON `outputParserStructured` schema and `autoFix`. Credentials are referenced by name (created by the owner in the n8n UI) — never hardcoded. Prompt rules are agent-specific (see `Plan.md` §5); two rules apply to **all** agents: their own AgentNotes arrive labeled **UNVERIFIED HYPOTHESES**, and outputs are small, validated schemas so no agent can smuggle instructions into another.

## Google Sheets database

One spreadsheet, six tabs (full column lists and seed values in `Plan.md` §2):

- **`Events`** — raw episodic history, one row per sensor/photo event; `ReasoningSummary` must cite concrete historical values.
- **`SystemConfig`** — key/value store incl. `dry_run_mode`, `min_rewater_interval_hours`, `camera_battery_percent` + `camera_battery_min_percent` (default `30`, user-tunable), `scan_session_active`, sun times, species; `last_watered_utc` provisional until firmware confirms pump completion.
- **`DiseaseScans`** — the new scan-panel schema: drive links, vision + YOLO opinions, judge verdict + reasoning, treatment plan, user verdict, treatment outcome.
- **`Notifications`** — the HITL queue: pending rows with `resume_url`, `response_options`, `response`, `context_ref`, status `pending/done/expired`.
- **`PushSubscriptions`** — Web Push subscription registry (written by the dashboard, read by n8n).
- **`AgentNotes`** — working memory (see memory layers).

(`BranchMap` was deleted entirely — no servo positioning remains.)

## Dashboard

The single place where everything about the plant lives.

- **Minimal version (built first, required to replace Telegram):** current plant status card; event history; scan reports with Drive images; pending Notifications with working buttons that call the stored resume URLs (log `response`, mark `status=done`); free-text corrections; 👍/👎 on watering decisions; user-verdict and treatment-outcome feedback for scans.
- **Full version (later):** charts/trends of all sensor history, full disease history, AgentNotes/profile visibility, camera battery status, service-worker Web Push.
- **Stack:** static HTML/CSS/JS on GitHub Pages; Sheets API for reads (OAuth for writes); dashboard → n8n resume calls through a **persistent named Cloudflare tunnel** (quick-tunnel URLs change on every restart and would invalidate stored resume URLs).

### Implementation (`dashboard/`)

- `dashboard/index.html`, `dashboard/styles.css`, `dashboard/app.js` — no build step, no dependencies.
- `dashboard/config.js` — the only file to edit: Google OAuth **client ID** and spreadsheet ID (already set to the fixed `10a3YXWBN4-hFJQQT4sLERmyu8D2TxYKNkXW-k3QRyLI`).
- **Flow:** `Connect Google` → Google Identity Services token (scopes `spreadsheets` + `drive.readonly`, token kept in `sessionStorage`) → reads `SystemConfig`, `Events`, `Notifications`, `DiseaseScans` via the Sheets API v4 → renders the four sections.
- **Answering a question:** button click calls the stored `resume_url` with `?response=<label>&comment=<text>` (the exact contract the Wait nodes read), then the dashboard writes `status=done` + `response` back to the `Notifications` row (columns resolved by header name). The workflow itself also updates `Notifications` and logs `user_verdict`/`treatment_outcome` to `DiseaseScans` when resumed.
- **Push is intentionally not in the minimal version** — Change 6 lists service-worker Web Push under the FULL version, so it stays deferred with the full dashboard.
- **Setup:** enable Sheets API + Drive API in a Google Cloud project; create an OAuth Client ID (type *Web application*) with authorized JavaScript origins `https://<your-username>.github.io` (and `http://localhost:8000` for local testing); put the client ID in `config.js`; add yourself as a test user on the OAuth consent screen (Testing mode is fine for a single owner). For local preview: `npx serve dashboard` (or any static server). For production: GitHub Pages from the repo root/folder.
- **Tunnel requirement:** resume URLs stored in `Notifications` are absolute and point at the n8n tunnel — the persistent named Cloudflare tunnel must be configured before the workflow produces real rows.

## Web Push

The dashboard registers a service worker and a VAPID push subscription, stored in `PushSubscriptions`. n8n sends browser push notifications for urgent events only: tank empty, low camera battery, disease/anomaly detected, scan verdicts. This (like resume URLs) requires the persistent named tunnel.

## The dataset flywheel

Every weekly scan logs the photo plus the vision opinion, the YOLO opinion, the judge's verdict, and the owner's verification — human-verified gold labels accumulating with zero extra effort, destined for later YOLO fine-tuning on *this* plant's real home conditions. Public lab datasets (PlantVillage-style) transfer poorly to real home lighting and backgrounds, which is exactly why self-accumulated data matters.

## Repository map

- `Plan.md` — the canonical plan: schemas, workflow structure, prompts, webhook contracts, manual prerequisites, open questions.
- `SmartPot-Full-Engineering-Spec-PRD.md` — the full engineering specification (hardware, wiring, firmware behavior, safety notes).
- `phytoai-workflowone.json` — n8n export of the workflow; the live instance in n8n is the source of truth.
- `phytoai-workflowone.backup.json` — pre-redesign backup of the workflow.
- `dashboard/` — minimal static dashboard (HTML/CSS/JS, no build step); setup in the Dashboard section.
- `Hardware/` — hardware documentation (parts list, wiring notes).
- `phytoai-redesign-prompt.md` — the redesign spec this architecture was rebuilt from.

## Current status / what's next

- [ ] Persistent named Cloudflare tunnel to the n8n instance
- [ ] n8n credentials created by the owner (Google Sheets, Google Drive, OpenRouter)
- [ ] Google Sheets tabs created per `Plan.md` §2 (`BranchMap` deleted) — **blocking dependency for the Phase 5 wiring test**
- [x] Minimal dashboard built (`dashboard/`; OAuth client ID + GitHub Pages deploy still to do)
- [ ] Minimal dashboard deployed to GitHub Pages (config: see Dashboard section)
- [ ] Workflow smoke-tested end to end (still inactive, dry-run)
- [x] ESP32 WROOM calibration/test sketch flashed and running (part 1 DONE — 2026-09-14; boots, Wi-Fi/serial OK)
- [ ] WROOM sensor verification complete — **PARTIAL**: HX711 blocked on 2 scale-mount screws; heater now wired (CH2/GPIO16) with bench-test command, physical test pending (2026-09-14)
- [x] HX711 + full bench run complete 2026-09-15, constants recorded in `docs/hw-bench-2026-09-15.md`
- [ ] **Still open:** (a) `PUMP_FLOW_ML_PER_SEC` repeat run (confirm 9.706, rule out siphon); (b) heater `e` safety drill — 40.0 °C cutoff + 120 s lockout both demonstrably trip
- [ ] ESP32 WROOM production firmware (sensor routine, NTP re-sync, pump/heater execution)
- [x] ESP32-CAM test sketch bench-tested (camera init, Wi-Fi connect, webhook upload — 2026-09-14)
- [x] ESP32-CAM production firmware written + compile-verified (`firmware/esp32cam_production/`; autonomous capture/upload, not flashed)
- [ ] ESP32-CAM production firmware flashed + end-to-end verified (test plan: `firmware/esp32cam_production/PRODUCTION-TESTS.md`; capture-button debounce still open, Plan §8 Q4)
- [ ] Full dashboard (charts, history, AgentNotes, battery status, Web Push)
- [ ] Plant Profile Agent build; YOLO fine-tuning on accumulated gold labels

## WROOM bench test (serial menu)

`firmware/wroom_calibration/wroom_calibration.ino` — bench/calibration sketch only: no Wi-Fi/n8n code, no autonomous actuation. Flash, open the serial monitor at 115200, `h` prints the menu.

**Heater test (`e`) — bench only, submerged only.** The 10 W aquarium heater is switched by relay **CH2 (GPIO16)**; the pump stays on CH1 (GPIO13). Wiring: `USB brick 5 V → CH2 COM`, `CH2 NO → heater brown (+)`, `heater blue (−) → USB brick GND`. Press `e` to enter the test session; `e` toggles CH2; while ON it prints elapsed seconds and the water DS18B20 once per second; `x` exits and always forces CH2 OFF. Hard limits (compile-time constants, not settable over serial): **40.0 °C** water auto-cutoff and **120 s** maximum continuous ON, each latching a lockout until MCU reset; CH2 is OFF at boot/reset and refuses to start when the tank is empty or the water probe is invalid. Never run the heater out of water.

**HX711 load cell.** `t` tares; `w` runs the two-point calibration (tare empty platform → place known grams → `factor = offset-compensated raw / grams`). Boot now tares once so `get_units()` no longer shows phantom weight. `HX711_SCALE_FACTOR` ships as `0.0f` (= unset; prints `(unset - run 'w')`) — the previous baked-in value was computed with the broken read and must not be reused; re-calibrate after flashing and record the new factor.

## Known issues / lessons

API/MCP-created Sheets nodes can have empty or legacy-format match columns that render EMPTY in the UI — always verify "Column to match on" visually after MCP edits. Sheet By-name mode works fine at runtime; From-list only affects UI dropdown population.

**Pre-push key scan (mandatory for workflow changes).** Before committing anything under `workflows/`, scan the exported JSON for credential material — e.g. `Select-String -Path workflows/phytoai.json -Pattern 'key=|api[_-]?key|bearer\s|sk-'`. The Perenual API key lives ONLY in the n8n credential `PhytoAI Perenual` (Query Auth, parameter name `key`); it must never appear in workflow JSON, Code nodes, docs, git, or the dashboard. HTTP Request nodes reference credentials by name only — MCP cannot create or read credentials, so after an MCP update the owner must create/select them in the n8n UI.
