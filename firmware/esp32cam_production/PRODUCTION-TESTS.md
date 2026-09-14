# ESP32-CAM production firmware — test plan & verified status

File under test: `firmware/esp32cam_production/esp32cam_production.ino` (separate sketch folder; the
development baseline `firmware/esp32cam/esp32cam.ino` is untouched and still compiles).
Secrets: shared gitignored `firmware/esp32cam/secrets.h` (`SECRET_WIFI_SSID`, `SECRET_WIFI_PASSWORD`,
`SECRET_BASE_URL`, `SECRET_WEBHOOK_PREFIX`); placeholders keep it compiling without secrets.

Status legend: **COMPILED** = verified locally with `arduino-cli compile --fqbn esp32:esp32:esp32cam`
(2026-09-14: 1,170,930 bytes / 37 % flash, 60,772 bytes / 18 % RAM). **REQUIRES HARDWARE** = needs the real
camera flashed/wired. **PENDING E2E** = needs the deployed n8n + Sheets + dashboard round-trip.
Nothing below is claimed as production-ready until the real hardware run is recorded.

## Contract notes / mismatches found before implementation

Payload contracts are unchanged: `POST /core/photo` (multipart field `data`; `device_id`, `event_id`,
`event_type`, `captured_at_utc`, `battery_percent`), `POST /yolo-scan` (`device_id`,
`captured_at_utc`, `battery_percent`), `POST /yolo-scan/done` (JSON `device_id`, `photos_uploaded`,
`started_at_utc`, `ended_at_utc`), `GET /config`.

1. **`GET /config` has no `next_scan_utc`.** The live `Build Config Response` returns sun times,
   `dry_run_mode`, location, `last_lightlevel`, `flash_dark_threshold`, `last_lightlevel_utc` — but no scan
   schedule. The firmware therefore uses `next_scan_utc` **when present** and otherwise falls back to a local
   weekly schedule (Monday `SCAN_HOUR_UTC:SCAN_MIN_UTC`, default 06:00 UTC). *Proposed (not applied): expose
   `next_scan_utc` per `docs/phytoai-changes-10-11-camera-and-care.md` (Change 10).*
2. **Autonomous scan gate — RESOLVED 2026-09-14.** `Wait Camera Positioned` and the dashboard confirmation
   were removed (Change 10 applied live + simulated: executions 691–696, see `STATUS.md` §3.1). The scheduler
   opens the session (`scan_session_active=true`) at `30 5 * * 1`, and `/yolo-scan` returns
   `{"status":"ok",…}` without human action. The firmware's 90-min window / 10-min retry logic still covers
   `no_active_session` correctly (e.g. after a watchdog auto-close or outside a session window).
3. **`/yolo-scan` has no idempotency key.** A retry after a POST that was already processed (response lost)
   can duplicate a scan. Daily photos are idempotent (deterministic `event_id` = `cam-<YYYYMMDD>`, n8n upserts
   by EventID). *Proposed (not applied): optional `scan_id`/`event_id` field on `/yolo-scan`.*
4. **No daily-photo schedule in `/config`.** Daily capture time is a firmware constant
   (`DAILY_PHOTO_HOUR_UTC:DAILY_PHOTO_MIN_UTC`, default 10:00 UTC). *Proposed: `next_photo_utc`.*
5. **Manual capture button not implemented** in production v1 (autonomous + serial diagnostics only); it
   remains the open Plan §8 Q4 item.

## Reliability constants (as implemented)

| Area | Value |
|---|---|
| Wi-Fi | 3 attempts × 20 s per pass; on failure deep-sleep 15 min (`RETRY_SOON_SECONDS`) and retry |
| NTP | 2 attempts × 15 s; no valid UTC clock ⇒ no capture this pass, retry in 15 min |
| HTTP | uploads 15 s timeout, `GET /config` 8 s; uploads retried 3× with 5 s exponential backoff |
| Scan window | 90 min after target; retry every 10 min (`no_active_session` included) |
| Duplicate prevention | daily: `event_id` upsert; scan: NVS week bucket `lastScanB`, miss recorded in `scanMissB` |
| Deep sleep | until next event − 180 s lead, capped at 12 h per sleep; NTP re-syncs every wake |
| State | NVS namespace `phytoai-cam`: `lastDaily`, `lastScanB`, `scanMissB` (survives reboot/brownout) |
| Never actuates | no pump/heater code paths at all (camera only) |

## Flashing checklist (production CAM)

Ordered steps; each step names its evidence. Do not skip the workflow-prefix decision (step 2) — it is the
most common way to get silent 404s.

1. **Hardware.** AI-Thinker ESP32-CAM (OV2640) + a 5 V supply that can source ≥ 1 A peaks (camera + flash);
   USB-TTL adapter (3.3 V) for flashing and serial; jumper GPIO0 → GND while resetting to enter flash mode
   (remove/reboot after). Production firmware has no capture button — serial only.
