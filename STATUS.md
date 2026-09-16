# PhytoAI — Project Status (for external review)

Scope: everything below is sourced from the working copy `C:\Users\moham\Downloads\Phython` and its git history, as of 2026-09-14. Anything not verifiable there is marked **UNKNOWN** (not guessed). Live n8n state is cited only where a file/commit evidences it.

## 1. WHAT EXISTS NOW

**Planning / docs**
- `docs/Plan.md` (2026-09-10) — canonical Stage-1 plan: Sheets schemas, branch-by-branch workflow structure, prompts, webhook contracts, manual prerequisites (§7), open questions (§8).
- `docs/SmartPot-Full-Engineering-Spec-PRD.md` (2026-08-20) — full engineering spec (hardware, wiring, firmware, safety).
- `docs/PhytoAI-Deployment-Prompt.md` (2026-08-22), `docs/PhytoAI-Execution-Kickoff-v2.md` (2026-08-23) — earlier execution briefs (superseded).
- `docs/phytoai-redesign-prompt.md` (2026-09-09) — Changes 1–6 redesign spec.
- `docs/phytoai-firmware-changes-7-8-9.md` (2026-09-11) — firmware Changes 7–9 + Phase-5 change list.
- `docs/phytoai-changes-10-11-camera-and-care.md` (2026-09-11) — scheduled-camera + placement-review spec (Phase-5; the Change 10 scheduled-camera/no-approval part was applied 2026-09-14 — §3.1; the placement-review part is not applied).
- `docs/opencode-firmware-brief.md` (2026-09-12) — firmware brief (Deliverable 1 calibration, Deliverable 2 production).
- `docs/opencode-esp32cam-production-brief.md` (2026-09-14) — production CAM implementation brief (scope, contract gaps, test plan).
- `docs/opencode-wroom-production-brief.md` (2026-09-15) — WROOM production firmware brief (respec'd to the audited WiFi/HTTP architecture; bench pin map + constants, `/core/sensor` + `/config` contracts with workflow line evidence, safety limits, compile deps).
- `docs/flash-light-gating-spec.md`, `docs/yolo-service-spec.md` (both 2026-09-14) — approved specs implemented on 2026-09-14.
- `docs/perenual-integration-spec.md` (2026-09-14) — approved Perenual secondary-knowledge-layer spec (free tier only; implemented 2026-09-14 — §3.2).
- `docs/cross-audit-2026-09-15.md` (2026-09-15) — cross-system audit on the real surfaces (B1 workflow, B2 live/MCP check, B3 reference data, B4 camera); findings M1–M8; decides the WROOM production command envelope (WROOM-initiated HTTP + decision JSON — no M5/serial layer exists).
- `docs/dashboard-data-contract-audit.md` (2026-09-15) — dashboard Phase-1 contract audit: persisted vs live-only fields, image/notification/endpoint inventory, gap classification (G1–G9), EdgeOne auth/CORS requirements, never-claim list, and the single required n8n change (G1: photo-row timestamps).
- `docs/dashboard-ux-v3.md` (2026-09-15) — dashboard UX v3 + n8n assistant contracts: workflow audit, `/dashboard/ask|overview|detection` contracts, auth/CORS/rate-limit model, app navigation + themes + Plant Doctor, and full validation evidence (exec 732–751).

**Workflow exports**
- `workflows/phytoai.json` (2026-09-14 16:57 UTC) — **authoritative**: name `phytoai`, workflow ID `WXd35adnUc9QQA84`, **217 nodes / 238 edges**, settings `{executionOrder:"v1", binaryMode:"separate", availableInMCP:true}`. Re-applied to the live workflow via MCP on 2026-09-14 (autonomous scan change, then the Perenual integration §3.2) and again on 2026-09-15 (audit M1–M6 fixes `63274c9`, then the dashboard G1 photo-timestamp change — `Build Photo Update Row` + `Update Event Row` now persist `Timestamp`/`EventType` on daily-photo rows); each re-apply was re-fetched and verified identical to this export.
  - Webhooks: `Core Sensor Webhook` (`core/sensor`), `Daily Photo Webhook` (`core/photo`), `Scan Photo Webhook` (`yolo-scan`), `Scan Sweep Done` (`yolo-scan/done`), `Device Config` (`config`, GET).
  - Agents: `History Analyst`, `Decision Agent`, `Photo Analysis Agent`, `Vision Analyst`, `Judge`, `Treatment Advisor`.
  - Added 2026-09-14: `YOLO Analyst` (HTTP node id `1692f6cd-3c04-4c31-89a8-92c5ccab6737`), `Attach Scan Image` (Code node id `ca423560-cd65-4414-acbe-5358f47cbe4f`).
  - Added 2026-09-14 (autonomous scan change, §3.1): `Build Scan Scheduled Row`, `Append Scan Scheduled`, `Scan Session Watchdog`, `Read SystemConfig Watchdog`, `Check Session Timeout`, `Build Session Timeout Notification`, `Append Session Timeout Notification`.
  - Removed 2026-09-14 (same change): `Scan Session Active?`, `Build Position Camera Row`, `Append Position Camera`, `Wait Camera Positioned`, `Camera Positioned?`, `Build Expire Row`, `Expire Position Notification`, `Build Return Camera Row`, `Append Return Camera`.
  - Added 2026-09-14 (Perenual integration, §3.2): Branch A — `Check Perenual Cache`, `Needs Perenual Enrichment?`, `Perenual Species Search`, `Pick Best Perenual Match`, `Has Perenual Match?`, `Perenual Species Detail`, `Build Perenual Cache Rows`, `Quota Exceeded?`, `Build Perenual Quota Note`, `Update Perenual Config`; Branch C — `Build Pest Lookup Query`, `Has Pest Query?`, `Perenual Pest Lookup`, `Build Perenual Pest Context`.
  - Wait nodes now 2 (`Wait Verdict Response`, `Wait Followup Response`); `Plant Profile Agent — TODO` schedule placeholder still present. No Telegram, servo, or BranchMap nodes.
- `workflows/phytoai.backup.json` (2026-09-09) — pre-redesign raw export: 105 nodes, `active:false`, `triggerCount:0`.
- Root `phytoai-workflowone.json` no longer exists (moved into `workflows/` in commit `e5b81f8`).
- `docs/PhytoAI.v2.xlsx` (2026-09-14) — live Google Sheets export, audit file **v2**: 6 tabs, 25-column Events, 0 sheet-side issues (audited 2026-09-14 against `docs/Plan.md` §2 and `workflows/phytoai.json`).

**Hardware / firmware**
- `Hardware/Hardware-list.txt` (2026-09-10) — parts list (servos removed).
- `firmware/wroom_calibration/wroom_calibration.ino` (2026-09-13; updated 2026-09-14) — WROOM bench/calibration sketch: offset-compensated HX711 calibration fix + bench-only heater test on CH2/GPIO16 (§3.3).
- `firmware/wroom_production/wroom_production.ino` (2026-09-15) — production autonomous WROOM firmware (WiFi/HTTPS to n8n, decision execution, hardware safety limits; brief: `docs/opencode-wroom-production-brief.md`); **compile-verified only, not flashed**.
- `firmware/esp32cam/esp32cam.ino` (2026-09-14) — CAM sketch (photo/scan upload, flash gating + measured-light decision, `f` torch).
- `firmware/esp32cam/ESP32CAM-TASK.md` (2026-09-13); `firmware/esp32cam/secrets.h` (2026-09-13, **gitignored** — local Wi-Fi/tunnel values).
- `firmware/esp32cam_production/esp32cam_production.ino` (2026-09-14) — production **autonomous** CAM firmware (Wi-Fi + NTP + `/config` + scheduled daily photo + scheduled scan + scan-done + retries + deep sleep); separate sketch folder, baseline untouched; **compile-verified only**.
- `firmware/esp32cam_production/PRODUCTION-TESTS.md` (2026-09-14) — 14-test plan/status for the production CAM plus the contract-gap notes.

**Services / scripts / dashboard**
- `yolo-service/` (2026-09-14): `app/main.py`, `requirements.txt`, `Dockerfile`, `docker-compose.yml`, `README.md`.
- `scripts/` (2026-09-14): `prepare_plantvillage.py`, `train.py`, `export_dataset.py`, `README.md`.
- `dashboard/` (rebuilt 2026-09-15, UX v3): `index.html`, `styles.css`, `app.js`, `config.js`, `assets/` — app-style hash navigation (Overview / Timeline / Plant Doctor / Photos / Insights / Settings; bottom nav on mobile), light/dark/system themes, one-metric trend charts, image gallery + viewer, notification center, and the n8n-backed assistant (ask bar + AI overview + normalized detections) per `docs/dashboard-ux-v3.md`; direct Google APIs for data, user-token-authenticated n8n webhooks for AI.
- `README.md` (2026-09-13) incl. "Known issues / lessons"; `.gitignore` (2026-09-14). Gitignored local secrets: `opencode.json`, `mcp-auth.json`.

**Authoritative workflow JSON: `workflows/phytoai.json`.**

## 2. ARCHITECTURE AS IT STANDS

Per `docs/Plan.md`: one n8n workflow **`phytoai`** (ID `WXd35adnUc9QQA84`) is the whole cloud brain. Devices (ESP32 WROOM "body" + battery ESP32-CAM "eye") talk only to n8n webhooks; **Google Sheets is the database** (Events, SystemConfig, Notifications, DiseaseScans, AgentNotes, PushSubscriptions); photos go to **Google Drive**; the **static dashboard is the only user interface** (Telegram removed; no servos/pan-tilt/BranchMap/aiming). Branch A = history-aware watering council with deterministic Safety Guardrails; Branch B = daily photo analysis; Branch C = weekly disease-scan panel — **updated 2026-09-14 to run autonomously** (scheduler opens the session; no dashboard approval; a watchdog force-closes stale sessions; notifications are informational; HITL Waits remain only for flagged issues — §3.1); Branch E = scheduler + `GET /config`. A **Perenual species-reference layer** (§3.2) adds a lazy, cached knowledge prior (free tier only) to Branch A's decision prompt and to Branch C's treatment prompt; it is advisory only and never enters Safety Guardrails. `dry_run_mode=true` (13 refs in the export) and the workflow is meant to stay **INACTIVE** until the manual prerequisites are done. AI runs on one shared OpenRouter model node (`OpenRouter Gemma`).

## 3. WHAT IS DEPLOYED VS ONLY PLANNED

| Item | Evidence in this repo | Status |
|---|---|---|
| n8n workflow `phytoai` (WXd35adnUc9QQA84) | exported + re-applied 2026-09-14 via MCP (217 nodes; dashboard assistant/insight contracts §3.5; autonomous scan change §3.1; Perenual integration §3.2); commits `bbf4f7c`…`5993d31` | **VERIFIED LIVE (definition)** — re-fetched after the MCP updates and matches the repo export; **INACTIVE** (live read `active:false`) |
| Workflow executions | MCP test executions `691`–`696` (autonomous scan, §3.1), `697`–`731` (Perenual + audit M1–M6), `732`–`751` (dashboard contracts, §3.5); all pinned; no device executions recorded | **test-level VERIFIED**; device executions **UNKNOWN** |
| Branch B end-to-end | commit `bbf4f7c` "Branch B verified end-to-end (known-good baseline)" | user-verified per commit message; executions UNKNOWN |
| M1 named Cloudflare tunnel | Plan §7 | PLANNED |
| M2 Sheets tabs + seed keys | `docs/PhytoAI.v2.xlsx` audited vs Plan §2 + workflow | **DONE / VERIFIED — audited 2026-09-14 (audit file v2), 0 sheet-side issues** |
| M3 Google Sheets/Drive credentials | not in repo (redacted); Plan §7 | PLANNED/UNKNOWN |
| M4 OpenRouter credential | not in repo; Plan §7 | PLANNED/UNKNOWN |
| M5 VAPID keys | Plan §7 | PLANNED |
| M6 dashboard deploy (EdgeOne static) | `dashboard/` rebuilt 2026-09-15 per `docs/dashboard-data-contract-audit.md`; no deploy artifact | code EXISTS; deploy **UNKNOWN** — needs the EdgeOne origin added to the OAuth client (HTTPS), no secrets in browser files |
| M7 Drive folders (`SmartPot/DailyPhotos`, `SmartPot/ScanPhotos`) | Plan §3.5/§7 | PLANNED |
| WROOM firmware (`firmware/wroom_calibration/wroom_calibration.ino`) | owner-verified 2026-09-14; sketch updated + compile-checked 2026-09-14 (§3.3); **bench run 2026-09-15 recorded** (`docs/hw-bench-2026-09-15.md`) | code EXISTS; **Part 1 (flash) DONE**; **Part 2 (sensor verification) PARTIAL** — measured constants recorded; heater safety-limit drill still to record |
| WROOM production firmware (`firmware/wroom_production/wroom_production.ino`) | compile-verified 2026-09-15 (1,094,076 B / 83 % flash, 49,288 B / 15 % RAM; `esp32:esp32:esp32`); operating rules §3.4 | **COMPILED ONLY — NOT FLASHED**; dry-run default; no auto-tare (NVS offset restore); production `/webhook` paths require the workflow ACTIVE (or editor test mode) |
| ESP32-CAM firmware — test baseline (`firmware/esp32cam/esp32cam.ino`) | owner-verified 2026-09-14 | **bench-tested DONE** (camera init, Wi-Fi, webhook upload) |
| ESP32-CAM firmware — production (`firmware/esp32cam_production/esp32cam_production.ino`) | compile-verified 2026-09-14 (37 % flash / 18 % RAM; `arduino-cli`, `esp32:esp32:esp32cam`) | **COMPILED ONLY — NOT FLASHED**; the required Change 10 workflow edit is APPLIED + simulated (§3.1); remaining: flash + 14-test plan + real end-to-end. **CAM power is wired-only (owner 2026-09-15)** — battery ADC / test #7 and `camera_battery_*` gating are legacy (Q23) |
| `yolo-service` container | code + `models/model.pt` committed (`b318a75`, 3.0 MB, "96 % top-1" per commit message); compose network corrected to the real VPS network `tunnel-net`, port 8090 exposed internally | model EXISTS; deployed/running **UNKNOWN** |
| PlantVillage dataset on VPS | see §4 | **DELETED 2026-09-14** |

### 3.1 Autonomous scan change (Change 10) — applied & simulated (2026-09-14)

Applied to the live workflow via MCP (`update_workflow`, validated SDK re-emission), then verified by re-fetch and by pinned test executions. Exact deltas vs the previous definition:

- `Weekly Scan` cron `0 6 * * 1` → `30 5 * * 1` (T−30 min, ahead of the firmware's 06:00 UTC capture).
- `Check Scan Preconditions`: a session left `active=true` at schedule time is reset to `false` and logged (`stale scan session reset`).
- `Build Open Session Row` (Set → Code): writes `scan_session_active=true` plus the new key `scan_session_opened_utc`.
- Human gate removed — 9 nodes deleted: `Scan Session Active?`, `Build Position Camera Row`, `Append Position Camera`, `Wait Camera Positioned`, `Camera Positioned?`, `Build Expire Row`, `Expire Position Notification`, `Build Return Camera Row`, `Append Return Camera`. `Read SystemConfig D2` now goes straight to `Build Close Session Row`.
- Added 7 nodes: `Build Scan Scheduled Row` + `Append Scan Scheduled` (Notifications row `type=scan_scheduled`, `status=done`, empty `resume_url` — informational only) and the watchdog chain `Scan Session Watchdog` (cron `0 */2 * * *`) → `Read SystemConfig Watchdog` → `Check Session Timeout` (6 h) → `Update SystemConfig` (close: `scan_session_active=false`, `scan_session_opened_utc=''`) + `Build/Append Session Timeout Notification` (`type=scan_postponed`, `status=done`).
- `Build Close Session Row` got `executeOnce=true`: the Set node was emitting one identical close row per SystemConfig row (N redundant upserts); found during simulation, fixed and re-verified.
- Deliberately NOT changed: `GET /config` still has no `next_scan_utc` (the production CAM falls back to its local Monday 06:00 UTC schedule — no silent contract invention); a `scan_quality`/framing safety-net was not implemented.

Verification (MCP `test_workflow`; trigger, credential and HTTP-request nodes are pinned — so no real Sheets/Drive writes and no real image binary; the AI agents ran for real):

| Executions | Trigger | Verified |
|---|---|---|
| 691, 694 | `Weekly Scan` | session auto-opened (`scan_session_active=true`, `scan_session_opened_utc` set); `scan_scheduled` reminder is informational (`status=done`, empty `resume_url`); no Wait involved |
| 692 | `Scan Photo Webhook` | gate passed automatically with the scheduler-set session (no dashboard confirmation); Drive upload stub → YOLO opinion → Judge (real call; verdict `monitor`) → DiseaseScans row built + appended; no HITL wait for a non-issue verdict |
| 693, 695 | `Scan Sweep Done` | exactly one close row (`scan_session_active=false`) after the `executeOnce` fix (previously one per SystemConfig row) |
| 696 | `Scan Session Watchdog` | an 8 h-stale session was closed (`active=false`, `opened_utc=''`) + `scan_postponed` informational notification |

This is **workflow-level simulation only, not a device end-to-end test**: no real camera JPEG, real Drive upload, or real Sheets write has been exercised yet.

### 3.2 Perenual integration (2026-09-14) — implemented & simulated

Implements `docs/perenual-integration-spec.md` exactly: a free-tier, cached, advisory species-reference layer. 14 nodes added (10 in Branch A, 4 in Branch C); live definition re-fetched and identical to the repo export (168 nodes / 182 edges).

**Branch A — lazy species enrichment (owner of the cache).** Inserted between `Read AgentNotes History` and `Build Context`: `Check Perenual Cache` (code) decides from SystemConfig whether enrichment is due; `Needs Perenual Enrichment?` (IF) routes to `Perenual Species Search` → `Pick Best Perenual Match` → `Has Perenual Match?` → `Perenual Species Detail` → `Build Perenual Cache Rows` → `Update Perenual Config` (Sheets upsert, Key/Value rows) → back into `Build Context`. A `Quota Exceeded?` → `Build Perenual Quota Note` branch appends one AgentNote on HTTP 429.

- Only runs when `last_species_guess` is set (not `unknown`) AND the cache is missing/for another species.
- Cache semantics: `ok`/`not_found` are settled for that species (no refetch); `lookup_failed_*` retries after 24 h; `quota_exhausted` suppresses lookups until the next UTC day; a species switch always refetches once.
- 7 SystemConfig keys upserted (rows, not headers — Plan §2.2 updated): `perenual_species_id`, `perenual_cached_species`, `perenual_cached_utc`, `perenual_status`, `perenual_water_benchmark`, `perenual_common_name`, `perenual_care_json`. The 7th key (`perenual_common_name`) was confirmed with the owner — spec §5's table listed 6 while §9 said 7.
- `Build Context` merges freshly written rows (try/catch; cache-hit runs read the existing cache) and emits `decision_parts_perenual` + `perenual_status`. The PERENUAL REFERENCE paragraph is injected into the Decision Agent user prompt **only when** `perenual_status=ok` AND the cached species matches, explicitly framed as a low-priority prior that never outranks this plant's own history (and never touches Safety Guardrails).

**Branch C — on-demand pest/disease lookup.** Inserted between `Read AgentNotes Treatment` and `Build Treatment Prompt`: `Build Pest Lookup Query` → `Has Pest Query?` → `Perenual Pest Lookup` (only when the Judge verdict is `issue`; query = first suspected issue, else first symptom) → `Build Perenual Pest Context`. `Build Treatment Prompt` also adds the cached species `pest_susceptibility` line. Two HTTP Request nodes (per spec) plus the pest lookup, all: query-auth credential `PhytoAI Perenual`, `Continue on fail` ON, 8 s timeout. Supreme-only endpoints/fields are untouched (care guides, hardiness map, `xWatering*`, `xSunlightDuration`).

**Failure semantics:** all 4xx/429/timeout/empty-`data[]` outcomes degrade silently to `perenual_status` values; no workflow error, no alert spam; zero impact on Safety Guardrails, `dry_run_mode`, or decision/DiseaseScans schemas. The API key is not in the export — the HTTP nodes carry a **name-only** credential reference (`PhytoAI Perenual`); the MCP cannot create/read credentials, so the owner must create the credential (Query Auth, parameter `key`) and select it on the 3 HTTP nodes in the UI (Plan §8 note; spec §8 also recommends regenerating the key that was shared in chat).

**Verification (spec §9), all via pinned MCP `test_workflow` — HTTP nodes pinned, so no real Perenual requests were made; the AI agents ran for real; no live Sheets/Drive writes):**

| Check | Execution(s) | Result |
|---|---|---|
| 1. Mock `Monstera deliciosa`: 7 keys written, `status=ok`, Decision prompt contains PERENUAL REFERENCE | `712` (also `698`, `699`) | PASS — best match id 750, benchmark `5-7 days`, common name, `care_json` with pests; prompt block present |
| 2. Nonsense species `zzzzplant`: `not_found`, zero downstream impact | `713` | PASS — `data: []` → `not_found`; no detail call; no prompt block; guardrails ran |
| 3. Invalid key: `lookup_failed_4xx`, guardrails identical | `714` | PASS — `lookup_failed_401`; no prompt block |
| 3b. HTTP 429: `quota_exhausted` + one AgentNote | `715` | PASS — note `agent=Perenual` appended (fan-out bug found here and fixed, below) |
| 3c. Quota suppression (same UTC day) | `716` | PASS — `needs_enrichment=false`, zero calls |
| 4. Same species 3 days: ZERO Perenual calls (cache hit) | `725`, `718`, `719` | PASS — search/detail absent from runData; cached block still injected |
| 5. Species switches away and back: refetch once per switch | `720`, `721` | PASS — `reason=species_changed`, exactly one search each |
| 6. Judge=`issue`: pest lookup fires at most once | `722` | PASS — one `Perenual Pest Lookup` call (`spider mites`); treatment prompt gets both species-pest and on-demand blocks |
| 6b. Judge=healthy: no lookup | `723` | PASS — pest nodes absent; DiseaseScans row still built |
| 7. Regression with Perenual down: schema-identical output | `724` vs baseline `697` | PASS — `Build Event Row` (27 keys), `Safety Guardrails` (34), `Build Decision Response` (11), `Normalize Decision Output` (29) identical; `Build Context` gains only the 2 additive internal fields; no prompt block |

- **Bug found & fixed during verification:** `Build Perenual Cache Rows` initially emitted the quota branch as a second output (Code nodes have one output), making `Quota Exceeded?` unreachable. Fixed to a single-output fan-out, re-applied via MCP, and the whole suite re-run on the final definition (`712`–`725`; pre-fix runs `698`–`711`).
- **Documented deviations:** quota suppression is same-UTC-day (no cross-device jitter — a single pot has no thundering herd); `lookup_failed_*` retries after 24 h (spec did not define a retry cadence); the 429 AgentNote is one row per 429.
- **Pre-push key scan:** `workflows/phytoai.json` and the generated SDK scanned for `key=`, `api_key`, bearer/`sk-` tokens and long literal tokens in Perenual nodes — no key material found (only the Google Sheets document id, which every Sheets node already contains).
- **Not yet real:** the Perenual credential is name-only and unresolved until the owner creates/selects it; the real API response shapes, real quota behavior, and a live Branch A/Branch C run with the actual key have not been exercised. No production-ready claim.

### 3.3 WROOM bench sketch update (2026-09-14) — HX711 fix + heater test command

Scope: only `firmware/wroom_calibration/wroom_calibration.ino` changed; no workflow, Sheets, webhook-contract, or secrets edits. Compile-checked with `arduino-cli` (`esp32:esp32:esp32`): 301,420 bytes / 22 % flash, 22,412 bytes / 6 % RAM.

- **Task A — HX711 calibration fix.** `hxRawAvg()` now averages `scale.get_value()` (offset-compensated) instead of `scale.read()` (raw; ignores the tare OFFSET — the cause of the "stacking weight" behaviour). `setup()` now calls `scale.tare(10)` immediately after `scale.begin()` and before any `set_scale()` (previously OFFSET defaulted to 0, so `get_units()` showed phantom weight until a manual `t`). The calibration flow is exactly tare(10) → `hxRawAvg(20)` → `factor = raw / grams`. The stale baked-in `HX711_SCALE_FACTOR = 305.070f` was **deleted** and replaced by `0.0f` as an explicit "unset" sentinel (`printConstants()` prints `(unset - run 'w')`); that old value was computed with the broken math and is **invalid — nothing may depend on it**. Recalibration was required after flashing and was completed on 2026-09-15: tare empty platform → known weight → new factor `1068.335`, recorded in `docs/hw-bench-2026-09-15.md` (bake it into the production WROOM sketch when written — never into `wroom_calibration.ino`).
- **Task B — bench-only heater test (`e`).** Relay **CH2 = GPIO16** (owner-confirmed; the PRD's proposed GPIO26 is used by HX711 DT in this sketch). `e` enters a bench test session: `e` toggles CH2; while ON it prints elapsed seconds + the water DS18B20 once per second; `x` exits and always forces CH2 OFF. Safety invariants, all compile-time constants (not parameters, not serial-settable): OFF at boot and after reset/watchdog (setup writes OFF first); **40.0 °C** water auto-cutoff with lockout until MCU reset; **120 s** maximum continuous ON with lockout until MCU reset; wet-only interlock before ON (tank not empty + valid water probe). The heater stays manual/bench-only — `commandHeaterTest()` has exactly one call site (the `e` menu case), the sketch contains no Wi-Fi/n8n/sleep/autonomous code, and no workflow path can reach it.
- **Verification:** `grep` for `305.070` / `305070` across `firmware/`, `workflows/`, `scripts/`, `yolo-service/` returns **zero hits**; the only remaining mentions in git are this invalidation note and historical docs (`docs/opencode-firmware-brief.md`, `docs/phytoai-firmware-changes-7-8-9.md`) that describe the old provisional state. The physical bench run followed on 2026-09-15: the HX711 recalibration was completed and the measured constants were recorded in `docs/hw-bench-2026-09-15.md`; the submerged heater `e` safety-limit drill (40.0 °C / 120 s) is not yet recorded.

### 3.4 WROOM production — operating rules (owner-verified 2026-09-15)

Implemented + documented in `firmware/wroom_production/wroom_production.ino` (compile-verified 2026-09-15, 1,094,076 B / 83 % flash, 49,288 B / 15 % RAM):

1. **No automatic HX711 tare — ever.** Boot/load detection never tares; startup only RESTORES a recorded empty-platform offset from NVS (the `t` installation tare stores it). Live weight is GROSS: plant + soil + tray + plumbing (+ water) stay on the platform; without a recorded offset, weight is reported `unset` — never phantom.
2. **Tare is an explicit INSTALLATION/RESET operation.** Serial `t` is labelled "not normal operation", requires an EMPTY platform and a `y` confirmation; there is no tare path in normal operation.
3. **Watering measurement.** `wt_before_g` captured before the pump; after the pump + a 3 s settle (`SETTLE_AFTER_PUMP_MS`) the gross `wt_after_g` is captured and reported as `wt_delta_g = wt_after_g − wt_before_g` when both samples are valid. `ml_est = seconds × PUMP_FLOW_ML_PER_SEC` stays SEPARATE — always labelled estimated, never measured ml.
4. **No completion acknowledgement exists** in the decision schema (verified) → completions are log-only; measured `wt_delta_g` is local/serial telemetry and is **not persisted by n8n**. Estimated ml is never presented as measured ml.
5. **Heating order + limits.** Heat first when requested; stop at the requested safe target (`max_water_temp_c` from the decision when present, else the 28.0 °C policy default) or at the 40.0 °C hard cutoff; refuse start at ≥ 39.5 °C or with an invalid probe; watering is blocked whenever the safety state is invalid (tank empty, soil invalid, or water probe invalid).
6. **Camera power is wired-only** — the WROOM firmware carries zero camera-battery assumptions (verified: no battery references); battery gates/telemetry are legacy on this side (see Q23).
7. **Post-watering weight verification — implemented, with stated limits:** the pump path truly waits (3 s settle) and reports `wt_delta_g` only from two valid gross samples (HX711 10-sample average each). Residual gaps, documented rather than hidden: the delta is log-only (rule 4), dry-runs report null deltas, endpoints are single averages (no stability study), and no delta is possible until an installation tare/recorded offset exists.

### 3.5 Dashboard UX v3 + n8n assistant contracts (2026-09-15)

Implemented and live-applied (`85ca5e1`; workflow now **217 nodes / 238 edges**, live-identical, INACTIVE):
- `POST /webhook/dashboard/ask`, `GET /webhook/dashboard/overview`, `GET /webhook/dashboard/detection` added (45 nodes): CORS locked to `https://phytoai.edgeone.dev`; auth = the caller's Google access token verified via `oauth2/v1/tokeninfo` (audience + expiry + spreadsheets scope); per-token rate limits in workflow static data (12/30/30 per minute); question bounds + plant-id validation server-side.
- Ask classifies 8 intents; the 7 factual intents answer deterministically from a bounded Sheets context with **no model call**; care-recommendation/unknown use the shared `OpenRouter Gemma` node with a structured parser; AI failure returns the documented `{ok:false, answer_type:"unavailable"}` shape. Overview derives status / summary / what-changed / what-to-check / evidence deterministically (optional `ai=1` synthesis). Detection normalizes persisted `DiseaseScans` rows: image only when a real Drive link exists, "unverified visual hypothesis" wording, actions parsed from the stored treatment plan, derived `detection_id`/`resolved` (no schema changes).
- Dashboard v3 ships the contracts: hash routes (Overview / Timeline / Plant Doctor / Photos / Insights / Settings), bottom navigation on mobile, light/dark/system themes, Plant Doctor screen, assistant ask bar with honest failure states (inactive workflow, denied, timeout, network), Insights with evidence + one-metric trends, and unchanged integrity labels (`ml_est` ESTIMATE; measured delta device-log only).
- Verified: 39/39 contract assertions across exec `732`–`751` (deterministic/no-model, bounded AI, AI-failure unavailable, wrong-audience denial before any read, overview critical + freshness + evidence, detection with/without image and no-scans, over-length rejection); layout probe zero horizontal overflow on all 6 routes at 320/390/768/1280/1920 with correct nav and 0 console errors; reduced-motion run disables leaf sway/reveals; 8/8 static smoke; `?sheet=` override regression intact. Full audit + contracts + evidence: `docs/dashboard-ux-v3.md`.
- **2026-09-16 — workflow is now ACTIVE** (`active:true` live read) and the deployed `POST /webhook/dashboard/ask` is reachable: live curl from `Origin: https://phytoai.edgeone.dev` returned preflight `204` + exact ACAO/ACAH and a `200 application/json` documented body. The earlier "successful execution shown as failure" was a **client bug** (15 s abort vs 20–60 s AI latency + generic error masking), fixed in the dashboard: per-route timeouts (ask 60 s / overview+detection 25 s), full failure taxonomy (2xx-invalid, 401/403, 404, 429, 5xx, blocked, timeout, 2xx deny), in-flight duplicate guard + failure/busy cooldowns — validated by a 12-scenario headless suite (all pass, duplicate clicks = 1 request, cooldown = 0 new requests). No n8n contract changes; no extra Sheets reads.

**Firmware test status (owner-verified, 2026-09-14):**
- **WROOM calibration/test** (`firmware/wroom_calibration/wroom_calibration.ino`) — two parts. **Part 1 (upload) DONE:** flashed to the ESP32-WROOM; board boots, sketch runs, Wi-Fi/serial output works. **Part 2 (sensor-by-sensor verification) PARTIAL:** sensors that did not depend on missing hardware were read and returned values. **Update 2026-09-14 (§3.3):** the HX711 calibration bug is fixed (offset-compensated read + boot tare) and the stale baked-in factor **`305.070f` is invalid** — it was computed with the broken (non-offset-compensated) math — replaced by the `0.0f` unset sentinel — the two-point recalibration was then completed on 2026-09-15 (new factor `1068.335`); the heater module is now delivered and wired to relay CH2 (GPIO16) with a bench-only `e` test (40.0 °C / 120 s hard limits + lockout). **Bench run 2026-09-15:** tank level, relay polarity, HX711 factor, soil ADC and DS18B20 addresses measured and recorded in `docs/hw-bench-2026-09-15.md`; the submerged heater `e` safety-limit drill is not yet recorded.
- **WROOM production** (`firmware/wroom_production/wroom_production.ino`) — written 2026-09-15 per `docs/opencode-wroom-production-brief.md` (bench pin map + constants; WROOM-initiated HTTPS `POST /core/sensor` and `GET /config`; executes the 12-field decision JSON; hardware safety 40.0 °C cutoff / 39.5 °C refuse / 120 s actuator cap / 8 s WDT; dry-run gates all GPIO; POST-or-sensor failure ⇒ no actuation). **Compile-verified only** (1,094,076 B / 83 % flash, 49,288 B / 15 % RAM; deps: ArduinoJson 7.4.2, HX711 0.7.5, OneWire 2.3.8, DallasTemperature 4.0.6, DHT 1.4.7, ESP32 core 3.3.11); not flashed; no hardware results. Operating rules (no auto-tare; explicit INSTALLATION tare; measured `wt_delta_g` separate from `ml_est`, log-only; heater target stop at 28 °C default or 40 °C cutoff; wired-only camera) are documented in §3.4 and in the sketch header.
- **ESP32-CAM** (`firmware/esp32cam/esp32cam.ino`) — test sketch written and bench-tested **DONE**: camera init, Wi-Fi connect, and webhook upload path verified.

### 3.6 Request serialization + Assistant chat route (2026-09-16)

Implemented and live-applied (`7c7434d` workflow — 224 nodes; dashboard in the same-day commit):
- **Dashboard request scheduler:** every data request (Sheets, Drive, assistant, artwork, resume pings) runs through one FIFO pipeline (`CFG.scheduler.maxConcurrent: 1`); identical pending requests coalesce; assistant calls get a priority lane without cancelling in-flight work; TTL caches keyed by sheet id (config 300 s, tabs/panels 45 s, ask never cached); explicit Refresh bypasses caches. Measured initial-load peak concurrency **5 → 1** (HEAD baseline probe vs new, same stubbed transport). `PHYTOAI_STATS` exposes safe counters; `?debug=1` logs labels only.
- **Assistant chat:** new `#/assistant` route (session-only, labelled “This session”) with bubbles/timestamps, pending state, classified failures, safe retry, clear conversation, six suggested questions, Enter sends / Shift+Enter newline, one question at a time, evidence + warnings preserved. Mobile primary nav = Overview / Assistant / Doctor / Photos + More (Timeline / Insights / Settings); desktop tabs = 7 ordered routes. Overview / Insights / Doctor ask bars now hand the question to the chat exactly once, preserving `context.route` + `client_time_utc`.
- **Workflow read routing + quota (`7c7434d`):** asks route by intent to scoped reads — 2 (status/last-watering), 1 (change/sensor), 1 (warnings), 1 (detection), 2 (photo), 5 (AI care); detection branch dropped its unused Notifications read (4→3); all dashboard Sheets reads use `onError: continueRegularOutput` and compose a `{ok:false, warnings:["sheets_rate_limited"], retry_after_seconds:60}` busy shape (exact message “Plant data is temporarily busy. Please try again in about a minute.”), never fake data and never auto-retry.
- **Verified:** headless suite 22/22 (coalescing, route-storm zero refetch, one-request-per-question for chip/Enter/both handoffs, one-at-a-time, busy cooldown, quota banner + gate, nav structure, zero overflow at 5 widths, 0 console errors) plus live workflow MCP tests **exec 780–799, 42/42** (per-intent read counts, quota shapes, no-model paths); `validate_workflow` valid; `node --check` clean. Details: `docs/dashboard-ux-v3.md` §2026-09-16.
- **Limit stated:** serialization is per browser tab — the n8n workflow is not globally single-threaded across users/devices (server-side queueing would be a separate change); the quota gate is client-side.

### 3.7 Startup request storm fix + charts visibility + botanical polish (2026-09-16)

Implemented in the dashboard (commit pending at time of writing; no workflow change needed):
- **Hard refresh now sends 2 data requests instead of 8** (identical stub, before = `00532a9`): one
  `values:batchGet` bootstrap for the five tabs (was 5 per-tab reads) and one `/webhook/dashboard/overview`
  for the active route (was overview + overview?ai=1 + detection). Endpoint-by-endpoint table:
  `docs/dashboard-ux-v3.md` section 2026-09-16.
- **Boot state machine** `auth_pending -> authenticated -> bootstrapping -> routing -> ready` (each transition
  once; hashchange ignored during boot; initial hash normalized via `replaceState`). **Route-scoped loaders:**
  only the visible route requests panel data - Overview `/overview`, Insights `/overview?ai=1`, Doctor
  `/detection`; Photos/Timeline/Settings/Assistant fetch nothing; hidden routes are never prefetched.
- **Quota state** with retry-after countdown: route requests are suppressed while it runs, manual `Refresh`
  re-arms after it ends, nothing retries automatically, theme/resize/banner events never refetch.
- **Instrumentation:** `PHYTOAI_STATS.startupRequests`, `routeRequests`, `coalesced`, `activeRoute`, `bootPhase`
  plus a bounded netLog of safe endpoint/label metadata only (no tokens, headers, rows or bodies).
- **Charts fixed and visible:** root cause was chart cards rebuilt by range switches never receiving the `in`
  reveal class (permanently `opacity: 0`), compounded by IntersectionObserver callbacks being droppable.
  Overview now has a "Plant trend" preview (7-day, markers, legend, "View full history" -> Insights); Insights
  shows all four full charts (moisture, weight, water/soil temperature) with honest per-chart empty states and
  a reveal fallback so content can never stay invisible.
- **Visual system reworked:** layered deep-forest dark palette, warm botanical light palette, gradient surfaces
  and CTA, stronger hierarchy (identity/status -> recommendation -> trend -> three vitals -> latest -> deeper
  navigation), Settings wall-of-numbers behind a collapsed details.
- Verified: headless suite **30/30 normal + 30/30 reduced-motion**; charts nonzero at 320/390/768/1280/1920;
  zero overflow; zero console errors; `node --check` + static smoke 8/8.

### 3.8 Notification audit + explicit browser-alert controls (2026-09-16)

Audited (no workflow/schema changes) and documented in `docs/dashboard-notifications.md`:
- **Path:** ten `append` writers in the workflow create all `Notifications` rows (tank/anomaly/watering
  feedback/verdict/follow-up/scan scheduled+postponed/legacy camera battery/smoke test/session timeout); four
  `appendOrUpdate` nodes update/expire them when the user answers. Persisted fields:
  `timestamp,type,title,message,response_options,status,response,resume_url,context_ref` — **no read/unread
  field exists**, and the dashboard does not invent one.
- **Channels:** zero Telegram/email/Slack/SMS/push nodes anywhere in the workflow. **No service worker, no Web
  Push subscription storage, no `Notification.requestPermission()`** existed before this change; closed-site
  alerts are impossible today and are documented as a separate future phase (architecture, storage, security and
  n8n sender options, with a review gate before any SW/VAPID code).
- **Implemented now (dashboard only):** (A) notification centre keeps working, now with severity chip, source
  label, plant context and an honest "no separate read state" line; (B) Settings → "Enable browser alerts" —
  permission requested **only on click** (never on load), explicit unsupported/not-requested/granted/denied
  states, system alerts only for newly observed `pending` critical rows plus explicitly selected warnings
  (`alert_anomaly`, `scan_verdict`, max 24 h old), stable dedupe key in a bounded localStorage list + browser
  `tag` so a row alerts once ever (survives reload), click focuses the tab and routes to the relevant screen,
  denied permission leaves the centre fully functional, permission is never treated as backend authorization;
  (C) one serialized Notifications-tab poll per minute, visible-tab only, pause during quota countdowns, one
  catch-up poll on re-focus, no fetch on route changes (≤1 read/min, <2 % of the Sheets read budget).
- **Verified:** UX7 headless suite **17/17** (no permission at boot; one click → one request; one alert for a new
  critical row; no repeat on refresh or after reload; hidden = 0 polls, re-focus = exactly 1; denied/unsupported
  keep the centre; zero console errors) plus UX6 regression **30/30** (startup 2-request set, charts, override),
  `node --check`, static smoke 8/8, secret scan clean.

## 4. WHAT'S LEFT (priority order)

1. **M1 — Persistent named Cloudflare tunnel** (top priority; production webhook base URL; quick-tunnel URLs change and would invalidate stored resume URLs).
2. **M2 — Create the six Sheets tabs** with exact headers/seed keys and delete `BranchMap` (blocking dependency for the wiring test; includes `camera_battery_min_percent=30`).
3. **M3 — n8n Google Sheets + Drive credentials** (Plan expects names "PhytoAI Google Sheets" / "PhytoAI Google Drive").
4. **M4 — n8n OpenRouter credential** ("PhytoAI OpenRouter").
5. **M5 — VAPID keypair** → SystemConfig `push_vapid_public_key` (private key stays in n8n).
6. **M6 — Deploy the static dashboard** (EdgeOne free static hosting): add the site origin to the OAuth client's authorized JavaScript origins (HTTPS required by GIS). The dashboard reads Sheets/Drive directly with the user token (no browser secrets, no server); per-user OAuth writes to `Notifications` already work; resume links need the named tunnel and degrade gracefully (response is always persisted in the sheet).
7. **M7 — Run the one-time setup branch** to create the two Drive folders and store their IDs.
8. Flash/commission firmware — **calibration sketch flashed; bench run 2026-09-15 complete; constants in `docs/hw-bench-2026-09-15.md`.** Remaining: heater safety-limit drill, production WROOM firmware, and the CAM, then a first real end-to-end run:
   - **8a.** HX711 — **DONE 2026-09-15:** two-point calibration completed, new factor `1068.335` recorded in `docs/hw-bench-2026-09-15.md`; the deleted `305.070f` remains invalid and must not be reused. Bake `1068.335` into the production WROOM sketch when it is written (not into `wroom_calibration.ino`).
   - **8b.** Run the **heater bench test** on the wired CH2 (GPIO16): serial `e`, submerged only → verify the 40.0 °C auto-cutoff + lockout and the 120 s maximum-ON + lockout (relay polarity is already confirmed — `docs/hw-bench-2026-09-15.md` item 2); the production `max_heater_seconds=600` cutoff remains a separate production-firmware item.
   - **8c.** Bench constants (tank level, relay polarity, HX711, soil ADC, DS18B20 addresses, pump flow) are recorded in `docs/hw-bench-2026-09-15.md`; copy them into the same result sheet so the sensor test is marked **fully DONE** before production firmware is written.
   - **8d.** Flash the **production autonomous CAM** (`firmware/esp32cam_production/`) and run its 14-test plan (`PRODUCTION-TESTS.md`); the Change 10 workflow edit is already APPLIED + simulated (§3.1) — only flashing and the 14-test plan remain.
   - **8e.** Flash the **production WROOM** (`firmware/wroom_production/`, compile-verified 2026-09-15) → bench-verify the decision cycle in dry-run first, then the wet-only heater drill; needs the workflow ACTIVE (or editor test mode) for the `/webhook` paths, and resolves open question 22 (LDR digital vs analog) before real light-gated flashing.
9. Deploy `yolo-service` on the VPS (`models/model.pt` now committed — `b318a75`) and run the flywheel.
10. Apply the remaining documented-but-not-live Phase-5 workflow changes: Changes 7–9 contracts and the placement-review / framing-quality safety net from the Changes 10–11 doc. (The Change 10 scheduled-camera/no-approval part is APPLIED + simulated — §3.1.)
11. **Dataset cleanup (2026-09-14):** `plantvillage` and `plantvillage_repo` were deleted from `~/PhytoAI` on the VPS; disk afterward **66 % used / 25 G free**. Re-run `scripts/prepare_plantvillage.py` before any bootstrap; **update dataset references** in `scripts/README.md`, `yolo-service/README.md`, and `docs/yolo-service-spec.md` to reflect that the local dataset must be recreated.
12. After any MCP edit, verify Sheets "Column to match on" in the n8n UI (see README "Known issues / lessons").
13. **Perenual go-live steps:** create the n8n credential `PhytoAI Perenual` (Query Auth, parameter `key`, value = a regenerated key — the one shared in chat should be rotated per spec §8), select it on the 3 HTTP nodes (`Perenual Species Search`, `Perenual Species Detail`, `Perenual Pest Lookup`), then run one real Branch A and one Branch C pass to validate the live response shapes (spec §9 items 1–6 were simulated only).

## 5. OPEN QUESTIONS

From `docs/Plan.md` §8 (verbatim subjects):
1. n8n Wait node exact config (Branch C) — resume setup, timeout, timeout branch, resume-URL payload.
2. n8n push-send implementation (Web Push) — `web-push` in a Code node vs a relay service.
3. Long-Wait execution timeouts — confirm n8n execution timeout vs hours-long Wait.
4. Capture-button debounce details — GPIO choice, debounce strategy, LED behavior.
5. Dashboard write auth — service-account proxy vs per-user OAuth.
6. Resume-URL auth — any protection beyond the unguessable URL.
7. Scan photo arrival model — confirm paused-execution vs separate `/yolo-scan` execution.
8. Sheets MCP access — whether the owner can grant the MCP's Google account access.

New / still open (found in the working copy):
9. **yolo-service Docker network name — RESOLVED 2026-09-14:** the owner corrected the compose file to the real VPS network `tunnel-net` (`b318a75`); port 8090 is exposed internally (not published to the host). Remaining check: the n8n container must be attached to `tunnel-net` for `http://yolo:8090` to resolve.
10. **Live activation/execution state — audited 2026-09-15 (`docs/cross-audit-2026-09-15.md` §3):** live `phytoai` = **217 nodes / 238 edges, identical to the repo export**, `active:false`; the instance's other 8 workflows are unrelated personal projects; **no MCP/M5/Flask/serial nodes exist live or in the export** (the MCP-server/M5Stack/serial architecture from the audit brief was never materialized in this repo). Test executions exist (`691`–`725`); device executions UNKNOWN.
11. **Hardware unknowns** (`docs/phytoai-firmware-changes-7-8-9.md` §11) — remaining: H1 relay board characterization (polarity/logic level **confirmed 2026-09-15**: `RELAY_ACTIVE_LOW=true`, CH1 reacted, CH2 identical; model/coil-current specs still open), H4 PSU, H7 load-cell mounting (calibration completed — no longer blocking), H8 remaining free-GPIO confirmation, H9 relay-board VCC/coil current. **Tank-level question RESOLVED and removed** — owner-confirmed: `TANK_EMPTY_LEVEL=LOW`, GPIO27 flips HIGH→LOW when wet, sensor out of water reads LOW (`docs/hw-bench-2026-09-15.md` item 1). `HX711_SCALE_FACTOR` recalibrated to `1068.335` (item 3; the former `305.070f` was computed with the broken non-offset-compensated read and is invalid); `PUMP_FLOW_ML_PER_SEC = 9.706` measured (item 6) — the one repeat run pending is a **minor pre-flight check only and does not block `dry_run_mode`**; heater wired to CH2/GPIO16, submerged safety-limit drill still to record.
**Pin map corrected to the bench-verified values (2026-09-15)** — pump 13, heater 16 (ACTIVE LOW), HX711 DT 26 / SCK 33, OneWire 4, soil ADC 34, tank 27 (LOW = empty), DHT22 14, LDR 25, LED 2; the stale doc map (pump 4 / HX711 5,25 / OneWire 13 / soil 26) from the early Part A brief is **superseded** (audit M9, bench-doc errata).
12. **ESP32-CAM/WROOM flashing values are local-only** — `firmware/esp32cam/secrets.h` is gitignored; a fresh clone must recreate it (the production sketch shares it via a relative include).
13. **Autonomous scan** — Change 10 is APPLIED live and simulated (§3.1): the `Wait Camera Positioned` gate is gone, the scheduler opens sessions, and a 6 h watchdog closes stale ones. Remaining contract gap: `GET /config` has no `next_scan_utc`, so the production CAM falls back to its local weekly schedule (Monday 06:00 UTC) and retries `no_active_session` for up to 90 min. A framing-quality (`scan_quality`) safety net is also not implemented.
14. **`/yolo-scan` idempotency** — the contract has no `scan_id`/`event_id` field, so a retry after a lost response can duplicate a DiseaseScans row (daily photos are idempotent via the deterministic `event_id` + Events upsert). Proposed contract addition: optional scan id.
15. **Production CAM firmware is not flashed** — compile-verified only; no hardware results recorded (see `firmware/esp32cam_production/PRODUCTION-TESTS.md`). Workflow side (Change 10) is ready (§3.1).
16. **Perenual credential + real API validation** — the integration is simulated only (§3.2): the credential `PhytoAI Perenual` must be created/selected in the n8n UI (MCP cannot), the key should be regenerated, and one real lookup pass should confirm the live v2 response shapes and the free-tier behavior. `GET /config` does not expose any Perenual data (by design).

Added by the 2026-09-15 cross-system audit (`docs/cross-audit-2026-09-15.md`):
17. **`GET /config` missing preheat keys — RESOLVED 2026-09-15 (`63274c9`):** `Build Config Response` now returns `preheat_margin_c` + `preheat_lead_minutes` (verified exec `731`; audit M3).
18. **Source-of-truth mismatch (pump / water-temp) — RESOLVED 2026-09-15 (`63274c9`):** `Build Context` resolves `max_water_temp_c` (fallback 28) and `max_pump_seconds` (fallback 60); `Safety Guardrails` reads them instead of the old 30/60 literals, and the decision JSON now carries `max_pump_seconds` (`Build Decision Response` L405-406). Verified exec `729` (config 28/45 honoured) and `730` (fallbacks 28/60) — audit M1/M2.
19. **Legacy `current_cycle_week` in `GET /config` — RESOLVED 2026-09-15 (`63274c9`):** field removed from `Build Config Response`; dashboard grep showed no usage (audit M5).
20. **Docs drift after Change 10 — RESOLVED 2026-09-15:** README Branch C narrative + endpoint table rewritten to the autonomous Drive+Sheets chain (no `scan_position`, no return-camera notification). Plan §2.3's example type list refresh is cosmetic and still open (audit M4).
21. **Duplicate reference export — RESOLVED 2026-09-15:** untracked `docs/PhytoAI-final.xlsx` deleted; `docs/PhytoAI.v2.xlsx` remains authoritative (audit M6).

New (from the WROOM production brief, 2026-09-15):
22. **LDR is digital, not analog** — the bench-verified LDR module is read via its DO on GPIO25 (`light_level` = 0/1), while `docs/flash-light-gating-spec.md` and Plan §2.2 assume a 0–4095 analog value; GPIO25 is ADC2 and unusable with WiFi. Decide: keep the digital 0/1 (CAM flashes always-dark below threshold 500) or rewire the LDR AO to an ADC1 pin. Not blocking `dry_run_mode`.
23. **Camera battery assumptions are obsolete** — camera power is wired-only (owner-verified 2026-09-15). Legacy leftovers to decide on: CAM production `PRODUCTION-TESTS.md` test #7 (battery ADC) and `camera_battery_percent` in SystemConfig, Branch C's `camera_battery_min_percent` gate / `alert_battery_low`, and the dashboard battery display. The WROOM firmware has no battery references (§3.4 rule 6). Not blocking `dry_run_mode`.
24. **Measured-water persistence (P1 from the dashboard audit)** — measured `wt_delta_g` and `ml_est` exist only in WROOM serial logs; persisting them needs a firmware completion POST → n8n → `Events.WaterAddedGrams` (`FinalWaterTempC`/`WateringAborted` likewise unwritten). Firmware was out of scope for the dashboard task, so the UI renders "measured delta: not persisted" instead of fabricating history. `ml_est` is computed in the dashboard from the commanded duration × calibrated flow (9.706 ml/s) and always labelled an estimate.
25. **Per-image metadata (G4 from the dashboard audit)** — capture reason and per-image light condition are not persisted anywhere; Drive provides dimensions/createdTime only (used). Optional future: extra Sheets columns or a metadata endpoint. Not blocking.
26. **Assistant endpoints are inactive** — the three dashboard webhooks exist and are test-verified, but the workflow is INACTIVE, so production HTTP returns 404 and the UI shows the explicit inactive state. To go live: publish the workflow, then verify from a real browser session (real Google token) that CORS + `tokeninfo` + rate limits work; the exact curl is in `docs/dashboard-ux-v3.md` §"Still missing / not yet real".
