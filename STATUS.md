# PhytoAI — Project Status (for external review)

Scope: everything below is sourced from the working copy `C:\Users\moham\Downloads\Phython` and its git history, as of 2026-09-14. Anything not verifiable there is marked **UNKNOWN** (not guessed). Live n8n state is cited only where a file/commit evidences it.

## 1. WHAT EXISTS NOW

**Planning / docs**
- `docs/Plan.md` (2026-09-10) — canonical Stage-1 plan: Sheets schemas, branch-by-branch workflow structure, prompts, webhook contracts, manual prerequisites (§7), open questions (§8).
- `docs/SmartPot-Full-Engineering-Spec-PRD.md` (2026-08-20) — full engineering spec (hardware, wiring, firmware, safety).
- `docs/PhytoAI-Deployment-Prompt.md` (2026-08-22), `docs/PhytoAI-Execution-Kickoff-v2.md` (2026-08-23) — earlier execution briefs (superseded).
- `docs/phytoai-redesign-prompt.md` (2026-09-09) — Changes 1–6 redesign spec.
- `docs/phytoai-firmware-changes-7-8-9.md` (2026-09-11) — firmware Changes 7–9 + Phase-5 change list.
- `docs/phytoai-changes-10-11-camera-and-care.md` (2026-09-11) — scheduled-camera + placement-review spec (Phase-5; not applied live).
- `docs/opencode-firmware-brief.md` (2026-09-12) — firmware brief (Deliverable 1 calibration, Deliverable 2 production).
- `docs/flash-light-gating-spec.md`, `docs/yolo-service-spec.md` (both 2026-09-14) — approved specs implemented on 2026-09-14.

**Workflow exports**
- `workflows/phytoai.json` (2026-09-14 10:10) — **authoritative**: name `phytoai`, workflow ID `WXd35adnUc9QQA84`, **156 nodes / 168 edges**, settings `{executionOrder:"v1", binaryMode:"separate", availableInMCP:true}`.
  - Webhooks: `Core Sensor Webhook` (`core/sensor`), `Daily Photo Webhook` (`core/photo`), `Scan Photo Webhook` (`yolo-scan`), `Scan Sweep Done` (`yolo-scan/done`), `Device Config` (`config`, GET).
  - Agents: `History Analyst`, `Decision Agent`, `Photo Analysis Agent`, `Vision Analyst`, `Judge`, `Treatment Advisor`.
  - Added 2026-09-14: `YOLO Analyst` (HTTP node id `1692f6cd-3c04-4c31-89a8-92c5ccab6737`), `Attach Scan Image` (Code node id `ca423560-cd65-4414-acbe-5358f47cbe4f`).
  - Still present: 3 Wait nodes (`Wait Camera Positioned`, `Wait Verdict Response`, `Wait Followup Response`); `Plant Profile Agent — TODO` schedule placeholder. No Telegram, servo, or BranchMap nodes.
- `workflows/phytoai.backup.json` (2026-09-09) — pre-redesign raw export: 105 nodes, `active:false`, `triggerCount:0`.
- Root `phytoai-workflowone.json` no longer exists (moved into `workflows/` in commit `e5b81f8`).

**Hardware / firmware**
- `Hardware/Hardware-list.txt` (2026-09-10) — parts list (servos removed).
- `firmware/wroom_calibration/wroom_calibration.ino` (2026-09-13) — WROOM bench/calibration sketch.
- `firmware/esp32cam/esp32cam.ino` (2026-09-14) — CAM sketch (photo/scan upload, flash gating + measured-light decision, `f` torch).
- `firmware/esp32cam/ESP32CAM-TASK.md` (2026-09-13); `firmware/esp32cam/secrets.h` (2026-09-13, **gitignored** — local Wi-Fi/tunnel values).

**Services / scripts / dashboard**
- `yolo-service/` (2026-09-14): `app/main.py`, `requirements.txt`, `Dockerfile`, `docker-compose.yml`, `README.md`.
- `scripts/` (2026-09-14): `prepare_plantvillage.py`, `train.py`, `export_dataset.py`, `README.md`.
- `dashboard/` (2026-09-10): `index.html`, `styles.css`, `app.js`, `config.js`.
- `README.md` (2026-09-13) incl. "Known issues / lessons"; `.gitignore` (2026-09-14). Gitignored local secrets: `opencode.json`, `mcp-auth.json`.

**Authoritative workflow JSON: `workflows/phytoai.json`.**

## 2. ARCHITECTURE AS IT STANDS

Per `docs/Plan.md`: one n8n workflow **`phytoai`** (ID `WXd35adnUc9QQA84`) is the whole cloud brain. Devices (ESP32 WROOM "body" + battery ESP32-CAM "eye") talk only to n8n webhooks; **Google Sheets is the database** (Events, SystemConfig, Notifications, DiseaseScans, AgentNotes, PushSubscriptions); photos go to **Google Drive**; the **static dashboard is the only user interface** (Telegram removed; no servos/pan-tilt/BranchMap/aiming). Branch A = history-aware watering council with deterministic Safety Guardrails; Branch B = daily photo analysis; Branch C = weekly human-assisted disease-scan panel; Branch E = scheduler + `GET /config`. `dry_run_mode=true` (13 refs in the export) and the workflow is meant to stay **INACTIVE** until the manual prerequisites are done. AI runs on one shared OpenRouter model node (`OpenRouter Gemma`).

