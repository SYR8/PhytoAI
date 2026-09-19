<div align="center">

# 🌱 PhytoAI
![Banner](PhytoaiBanner.png)
**ESP32 sensors + camera vision + n8n + AI + dashboard = a plant that can tell you when it needs attention.**

[![ESP32](https://img.shields.io/badge/ESP32-WROOM-informational)](https://www.espressif.com/en/products/socs/esp32)
[![ESP32-CAM](https://img.shields.io/badge/ESP32--CAM-camera-blueviolet)](https://www.espressif.com/en/products/socs/esp32)
[![n8n](https://img.shields.io/badge/n8n-workflow-orange)](https://n8n.io/)
[![Google Sheets](https://img.shields.io/badge/Google%20Sheets-storage-34a853)](https://developers.google.com/sheets/api)
[![Google Drive](https://img.shields.io/badge/Google%20Drive-images-4285f4)](https://developers.google.com/drive)
[![YOLOv8](https://img.shields.io/badge/YOLOv8n--cls-PlantVillage-red)](https://docs.ultralytics.com/)
[![Perenual](https://img.shields.io/badge/Perenual-optional%20reference-2f8a52)](https://perenual.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-success)](LICENSE)
[![Status](https://img.shields.io/badge/status-first%20real--plant%20run%20planned-yellow)](#current-status)

</div>

Most plant projects stop at a number like soil moisture. PhytoAI connects those readings to camera
evidence, history, AI interpretation, and a dashboard so the owner can understand what the plant
actually needs.

> German version: **[README.de.md](README.de.md)**

**Honest one-line status:** The full system ran live end-to-end on **2026-09-19** — telemetry
decisions drove real pump actuation under the code guardrails, the daily photo analysis and the
weekly-scan chain ran in production, and all five device webhooks were verified live.

## Contents

1. [Overview](#overview)
2. [What it can do](#what-it-can-do)
3. [Species knowledge from Perenual](#species-knowledge-from-perenual)
4. [Why this project is cool](#why-this-project-is-cool)
5. [Current status](#current-status)
6. [System flow](#system-flow)
7. [Repository map](#repository-map)
8. [What a newcomer can build](#what-a-newcomer-can-build)
9. [Hardware needed](#hardware-needed)
10. [Software and services needed](#software-and-services-needed)
11. [Camera and AI plant inspection](#camera-and-ai-plant-inspection)
12. [Data and project memory](#data-and-project-memory)
13. [PlantVillage and YOLO model](#plantvillage-and-yolo-model)
14. [Dashboard and notifications](#dashboard-and-notifications)
15. [Built on n8n: swap almost any service](#built-on-n8n-swap-almost-any-service)
16. [Workflow map](#workflow-map)
17. [Setup guide](#setup-guide)
18. [Testing and verification](#testing-and-verification)
19. [Troubleshooting](#troubleshooting)
20. [Privacy and safety](#privacy-and-safety)
21. [Limitations and future ideas](#limitations-and-future-ideas)
22. [License and attribution](#license-and-attribution)
23. [Contributing and build your own](#contributing-and-build-your-own)

## Overview

Plants rarely die because a single value was wrong for one minute. They struggle when care is
irregular: watering by feeling, no memory of what happened last week, and nobody noticing the first
small sign of a problem.

PhytoAI is built around that observation. An ESP32-WROOM senses the plant and its environment, a
camera looks at it, n8n coordinates everything, Google Sheets and Drive form a transparent memory,
a local YOLOv8 classifier and cloud AI agents interpret the observations, and a dashboard shows the
plant's state and asks for human confirmation when a decision matters.

**Positioning:** an AI-assisted plant-care system that watches, senses, remembers, explains, and
helps care for a plant. It is not a black box that secretly decides things — every AI output is
advisory, and deterministic code guardrails sit between any AI suggestion and every actuator.

**Layered design:**

- **ESP32/WROOM** senses the plant and environment.
- **The camera is a key visual component of the complete system** — it provides the visual evidence,
  not just an extra sensor.
- **n8n** coordinates the data pipeline and all integrations.
- **Google Sheets/Drive** provide transparent memory and storage.
- **The PlantVillage/YOLO service** provides visual plant-health analysis.
- **The AI assistant layer** interprets and explains observations.
- **The dashboard** presents status, trends, images, alerts, and recommendations.
- **Repeated observations and owner verification create a future learning loop** (see the dataset
  flywheel below).

## What it can do

Only implemented or clearly designed features are listed here.

- **Measure plant and environment values** — soil moisture, soil/water/air temperature, air humidity,
  pot weight, light, and tank level, mapped to the bench-verified pin layout.
- **Execute care decisions safely** — the WROOM runs the pump and heater from the workflow's decision
  JSON, with firmware limits no AI output can override.
- **Capture plant images** — the ESP32-CAM takes daily photos and weekly scan photos (wired power).
- **Analyze visual health signals** — a local YOLOv8n-cls classifier plus vision/treatment agents
  produce an unverified hypothesis until the owner confirms it.
- **Store observations and images** — rows in Google Sheets, photos in Google Drive, timestamped in UTC.
- **Show trends** — the dashboard charts moisture, weight, and temperatures from real event history.
- **Create in-app and browser alert records** — a notification center in the dashboard, with optional
  browser alerts while the page is open (see notifications).
- **Answer and assist** — the implemented assistant path answers from stored data (deterministic
  intents) or from bounded AI summaries.
- **Accumulate observations for later improvement** — designed dataset flywheel: verified scans can
  later be exported and used to fine-tune the plant-health model for this plant's real home conditions.

## Species knowledge from Perenual

[Perenual](https://perenual.com/) is an **optional plant-care reference API** that PhytoAI can
consult for generic species information — a small, lazy side branch in the n8n workflow, not part
of the core sensor pipeline. **Optional, but valuable:** it adds species-aware context that
neither the sensors nor the image classifier provide by themselves.

- **How it works:** when a species guess is available, the workflow checks the cache
  (`Check Perenual Cache`). Only if the guess is new (or the cache is stale) does it search
  Perenual, pick the best match, fetch the care details, and cache the result — care details in
  `SystemConfig`, and a note about any interruption in `AgentNotes`. Repeated identical lookups are
  avoided on purpose (quota discipline).
- **Advisory and generic:** the reference describes the species in general terms. It is **lower
  priority than measured plant data, local history, and owner verification**, and it does **not**
  override sensor evidence.
- **Graceful degradation:** if the key is missing or a lookup fails, the workflow continues without
  Perenual. A quota-exceeded response is handled explicitly and recorded (a note in `AgentNotes`
  plus a `lookup_failed_...` cache status) instead of breaking the run.
- **Where it helps:** the cached reference is injected as advisory context for the care decision and
  the Treatment Advisor, so advice can include species-aware expectations next to what this plant's
  own data shows.

**Configuration (optional):** create a free Perenual API key, add the n8n credential with **Query
Auth** and parameter name `key`, and leave the `perenual_*` values in `SystemConfig` empty until the
enrichment runs. The cached state is visible as `perenual_status` (`ok`, `not_found`, or
`lookup_failed_...`) in SystemConfig and on the dashboard Settings screen.

### What Perenual is not

- It is **not** a trained disease classifier.
- It is **not** a replacement for the PlantVillage/YOLO model.
- It is **not** the owner's own learned plant data.
- It is **not** authoritative for this specific plant or environment.
- It is **not** required for basic dashboard or test-data operation.

## Why this project is cool

- **Hardware + IoT + automation + AI vision + dashboard in one build.** One person's weekend-project
  scale problem, solved end to end: from a load cell to an AI summary in a browser.
- **Camera + sensor fusion.** A moisture reading alone cannot say "these leaves changed since last
  week". Numbers plus images give context that neither provides alone.
- **Plant-care memory.** The plant's history lives in a spreadsheet you can open yourself — no lock-in,
  no hidden database, and a dashboard that shows what changed and when.
- **Future dataset flywheel.** Scans, model outputs, and owner verdicts accumulate as human-verified
  labels, so the model can be improved later for real home lighting and backgrounds.
- **Human verification and safety.** Open questions wait for a human answer (with timeouts), the AI
  is advisory only, and code guardrails (tank-empty, minimum re-water gap, pump/heat caps, dry-run)
  cannot be overridden by any model.

## Current status

The full system ran live end-to-end on **2026-09-19**: telemetry decisions drove real pump actuation
under the code guardrails, the daily photo analysis and the weekly-scan chain ran in production, and
all five device webhooks were verified.

| Part | Status |
|---|---|
| n8n workflow (`workflows/phytoai.json`, 233 nodes) | **implemented + tested + live (2026-09-19)** — telemetry decisions, photo analysis, weekly scan and the session-flag plumbing ran in production. **Owner-specific:** may be deactivated on the owner's instance; actuation is gated by `dry_run_mode`. |
| Dashboard (`dashboard/`) | **implemented + tested** (headless end-to-end suites: startup requests, charts, assistant, notifications — see `docs/dashboard-ux-v3.md`, `docs/dashboard-notifications.md`); deployed by the owner on a static host. |
| WROOM production firmware | **live-verified 2026-09-19** — flashed; decisions drove real pump actuation under the code guardrails. |
| WROOM calibration/bench sketch | **bench-tested** 2026-09-15 (constants recorded in `docs/hw-bench-2026-09-15.md`). |
| ESP32-CAM production firmware | **live-verified 2026-09-19** — flashed; session-gated daily photo and weekly scan ran in production. |
| ESP32-CAM test sketch | **bench-tested** (camera init, Wi-Fi, webhook upload). |
| Local disease classifier (`yolo-service/`) | **implemented + tested**: deployed on the owner's server with the trained model (validation metrics below). |
| In-app notification center + open-tab browser alerts | **implemented + tested** (`docs/dashboard-notifications.md`). |
| Closed-site push notifications (Web Push / service worker) | **not implemented**. |
| Continuous real-plant operation | **live end-to-end 2026-09-19** — telemetry → decision → real pump actuation under guardrails, daily photo analysis and the weekly-scan chain all ran in production. |
| Camera power | **wired-only** (verified); legacy battery fields remain in schema/firmware and are obsolete. |

Measured model result (validation split only): **96.08 % top-1 / 99.955 % top-5**; no separate test
set and no training-accuracy measurement, so none is claimed. Details:
[PlantVillage and YOLO model](#plantvillage-and-yolo-model).

## System flow

```text
sensors + camera -> WROOM/ESP32 device -> n8n workflow -> Sheets/Drive
      -> YOLO/AI analysis -> dashboard/notifications -> owner
```

1. **Sense:** the WROOM wakes on schedule, reads all sensors, and POSTs JSON to the workflow
   (`POST /webhook/core/sensor`). The camera posts a daily photo (`/webhook/core/photo`) and a weekly
   scan photo (`/webhook/yolo-scan`); the scan is session-gated and fully automatic (the weekly
   schedule opens the session, the CAM sweeps on its next wake, `/yolo-scan/done` closes it).
2. **Decide:** the workflow reads history and SystemConfig, an AI agent proposes a decision from the
   history, and deterministic guardrails (code, never AI) enforce the safety rules. The WROOM only
   executes the decision JSON — it never decides locally.
3. **Store:** events land in the `Events` sheet; photos go to Google Drive; scans, notes, and
   configuration live in their own tabs.
4. **Analyze:** the local YOLOv8 classifier plus vision/judge/treatment agents produce a verdict the
   owner confirms (human in the loop).
5. **Show and ask:** the dashboard reads Sheets/Drive with the user's own Google login; open questions
   become `Notifications` rows with a resume URL, and dashboard buttons resume the paused workflow.

**Advisory side branch (optional — not the core sensor pipeline):** plant species guess →
Perenual reference lookup → cached advisory context → AI/Treatment Advisor. It runs lazily, caches
aggressively, and the workflow continues unchanged when it is unavailable.

## Repository map

- `dashboard/` — the static web dashboard (`index.html`, `styles.css`, `app.js`, `config.example.js`, assets).
- `firmware/` — production and bench firmware: `wroom_production/`, `wroom_calibration/`, `esp32cam_production/`, `esp32cam/` (with test plans).
- `workflows/` — the importable n8n workflow; `phytoai.annotated.json` is the same workflow with navigation notes (see [Workflow map](#workflow-map)).
- `scripts/` — dataset preparation and YOLO training pipeline (bootstrap + flywheel).
- `yolo-service/` — local CPU classifier service (FastAPI + Ultralytics) incl. the deployed trained checkpoint.
- `Hardware/` — parts list; wiring details in `docs/SmartPot-Full-Engineering-Spec-PRD.md` and `docs/hw-bench-2026-09-15.md`.
- `test-data/` — safe sample rows for a test spreadsheet (no real plant data).
- `docs/` — engineering plan and schemas (`Plan.md`), status and audit documents, dashboard and notification contracts.
- `STATUS.md` — current project state with open items.
- `LICENSE` — MIT.

## What a newcomer can build

PhytoAI can be built in stages — but only the complete build is the complete system.

| Build | What it is | Includes camera? |
|---|---|---|
| **Complete PhytoAI** | The whole loop: sensors, camera, workflow, storage, AI analysis, dashboard, notifications | **Yes — the camera is part of the complete system** |
| **Sensor-only build** | WROOM + sensors + relays/pump/heater, workflow and storage; no image analysis | No |
| **Camera + dashboard build** | Camera, workflow image path, storage, dashboard and notifications; sensors can follow later | Yes, but without the sensing loop the care decisions lack their input |
| **Software/dashboard demonstration** | No hardware: import the workflow, seed a test spreadsheet, exercise the pipeline with test payloads, run the dashboard locally | No |

A reduced build is a great way to start, but it is not the same as the complete PhytoAI system —
for example, the disease-scan verdicts are most meaningful when camera images and sensor history
exist together.

## Hardware needed

From `Hardware/Hardware-list.txt` plus the bench-verified pin map in `docs/hw-bench-2026-09-15.md`:

**Core:** ESP32-WROOM dev board (+ expansion board as in the list) · 5 V 4-channel relay module ·
DHT22 · capacitive soil moisture sensor · 2× DS18B20 (waterproof, one OneWire bus) ·
1 kg load cell + HX711 · 3–5 V submersible pump · 5 V/10 W USB aquarium heater ·
XKC-Y25 non-contact tank sensor · 5 V USB power supply and wiring.

**Camera (part of the complete build):** ESP32-CAM with its **own stable 5 V supply** — never power it
from an arbitrary GPIO.

**Optional extras:** LDR module (digital output used), status LED.

**Pins (bench-verified, `firmware/wroom_production/wroom_production.ino`):** pump **13**, heater **16**
(both active-low relay), HX711 **DT 26 / SCK 33**, OneWire **4**, soil ADC **34**, tank **27**
(LOW = empty), DHT22 **14**, LDR **25**, LED **2**.

**Safety notes (mandatory):** operate the heater **submerged only**; firmware enforces a 40.0 °C
cutoff, refuses to start at ≥ 39.5 °C, and caps continuous actuation at a runtime-settable limit
(default 120 s, hard bounds 5–600 s via serial `l`); relays default OFF at boot. An early brief
contained a stale pin map (pump 4, HX711 5/25, OneWire 13, soil 26) — it is superseded; use the map
above.

**DS18B20 water probe placement (mandatory):** the waterproof water-temperature probe must float
**freely in the tank — fully surrounded by water on all sides** — and must **not** touch the tank
wall, the tank bottom, or any other object. Contact conducts stray heat and skews the
water-temperature readings that gate the heater.

## Software and services needed

- **Arduino IDE or arduino-cli** with **ESP32 core 3.3.11**; libraries: ArduinoJson 7.4.2, HX711 0.7.5,
  OneWire 2.3.8, DallasTemperature 4.0.6, DHT 1.4.7 (versions from the production build).
- **n8n** (Docker recommended) — import `workflows/phytoai.json`.
- **Python 3** for the training scripts and the classifier service (`scripts/README.md`,
  `yolo-service/requirements.txt`).
- **A browser** for the dashboard — no build step, no npm dependencies.
- **Optional:** any HTTPS static host for the dashboard; a small CPU server/VPS for `yolo-service`.

Accounts you create yourself (placeholder values only — never commit real credentials):

| Service | Why | Notes |
|---|---|---|
| Google account + Google Cloud project | Sheets + Drive + OAuth login for the dashboard | Enable **Google Sheets API** and **Google Drive API**; create an OAuth **Web** client; the client **secret is never used or stored** here. |
| Google Sheets spreadsheet | The database | Create the five tabs with the exact headers from [Data and project memory](#data-and-project-memory), or import the seed CSVs from `test-data/dashboard-seed/`. |
| n8n instance | Runs the workflow | Self-hosted (Docker) or your own server. |
| OpenRouter account + API key | The AI agents (Gemma) | Needed for AI branches; deterministic assistant intents work without an LLM call. |
| Static host (optional) | Dashboard | Any HTTPS host. |
| VPS/small server (optional) | Local classifier (`yolo-service`) | CPU-only, reachable from n8n inside the same Docker network. |
| Perenual API key (optional) | Advisory species/pest reference | Free tier; the workflow degrades gracefully without it. |

**Configuration:** copy [`dashboard/config.example.js`](dashboard/config.example.js) to
`dashboard/config.js` and fill in your client ID, spreadsheet ID, and n8n host. Each firmware sketch
has a `secrets.h` section (`SECRET_WIFI_SSID`, `SECRET_WIFI_PASSWORD`, `SECRET_BASE_URL`,
`SECRET_WEBHOOK_PREFIX`); `secrets.h` is git-ignored — never commit it.

**Production webhooks:** set `SECRET_WEBHOOK_PREFIX` to `/webhook` for production; `/webhook-test` is
the n8n **editor test listener** and only responds once after you click “Execute workflow”.
Production webhooks only register while the workflow is **ACTIVE**, so activate the workflow in n8n
before flashing or operating the devices.

## Camera and AI plant inspection

This is the part that makes PhytoAI more than a sensor logger.

- **Visual observation:** the ESP32-CAM takes a daily photo and a weekly scan photo of the plant.
  Camera power is **wired** and the camera is fixed — there is no positioning step and no battery
  behavior to invent or rely on.
- **Weekly scan is fully automatic:** the Monday schedule opens a scan session
  (`scan_session_active=true`), the CAM picks it up from `GET /config` at its next wake and posts
  the scan, and the session closes on `/yolo-scan/done`. One informational notification is created;
  nothing waits for human input.
- **Session-gated scanning (rule):** the CAM never posts to `/webhook/yolo-scan` unless the latest
  `/config` reports `scan_session_active=true`. On boot or any non-scan wake it only posts to
  `/core/photo`.
- **Upload:** the camera posts images over HTTPS to the workflow (daily photo and scan photo paths),
  fire-and-forget with retries; timestamps are UTC.
- **Storage:** images land in Google Drive folders referenced from `SystemConfig`.
- **Analysis:** a local YOLOv8n-cls classifier (CPU) gives a low-weighted second opinion; vision,
  judge, and treatment agents reason about the image together with history and produce an
  **unverified hypothesis** with reasoning.
- **Owner verification:** the verdict becomes a pending notification; the owner answers
  Confirmed / Wrong / Not sure in the dashboard, and a follow-up asks whether the issue resolved.
- **Why it matters:** sensor numbers say *how wet* the soil is; images show *whether the plant looks
  healthy* — yellowing, spots, or damage that no moisture value captures. Together they give more
  context than sensors alone, and the verified answers are what make the future dataset flywheel
  possible.

## Data and project memory

One spreadsheet, **five tabs** (headers exactly as in `test-data/dashboard-seed/`):

**`Events`** — one row per sensor/photo event:
`EventID, Timestamp, EventType, MoisturePercent, SoilTempC, WaterTempC, AirTempC, AirHumidityPercent, WeightGrams, LightLevel, TankEmpty, WateringTriggered, WaterDurationSeconds, HeaterUsed, HeaterDurationSeconds, SpeciesGuess, SpeciesConfidence, PhotoFileID, AnomalyDetected, AnomalyDescription, AI_Notes, ReasoningSummary, WateringAborted, FinalWaterTempC, WaterAddedGrams`

**`SystemConfig`** — key/value store. Reference keys: `pot_latitude`, `pot_longitude`,
`last_watered_utc`, `last_species_guess`, `species_confidence`, `next_sunrise_utc`, `next_sunset_utc`,
`last_tank_empty_alert_sent`, `dry_run_mode`, `min_rewater_interval_hours`, `scan_session_active`,
`scan_next_utc`, `scan_auto`,
`max_pump_seconds`, `max_water_temp_c`, `preheat_margin_c`, `preheat_lead_minutes`,
`heater_hysteresis_c`, `flash_dark_threshold`, plus optional `camera_battery_*`, `drive_*_folder_id`,
`push_vapid_public_key` (unused today).

**`DiseaseScans`** — scan results:
`timestamp, drive_links, vision_opinion, yolo_opinion, judge_verdict, judge_reasoning, treatment_plan, user_verdict, treatment_outcome, ai_notes`

**`Notifications`** — the human-in-the-loop queue:
`timestamp, type, title, message, response_options, status, response, resume_url, context_ref`
(status: `pending` -> `done`/`expired`)

**`AgentNotes`** — agent working memory:
`timestamp, agent, note, context_ref, status`

- **Timestamps:** UTC ISO-8601, all ending in `Z`.
- **Dashboard trends:** charts are drawn from `Events` rows (one point per cycle), never from invented data.
- **Later model training:** `scripts/export_dataset.py` can turn owner-verified `DiseaseScans` rows
  into a training set; `scripts/train.py --mode flywheel` is the designed path to fine-tune the model
  on this plant's real home conditions.

**Important semantics:** `ml_est` is an **estimate** from pump runtime × calibrated flow
(`9.706 ml/s` reference). The **measured** weight delta is currently **device-log only** — the
workflow does not persist it, so `WaterAddedGrams` stays empty by design. Capture reason and per-photo
light condition are **not persisted**. Firmware hard limits (40.0 °C cutoff, 39.5 °C refuse, runtime
actuator cap — default 120 s, settable 5–600 s, 8 s watchdog) are authoritative over everything;
workflow guardrails (tank-empty forces watering off,
`min_rewater_interval_hours`, `max_pump_seconds`, `max_water_temp_c`, `dry_run_mode`) are authoritative
over AI output; the AI is advisory only.

## PlantVillage and YOLO model

- **Dataset:** PlantVillage (color version, spMohanty/PlantVillage-Dataset), **38 classes**; the full
  dataset is about 54,000 images. For the bootstrap run, **max. 300 images per class** were used
  (about 11,000 per epoch) because training runs on CPU. The exact number of images actually used can
  no longer be verified (the prepared dataset was deleted from the owner's server).
- **Preparation:** a script performs a sparse checkout and builds a `train/<class>` + `val/<class>`
  structure with an **80/20 per-class split** and a fixed seed (reproducible); standard Ultralytics
  augmentation stays active.
- **Method:** **YOLOv8n-cls bootstrap fine-tuning** (transfer learning), **12 epochs**,
  **160 × 160** images, **batch size 32**, **CPU training**, fixed seed.
- **Measured result (validation split only):** **96.08 % top-1** and **99.955 % top-5**.
- **No separate test set** was held back, and no training-accuracy measurement exists — so **no test
  accuracy is claimed**.
- **Deployed checkpoint:** `yolo-service/models/model.pt` is the trained checkpoint used by the
  running service; the service reloads automatically when the file changes.
- **Role in the workflow:** the classifier is a **low-weighted second opinion** next to the vision
  agent and judge; the owner confirms verdicts before they count as labels.

## Dashboard and notifications

- **Deployment:** any static HTTPS host (no build step). Locally: `npx serve dashboard` or
  `python -m http.server` inside `dashboard/`.
- **Routes:** Overview, Timeline, Assistant, Doctor, Photos, Insights, Settings.
- **Purpose:** show the plant's status, trends, images, scan verdicts, and open questions — with the
  user's own Google login reading Sheets/Drive directly (no server secrets in the browser).
- **Notification center (in-app):** the Timeline screen lists all `Notifications` rows with severity,
  source, time, plant context, and answer buttons; no read/unread state is invented (status comes
  from the sheet).
- **Browser alerts:** optional; they require you to click “Enable browser alerts” in Settings and
  grant the browser permission — permission is **never requested automatically on page load**.
- **While the dashboard is open and able to poll:** alerts are checked once per minute and only while
  the tab is visible; hidden or closed tabs receive nothing.
- **Closed-site push is not implemented:** there is no service worker and no Web Push;
  `SystemConfig.push_vapid_public_key` is unused. Details: `docs/dashboard-notifications.md`.

## Built on n8n: swap almost any service

n8n is PhytoAI's integration hub. The ESP32 device, sensors, camera, storage, AI analysis, dashboard,
and notifications do not need to know every other service directly. The workflow connects them. You
can replace Sheets with a database, Drive with another file store, or the notification target with
your preferred service by editing the relevant workflow branch.

| System responsibility | Current implementation | Possible alternative |
|---|---|---|
| Event/data storage | Google Sheets | PostgreSQL, MySQL, Supabase, Airtable, CSV, or another database node |
| Image storage | Google Drive | S3-compatible storage, Dropbox, Nextcloud, local filesystem, or another file node |
| Notifications | Dashboard/in-app and browser alerts while open | Telegram, Discord, email, Matrix, Slack, Web Push, or another service |
| Vision analysis | PlantVillage/YOLO service + AI analysis | Another local model, cloud vision API, OpenAI-compatible vision endpoint, or custom service |
| Species/care reference | Perenual | Another plant-care API, local plant reference table, or leaving the branch disabled |
| Assistant response | n8n/AI workflow | Another LLM provider, local model, or custom agent |
| Dashboard source | Current dashboard/Sheets integration | Replace the connector and preserve the normalized response format |
| Automation engine | n8n | Keep n8n as the integration hub and replace individual nodes as needed |

**Read this before swapping anything:**

- These are **customization paths, not already-tested alternatives**.
- You must create **your own credentials** and adapt node settings.
- Replacement nodes should **preserve the workflow's input/output contract**.
- The **default implementation remains the verified path** — everything else is your own experiment.

## Workflow map

- The workflow includes **navigation sticky notes** so you can follow it branch by branch after
  importing (entry, normalize, safety/validation, storage, image storage, vision specialist, AI
  assistant, notifications, dashboard source, owner configuration).
- Import [`workflows/phytoai.annotated.json`](workflows/phytoai.annotated.json) to read the workflow
  with those notes; import [`workflows/phytoai.json`](workflows/phytoai.json) to run the proven
  production export. Both are the same system — the annotated copy changes **no** behaviour.
- The sticky notes mark **where storage, image storage, notifications, and AI providers can be
  replaced** (see the table above).
- Nodes and credentials referenced by documentation should **not be renamed** — that is what keeps
  the guides, dashboard contracts, and resume URLs working.
- Full customization notes: [docs/workflow-customization.md](docs/workflow-customization.md).

## Setup guide

Recommended order:

```text
clone -> hardware -> dependencies -> services -> five-tab schema -> workflow credentials by name
      -> flash firmware -> verify readings -> deploy dashboard -> test notifications -> troubleshoot
```

1. **Clone** this repository.
2. **Prepare the hardware** (solder/plug sensors, relay, pump, heater, camera per the hardware section).
3. **Install dependencies** (Arduino core + libraries, n8n, Python for the service/scripts).
4. **Configure services**: Google Cloud APIs + OAuth client; n8n instance; OpenRouter key.
5. **Create the storage schema**: five tabs with exact headers (or import
   `test-data/dashboard-seed/*.csv` into a *test* spreadsheet first).
6. **Configure the workflow**: import `workflows/phytoai.json`, create the credentials **by name** in
   the n8n UI, set your sheet/folder IDs in `SystemConfig`.
7. **Flash the firmware**: first `firmware/wroom_calibration/` (bench, calibrate, record values), then
   `firmware/wroom_production/` after filling `secrets.h` and your bench constants; then the camera
   firmware (`firmware/esp32cam_production/`) with its own 5 V supply.
8. **Verify readings**: watch the serial monitor, then confirm rows appear in `Events`.
9. **Deploy the dashboard**: copy config, serve statically, sign in, verify data.
10. **Test notifications**: in-app center first, then the optional browser alerts in Settings.
11. **Troubleshoot** with the section below.

## Testing and verification

**Simulation and test-data testing (done):** the workflow was exercised with pinned-data and
simulated executions; the dashboard with headless end-to-end suites (startup request behavior, charts,
assistant paths, notification controls); test spreadsheets use the safe seed data from `test-data/`.

**Hardware bench testing (done):** the calibration sketch was flashed and run; measured constants
(scale factor `1068.335`, soil dry/wet `4095`/`1964`, pump flow `9.706 ml/s`, tank LOW = empty, relay
active-low, DS18B20 addresses) are recorded in `docs/hw-bench-2026-09-15.md`. The camera test sketch
was bench-tested (init, Wi-Fi, upload).

**Live (2026-09-19):** the first full real-plant end-to-end run completed — telemetry decisions drove
real pump actuation under the code guardrails, and the daily photo analysis and weekly-scan chain ran
in production.

**What a new builder should test:**

- [ ] WROOM boots; serial log shows Wi-Fi + NTP + sensor readings.
- [ ] Sensor values are plausible (compare against a reference); calibrate and record your own values.
- [ ] Tank sensor: LOW = empty confirmed; relay polarity confirmed (dry-run does not actuate).
- [ ] A test sensor POST produces a decision response and an `Events` row.
- [ ] `dry_run_mode=TRUE` zeroes the actuation fields in the response.
- [ ] Guardrails: tank empty forces watering off; the re-water gap is respected.
- [ ] HITL: a `Notifications` row appears and resuming it marks it `done`.
- [ ] Dashboard loads and shows your data; test-sheet override works (`?sheet=`).
- [ ] Browser permission is requested only after the Settings click; all states render.
- [ ] Camera: follow `firmware/esp32cam_production/PRODUCTION-TESTS.md` (14 tests; several need hardware).

### WROOM serial commands

The production WROOM sketch (`firmware/wroom_production/`) accepts single-key commands over the
serial monitor at **115200 baud**. `dry_run` gates **all** GPIO actuation, including the debug-send
cycle.

| Key | Command | Usage | Safety bounds |
|---|---|---|---|
| `t` | INSTALLATION tare | Press `t`, then `y` to confirm. The platform must be **EMPTY**; records the empty-platform offset in NVS and is never part of normal operation. | Only with an empty platform; the HX711 is never auto-tared. |
| `l` | Runtime actuator cap | Press `l`, type the new cap in seconds, press Enter. Applies to pump and heater and is persisted to NVS (survives reboots). | Hard bounds **5–600 s**; non-numeric or out-of-range input is rejected with a printed reason; default `120 s`. |
| `s` | Debug send | Press `s` — runs one full telemetry cycle immediately: `GET /webhook/config`, then the same 12-field `POST /webhook/core/sensor` as the scheduled event; prints the HTTP status and returned decision keys, then the next scheduled event. | Uses the normal code path; `dry_run` still gates all actuation. |
| `i` | Status | Prints uptime, Wi-Fi, dry-run state, HX711 offset/scale, actuator cap, tank and water state. | — |
| `h` or `?` | Help | Lists the commands. | — |

### ESP32-CAM serial commands

The production CAM sketch (`firmware/esp32cam_production/`) accepts single-key commands over the
serial monitor at **115200 baud** (also listed in the boot banner and via `h`).

| Key | Command | Usage | Safety bounds |
|---|---|---|---|
| `s` | Send photo now | GET `/config`, then one daily photo via the same code path as the scheduled photo (POST `/core/photo`); prints HTTP status + response body, then the next scheduled events. | Normal code path; never triggers a scan. |
| `c` | Scan now (test) | GET `/config`; if `scan_session_active` is false it prints `[scan] cloud session not active - scan would be rejected` and **aborts with no uploads**. If true it runs the full sweep (POST `/yolo-scan`, then `/yolo-scan/done`) and prints the next events. | Cloud-session-gated; a manual test never records a weekly miss. |
| `i` or `t` | Status | Last/next scheduled events, `scan_session_active` as last seen in `/config`, flash mode, free heap/PSRAM. | — |
| `h` | Help | Lists all commands. | — |
| `w` / `n` / `g` | Wi-Fi / NTP / get config | Diagnostics. | — |
| `b` / `d` / `f` / `r` | Battery / scan-done test / flash torch / reboot | Diagnostics. | — |

## Troubleshooting

Confirmed issues and lessons:

- **Sheets nodes created via API can have empty/legacy “Column to match on”** — verify it visually in
  the n8n UI after programmatic edits.
- **A stale pin map circulated in an early brief** (pump 4, HX711 5/25, OneWire 13, soil 26). It is
  wrong; use the verified pin map above.
- **The old HX711 factor `305.070f` is invalid** (computed with a broken, non-offset-compensated
  read). Use your own calibrated factor (reference: `1068.335`).
- **The heater did not work at first** because the relay coil supply was insufficient — adding a
  dedicated supply fixed it. If your heater stays off, check relay power, polarity, and the firmware's
  refuse/cutoff conditions.
- **Frequent HTTPS test calls were blocked by a home router** during development; if device uploads
  fail while the server is reachable, check your router's security/DoS settings.
- **Dashboard API calls fail while data exists** — the signed-in Google account must have access to
  the spreadsheet and Drive folders; that sharing is the access boundary.
- **Workflow webhook returns 404** — the workflow must be active (or use the test listener with the
  `/webhook-test` prefix).
- **First run with empty sheets is valid** — `Events`, `AgentNotes`, `DiseaseScans`, and
  `Notifications` can legitimately be empty on the first cycle. The workflow configures "Always
  Output Data" on those history/log reads, so empty history still produces a normal decision (e.g.
  watering denied because the tank is empty). Only `SystemConfig` must contain its seed keys before
  activation — if it is empty, that is a real setup error and the workflow fails loudly on purpose.
  **An empty 200 response from a webhook means the workflow halted early** — check the n8n
  Executions view to see which node stopped the chain. "Always Output Data" is now part of the
  workflow configuration; no manual action is needed.
- *Requires your own verification:* open hardware questions in `STATUS.md` (relay board specifics,
  power supply, free GPIOs) stay open until measured on your build.

## Privacy and safety

- **No secrets in this repository.** `secrets.h`, `opencode.json`, `mcp-auth.json`, `.env*`,
  `client_secret_*.json`, `*.pem`, `*.key` and `yolo-service/models/` are git-ignored.
- **Placeholders only.** `dashboard/config.example.js` contains `YOUR_...` placeholders; never commit
  your real spreadsheet ID, private webhook host, or tokens.
- **User-owned credentials.** You create your own Google/OpenRouter/n8n credentials; the OAuth client
  **secret** is not used by this project at all.
- **Camera and monitoring privacy:** photos of plants are still photos of your home. Keep the Drive
  folders private, and be mindful when sharing screenshots — hide account names, IDs, and hosts.
- **Actuator and sensor safety:** never run the heater out of water; respect the firmware limits;
  start in `dry_run_mode`; the AI never bypasses the code guardrails.
- **Do not commit personal or production identifiers** — personal emails, spreadsheet IDs, OAuth
  client secrets, webhook hosts, or n8n tokens. A pre-push key scan is documented in the repository
  history (`Select-String -Path workflows\phytoai.json -Pattern 'key=|api[_-]?key|bearer\s|sk-'`).

## Limitations and future ideas

**Known limitations (honest list):**

- Continuous real-plant end-to-end operation is **live-verified (2026-09-19)** — not yet a long-duration soak test.
- The system needs Wi-Fi and a server; without internet it does not run.
- One camera cannot cover very large plants; framing is fixed (no positioning step).
- Sensor calibration takes time, and closed-site push (Web Push) is **not implemented**.

**Future ideas (owner-selected, not implemented):**

- **Real-plant end-to-end testing** as a permanent routine, not a one-time event.
- **Real-home dataset accumulation** — collect more real-world images with owner-verified labels.
- **Owner-verified labels** feeding the designed flywheel: periodic fine-tuning with
  `scripts/train.py --mode flywheel` once enough verified images exist.
- **Future Web Push / service worker** for alerts when the site is closed (architectural plan exists
  in `docs/dashboard-notifications.md`; nothing is built).
- **Stronger continuous-learning workflow** — a clearer, human-reviewed loop from verified scans to
  the next model generation.
- Peristaltic dosing pump for AI-dosed nutrients/treatment · water-cooling module (fan + Peltier) for
  hot summers · rechargeable battery pack from discarded vape cells · standalone Wi-Fi variant ·
  multiple ESP32-CAMs for large plants · garden and multi-plant scale.

## License and attribution

- **License:** MIT — see [LICENSE](LICENSE). © 2026 Mohammad Abdin.
- **Dataset:** PlantVillage color images by spMohanty (`spMohanty/PlantVillage-Dataset`) — check the
  dataset's own terms before redistribution.
- **Model/libraries:** Ultralytics YOLOv8 (check Ultralytics' license terms for your use case),
  FastAPI, n8n, Google APIs — each under its own license.
- **Illustrations:** unDraw SVGs in `dashboard/assets/` (unDraw license).

## Contributing and build your own

This is a solo learning/competition project, shared so others can build their own version. Practical
ways to help: report reproducible bugs, improve documentation, or adapt the workflow for different
plants. Please keep credentials and personal data out of issues and pull requests, and mention which
build level you used. No support guarantees are given, and nothing here is production-certified.

**Full source, history, and documentation:** <https://github.com/SYR8/PhytoAI>
