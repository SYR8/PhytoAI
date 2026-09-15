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
- `docs/flash-light-gating-spec.md`, `docs/yolo-service-spec.md` (both 2026-09-14) — approved specs implemented on 2026-09-14.
- `docs/perenual-integration-spec.md` (2026-09-14) — approved Perenual secondary-knowledge-layer spec (free tier only; implemented 2026-09-14 — §3.2).

**Workflow exports**
- `workflows/phytoai.json` (2026-09-14 16:57 UTC) — **authoritative**: name `phytoai`, workflow ID `WXd35adnUc9QQA84`, **168 nodes / 182 edges**, settings `{executionOrder:"v1", binaryMode:"separate", availableInMCP:true}`. Re-applied to the live workflow via MCP on 2026-09-14 (autonomous scan change, then the Perenual integration §3.2) and re-fetched to confirm the live definition matches this export.
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
- `firmware/esp32cam/esp32cam.ino` (2026-09-14) — CAM sketch (photo/scan upload, flash gating + measured-light decision, `f` torch).
- `firmware/esp32cam/ESP32CAM-TASK.md` (2026-09-13); `firmware/esp32cam/secrets.h` (2026-09-13, **gitignored** — local Wi-Fi/tunnel values).
- `firmware/esp32cam_production/esp32cam_production.ino` (2026-09-14) — production **autonomous** CAM firmware (Wi-Fi + NTP + `/config` + scheduled daily photo + scheduled scan + scan-done + retries + deep sleep); separate sketch folder, baseline untouched; **compile-verified only**.
- `firmware/esp32cam_production/PRODUCTION-TESTS.md` (2026-09-14) — 14-test plan/status for the production CAM plus the contract-gap notes.

**Services / scripts / dashboard**
- `yolo-service/` (2026-09-14): `app/main.py`, `requirements.txt`, `Dockerfile`, `docker-compose.yml`, `README.md`.
- `scripts/` (2026-09-14): `prepare_plantvillage.py`, `train.py`, `export_dataset.py`, `README.md`.
- `dashboard/` (2026-09-10): `index.html`, `styles.css`, `app.js`, `config.js`.
- `README.md` (2026-09-13) incl. "Known issues / lessons"; `.gitignore` (2026-09-14). Gitignored local secrets: `opencode.json`, `mcp-auth.json`.

**Authoritative workflow JSON: `workflows/phytoai.json`.**

## 2. ARCHITECTURE AS IT STANDS

Per `docs/Plan.md`: one n8n workflow **`phytoai`** (ID `WXd35adnUc9QQA84`) is the whole cloud brain. Devices (ESP32 WROOM "body" + battery ESP32-CAM "eye") talk only to n8n webhooks; **Google Sheets is the database** (Events, SystemConfig, Notifications, DiseaseScans, AgentNotes, PushSubscriptions); photos go to **Google Drive**; the **static dashboard is the only user interface** (Telegram removed; no servos/pan-tilt/BranchMap/aiming). Branch A = history-aware watering council with deterministic Safety Guardrails; Branch B = daily photo analysis; Branch C = weekly disease-scan panel — **updated 2026-09-14 to run autonomously** (scheduler opens the session; no dashboard approval; a watchdog force-closes stale sessions; notifications are informational; HITL Waits remain only for flagged issues — §3.1); Branch E = scheduler + `GET /config`. A **Perenual species-reference layer** (§3.2) adds a lazy, cached knowledge prior (free tier only) to Branch A's decision prompt and to Branch C's treatment prompt; it is advisory only and never enters Safety Guardrails. `dry_run_mode=true` (13 refs in the export) and the workflow is meant to stay **INACTIVE** until the manual prerequisites are done. AI runs on one shared OpenRouter model node (`OpenRouter Gemma`).

## 3. WHAT IS DEPLOYED VS ONLY PLANNED

