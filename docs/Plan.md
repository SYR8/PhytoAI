# Stage 1 Plan — Smart Pot Cloud Automation (`PhytoAI` + Google Sheets + Dashboard)

## 1. Summary

Stage 1 builds the entire cloud-automation layer of the Smart Pot project around a single n8n workflow named `phytoai` (extended from the existing workflow, ID `WXd35adnUc9QQA84`), a Google Sheets database, and a static dashboard (GitHub Pages). The design follows the "council" pattern: AI specialists deliberate freely, a Judge cross-checks, deterministic Code guardrails protect every physical action, the owner verifies via the dashboard, and Sheets remembers everything.

Key design decisions in force for this stage:

- **No camera autonomy.** The ESP32-CAM is a static, battery-powered unit in a charging dock at the pot edge (default view = the plant; manually movable for close-ups). No servos, no pan/tilt, no YOLO-for-aiming. The CAM has a manual capture button. It reports `battery_percent` in every photo webhook payload.
- **Telegram is removed entirely.** The dashboard is the only user interface. Urgent events additionally produce browser Web Push.
- **Branch A (watering) is multi-agent:** History Analyst → Core Decision Agent, followed by a deterministic, never-AI-overridable Safety Guardrails Code layer (tank-empty force-off, `min_rewater_interval_hours`, max pump seconds, `max_heater_seconds=600`, max water temp, dry-run zeroing). After each watering decision a Notifications row asks 👍/👎.
- **Branch C (weekly disease scan) is a human-assisted multi-model panel:** battery check → "position camera" HITL (Wait node + timeout) → photo upload → Vision Analyst + YOLO stub → Judge → Treatment Advisor → user-verdict HITL → follow-up outcome HITL.
- **Agent memory lives in Sheets:** `Events` (episodic history) → `AgentNotes` (working memory, active/promoted/expired) → `SystemConfig` (distilled long-term profile). A weekly Plant Profile Agent is planned as a disabled placeholder trigger.
- **The dashboard is pulled forward** as its own plan stage (minimal version first), including Web Push; it talks to n8n resume URLs over a persistent named Cloudflare tunnel.
- The workflow stays **INACTIVE** and `dry_run_mode` stays **true**. Only contracts and schemas are fixed in this stage; no firmware is written.

## 2. Google Sheets Plan

**Target spreadsheet (fixed):** `https://docs.google.com/spreadsheets/d/10a3YXWBN4-hFJQQT4sLERmyu8D2TxYKNkXW-k3QRyLI/edit` (ID `10a3YXWBN4-hFJQQT4sLERmyu8D2TxYKNkXW-k3QRyLI`).

**Application method — documentation only this phase.** The Sheets MCP has historically returned `The caller does not have permission` for this spreadsheet. Therefore this phase only *documents* the schemas below; the tabs are applied **manually by the owner** (or via MCP later if access is restored). Application = create tabs `Events`, `SystemConfig`, `Notifications`, `PushSubscriptions`, `AgentNotes`, `DiseaseScans`; write the header rows and seed keys exactly as specified; **delete the `BranchMap` tab entirely** (no servo positioning remains anywhere).

### 2.1 `Events` — unchanged (raw episodic history)

One row per sensor/photo event. Columns, in order:

`EventID, Timestamp, EventType, MoisturePercent, SoilTempC, WaterTempC, AirTempC, AirHumidityPercent, WeightGrams, LightLevel, TankEmpty, WateringTriggered, WaterDurationSeconds, HeaterUsed, HeaterDurationSeconds, SpeciesGuess, SpeciesConfidence, PhotoFileID, AnomalyDetected, AnomalyDescription, AI_Notes, ReasoningSummary`

- `EventID` — correlation key joining the sensor webhook row and the photo webhook row.
- `Timestamp` — ISO-8601 UTC.
- `TankEmpty` — boolean (XKC-Y25 sensor).
- `ReasoningSummary` — must cite concrete historical values (audit of the "never decide from a snapshot" requirement).
- `AI_Notes` — human-readable AI notes (no Telegram anymore; plain text for the dashboard).

### 2.2 `SystemConfig` — key/value store (distilled long-term profile)

Columns: `Key | Value | LastUpdated`.

Seeded keys:

| Key | Initial value | Written by |
|---|---|---|
| pot_latitude | `49.9886` | seed only |
| pot_longitude | `8.5958` | seed only |
| last_watered_utc | *(empty)* | Core Daily Logic — **PROVISIONAL until firmware confirms pump completion (documented)** |
| last_species_guess | `unknown` | Photo branch |
| species_confidence | `0` | Photo branch |
| current_temp_tolerance_c | *(empty)* | Core Daily Logic |
| next_sunrise_utc | *(empty)* | Scheduler branch |
| next_sunset_utc | *(empty)* | Scheduler branch |
| last_tank_empty_alert_sent | *(empty)* | Core Daily Logic |
| dry_run_mode | `true` | user toggles manually |
| min_rewater_interval_hours | `6` | seed (user-tunable) |
| scan_session_active | `false` | Branch C |
| camera_battery_percent | *(empty; latest value)* | every CAM webhook |
| camera_battery_min_percent | `30` | seed (user-tunable; Branch C battery gate) |
| drive_daily_photos_folder_id | *(empty until setup)* | one-time Drive setup |
| drive_scan_photos_folder_id | *(empty until setup)* | one-time Drive setup |
| push_vapid_public_key | *(empty; owner generates VAPID keys)* | manual prerequisite |

**REMOVED keys:** `telegram_chat_id`, `current_cycle_week`, `drive_map_photos_folder_id`.

### 2.3 `Notifications` — NEW (HITL queue + alert feed)

Columns: `timestamp, type, title, message, response_options, status, response, resume_url, context_ref`