## 3. WHAT IS DEPLOYED VS ONLY PLANNED

| Item | Evidence in this repo | Status |
|---|---|---|
| n8n workflow `phytoai` (WXd35adnUc9QQA84) | exported 2026-09-14 via MCP (156 nodes); commits `bbf4f7c`…`5993d31` | **VERIFIED LIVE (definition)**; INACTIVE per Plan §1/README — export carries no `active` field, so current live activation is **UNKNOWN** |
| Workflow executions | none in repo | **UNKNOWN** |
| Branch B end-to-end | commit `bbf4f7c` "Branch B verified end-to-end (known-good baseline)" | user-verified per commit message; executions UNKNOWN |
| M1 named Cloudflare tunnel | Plan §7 | PLANNED |
| M2 Sheets tabs + seed keys | Plan §2/§7 (manual) | PLANNED; actual sheet state UNKNOWN |
| M3 Google Sheets/Drive credentials | not in repo (redacted); Plan §7 | PLANNED/UNKNOWN |
| M4 OpenRouter credential | not in repo; Plan §7 | PLANNED/UNKNOWN |
| M5 VAPID keys | Plan §7 | PLANNED |
| M6 dashboard deploy (GitHub Pages) | `dashboard/` files exist; no deploy artifact | code EXISTS; deploy **UNKNOWN** |
| M7 Drive folders (`SmartPot/DailyPhotos`, `SmartPot/ScanPhotos`) | Plan §3.5/§7 | PLANNED |
| WROOM firmware (`firmware/wroom_calibration/wroom_calibration.ino`) | owner-verified 2026-09-14 | code EXISTS; **Part 1 (flash) DONE**; **Part 2 (sensor verification) PARTIAL** — HX711 + heater untested |
| ESP32-CAM firmware (`firmware/esp32cam/esp32cam.ino`) | owner-verified 2026-09-14 | code EXISTS; **test sketch bench-tested DONE** (camera init, Wi-Fi, webhook upload); production capture button/battery unverified |
| `yolo-service` container | code exists; no model in repo (`models/` gitignored) | code EXISTS; deployed **UNKNOWN** |
| PlantVillage dataset on VPS | see §4 | **DELETED 2026-09-14** |

**Firmware test status (owner-verified, 2026-09-14):**
- **WROOM calibration/test** (`firmware/wroom_calibration/wroom_calibration.ino`) — two parts. **Part 1 (upload) DONE:** flashed to the ESP32-WROOM; board boots, sketch runs, Wi-Fi/serial output works. **Part 2 (sensor-by-sensor verification) PARTIAL:** sensors that did not depend on missing hardware were read and returned values; **HX711 load cell NOT tested** — blocked, waiting on 2 extra screws for the scale mount (`HX711_SCALE_FACTOR` stays provisional `305.070f`); **water-heater path NOT tested** — heater module not delivered, so `heater_on` / `max_heater_seconds=600` remains validated only in dry-run. Results were reported back as planned but the set is **INCOMPLETE** (scale + heater rows open).
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
   - **8a.** Re-run the WROOM sensor test for the **HX711** once the 2 scale-mount screws arrive → calibrate → replace the provisional `HX711_SCALE_FACTOR` (`305.070f`).
   - **8b.** Test **heater wiring/relay** once the heater module arrives → verify the `max_heater_seconds=600` cutoff and water-temperature readings.
   - **8c.** Attach the completed **scale + heater results** to the same result sheet so the sensor test is marked **fully DONE** before production firmware is written.
9. Deploy `yolo-service` on the VPS and provide a bootstrap `model.pt`; then run the flywheel.
10. Apply the documented-but-not-live Phase-5 workflow changes (Changes 7–9 contracts; Changes 10–11 scheduled camera + Placement Reviewer).
11. **Dataset cleanup (2026-09-14):** `plantvillage` and `plantvillage_repo` were deleted from `~/PhytoAI` on the VPS; disk afterward **66 % used / 25 G free**. Re-run `scripts/prepare_plantvillage.py` before any bootstrap; **update dataset references** in `scripts/README.md`, `yolo-service/README.md`, and `docs/yolo-service-spec.md` to reflect that the local dataset must be recreated.
12. After any MCP edit, verify Sheets "Column to match on" in the n8n UI (see README "Known issues / lessons").

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
9. **yolo-service Docker network name** — `docker-compose.yml` uses placeholder `n8n_default`; no compose file exists in the repo and Docker is not available locally. Must be verified on the VPS (`docker network ls`).
10. **Live activation/execution state** — not represented in the repo exports; only MCP reads (session) showed `active:false`. Treat as UNKNOWN from files alone.
11. **Hardware unknowns** (`docs/phytoai-firmware-changes-7-8-9.md` §11): H1 relay board, H4 PSU, H7 load-cell mounting, H8 free GPIOs. `HX711_SCALE_FACTOR` is provisional (`305.070f`), pump flow unmeasured, heater module untested.
12. **ESP32-CAM/WROOM flashing values are local-only** — `firmware/esp32cam/secrets.h` is gitignored; a fresh clone must recreate it.