| Item | Evidence in this repo | Status |
|---|---|---|
| n8n workflow `phytoai` (WXd35adnUc9QQA84) | exported + re-applied 2026-09-14 via MCP (168 nodes; autonomous scan change §3.1; Perenual integration §3.2); commits `bbf4f7c`…`5993d31` | **VERIFIED LIVE (definition)** — re-fetched after the MCP updates and matches the repo export; **INACTIVE** (live read `active:false`) |
| Workflow executions | MCP test executions `691`–`696` (autonomous scan, §3.1) and `697`–`725` (Perenual suite, §3.2); all pinned; no device executions recorded | **test-level VERIFIED**; device executions **UNKNOWN** |
| Branch B end-to-end | commit `bbf4f7c` "Branch B verified end-to-end (known-good baseline)" | user-verified per commit message; executions UNKNOWN |
| M1 named Cloudflare tunnel | Plan §7 | PLANNED |
| M2 Sheets tabs + seed keys | `docs/PhytoAI.v2.xlsx` audited vs Plan §2 + workflow | **DONE / VERIFIED — audited 2026-09-14 (audit file v2), 0 sheet-side issues** |
| M3 Google Sheets/Drive credentials | not in repo (redacted); Plan §7 | PLANNED/UNKNOWN |
| M4 OpenRouter credential | not in repo; Plan §7 | PLANNED/UNKNOWN |
| M5 VAPID keys | Plan §7 | PLANNED |
| M6 dashboard deploy (GitHub Pages) | `dashboard/` files exist; no deploy artifact | code EXISTS; deploy **UNKNOWN** |
| M7 Drive folders (`SmartPot/DailyPhotos`, `SmartPot/ScanPhotos`) | Plan §3.5/§7 | PLANNED |
| WROOM firmware (`firmware/wroom_calibration/wroom_calibration.ino`) | owner-verified 2026-09-14; sketch updated + **compile-checked** 2026-09-14 (§3.3) | code EXISTS; **Part 1 (flash) DONE**; **Part 2 (sensor verification) PARTIAL** — heater bench test + HX711 recalibration still to run on hardware |
| ESP32-CAM firmware — test baseline (`firmware/esp32cam/esp32cam.ino`) | owner-verified 2026-09-14 | **bench-tested DONE** (camera init, Wi-Fi, webhook upload) |
| ESP32-CAM firmware — production (`firmware/esp32cam_production/esp32cam_production.ino`) | compile-verified 2026-09-14 (37 % flash / 18 % RAM; `arduino-cli`, `esp32:esp32:esp32cam`) | **COMPILED ONLY — NOT FLASHED**; the required Change 10 workflow edit is APPLIED + simulated (§3.1); remaining: flash + 14-test plan + real end-to-end |
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

