# PhytoAI — Setup & Test Guide (for reviewers)

This guide walks through the complete setup in order: Google Sheet → n8n → firmware →
commissioning → live tests. Everything here was run on the live system on **2026-09-19**.

**Easiest start:** import `test-data/PhytoAI-demo-data.xlsx` as your spreadsheet (Google Sheets:
*File → Import → Replace spreadsheet*). It contains the exact tab names, exact headers, the required
`SystemConfig` seed rows and a small coherent slice of real demo rows (one watering event, one daily
photo analysis, one scan verdict, two notifications, agent notes).

---

## 1. Google Sheet (the database)

Create one spreadsheet with these **six tabs** and the **exact headers** below (copy them
verbatim; the workflow matches by name):

| Tab | Headers |
|---|---|
| `Events` | `EventID, Timestamp, EventType, MoisturePercent, SoilTempC, WaterTempC, AirTempC, AirHumidityPercent, WeightGrams, LightLevel, TankEmpty, WateringTriggered, WaterDurationSeconds, HeaterUsed, HeaterDurationSeconds, SpeciesGuess, SpeciesConfidence, PhotoFileID, AnomalyDetected, AnomalyDescription, AI_Notes, ReasoningSummary, WateringAborted, FinalWaterTempC, WaterAddedGrams` |
| `SystemConfig` | `Key, Value, LastUpdated` |
| `Notifications` | `timestamp, type, title, message, response_options, status, response, resume_url, context_ref` |
| `DiseaseScans` | `timestamp, drive_links, vision_opinion, yolo_opinion, judge_verdict, judge_reasoning, treatment_plan, user_verdict, treatment_outcome, ai_notes` |
| `AgentNotes` | `timestamp, agent, note, context_ref, status` |
| `PushSubscriptions` | `timestamp, endpoint, p256dh, auth, expiration_time, user_agent, status` (may stay empty) |

### Required `SystemConfig` seed rows

The demo xlsx already contains these. Minimum set to start safely:

| Key | Value | Meaning |
|---|---|---|
| `dry_run_mode` | `TRUE` | Fail-safe default: no GPIO actuation until you deliberately set `FALSE` |
| `scan_session_active` | `FALSE` | Scan session flag; only `true` lets the CAM sweep |
| `scan_auto` | `TRUE` | `false` disables the automatic weekly scan session |
| `scan_next_utc` | *(empty)* | Filled automatically when a scan session opens |
| `perenual_species_id` | *(empty)* | Optional Perenual reference cache (filled lazily) |
| `drive_daily_photos_folder_id` | *(empty)* | Filled by the One-Time Setup branch (step 2) |
| `drive_scan_photos_folder_id` | *(empty)* | Filled by the One-Time Setup branch (step 2) |
| `pot_latitude` / `pot_longitude` | e.g. `49.9886` / `8.5958` | Used to compute sun times |
| `next_sunrise_utc` / `next_sunset_utc` | *(empty ok)* | Sun times are computed automatically when stale |
| `max_pump_seconds` | `60` | Decision cap (firmware also has its own runtime cap) |
| `max_water_temp_c` | `28` | Heater target policy default |
| `min_rewater_interval_hours` | `6` | Guardrail: minimum gap between waterings |

`Events`, `Notifications`, `DiseaseScans`, `AgentNotes` may start empty — the workflow treats empty
history as a valid first-run state ("Always Output Data" is configured on those reads).

---

## 2. n8n

1. **Import** `workflows/phytoai.json` into your n8n instance.
2. **Create credentials by name** in the n8n UI and attach them to the nodes:
   - **Google Sheets OAuth2** (the Sheets nodes)
   - **Google Drive OAuth2** (the Drive nodes)
   - **OpenRouter API** (the model node `OpenRouter Gemma`)
   - optional: **Perenual** (Query Auth, parameter `key`) for species reference
3. **Run the One-Time Setup branch:** open the workflow, click the manual trigger node
   `One-Time Setup` → *Execute workflow*. It creates the Drive folders
   (`SmartPot / DailyPhotos / ScanPhotos`) and writes both folder IDs into `SystemConfig`.
4. **Activate the workflow.** Production webhooks (`/webhook/...`) only register while the workflow
   is **ACTIVE**. The editor test listener (`/webhook-test/...`) only answers once after clicking
   *Execute workflow* — use `/webhook` for devices.
5. Set the spreadsheet ID in the Sheets/Drive nodes (or point them at your imported spreadsheet).

---

## 3. Firmware

| Board | Sketch | FQBN |
|---|---|---|
| ESP32-WROOM | `firmware/wroom_production/` | `esp32:esp32:esp32` |
| ESP32-CAM (AI-Thinker) | `firmware/esp32cam_production/` | `esp32:esp32:esp32cam` |

Create a `secrets.h` next to each sketch (or use the shared `firmware/esp32cam/secrets.h`):

