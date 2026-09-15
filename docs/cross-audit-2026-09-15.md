# Cross-System Audit — 2026-09-15

**Repo:** `github.com/SYR8/PhytoAI`, branch `main` @ `a68b1f9` (audit run on a clean working tree at
`af5a409`→`a68b1f9`; untracked: `docs/cross-system-audit-brief.md`, `docs/PhytoAI-final.xlsx`,
`docs/PhytoAI.xlsx`).
**Scope:** Part B of `docs/cross-system-audit-brief.md`, re-mapped to the **real** repo surfaces (the brief's
`n8n/`, `mcp-server/`, `m5-complete/`, `esp32-cam-monitor/`, `n8n-endschedules/` folder names do not exist
here — see §1). Method: file/line evidence, workflow JSON analysis, live n8n instance reads via the
workflow-management MCP, and xlsx parsing.

---

## 1. Surface inventory (brief mapping → reality)

| Brief surface | Real surface audited | Status |
|---|---|---|
| `n8n/PHYTO2026 workflow.json` | `workflows/phytoai.json` (+ `workflows/phytoai.backup.json` drift) | EXISTS |
| `PhytoAI-final.xlsx` | `docs/PhytoAI.v2.xlsx` (authoritative) + `docs/PhytoAI-final.xlsx` (local duplicate) | EXISTS (both) |
| `esp32-cam-monitor/` | `firmware/esp32cam/`, `firmware/esp32cam_production/` | EXISTS |
| Service layer | `yolo-service/`, `scripts/` | EXISTS |
| Dashboard | `dashboard/` | EXISTS |
| Specs of record | `docs/SmartPot-Full-Engineering-Spec-PRD.md`, `docs/perenual-integration-spec.md`, `docs/yolo-service-spec.md`, `docs/opencode-firmware-brief.md`, `docs/opencode-esp32cam-production-brief.md` | EXISTS |
| `mcp-server/server.js` | — | **ABSENT** |
| `m5-complete/complete-code.gs` | — | **ABSENT** |
| `.github/` | — | **ABSENT** |

`git ls-files` matches for `mcp-server|m5-complete|esp32-cam-monitor|n8n-endschedules|^n8n/|^\.github`:
**none**. Repo-wide search for `M5Stack|espNow|AWT3|AC100|plantid|potId|Flask|Groq|photoContract|getImageMetadata|sendCMDforA2|getSensorInfo|complete-code|commandParser`: **zero hits** in tracked files.

---

## 2. B1 — n8n workflow (`workflows/phytoai.json`) — **PASS (with findings)**

