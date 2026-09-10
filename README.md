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

**Branch C — weekly human-assisted disease-scan panel** (scheduled Mon 06:00 UTC).

1. Battery check: latest `camera_battery_percent` below threshold → "charge camera" notification, scan postponed, logged.
2. Else: pending `scan_position` notification ("position the camera facing the whole plant") → Wait node with timeout (timeout → expired + postponed).
3. On confirm: `scan_session_active=true`; the photo arrives as a separate webhook execution (`POST /yolo-scan`, legacy path kept for firmware compatibility).
4. Photo → Drive (`SmartPot/ScanPhotos/`) → two analyses **in parallel**: **Vision Analyst** (framing/quality, symptoms, suspected issues, confidence, affected areas) and **YOLO Analyst stub** (`{"status":"not_yet_trained"}` — later swapped for a local FastAPI inference endpoint).
5. **Judge** — weighting: vision model provides symptom reasoning; YOLO = label + confidence from a model still learning this environment → **low weight until fine-tuned**. Output: final verdict, reasoning, recommended action.
6. Real issue → **Treatment Advisor** with full plant context (species, conditions, watering history, past diseases/treatments/outcomes, relevant AgentNotes): disease name, severity, plant-specific step-by-step treatment, and product guidance as **active ingredients/categories only, never brand names**, plus an explicit low-confidence statement when uncertain, and why the advice fits *this* plant's data.
7. Owner verdict HITL: Confirmed / Wrong / Not sure + free text → `user_verdict`; later a follow-up "did it resolve?" HITL → `treatment_outcome`.
8. Close: "return camera to charging dock" notification, `scan_session_active=false`.

**Branch E — scheduler.**

Daily NOAA solar-position computation in Code (no external API, no keys) stores next sunrise/sunset UTC in SystemConfig (daily 00:10 UTC refresh); `GET /config` serves sun times + location + `dry_run_mode` to both devices and self-heals by recomputing stale values. A weekly **Plant Profile Agent** trigger exists as a **disabled placeholder** for the memory-janitor build.

**Status:** the workflow stays **INACTIVE** and `dry_run_mode=true` until the owner tests; contracts and schemas are fixed now, firmware comes later.

## Webhook contracts

All device traffic enters `phytoai` through webhooks on the **persistent named Cloudflare tunnel** (base URL = firmware config, never hardcoded):

| Endpoint | Caller | Purpose |
|---|---|---|
| `POST /core/sensor` | WROOM | Sensor payload → synchronous watering decision (≥120 s timeout tolerated for AI latency) |
| `POST /core/photo` | CAM | Daily photo (multipart JPEG + `battery_percent`), fire-and-forget static ack |
| `POST /yolo-scan` | CAM | Weekly scan photo (legacy path kept for firmware compatibility), gated by `scan_session_active` |
| `POST /yolo-scan/done` | CAM | Close scan session → "return camera to dock" notification |
| `GET /config` | either | Sun times, location, `dry_run_mode` (self-healing recompute) |

Full request/response JSON for every endpoint is in `Plan.md` §4.

## AI model & prompts

Every agent node shares one wiring: Gemma via OpenRouter (OpenRouter Chat Model subnode, Responses API disabled, temperature 0.2) with a per-agent strict-JSON `outputParserStructured` schema and `autoFix`. Credentials are referenced by name (created by the owner in the n8n UI) — never hardcoded. Prompt rules are agent-specific (see `Plan.md` §5); two rules apply to **all** agents: their own AgentNotes arrive labeled **UNVERIFIED HYPOTHESES**, and outputs are small, validated schemas so no agent can smuggle instructions into another.

## Google Sheets database

One spreadsheet, six tabs (full column lists and seed values in `Plan.md` §2):

- **`Events`** — raw episodic history, one row per sensor/photo event; `ReasoningSummary` must cite concrete historical values.
- **`SystemConfig`** — key/value store incl. `dry_run_mode`, `min_rewater_interval_hours`, `camera_battery_percent`, `scan_session_active`, sun times, species; `last_watered_utc` provisional until firmware confirms pump completion.
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

## Web Push

The dashboard registers a service worker and a VAPID push subscription, stored in `PushSubscriptions`. n8n sends browser push notifications for urgent events only: tank empty, low camera battery, disease/anomaly detected, scan verdicts. This (like resume URLs) requires the persistent named tunnel.

## The dataset flywheel

Every weekly scan logs the photo plus the vision opinion, the YOLO opinion, the judge's verdict, and the owner's verification — human-verified gold labels accumulating with zero extra effort, destined for later YOLO fine-tuning on *this* plant's real home conditions. Public lab datasets (PlantVillage-style) transfer poorly to real home lighting and backgrounds, which is exactly why self-accumulated data matters.

## Repository map

- `Plan.md` — the canonical plan: schemas, workflow structure, prompts, webhook contracts, manual prerequisites, open questions.
- `SmartPot-Full-Engineering-Spec-PRD.md` — the full engineering specification (hardware, wiring, firmware behavior, safety notes).
- `phytoai-workflowone.json` — n8n export of the workflow; the live instance in n8n is the source of truth.
- `phytoai-workflowone.backup.json` — pre-redesign backup of the workflow.
- `Hardware/` — hardware documentation (parts list, wiring notes).
- `phytoai-redesign-prompt.md` — the redesign spec this architecture was rebuilt from.

## Current status / what's next

- [ ] Persistent named Cloudflare tunnel to the n8n instance
- [ ] n8n credentials created by the owner (Google Sheets, Google Drive, OpenRouter)
- [ ] Google Sheets tabs created per `Plan.md` §2 (`BranchMap` deleted)
- [ ] Minimal dashboard built and deployed (GitHub Pages)
- [ ] Workflow smoke-tested end to end (still inactive, dry-run)
- [ ] ESP32 WROOM firmware (sensor routine, NTP re-sync, pump/heater execution)
- [ ] ESP32-CAM firmware (capture, battery ADC, capture-button debounce, uploads)
- [ ] Full dashboard (charts, history, AgentNotes, battery status, Web Push)
- [ ] Plant Profile Agent build; YOLO fine-tuning on accumulated gold labels