2. **Secrets** (`firmware/esp32cam/secrets.h`, gitignored; already present: Wi-Fi + `SECRET_BASE_URL`).
   - `SECRET_WEBHOOK_PREFIX` is currently `/webhook-test`. Keep `/webhook-test` **only** for editor test mode
     (n8n editor open, listening on the test URL). For the production tunnel switch it to `/webhook` **after**
     the workflow is activated (currently INACTIVE) — production webhook URLs return 404 while inactive.
   - Confirm `DEVICE_ID` in the sketch (`esp32-cam-01`) is the id you want in Sheets/n8n.
3. **Workflow prerequisites.** Change 10 applied + simulated (2026-09-14) — done. Keep `dry_run_mode=TRUE`
   for the first runs. In the n8n UI, visually confirm the Google Sheets credential on the 3 nodes added by
   Change 10 (`Append Scan Scheduled`, `Read SystemConfig Watchdog`, `Append Session Timeout Notification`) —
   MCP cannot reveal or verify credential bindings.
4. **Compile.**
   `arduino-cli compile --fqbn esp32:esp32:esp32cam firmware/esp32cam_production`
   Expected: 1,170,930 bytes / 37 % flash, 60,772 bytes / 18 % RAM. For bench sessions add
   `-DALWAYS_DIAGNOSTIC=true` (keeps the board awake and the serial menu open instead of deep-sleeping).
5. **Upload.**
   `arduino-cli upload -p <COMx> --fqbn esp32:esp32:esp32cam firmware/esp32cam_production`
   (GPIO0 → GND at reset for flash mode). Serial monitor at **115200**, press `h` for the menu.
6. **Bench smoke tests** (details/expected evidence in the table below):
   `r` reboot, `t` state, `b` battery, `f` torch toggle (visual), `w` Wi-Fi, `n` NTP, `c` `GET /config`
   (`[config] ok`; watch the flash decision log), `p` daily photo upload (200 `{"status":"received"}` +
   Events row, no duplicate on repeat), `s` scan (`/yolo-scan`; returns `{"status":"ok",…}` with an open
   session), `d` scan-done (`scan_session_active=false`).
7. **Record results** in the test table below (serial log + HTTP response + n8n execution + Sheets row for
   each test). Test 14 (full end-to-end) is the production-ready gate.

## Required tests

| # | Test | Method / expected evidence | Status |
|---|---|---|---|
| 1 | Camera init + JPEG capture | serial `h`/`p`; `[CAM] initialized`, frame bytes logged, Drive file appears | REQUIRES HARDWARE (baseline camera path already bench-tested 2026-09-14) |
| 2 | NTP sync + UTC formatting | serial `n`; `[NTP] UTC now …Z`; timestamps in payloads end in `Z` | REQUIRES HARDWARE |
| 3 | `GET /config` retrieval | serial `c`; `[config] ok …`; missing fields tolerated | REQUIRES HARDWARE |
| 4 | `POST /core/photo` daily upload | serial `p`; `[photo] uploaded event_id=cam-YYYYMMDD`; 200 `{"status":"received"}`; Events row upserted | PENDING E2E |
| 5 | `POST /yolo-scan` scheduled scan | serial `s`; 200 `{"status":"ok","judge_verdict":…}`; DiseaseScans row appended | PENDING E2E (workflow side applied 2026-09-14 — `STATUS.md` §3.1; needs real device) |
| 6 | `POST /yolo-scan/done` | after 5; serial `[scan-done] … status=200`; `scan_session_active=false` | PENDING E2E |
| 7 | Battery percentage included | serial `b`; `battery_percent` present in every multipart payload | REQUIRES HARDWARE (ADC calibration TODO) |
| 8 | Wi-Fi failure/recovery | disable AP; serial shows 3 failed attempts → `[sleep] 900 s`; next wake reconnects | REQUIRES HARDWARE |
| 9 | n8n timeout/retry | point at an unreachable/black-hole URL; 3 upload attempts with backoff logged | PENDING E2E |
| 10 | Server error response | return 5xx; firmware retries then records failure without crash | PENDING E2E |
| 11 | Reboot during pending upload | power-cycle mid-upload; daily re-posts same `event_id` → no duplicate Events row | REQUIRES HARDWARE |
| 12 | Duplicate-capture prevention | run two passes in one day/week; second pass logs "already completed"/not due | REQUIRES HARDWARE |
| 13 | Missing/stale config fallback | run with `/config` down; flash decision logs `(fallback)`/`(suntimes)`; captures still upload | PENDING E2E |
| 14 | Full end-to-end | flash camera; one autonomous daily + one scan cycle visible in n8n, Drive, Sheets, dashboard | PENDING E2E |

A test counts as complete only when the received payload, the HTTP response, and the resulting n8n/Sheets
behavior are recorded (serial log + execution + row).

## Remaining before production-ready

- Flash `firmware/esp32cam_production/` to the real ESP32-CAM and record test results above.
- Autonomous-scan workflow side is DONE (Change 10 applied + simulated 2026-09-14); only the proposed
  `next_scan_utc` contract addition (note 1) remains unapplied.
- Decide on the `/yolo-scan` idempotency key (contract note 3).
- Calibrate the battery divider; confirm flash polarity on the unit.
- **Do not claim production readiness until the flash + full end-to-end run succeed.**