- **Active architecture, not the legacy export.** Active export = **168 nodes / 182 edges**; the archived
  `workflows/phytoai.backup.json` = **105 nodes, `active:false`**, containing **6 Telegram nodes**
  (`Telegram Empty Tank Alert/Daily Summary/Anomaly Alert/Map Sweep Summary/Scan Sweep Summary/Test Message`),
  BranchMap/map-sweep and mapping/scanning agent nodes. Active workflow contains **none** of those
  (In-backup-only = 45 nodes, in-active-only = 108 nodes). The active export is the Lean build for this repo
  (the brief's "~48-node vs 85-node" numbers belong to the other project).
- **No hidden integrations.** Active JSON scan: `telegram|mqtt|espNow|m5stack|flask|groq|ftp|servo|
  serialport|websocket` → **0 hits each**. Only `mapping` hits are `mappingMode` (Sheets params) —
  no BranchMap/servo nodes.
- **Telegram→Groq path:** N/A on this repo — the chat/UI path is the **dashboard + Notifications HITL with
  `Wait` resume URLs** (Plan §3.3, `docs/phytoai-redesign-prompt.md` Change 2). No Telegram/Groq nodes exist
  in the active workflow (evidence above); Telegram is only present in the pre-redesign backup.
- **Decision → Flask → MCP path:** N/A — **no Flask/MCP server exists**; the decision path is
  `Core Sensor Webhook (core/sensor, responseMode=responseNode)` → `Decision Agent` → `Safety Guardrails` →
  `Build Decision Response` → `Respond Decision` (`respondToWebhook`, `responseBody: {{ $json }}`). See §4 for
  the resulting envelope.
- **Stale water-command TODO** (`addWateringEntry` vs `executeMCPCommand`): **not present** in this repo
  (zero hits). Analog open item here: `last_watered_utc` stays provisional until firmware pump-completion
  feedback (Plan §2.2; README/STATUS known issues) — already tracked, no action in this audit.
- **Alert payload shapes:** all row-builder nodes populate the 9 Notifications columns
  (`timestamp,type,title,message,response_options,status,response,resume_url,context_ref`) and the dashboard
  reads `Notifications!A1:I` plus `response_options`/`resume_url` (`dashboard/app.js` L113, L119, L210, L251).
  Types present in the active workflow: `watering_feedback`, `scan_scheduled`, `scan_verdict`,
  `scan_followup`, `alert_tank_empty`, `alert_battery_low`, `alert_anomaly`, `scan_postponed` ×2,
  `smoke_test`. **`scan_position` = 0 hits** (removed by the Change 10 autonomous-scan edit) → see mismatch
  M4 below.
- **Embedded values vs reference data (`docs/PhytoAI.v2.xlsx`, §5 table):**
  - `min_rewater_interval_hours` (sheet `6.0`) — read in `Build Context`/`Safety Guardrails` ✓
  - `camera_battery_min_percent` (sheet `30.0`) — read in `Check Scan Preconditions` (default 30) ✓
  - `flash_dark_threshold` (sheet `500.0`) — read/written by Branch A/B ✓
  - `dry_run_mode` (sheet `TRUE`) — read in `Build Context`, `Safety Guardrails`, `Build Config Response` ✓
  - `max_pump_seconds` (sheet `60.0`) — **NOT referenced anywhere in the workflow** (0 hits; `Safety
    Guardrails` hardcodes `const maxPumpSeconds = 60` at `workflows/phytoai.json:3921`) → mismatch M2
  - `max_water_temp_c` (sheet `28.0`) — **not referenced**; `Safety Guardrails` hardcodes
    `const maxWaterTempC = 30` (same L3921) → mismatch M1
  - `preheat_margin_c` (sheet `2.0`), `preheat_lead_minutes` (sheet `25.0`) — **not referenced** and **not
    exposed** by `GET /config` (`Build Config Response` returns only sun times, cycle week, dry-run,
    lat/lng, light fields) → mismatch M3
  - `max_heater_seconds` — not a SystemConfig key; implemented as literal `600` in `Build Decision Response`
    (`workflows/phytoai.json` Set node) and `Safety Guardrails` — documented constant, no mismatch
  - `current_cycle_week` — Plan §2.2 says **REMOVED**, but `Build Config Response` still reads
    `cfg['current_cycle_week'] || 'mapping'` and ships it in `GET /config`
    (`workflows/phytoai.json:4642`) → mismatch M5
- **Backup artifact quality:** `workflows/phytoai.backup.json` begins with a zero-width/BOM character
  (`parse fails on strict JSON.parse`) and is a PowerShell-escaped old export (`\u0027`) — historical only,
  noted, no fix required.

## 3. B2 — MCP server + M5 (`mcp-server/`, `m5-complete/`) — **FAIL-as-specified / N/A by design**

- Both folders **do not exist** on `main` (inventory §1). No `.gs` file or `server.js` exists outside
  `.opencode/node_modules`.
- **Live n8n instance check (via MCP):** 9 workflows total — `Webtor`, `DiscordWebtorBot`,
  `Cashback hub Withdraw`, `AWStraining`, `My workflow`, `BSGG Project: Brain` (+`Ask`),
  `Schulportal_Hessen_Cockpit_Backend` — all unrelated to this project; the only plant workflow is
  `phytoai` (`WXd35adnUc9QQA84`, **active:false**). Its live definition **matches the repo export exactly**
  (168 nodes, 182 edges, identical node names; type counts identical; `/telegram|mqtt|espNow|m5|flask|groq|
  ftp|serialport|websocket/` → 0 hits live). **There is no VPS-side node talking to anything absent from
  `workflows/phytoai.json`.**
- **Finding:** the MCP-server/M5Stack/serial-bridge architecture described in the brief was **never
  materialized in this repo**, and nothing equivalent exists on the live instance. In this repo (and
  `Plan.md`), "MCP" refers only to the workflow-management MCP tooling (`README` pre-push checklist;
  `docs/Plan.md` §8's Sheets-MCP access question), and "M5" in `docs/Plan.md` is the **milestone label**
  `M5 — VAPID keypair`, not hardware.
- `complete-code.gs` AWT3/alert/espNowStatus branches: N/A — file absent (zero hits repo-wide).

## 4. Serial-envelope trace (B2 core) — the contract Part A implements

**Finding: there is no serial envelope anywhere on this repo's architecture.** The actual command path is
HTTP, initiated by the WROOM, answered synchronously by n8n:

```text
WROOM firmware (to be written, Part A)
  │  HTTPS POST https://<tunnel>/webhook/core/sensor      [JSON body: sensor telemetry + device_id/event_id]
  ▼
n8n  Core Sensor Webhook   (workflows/phytoai.json:3344 — path "core/sensor", responseMode: "responseNode")
  → Normalize Sensor Payload → Read SystemConfig → Read Event History → Read AgentNotes History
  → Build Context → History Analyst → Compose Decision Prompt → Decision Agent
  → Normalize Decision Output → Safety Guardrails → Tank Empty Override? → Needs Watering?
  → Build Decision Response (Set node, 11 fields) → Respond Decision (respondToWebhook, body: {{ $json }})
  │
  ▼  HTTP 200 JSON (the executable command envelope; built by "Build Decision Response", returned by "Respond Decision")
{
  "event_id": "...",                     "needs_watering": bool,
  "water_duration_seconds": N,           "heater_on": bool,
  "temperature_tolerance_c": N,          "max_heater_seconds": 600,
  "water_warmer_than_soil_action": "...","species_guess": "...",
  "ai_notes": "...",                     "dry_run": bool,
  "recheck_hours": N|null
}
  │
  ▼
WROOM executes locally (pump/heater) under its own hard limits; respects dry_run=true by simulating only.

Scheduling/context pull (WROOM-initiated):  HTTPS GET /webhook/config  (Device Config, responseMode: lastNode)
  → returns: next_sunrise_utc, next_sunset_utc, current_cycle_week (legacy, see M5), dry_run_mode,
             pot_latitude, pot_longitude, last_lightlevel, flash_dark_threshold, last_lightlevel_utc.
             [preheat_margin_c / preheat_lead_minutes are NOT exposed — see M3]
```

**What SHOULD send commands to the WROOM on this repo's architecture (explicit answer):**
**n8n is the only command source, and it does so as the *response* to the WROOM's own request** — there is
no serial/M5/ESP-NOW layer, and the ESP32-CAM never commands the WROOM (they meet only in the cloud, per
README/PRD). Part A's envelope is therefore:
1. **Outbound:** the WROOM POSTs the sensor payload to `/webhook/core/sensor` (contract: Plan §4.1) and
   executes exactly the 11-field decision JSON it gets back; nothing else may issue commands.
2. **Inbound config:** `GET /webhook/config` for sun times/flash/dry-run (+ the preheat gap, M3).
No third shape exists in the repo, in the live instance, or in the specs of record.

## 5. B3 — Reference data (`docs/PhytoAI.v2.xlsx`)

- **Presence:** `docs/PhytoAI.v2.xlsx` = the audited live-Sheets export (tracked; audit file v2). The brief's
  `PhytoAI-final.xlsx` exists locally as **untracked `docs/PhytoAI-final.xlsx`** and is **content-identical**
  to `PhytoAI.v2.xlsx` (all 6 tabs, headers and 24 SystemConfig rows byte-equal after parsing). README does
  **not** reference either xlsx (the brief's "README references it" is stale for this repo).
- **Tab/header check vs workflow Sheets nodes:** Events 25 cols ✓ (`Update Event Row` maps EventID,
  PhotoFileID, SpeciesGuess, SpeciesConfidence, AnomalyDetected, AnomalyDescription, AI_Notes — all exist
  in the header row); SystemConfig `Key/Value/LastUpdated` ✓; Notifications 9 cols ✓; AgentNotes 5 cols ✓
  (`Append AgentNotes` mapping matches); DiseaseScans 10 cols ✓ (`Build DiseaseScans Row` emits
  timestamp, drive_links, vision_opinion, yolo_opinion, judge_verdict, judge_reasoning, treatment_plan,
  user_verdict, treatment_outcome, ai_notes).
- **Authoritative per-parameter table (from v2.xlsx SystemConfig, 24 rows):**

| Key | Value | Consumed by workflow? |
|---|---|---|
| pot_latitude | `49.9886` | ✓ (`/config`, sun calc) |
| pot_longitude | `8.5958` | ✓ (`/config`, sun calc) |
| last_watered_utc | *(empty; provisional feed)* | ✓ |
| last_species_guess | `Pothos (Epipremnum aureum)` | ✓ |
| species_confidence | `0.7` | ✓ |
| current_temp_tolerance_c | *(empty)* | ✓ |
| next_sunrise_utc / next_sunset_utc | *(empty; scheduler writes)* | ✓ |
| last_tank_empty_alert_sent | *(empty)* | ✓ |
| dry_run_mode | `TRUE` | ✓ |
| min_rewater_interval_hours | `6.0` | ✓ |
| scan_session_active | `FALSE` | ✓ |
| camera_battery_percent | `80.0` | ✓ (latest) |
| camera_battery_min_percent | `30.0` | ✓ |
| drive_daily_photos_folder_id / drive_scan_photos_folder_id | (set — IDs omitted here) | ✓ |
| push_vapid_public_key | *(empty)* | ✗ (Web Push not built yet) |
| max_pump_seconds | `60.0` | ✗ (see M2) |
| preheat_margin_c | `2.0` | ✗ (see M3) |
| preheat_lead_minutes | `25.0` | ✗ (see M3) |
| max_water_temp_c | `28.0` | ✗ (see M1) |
| heater_hysteresis_c | `2.0` | ✗ (documented firmware constant) |
| last_lightlevel | *(empty; latest)* | ✓ |
| flash_dark_threshold | `500.0` | ✓ |

- Per-plant AC100/potId mapping, 16-plant table, watering-interval ranges: **N/A in this repo** — single-pot
  design; no `plantid`/`potId` artifacts exist (zero hits).

## 6. B4 — ESP32-CAM (`firmware/esp32cam/`, `firmware/esp32cam_production/`)

- **Files present:** `firmware/esp32cam/esp32cam.ino` (baseline, bench-tested), `firmware/esp32cam/
  ESP32CAM-TASK.md`, `firmware/esp32cam/secrets.h` (gitignored, local), `firmware/esp32cam_production/
  esp32cam_production.ino` (+ `PRODUCTION-TESTS.md`). README's repo-layout/checklist references these paths
  (L156-L158); README does **not** carry a "chapter 3" index of camera name/style files (brief artifact).
- **Photo chain, actual vs brief:** the repo has **no FTP / xlsx client-side upsert / `photoContract` /
  `getImageMetadata`** (zero hits — brief's chain belongs to the other project). Actual daily chain exists
  end-to-end in the workflow: `Daily Photo Webhook` (core/photo) → `Read SystemConfig B` → `Read Event
  History B` → `Read Matching Event Row` → `Build Multimodal Context` → `Photo Analysis Agent` →
  `Normalize Photo Output` → `Upload Daily Photo` (Drive; id used by `Build Photo Update Row` for
  `PhotoFileID`) → `Anomaly Detected?` → `Update Event Row` (Events upsert by EventID) → `Build Species
  Update` → `Update Species Config`. Scan chain: `Scan Photo Webhook` → … → `Upload Scan Photo` →
  `Attach Scan Image` → YOLO/Judge.
- **IP/serial expectations:** none in-repo — the CAM targets `SECRET_BASE_URL` + webhook paths only
  (`secrets.h`, gitignored); no FTP host, no serial, no hardcoded IPs. Nothing to cross-fix.
- **Doc drift:** README L57-L68 + the endpoint table L85 still describe the **pre-Change-10** flow
  (`scan_position` notification + Wait gate, "return camera to charging dock" notification). The live
  workflow is autonomous (scheduler opens session; watchdog closes; informational notifications). → M4.

## 7. Mismatches table

| # | Surface | Expected | Actual | Severity | Fix / won't-fix |
|---|---|---|---|---|---|
| M1 | Workflow vs reference data | `max_water_temp_c = 28` (Plan §2.2 seed, "firmware hard cap") | `Safety Guardrails` hardcodes `maxWaterTempC = 30` (`phytoai.json:3921`); key never read | **HIGH** (safety-relevant; feeds Part A design) | Decide: read the key (28) in Safety Guardrails, or re-seed to 30 + document override. Owner decision → STATUS Q18 |
| M2 | Workflow vs reference data | `max_pump_seconds = 60` = "single source of truth for the pump ceiling" (Plan §2.2) | Key never read; literal `60` hardcoded in `Safety Guardrails` | MEDIUM | Read the key on next workflow edit (or downgrade the doc claim). STATUS Q18 |
| M3 | Contract vs Plan §2.2 | `preheat_margin_c` / `preheat_lead_minutes` "exposed via GET /config" | `Build Config Response` does not return them (0 hits in workflow) | MEDIUM (blocks Part A preheat behavior) | Add to `Build Config Response` on next workflow edit, or change Plan. STATUS Q17 |
| M4 | Docs vs contract | README Branch C narrative + Plan §2.3 type list match the live workflow | README L57-L68/L85 and Plan §2.3 still list `scan_position` + return-camera flow (removed 2026-09-14) | MEDIUM (doc drift) | Refresh README/Plan narrative; `scan_scheduled` already live. STATUS Q20 |
| M5 | Contract | Plan §2.2 REMOVED `current_cycle_week` | `Build Config Response` still ships `current_cycle_week: 'mapping'` (`phytoai.json:4642`) | LOW | Remove field on next workflow edit. STATUS Q19 |
| M6 | Repo hygiene | One authoritative reference xlsx | `docs/PhytoAI-final.xlsx` (untracked) is content-identical to `docs/PhytoAI.v2.xlsx` | LOW | Keep v2 as authoritative; delete or explicitly label the duplicate. STATUS Q21 |
| M7 | Backup artifact | Strictly parseable export | `workflows/phytoai.backup.json` has a BOM/zero-width prefix + escaped legacy formatting | LOW | Historical only; won't-fix (documented) |
| M8 | Architecture docs | Brief assumes MCP-server/M5/serial layer | Never materialized in repo or live instance (validated) | INFO | Recording closure in this audit + STATUS; Plan needs no change (it never described M5/MCP hardware) |
| M9 | Hardware docs | Correct production pin map recorded (from the bench-verified wiring) | The early Part A brief carried a stale doc pin map (pump 4 / HX711 5,25 / OneWire 13 / soil 26) that contradicted the bench sketch/DHT/LDR reality — GPIO4 would have been driven as a pump output while it is the OneWire bus | **HIGH** (would have miswired production firmware) | **Resolved 2026-09-15:** bench map is authoritative (pump 13, heater 16, HX711 DT 26/SCK 33, OneWire 4, soil 34, tank 27, DHT22 14, LDR 25, LED 2); recorded in `docs/opencode-wroom-production-brief.md` §1 + `docs/hw-bench-2026-09-15.md` errata |

## 8. B5 — STATUS §5 updates from this audit

Updated in `STATUS.md` (same commit): item 10 (live-state text tightened with this audit's live read),
plus new open questions Q17–Q21 (preheat exposure, pump/water-temp source-of-truth, legacy
`current_cycle_week`, README/Plan Branch-C drift, duplicate xlsx). No schema/contract change was made.

## 9. Part A gate (explicit)

Per the owner's instruction, `firmware/wroom_production/` was **not** written this session. The envelope
Part A must implement is §4: **WROOM-initiated HTTPS POST `/webhook/core/sensor`, executing the 11-field
decision JSON response; `GET /webhook/config` for scheduling/dry-run/flash context** (preheat fields
pending M3). Any serial/M5 envelope is unsupported by this repo, its specs, and the live n8n instance.