- `type` — e.g. `watering_feedback`, `scan_position`, `scan_verdict`, `scan_followup`, `alert_tank_empty`, `alert_battery_low`, `alert_anomaly`, `scan_postponed`, `smoke_test`.
- `response_options` — JSON array of button labels the dashboard renders (e.g. `["👍","👎"]`).
- `status` — `pending` / `done` / `expired`.
- `resume_url` — n8n `$execution.resumeUrl` captured when the row is created; the dashboard's buttons call it.
- `response` — what the user answered (button label and/or free text).
- `context_ref` — references the `Events` row / `EventID` the feedback belongs to (e.g. watering 👍/👎 rows carry the event's `EventID`).

### 2.4 `PushSubscriptions` — NEW (Web Push registry)

Columns: `timestamp, endpoint, p256dh, auth, expiration_time, user_agent, status`

Written by the dashboard (service worker push subscription); read by n8n when pushing.

### 2.5 `AgentNotes` — NEW (working memory)

Columns: `timestamp, agent, note, context_ref, status`

- `status` — `active` / `promoted` / `expired`.
- `context_ref` — event/disease-scan the note was derived from.
- Every AI agent injects its own last ~10 `active` notes (labeled UNVERIFIED HYPOTHESES) and may append 1–3 short notes per run. The future Plant Profile Agent promotes validated notes into SystemConfig and expires stale ones.

### 2.6 `DiseaseScans` — NEW schema (replaces old)

Columns: `timestamp, drive_links, vision_opinion, yolo_opinion, judge_verdict, judge_reasoning, treatment_plan, user_verdict, treatment_outcome, ai_notes`

One row per weekly scan session. `drive_links` holds Drive photo links; `vision_opinion`/`yolo_opinion` the raw analyst JSON; `judge_verdict`/`judge_reasoning` the Judge output; `user_verdict` and `treatment_outcome` the two HITL answers. This tab is also the dataset flywheel: every row = photo + opinions + verdict + human verification → gold labels for later YOLO fine-tuning.

### 2.7 `BranchMap` — DELETED entirely

No servo positioning remains; drop the tab during manual application.

## 3. PhytoAI Workflow Plan

One workflow (`phytoai`, ID `WXd35adnUc9QQA84`), **INACTIVE**, `dry_run_mode=true`, multiple triggers. Structure:

```
phytoai
|-- Trigger 1  Webhook "Core Sensor Webhook"   POST /core/sensor      (responseNode)        -> Branch A
|-- Trigger 2  Webhook "Daily Photo Webhook"   POST /core/photo       (binary, onReceived)  -> Branch B
|-- Trigger 3  Webhook "Scan Photo Webhook"    POST /yolo-scan        (binary, responseNode)-> Branch C photo path
|-- Trigger 4  Webhook "Scan Sweep Done"       POST /yolo-scan/done                         -> Branch C close
|-- Trigger 5  Webhook "Device Config"         GET  /config           (responseMode)        -> Branch E
|-- Trigger 6  Schedule "Daily Sun Calc"       cron "10 0 * * *"                            -> Branch E
|-- Trigger 7  Schedule "Weekly Scan"          cron "0 6 * * 1" (Mon 06:00 UTC)             -> Branch C scheduler
`-- Trigger 8  Schedule "Plant Profile Agent — TODO"  weekly, DISABLED placeholder           -> future
```

**REMOVED triggers/paths:** `/yolo-map/start`, `/yolo-map`, `/yolo-map/done`, `/yolo-scan/positions`, and the Weekly Cycle Flip scheduler.

### 3.1 Branch A — Core Daily Logic (synchronous, multi-agent + Code guardrails)

1. **Webhook "Core Sensor Webhook"** (POST `core/sensor`, `responseMode: responseNode`) — receives the WROOM payload (§4.1).
2. **Set "Normalize Sensor Payload"** — coerces types, fills `event_id` fallback, timestamps.
3. **Google Sheets "Read SystemConfig"** + **"Read Event History"** — config + recent Events rows.
4. **Code "Build Context"** (no AI) — computes facts *before* any AI sees the data: hours since last successful watering, watering counts last 7/30 days, moisture trend over recent rows, weight trend, effect of last watering (moisture delta), current species + confidence, and sensor sanity flags (impossible values flagged as anomalies up front).
5. **AI Agent "History Analyst"** — strict small JSON over the computed facts + compacted history + its own AgentNotes: `trend_reading`, `watering_effectiveness`, `concerns`, `confidence`. Schema is tiny and validated; its output cannot smuggle instructions into the Decision Agent.
6. **AI Agent "Core Decision Agent"** — live sensors + calculated facts + History Analyst interpretation + own AgentNotes. Prompt rules (§5): never decide from the snapshot alone; no fixed thresholds; no fixed calendar; must cite concrete historical values in `reasoning_summary`; insufficient/contradictory evidence → `needs_watering=false` + recheck interval.
7. **Set "Normalize Decision"** — shape AI output for the guardrails.
8. **Code "Safety Guardrails"** (deterministic, never AI-overridable):
   - `tank_empty` → watering forced off.
   - Minimum rewater interval: if the last successful watering was < `min_rewater_interval_hours` (default 6) ago, watering is blocked unless the AI returns high confidence **and** cites evidence the previous watering failed. Blocked attempts are logged either way.
   - Hard caps: max pump seconds, `max_heater_seconds` = 600, max water temperature.
   - `dry_run_mode=true` → zero physical actuation fields.
9. **IF "Tank Empty Override?"** — routes the empty-tank path (12 h alert cooldown kept): instead of Telegram, the alert becomes a **pending Notifications row** (type `alert_tank_empty`, urgent + push) + `last_tank_empty_alert_sent` update. Forced `needs_watering=false` continues to the response.
10. **Set "Build Decision Response"** — exact response JSON (§4.1), incl. optional `recheck_hours`.
11. **Respond to Webhook "Respond Decision"** — the WROOM receives its decision here.
12. **Set "Build Event Row"** + **Google Sheets "Append Events"** — full event row incl. guardrail outcomes and `ReasoningSummary`.
13. **Google Sheets "Update SystemConfig"** — `last_watered_utc` (provisional, documented), species most-confident-wins, `current_temp_tolerance_c`.
14. **IF "Was a Watering Decision Made?"** → append a **Notifications row** (type `watering_feedback`, options `["👍","👎"]`, `context_ref` = this event's `EventID`, `resume_url` from `$execution.resumeUrl`). The dashboard's response is logged back to `Notifications.response` for the future Plant Profile Agent.

### 3.2 Branch B — Daily Photo (single multimodal call)

1. **Webhook "Daily Photo Webhook"** (POST `core/photo`, binary, `onReceived` static ack; CAM adds `battery_percent`) — §4.2.
2. **Read SystemConfig + Read Event History + Read Matching Event Row** — matching on `EventID`.
3. **Code "Build Multimodal Context"** — one single multimodal call: photo + today's row + history + species + last-watered.
4. **AI Agent "Photo Analysis Agent"** — output: `species_guess`, `species_confidence`, `anomaly_detected`, `anomaly_description`, `watering_review`, `ai_notes` (§5.2).
5. **Google Drive "Upload Daily Photo"** — `SmartPot/DailyPhotos/`.
6. **Google Sheets "Events upsert"** + **"species upsert"** (most-confident-wins) + **SystemConfig `camera_battery_percent` update**.
7. **IF "Urgent visual anomaly?"** → pending Notifications row (type `alert_anomaly`, urgent + push). No Telegram.

### 3.3 Branch C — Weekly disease scan (human-assisted multi-model panel)

Scheduler path (Schedule Trigger "Weekly Scan", cron `0 6 * * 1` = Mon 06:00 UTC):

1. **Read SystemConfig** (`camera_battery_percent`, `camera_battery_min_percent` [default `30`], `scan_session_active`).
2. **Code "Check Scan Preconditions"** → **IF "Battery low?"** (`battery_percent < camera_battery_min_percent`) → Notifications "charge camera" (type `alert_battery_low`) + log scan postponed → end.
3. Else append **Notifications "position camera facing plant"** (type `scan_position`, options `["Camera positioned"]`, `resume_url`).
4. **Wait node** — "Resume: On Webhook Call" with a timeout path: timeout → mark row `expired` + log scan postponed → end. *Exact Wait config to be confirmed during implementation (§8).*
5. On resume: set `scan_session_active=true` → end (the paused execution's job is done; the photo arrives as a separate webhook execution).

Photo path (Trigger 3, POST `/yolo-scan`, legacy path name kept for firmware compatibility — documented as legacy):

1. **IF "scan_session_active?"** — no → respond `{"status":"no_active_session"}` and stop.
2. **Google Drive "Upload Scan Photo"** — `SmartPot/ScanPhotos/`.
3. **AI Agent "Vision Analyst"** — structured JSON: framing/quality assessment, observed symptoms, suspected issues, confidence, affected areas (§5.3).
4. **Code "YOLO Analyst (stub)"** — returns `{"status":"not_yet_trained"}`. Later swapped for a local FastAPI YOLO inference call — documented, not built now.
5. **AI Agent "Judge"** — receives both opinions + image context. Weighting per prompt: vision model = symptom reasoning weight; YOLO = label + confidence from a model still learning this environment → **low weight until fine-tuned**. Output: final verdict, own reasoning, recommended action (§5.4).
6. **IF "Real issue?"** →
   - **AI Agent "Treatment Advisor"** — verdict + full plant context from Sheets (species, current conditions, watering history, past diseases, past treatments + outcomes, relevant AgentNotes). Output: disease name, severity, step-by-step treatment, product guidance as **active ingredients/categories only, never brand names**, explicit low-confidence statement when uncertain, and why the advice fits THIS plant's data (§5.5).
   - **Append Notifications row** (type `scan_verdict`, verdict + treatment, options `["Confirmed","Wrong","Not sure"]` + free text) → **Wait resume** → log `user_verdict` to the DiseaseScans row → append **follow-up "resolved?" notification** (type `scan_followup`) → **Wait** → log `treatment_outcome`.
   - No issue → Judge's clean verdict goes straight to the DiseaseScans row.
7. **Append DiseaseScans row** (new schema §2.6).
8. **Respond to Webhook** — synchronous per-scan ack (§4.4).

Close path (Trigger 4, POST `/yolo-scan/done`): append Notifications "return camera to charging dock" → `scan_session_active=false` → ack.

### 3.4 Branch E — Scheduler + Device Config

1. **Schedule "Daily Sun Calc"** (cron `10 0 * * *`, UTC) → **Code "Sunrise Sunset Calc"** (NOAA algorithm, no external API — §6) → **Update SystemConfig** `next_sunrise_utc` / `next_sunset_utc`. **Kept.**
2. **Weekly Cycle Flip — REMOVED** (no mapping/scanning alternation anymore).
3. **Webhook "Device Config"** (GET `/config`, `responseMode: lastNode`) — responds with sun times + location + `dry_run_mode` (§4.5); self-healing: recomputes sun times if missing or in the past.
4. **Schedule Trigger "Plant Profile Agent — TODO"** — exists in the workflow but is **DISABLED** (weekly placeholder). Full build later: reviews AgentNotes + Events + DiseaseScans + user feedback, promotes validated insights into the SystemConfig profile, marks stale notes `expired`.

### 3.5 One-Time Setup (manual trigger branch)

Creates Drive folders `SmartPot/DailyPhotos` + `SmartPot/ScanPhotos` (**NO MapPhotos**), stores folder IDs in SystemConfig. **No Telegram test message** — instead a Notifications **smoke-test row** (type `smoke_test`, dummy `resume_url`) so the dashboard can verify rendering + button flow.

## 4. Webhook Contracts

Production base URL: the **persistent named Cloudflare tunnel** (see §7 M1). Paths become `/webhook/<path>` (test: `/webhook-test/<path>`). Firmware treats the base URL as config, never hardcoded.

### 4.1 `POST /core/sensor` (WROOM → n8n, synchronous decision)

Request:
```json
{
  "device_id": "esp32-wroom-01",
  "event_id": "sunrise-2026-08-22",
  "event_type": "sunrise",
  "captured_at_utc": "2026-08-22T04:12:00Z",
  "moisture_percent": 42.5,
  "weight_grams": 812.3,
  "air_temp_c": 21.4,
  "air_humidity_percent": 58.2,
  "soil_temp_c": 19.8,
  "water_temp_c": 18.1,
  "light_level": 640,
  "tank_empty": false
}
```
Response (HTTP 200):
```json
{
  "event_id": "sunrise-2026-08-22",
  "needs_watering": true,
  "water_duration_seconds": 12,
  "heater_on": true,
  "temperature_tolerance_c": 2.5,
  "max_heater_seconds": 600,
  "water_warmer_than_soil_action": "proceed",
  "species_guess": "Monstera deliciosa",
  "ai_notes": "3 days since last watering, moisture trending down...",
  "recheck_hours": null,
  "dry_run": true
}
```
- `recheck_hours` — optional; set when evidence was insufficient (AI returns `needs_watering=false` + a recheck interval) so firmware may re-poll sooner.
- `max_heater_seconds: 600` surfaces the firmware safety timeout; firmware's local cap stays authoritative.
- `dry_run: true` (and zeroed actuation) whenever `dry_run_mode` is `true`. Tank-empty override always yields `needs_watering: false`.
- Firmware must tolerate ≥120 s HTTP timeout (AI latency).

### 4.2 `POST /core/photo` (CAM → n8n, fire-and-forget)

Multipart/form-data: JPEG file + fields `device_id`, `event_id`, `event_type`, `captured_at_utc`, **`battery_percent`**. Immediate static ack:
```json
{ "status": "received", "event_id": "sunrise-2026-08-22" }
```

### 4.3 `POST /yolo-scan` (CAM → n8n, scan photo — **legacy path name kept for firmware compatibility, documented as legacy**)

Multipart/form-data: JPEG + fields `device_id`, `captured_at_utc`, **`battery_percent`**. Response (`responseNode`):
```json
{ "status": "ok", "judge_verdict": "healthy", "confidence": 0.91 }
```
or `{ "status": "no_active_session" }` when no scan session is open.

### 4.4 `POST /yolo-scan/done`

Body: `{ "device_id": "...", "photos_uploaded": 1, "started_at_utc": "...", "ended_at_utc": "..." }` — response `{ "status": "ok" }`; "return camera to dock" notification fires async.

### 4.5 `GET /config` (either device)

```json
{
  "next_sunrise_utc": "2026-08-23T04:32:00Z",
  "next_sunset_utc": "2026-08-22T18:41:00Z",
  "dry_run_mode": true,
  "pot_latitude": 49.9886,
  "pot_longitude": 8.5958
}
```

**REMOVED endpoints:** `/yolo-map/start`, `/yolo-map`, `/yolo-map/done`, `/yolo-scan/positions`.

## 5. AI Model & Prompt Design

**Model wiring (every AI Agent node shares this):** Agent (v3.1) + **lmChatOpenAi** subnode named "OpenRouter Gemma":
- `model: { mode: 'id', value: 'google/gemma-4-26b-a4b-it' }`
- `options.baseURL: 'https://openrouter.ai/api/v1'`
- `responsesApiEnabled: false` (**critical** — OpenRouter has no Responses API; the node default `true` must be flipped)
- `options.temperature: 0.2`
- Credential referenced as **"PhytoAI OpenRouter"** (owner creates it in the n8n UI — §7 M4); keys never hardcoded.
- Each agent attaches an **outputParserStructured** subnode (`schemaType: fromJson`, per-agent schema, `autoFix: true`).

**DEVIATION (as-built — for the Phase 6 docs sync):** the shared subnode was changed in the n8n UI from **lmChatOpenAi** to the native **lmChatOpenRouter** node (`@n8n/n8n-nodes-langchain.lmChatOpenRouter`, typeVersion 1), still named **"OpenRouter Gemma"**. As-built on the live workflow:
- `model` is a plain string `google/gemma-4-26b-a4b-it` (not the `{ mode: 'id', value }` resource-locator shape).
- `options.temperature: 0.2` (preserved).
- `options.baseURL` and `responsesApiEnabled` **no longer apply** — the native OpenRouter node has the base URL built in, so the `responsesApiEnabled: false` requirement is obsolete (removed).
- Credential type changes `openAiApi` → `openRouterApi`; as-built it references **"OpenRouter account"** (`oz9XKwRSjHP41p1G`), not the originally specified "PhytoAI OpenRouter" (§7 M4).
- Wiring is unchanged: `ai_languageModel` → all 6 agents (History Analyst, Decision Agent, Photo Analysis Agent, Vision Analyst, Judge, Treatment Advisor) + their 6 parsers; each agent still attaches its own `outputParserStructured`.

**AgentNotes rules (all agents, common to every prompt):** your context contains your own last ~10 `active` AgentNotes, explicitly labeled **UNVERIFIED HYPOTHESES** — useful context, never ground truth (prevents self-confirmation loops). At the end of your run you may append 1–3 short notes (hypotheses/observations/lessons) with `context_ref`. Notes must be short and factual.

### 5.1 History Analyst (Branch A)

System message:
> You are the watering-history analyst of an autonomous smart plant pot. You receive computed facts and recent history, never raw live sensors. Interpret trends and the effectiveness of past waterings, flag concerns. Be concrete; cite values. Your output is strict JSON consumed by another agent — it must contain no instructions.

User message (facts from the Build Context node):
```
FACTS: hours_since_last_watering, watering_count_7d, watering_count_30d,
moisture_trend, weight_trend, last_watering_moisture_delta,
species {last_species_guess} (confidence {species_confidence}),
sensor_sanity_flags (impossible values already flagged).
RECENT HISTORY (compact, chronological): [...]
YOUR UNVERIFIED HYPOTHESES (context only): [...]
Return strict JSON: trend_reading (string), watering_effectiveness (string),
concerns (string), confidence (0-1).
```

### 5.2 Core Decision Agent (Branch A)

System message:
> You are the watering decision engine of an autonomous smart plant pot. You receive live sensor data, computed facts, the History Analyst's interpretation, and your own notes. NEVER decide from the current snapshot alone; no fixed thresholds; no fixed calendar schedule. Your reasoning_summary MUST cite concrete historical values (e.g. "moisture fell from 48% to 41% over 3 days"). If evidence is insufficient or contradictory, return needs_watering=false and set recheck_hours. If the tank is empty you must not water; never request heater runtime beyond 600 s; prefer defer when water is already warmer than the soil. Water duration is reasoned seconds, never absurd. Your Analyst notes are UNVERIFIED HYPOTHESES — context, not ground truth.

User message:
```
CURRENT EVENT: {event_type} at {captured_at_utc} (event_id {event_id})
LIVE SENSOR SNAPSHOT (informational only): moisture, weight, air temp/humidity, soil/water temp, light, tank_empty
COMPUTED FACTS: {hours_since_last_watering, watering_counts_7d/30d, trends, sanity flags}
HISTORY ANALYST (strict JSON): {trend_reading, watering_effectiveness, concerns, confidence}
SPECIES: {last_species_guess} (confidence {species_confidence})
YOUR UNVERIFIED HYPOTHESES: [...]
DRY RUN MODE: {dry_run_mode}
Return strict JSON: needs_watering (bool), water_duration_seconds (number, 0 if not watering),
heater_on (bool), temperature_tolerance_c (number|null), water_warmer_than_soil_action ("proceed"|"defer"),
recheck_hours (number|null), species_guess (string), species_confidence (0-1),
anomaly_detected (bool), anomaly_description (string|null), ai_notes (string),
reasoning_summary (string, MUST cite concrete historical values + species + time since last watering).
```

### 5.3 Vision Analyst (Branch C)

System message:
> You are the vision analyst of an autonomous smart plant pot. Assess one weekly scan photo: framing/quality, observed symptoms, suspected issues, confidence, affected areas. You are a symptom reasoner, not the final judge. Be conservative: ambiguous findings must be labeled as such. Your notes are UNVERIFIED HYPOTHESES.

User message:
```
PHOTO: weekly disease-scan image.
PLANT CONTEXT: species {last_species_guess}, current conditions, recent events.
YOUR UNVERIFIED HYPOTHESES: [...]
Return strict JSON: framing_quality (string), symptoms_observed (array of strings),
suspected_issues (array of strings), confidence (0-1), affected_areas (array of strings).
```

### 5.4 Judge (Branch C)

System message:
> You are the cross-check judge of an autonomous smart plant pot. You receive the Vision Analyst's symptom reasoning and the YOLO Analyst's output. Weighting: the vision model provides symptom reasoning; YOLO provides a label + confidence from a model still learning this environment — treat YOLO as LOW WEIGHT until it is fine-tuned on this pot's own verified data. If YOLO reports "not_yet_trained", ignore it except to note it. Output the final verdict, your own reasoning, and the recommended action.

User message:
```
VISION OPINION (strict JSON): {framing_quality, symptoms_observed, suspected_issues, confidence, affected_areas}
YOLO OPINION: {status: "not_yet_trained"} (or label + confidence)
IMAGE CONTEXT: weekly scan, species {last_species_guess}.
YOUR UNVERIFIED HYPOTHESES: [...]
Return strict JSON: verdict (string, e.g. "healthy" | "monitor" | "issue"),
verdict_confidence (0-1), reasoning (string, explain weighting), recommended_action (string).
```

### 5.5 Treatment Advisor (Branch C — runs only when the Judge concludes a real issue)

System message:
> You are the treatment advisor of an autonomous smart plant pot. You receive the Judge's verdict plus the FULL plant context from Sheets: species, current conditions, watering history, past diseases, past treatments and their outcomes, relevant AgentNotes. HARD RULES: recommend active ingredients / treatment categories ONLY (e.g. "neem oil", "copper fungicide") — NEVER brand/product names. If uncertain, include an explicit low-confidence statement. Explain why this advice fits THIS plant's data — not generic care advice. Your notes are UNVERIFIED HYPOTHESES.

User message:
```
JUDGE VERDICT: {verdict, verdict_confidence, reasoning, recommended_action}
PLANT CONTEXT: species {last_species_guess} (confidence {species_confidence}), current conditions {...},
watering history [...], past diseases/treatments/outcomes [...], relevant AgentNotes [...].
Return strict JSON: disease_name (string), severity ("mild"|"moderate"|"severe"),
treatment_steps (array of strings, plant-specific, step-by-step),
product_guidance (array of strings, active ingredients/categories only),
low_confidence_statement (string|null), why_this_fits (string), ai_notes (string).
```

### 5.6 Photo Analysis Agent (Branch B)

System message:
> You are the visual analyst of an autonomous smart plant pot. You receive one daily photo plus the same event's sensor data and history. Identify/refine the species (prefer the more confident identification), detect visual anomalies (drooping, discoloration, pests, wilting, mold), and review whether today's watering decision still looks reasonable given what you see. Be conservative about disease claims. Your notes are UNVERIFIED HYPOTHESES.

User message:
```
PHOTO: today's quick-check image.
SAME EVENT'S SENSOR DATA: {today's Events row matched by event_id}
HISTORY (last 10, compact): [...]
LAST WATERED: {last_watered_utc} ({elapsed_hours} h ago)
SPECIES ON RECORD: {last_species_guess} (confidence {species_confidence})
TODAY'S DECISION: needs_watering={...}, water_duration_seconds={...}
YOUR UNVERIFIED HYPOTHESES: [...]
Return strict JSON: species_guess, species_confidence (0-1), anomaly_detected (bool),
anomaly_description (string|null), watering_review (string), ai_notes (string).
```

## 6. Sunrise/Sunset Logic

- **Method:** Code node implementing the **NOAA solar-position algorithm** inside `phytoai` — deterministic, no API key, no rate limits, works behind restricted egress.
- **Location:** latitude `49.9886`, longitude `8.5958` (Mörfelden-Walldorf, Germany), also persisted in SystemConfig.
- **Output:** next upcoming sunrise and sunset as UTC ISO-8601, stored in `next_sunrise_utc` / `next_sunset_utc`. UTC regardless of DST; local offset noted in `ai_notes` for readability.
- **Refresh:** Schedule Trigger daily at 00:10 UTC. `GET /config` recomputes on the fly when values are missing or stale (self-healing).

## 7. Manual Prerequisites

Owner-side actions I cannot perform. Ordered by priority:

- **M1 — Persistent named Cloudflare tunnel (top priority).** Set up a **named** Cloudflare tunnel to the n8n instance. Quick tunnels die on restart and change URLs — resume URLs stored in Notifications rows must remain valid, so the tunnel must be persistent and named. This is the production webhook base URL for the whole system.
- **M2 — Google Sheets tab creation (per §2 schemas).** Manual paste steps in the Sheets UI: create the six tabs with the exact header rows and seed keys; delete `BranchMap`. (Historically the Sheets MCP lacks permission on this spreadsheet — manual application is the fallback and default this phase.) **Blocking dependency for Phase 5 (wiring test):** all six tabs + seed keys — including `camera_battery_min_percent` (`30`) — must exist first; a dry-run against a missing tab fails at the Sheets nodes.
- **M3 — n8n Google credentials.** In the n8n UI: Google Sheets OAuth credential **"PhytoAI Google Sheets"** and Google Drive credential **"PhytoAI Google Drive"**.
- **M4 — OpenRouter key.** Create the n8n AI credential **"PhytoAI OpenRouter"** with the owner's OpenRouter key (base URL override lives in the model subnode, not the credential).
- **M5 — VAPID keypair generation.** Owner generates a VAPID keypair (e.g. via `web-push` CLI); public key goes into SystemConfig `push_vapid_public_key`, private key stays in n8n (push-send implementation — §8).
- **M6 — Dashboard deployment.** Deploy the static dashboard to GitHub Pages (repo + Sheets API OAuth client for writes). Dashboard spec: §9.
- **M7 — Drive folder setup (workflow-assisted).** One-time setup branch (§3.5) creates `SmartPot/DailyPhotos` + `SmartPot/ScanPhotos` and stores IDs. Requires M3.

**REMOVED prerequisite:** the Telegram bot + `telegram_chat_id` (Telegram is gone).

## 8. Open Questions

1. **n8n Wait node exact config (Branch C):** the precise Wait ("Resume: On Webhook Call") setup, timeout duration, timeout branch behavior, and the resume-URL payload format the dashboard must send — to be confirmed during implementation (HARD RULE #1: max 2 research attempts, then implement the documented best effort).
2. **n8n push-send implementation (Web Push):** whether n8n's Code node can require/use the `web-push` library directly in this Docker deployment, or whether a tiny relay service is needed. Mechanism documented (§8.5 of the dashboard spec) — exact implementation marked open with fallback.
3. **Long-Wait execution timeouts:** n8n executions have timeouts; a Wait node waiting hours for the dashboard's scan confirmation may hit the workflow execution timeout. Confirm the limit and either configure the execution timeout or split the flow so each webhook is its own execution.
4. **Capture-button debounce details:** exact GPIO choice on the ESP32-CAM (with boot-strap pins avoided), debounce strategy (RC hardware vs. polling, ~ms), and LED confirmation behavior — firmware-stage detail to finalize when firmware is written.
5. **Dashboard write auth:** how the static GitHub Pages site stores OAuth/API access for Sheets writes (service-account proxy vs. per-user OAuth) — decided at dashboard implementation.
6. **Resume-URL auth:** whether dashboard→n8n resume calls need any token protection beyond the unguessable URL.
7. **Scan photo arrival model:** confirm the canonical split — the paused "position camera" execution ends on confirm; the photo arrives as a separate `/yolo-scan` execution gated by `scan_session_active`.
8. **Sheets MCP access:** whether the owner can grant the MCP's Google account access so future automated tab application becomes possible (manual application is the fallback this phase).

## 9. Dashboard Plan (pulled forward as its own stage)

Static HTML/CSS/JS on GitHub Pages. Reads Sheets via the Sheets API (OAuth for writes). Talks to n8n resume URLs through the persistent named tunnel (§7 M1).

- **Minimal version (build first — replaces Telegram):** current plant status card; event history; scan reports with Drive images; pending Notifications with working buttons (call `resume_url`, log `response`, mark `status=done`) and free-text corrections; 👍/👎 on watering decisions; user-verdict + treatment-outcome feedback for scans.
- **Full version (later):** charts/trends of sensor history, full disease history, AgentNotes/profile view, camera battery status, service-worker push notifications (VAPID; subscription saved to `PushSubscriptions`; n8n pushes on new pending urgent Notifications: tank empty, low camera battery, disease/anomaly detected, scan verdict).
- Design goal: every piece of info, detection, and past data about the plant lives here.

## 10. Web Push Mechanism (documented; implementation open — §8 Q2)

Dashboard registers a service worker and a push subscription (VAPID); subscription rows land in `PushSubscriptions`. n8n sends a push whenever a pending Notifications row of an urgent type is created (tank empty, low camera battery, disease/anomaly detected, scan verdict). The exact n8n push-send (web-push library in a Code node vs. tiny relay over HTTP) is **HARD-RULE-#1 research territory** and stays an open question with a documented fallback.

## 11. Hardware Notes (for the hardware-prerequisites record; contracts only this stage)

- **Removed from the plan:** servos, GT2 belt, pan/tilt arm, and all YOLO-for-aiming hardware/mechanics. The ESP32-CAM sits statically in a charging dock at the pot edge; the system never commands movement and never knows its position.
- **CAM battery monitoring:** two-resistor voltage divider from the battery to an ADC1-capable GPIO (**GPIO33**; ADC2 conflicts with Wi-Fi), sized so 4.2 V full charge reads under 3.3 V, calibrated against a multimeter. Firmware maps ADC → `battery_percent`, included in every CAM webhook payload.
- **Manual capture button:** a button on the CAM (GPIO with debounce) lets the owner trigger photo capture + upload when positioning for scans. Firmware requirement — documented here and in Hardware/ docs.
- These firmware items are **future-stage**; Stage 1 fixes only the contracts in §4.

## 12. Explicitly Out of Scope (Stage 1 only)

This plan does **not** cover — and the future execution run will not touch:

- ESP32 WROOM firmware (wake schedule, sensor reading, pump/heater execution, NTP re-sync) — contracts only (§4).
- ESP32-CAM firmware (photo capture, battery ADC, capture-button debounce, uploads) — contracts only.
- Physical wiring and power architecture (battery, divider, charging dock).
- Servo/GT2 mechanics and the 3D-printed enclosure — removed from the system entirely.
- Dashboard implementation code — this plan fixes the dashboard *spec* only.
- YOLO training/fine-tuning and the local FastAPI inference endpoint — the pipeline runs against the `{"status":"not_yet_trained"}` stub; training uses accumulated DiseaseScans gold labels later.
- The Plant Profile Agent build — planned as a disabled placeholder trigger; full build follows in a later stage.