```cpp
#pragma once
#define SECRET_WIFI_SSID       "your-wifi"
#define SECRET_WIFI_PASSWORD   "your-password"
#define SECRET_BASE_URL        "https://your-n8n-host"   // https://, NO trailing slash
#define SECRET_WEBHOOK_PREFIX  "/webhook"                // production prefix
```

**First boot:** the WROOM forces both relays OFF and starts fail-safe (`dry_run` gates all GPIO);
the CAM opens a 15-second serial diagnostic window, otherwise runs one autonomous pass and deep-sleeps.

---

## 4. WROOM commissioning

1. Flash the WROOM and open the Serial Monitor (**115200 baud, line ending "No line ending"**).
2. **With the platform EMPTY**, send `t`, then `y` to confirm the INSTALLATION tare. The
   empty-platform offset is stored in NVS (never auto-tared afterwards; weight stays gross).
3. Place the pot, plant, tray and hoses back on the platform.
4. Send `i` for status: uptime, Wi-Fi, `dry_run`, HX711 offset/factor, actuator cap, tank/water
   state, and the relay logic + GPIO levels (`relay_logic=ACTIVE_LOW ... pump_gpio13=...`) to
   compare with your physical relay module.
5. Optional: `l` changes the runtime actuator cap (hard bounds **5–600 s**, default 120 s, stored
   in NVS). Enter a number and press Enter.

---

## 5. ESP32-CAM commissioning

After boot/reset the CAM waits **15 seconds** for a serial key; if you send one it stays in
diagnostic mode (no deep sleep), otherwise it runs its scheduled pass and deep-sleeps.

| Key | Command | Usage |
|---|---|---|
| `s` | Send photo now | GET `/config`, take one photo, POST `/core/photo` via the scheduled path; prints HTTP status + body, then the next events |
| `c` | Scan now (test) | GET `/config`; if `scan_session_active=false` it prints `[scan] cloud session not active - scan would be rejected` and **aborts with no uploads**; if true it runs the sweep (`/yolo-scan` then `/yolo-scan/done`) |
| `i` / `t` | Status | Last/next events, `scan_session_active` as last seen, flash mode, free heap/PSRAM |
| `h` | Help | Lists all commands |
| `w` / `n` / `g` | Wi-Fi / NTP / get config | Diagnostics |
| `b` / `d` / `f` / `r` | Battery / scan-done test / flash torch / reboot | Diagnostics |

Outside the window the CAM deep-sleeps; press **reset** and a key to re-enter diagnostics.

---

## 6. Live test recipe

1. **WROOM `s`** (one full telemetry cycle): expect `[config] ok ...`, then
   `[http] awaiting decision (timeout 300 s)...`, `[decision] HTTP 200, N bytes...` and explicit
   `[actuate] water:` / `[actuate] heater:` verdicts — `RUNNING` when actuation is allowed,
   `SIMULATED - dry_run blocks...` with `dry_run_mode=TRUE`, `BLOCKED because tank is empty` etc.
   The decision POST can take up to ~2–4 minutes (LLM chain); the firmware waits up to 300 s.
2. **CAM `s`**: GET `/config` → photo POST `/core/photo` → HTTP status + body; the analysis runs
   **asynchronously** after the immediate 200. Check Google Drive for the photo and the `Events`
   row (`event_id` = `cam-<YYYYMMDD>`) with the analysis fields.
3. **CAM `c`** (scan test): first open a session (set `scan_session_active=true` in `SystemConfig`,
   or wait for the Monday schedule). Then send `c`: expect `[scan] cloud session ACTIVE - running
   the sweep now`, the upload status/body, `/yolo-scan/done`, and a new `DiseaseScans` row.
   With the session closed, `c` aborts with no uploads — that is the intended gate.
4. **`l`** on the WROOM: change the actuator cap (e.g. `30`) and confirm the printed new value;
   it survives reboots.
5. **Guardrail behavior to expect:** tank empty → pump blocked/refused; `dry_run_mode=TRUE` → no
   GPIO at all; heater refuses to start ≥ 39.5 °C and cuts at 40.0 °C; every actuation is capped by
   the decision cap and the runtime cap.

**Serial Monitor settings that matter:** **115200 baud** and **"No line ending"**. With a newline
appended, the `t` confirmation prompt reads the newline instead of `y` and aborts.

---

## 7. Expected timings

- Decision POST (`/core/sensor`): up to **~2–4 minutes** (LLM agents); firmware timeout 300 s,
  single attempt, no retry storm.
- Daily photo (`/core/photo`): webhook answers immediately (`{"status":"received"}`); analysis
  continues asynchronously.
- Scan: the sweep uploads one photo to `/yolo-scan`, then `/yolo-scan/done` closes the session;
  Vision → YOLO → Judge → `DiseaseScans` runs afterwards. Verdict notifications are informational
  and never block the next cycle.