- **Task A — HX711 calibration fix.** `hxRawAvg()` now averages `scale.get_value()` (offset-compensated) instead of `scale.read()` (raw; ignores the tare OFFSET — the cause of the "stacking weight" behaviour). `setup()` now calls `scale.tare(10)` immediately after `scale.begin()` and before any `set_scale()` (previously OFFSET defaulted to 0, so `get_units()` showed phantom weight until a manual `t`). The calibration flow is exactly tare(10) → `hxRawAvg(20)` → `factor = raw / grams`. The stale baked-in `HX711_SCALE_FACTOR = 305.070f` was **deleted** and replaced by `0.0f` as an explicit "unset" sentinel (`printConstants()` prints `(unset - run 'w')`); that old value was computed with the broken math and is **invalid — nothing may depend on it**. Recalibration is required after flashing: tare empty platform → known weight → record the new factor.
- **Task B — bench-only heater test (`e`).** Relay **CH2 = GPIO16** (owner-confirmed; the PRD's proposed GPIO26 is used by HX711 DT in this sketch). `e` enters a bench test session: `e` toggles CH2; while ON it prints elapsed seconds + the water DS18B20 once per second; `x` exits and always forces CH2 OFF. Safety invariants, all compile-time constants (not parameters, not serial-settable): OFF at boot and after reset/watchdog (setup writes OFF first); **40.0 °C** water auto-cutoff with lockout until MCU reset; **120 s** maximum continuous ON with lockout until MCU reset; wet-only interlock before ON (tank not empty + valid water probe). The heater stays manual/bench-only — `commandHeaterTest()` has exactly one call site (the `e` menu case), the sketch contains no Wi-Fi/n8n/sleep/autonomous code, and no workflow path can reach it.
- **Verification:** `grep` for `305.070` / `305070` across `firmware/`, `workflows/`, `scripts/`, `yolo-service/` returns **zero hits**; the only remaining mentions in git are this invalidation note and historical docs (`docs/opencode-firmware-brief.md`, `docs/phytoai-firmware-changes-7-8-9.md`) that describe the old provisional state. Physical bench tests (HX711 recalibration once the mount screws are in; heater `e` run, submerged) are **NOT yet done** — compile-check is the only demonstrated claim.

**Firmware test status (owner-verified, 2026-09-14):**
- **WROOM calibration/test** (`firmware/wroom_calibration/wroom_calibration.ino`) — two parts. **Part 1 (upload) DONE:** flashed to the ESP32-WROOM; board boots, sketch runs, Wi-Fi/serial output works. **Part 2 (sensor-by-sensor verification) PARTIAL:** sensors that did not depend on missing hardware were read and returned values. **Update 2026-09-14 (§3.3):** the HX711 calibration bug is fixed (offset-compensated read + boot tare) and the stale baked-in factor **`305.070f` is invalid** — it was computed with the broken (non-offset-compensated) math — replaced by the `0.0f` unset sentinel, so the owner must re-run the two-point calibration; the heater module is now delivered and wired to relay CH2 (GPIO16) with a bench-only `e` test (40.0 °C / 120 s hard limits + lockout). Both changes are **compile-checked only** — the physical HX711 recalibration and heater test have not been run yet.
- **ESP32-CAM** (`firmware/esp32cam/esp32cam.ino`) — test sketch written and bench-tested **DONE**: camera init, Wi-Fi connect, and webhook upload path verified.

## 4. WHAT'S LEFT (priority order)

1. **M1 — Persistent named Cloudflare tunnel** (top priority; production webhook base URL; quick-tunnel URLs change and would invalidate stored resume URLs).
2. **M2 — Create the six Sheets tabs** with exact headers/seed keys and delete `BranchMap` (blocking dependency for the wiring test; includes `camera_battery_min_percent=30`).
3. **M3 — n8n Google Sheets + Drive credentials** (Plan expects names "PhytoAI Google Sheets" / "PhytoAI Google Drive").
4. **M4 — n8n OpenRouter credential** ("PhytoAI OpenRouter").
5. **M5 — VAPID keypair** → SystemConfig `push_vapid_public_key` (private key stays in n8n).
6. **M6 — Deploy the static dashboard** to GitHub Pages (+ OAuth client for Sheets writes).
7. **M7 — Run the one-time setup branch** to create the two Drive folders and store their IDs.
8. Flash/commission firmware — WROOM Part 1 done, Part 2 partial; complete it and the CAM, then a first real end-to-end run:
   - **8a.** Re-run the WROOM sensor test for the **HX711** once the 2 scale-mount screws arrive → flash the fixed sketch → two-point calibration (`t` / `w`) → record the new factor (the old `305.070f` is invalid — computed with the broken read; the sketch now ships `0.0f` = unset).
   - **8b.** Run the **heater bench test** on the now-wired CH2 (GPIO16): serial `e`, submerged only → verify the 40.0 °C auto-cutoff + lockout and the 120 s maximum-ON + lockout; the production `max_heater_seconds=600` cutoff remains a separate production-firmware item.
   - **8c.** Attach the completed **scale + heater results** to the same result sheet so the sensor test is marked **fully DONE** before production firmware is written.
   - **8d.** Flash the **production autonomous CAM** (`firmware/esp32cam_production/`) and run its 14-test plan (`PRODUCTION-TESTS.md`); the Change 10 workflow edit is already APPLIED + simulated (§3.1) — only flashing and the 14-test plan remain.
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
10. **Live activation/execution state** — repo exports carry no `active` field; a live MCP read on 2026-09-14 showed `active:false`. Test executions exist (`691`–`696`); device executions UNKNOWN.
11. **Hardware unknowns** (`docs/phytoai-firmware-changes-7-8-9.md` §11): H1 relay board (incl. polarity/logic-level spec), H4 PSU, H7 load-cell mounting (blocked on 2 screws), H8 remaining free-GPIO confirmation, H9 relay-board VCC/coil current. `HX711_SCALE_FACTOR` is now the `0.0f` unset sentinel — the former `305.070f` was computed with the broken non-offset-compensated read and is invalid (recalibrate with `w` after flashing); pump flow unmeasured; heater module now delivered and wired to CH2/GPIO16 with a bench-only test (§3.3), physical run pending.
12. **ESP32-CAM/WROOM flashing values are local-only** — `firmware/esp32cam/secrets.h` is gitignored; a fresh clone must recreate it (the production sketch shares it via a relative include).
13. **Autonomous scan** — Change 10 is APPLIED live and simulated (§3.1): the `Wait Camera Positioned` gate is gone, the scheduler opens sessions, and a 6 h watchdog closes stale ones. Remaining contract gap: `GET /config` has no `next_scan_utc`, so the production CAM falls back to its local weekly schedule (Monday 06:00 UTC) and retries `no_active_session` for up to 90 min. A framing-quality (`scan_quality`) safety net is also not implemented.
14. **`/yolo-scan` idempotency** — the contract has no `scan_id`/`event_id` field, so a retry after a lost response can duplicate a DiseaseScans row (daily photos are idempotent via the deterministic `event_id` + Events upsert). Proposed contract addition: optional scan id.
15. **Production CAM firmware is not flashed** — compile-verified only; no hardware results recorded (see `firmware/esp32cam_production/PRODUCTION-TESTS.md`). Workflow side (Change 10) is ready (§3.1).
16. **Perenual credential + real API validation** — the integration is simulated only (§3.2): the credential `PhytoAI Perenual` must be created/selected in the n8n UI (MCP cannot), the key should be regenerated, and one real lookup pass should confirm the live v2 response shapes and the free-tier behavior. `GET /config` does not expose any Perenual data (by design).
