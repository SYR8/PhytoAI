# OpenCode Brief — WROOM Production Firmware (Part A, respec'd 2026-09-15)

**Scope:** `firmware/wroom_production/wroom_production.ino` only. Re-specified against the **audited
architecture** (`docs/cross-audit-2026-09-15.md`): the WROOM is a WiFi/HTTP device — **no serial/M5 layer
exists anywhere** (live n8n and repo both confirmed). n8n is the only command source, and it answers the
WROOM's own request; the ESP32-CAM never commands the WROOM.

**Ground truth:**
- `docs/hw-bench-2026-09-15.md` — bench constants (commit `a68b1f9`) + pin-map errata added 2026-09-15.
- `docs/cross-audit-2026-09-15.md` — contracts, findings M1–M9; `fix: audit M1-M6 resolutions` (`63274c9`).
- `workflows/phytoai.json` — authoritative export (live-verified identical, 168 nodes).

## 1. Hardware / pin map (bench-verified; owner-corrected 2026-09-15)

| Signal | GPIO | Notes |
|---|---|---|
| PIN_PUMP | 13 | relay CH1, **ACTIVE LOW** |
| PIN_HEATER | 16 | relay CH2, **ACTIVE LOW** |
| PIN_HX711_DT / PIN_HX711_SCK | 26 / 33 | 1 kg load cell |
| PIN_ONEWIRE | 4 | both DS18B20 (4.7 k pull-up) |
| PIN_SOIL_ADC | 34 | capacitive soil, ADC1 |
| PIN_TANK | 27 | XKC-Y25; **LOW = tank empty** (owner-confirmed) |
| PIN_DHT22 | 14 | air temp + humidity |
| PIN_LDR | 25 | light level (flash gating needs ambient-light state); **read digitally** — the bench sketch reads the module DO, so `light_level` is 0/1, not the 0–4095 analog range assumed by `docs/flash-light-gating-spec.md` (GPIO25 is ADC2, unusable with WiFi). Flagged as an open hardware item, not silently "fixed". |
| PIN_LED | 2 | status blink |

**Audit finding M9:** the earlier doc pin map (pump 4 / HX711 5,25 / OneWire 13 / soil 26) was stale and
would have driven the OneWire bus as a pump output. Bench-verified map above is authoritative; DHT22 + LDR
are retained (both are required by the `/core/sensor` contract and `docs/flash-light-gating-spec.md`).

## 2. Baked constants (from the bench run)

```cpp
float    HX711_SCALE_FACTOR   = 1068.335f;                       // 'w' calibration 2026-09-15
const int SOIL_ADC_DRY = 4095, SOIL_ADC_WET = 1964;              // map() -> 0..100 %, clamped
uint8_t waterTempAddress[8] = {0x28,0x94,0x6B,0xCB,0x00,0x00,0x00,0xBF};  // water DS18B20
uint8_t soilTempAddress[8]  = {0x28,0x83,0xFC,0xC8,0x00,0x00,0x00,0x0F};  // soil DS18B20
const float PUMP_FLOW_ML_PER_SEC = 9.706f;                       // flow (one repeat run pending; pre-flight)
```

Hardware safety limits (compile-time, never parameters/serial/OTA):
```cpp
const float    HEATER_CUTOFF_C    = 40.0f;    // continuous cutoff while ON
const float    HEATER_REFUSE_C    = 39.5f;    // refuse to start at/above
const uint32_t ACTUATOR_CAP_S     = 120;      // pump and heater hard cap per pulse (firmware)
const uint32_t WDT_TIMEOUT_S      = 8;        // task watchdog
```
The 28 °C `max_water_temp_c` from SystemConfig/decision is the **policy** limit (n8n Safety Guardrails); the
40.0 °C hardware ceiling above is the last-resort cutoff and is independent of policy.

## 3. Secrets (not committed)

WiFi credentials + tunnel base URL via a **gitignored `secrets.h`** (`SECRET_WIFI_SSID`,
`SECRET_WIFI_PASSWORD`, `SECRET_BASE_URL`, `SECRET_WEBHOOK_PREFIX`), same pattern as
`firmware/esp32cam/`: local `secrets.h` preferred, else `../esp32cam/secrets.h`; placeholder defaults keep
it compiling. Default prefix `/webhook-test` (editor test mode); switch to `/webhook` only after the
workflow is activated (production URLs 404 while inactive).

## 4. Contracts (evidence: `workflows/phytoai.json`)

### 4.1 POST `/webhook/core/sensor` (WROOM → n8n, synchronous decision)
Request body = exactly the fields consumed by `Normalize Sensor Payload` (L3364):
`device_id, event_id, event_type, captured_at_utc, moisture_percent, weight_grams, air_temp_c,
air_humidity_percent, soil_temp_c, water_temp_c, light_level, tank_empty` (types per the assignment
expressions; `tank_empty` boolean).

Response = the executable decision, built by `Build Decision Response` (L327) and returned by
`Respond Decision` (L1608, `responseBody: {{ $json }}`). **12 fields** — the 11 original fields plus
`max_pump_seconds` added by M2 (`workflows/phytoai.json` L405-406):

```json
{
  "event_id": "wroom-<epoch>",
  "needs_watering": false,
  "water_duration_seconds": 0,
  "heater_on": false,
  "temperature_tolerance_c": 2,
  "max_heater_seconds": 600,
  "water_warmer_than_soil_action": "proceed",
  "species_guess": "...",
  "ai_notes": "...",
  "dry_run": true,
  "recheck_hours": 6,
  "max_pump_seconds": 60
}
```

### 4.2 GET `/webhook/config` (context; `Device Config` L4606 → `Build Config Response` L4646)
`next_sunrise_utc, next_sunset_utc, preheat_margin_c, preheat_lead_minutes` (L4654), `dry_run_mode,
pot_latitude, pot_longitude, last_lightlevel, flash_dark_threshold, last_lightlevel_utc`.
(Preheat keys were added by M3; `current_cycle_week` was removed by M5.)

## 5. Behavior

1. **Boot:** relays to OFF level **first**; Serial 115200; LED boot pattern; WiFi (3×20 s); NTP UTC
   (2×15 s); HX711 `begin` → `tare(10)` → `set_scale`; DS18B20 scan by address; safe soil init
   (see §7); task WDT (8 s).
2. **Config fetch:** `GET /webhook/config` (8 s timeout). If it fails: use conservative compiled defaults
   **and force dry-run behavior** for the cycle; retry in 15 min.
3. **Sampling:** every 2 s locally (DHT22, both DS18B20, HX711 average, soil ADC, tank, LDR); one
   human-readable serial line per sample. No `TX`/M5 framing — that envelope is dead.
4. **Schedule:** next event = earliest valid `next_sunrise_utc`/`next_sunset_utc` after now; POST at
   event − `preheat_lead_minutes` (default 25) so the council can preheat in time. No valid times →
   fallback: POST every 12 h. Re-fetch `/config` after each cycle.
5. **POST + parse:** HTTPS POST with retries (3×, 5 s backoff, 15 s timeout); parse the 12-field JSON;
   reject (no actuation) on timeout, non-200, malformed JSON, or missing/invalid `needs_watering`.
6. **Execute decision** (heater first, then pump):
   - pump: `min(water_duration_seconds, max_pump_seconds, 120 s)` — never when `tank_empty` or soil invalid
   - heater: `min(max_heater_seconds, 120 s)` — refuse start when water probe unreadable or ≥ 39.5 °C;
     continuous cutoff at ≥ 40.0 °C; WDT petted inside both windows
   - LED: fast blink while pump ON, slow blink while heater ON
7. **dry-run:** `dry_run_mode` from config **or** decision `dry_run` gates **all** GPIO actuation; timing is
   simulated and the completion log includes `"simulated":true`. There is no ack endpoint in the decision
   schema (checked) → completion is **log-only**.
8. **Failure policy:** POST/timeout/invalid decision ⇒ no actuation that cycle (retry next schedule);
   sensor read failure ⇒ fields emitted as null/invalid and **never actuate on unknown soil/tank/water**.
9. **Out of scope v1:** OTA (noted as future in the header), deep sleep, MQTT, capture button.

## 7. Reuse from `wroom_calibration.ino`

Relay helpers (`relayOnLevel/relayOffLevel`), tank read, DS18B20-by-address, HX711 boot-offset
(`begin` → `tare(10)` → `set_scale`) are reused. **Note:** `rampSoilSafeInit()` referenced in the earlier
brief does **not exist** in the calibration sketch (grep: 0 hits); production implements the documented
equivalent `soilInitSafe()` — settle reads, median of 15, range sanity (never actuate on stuck/rail ADC).

## 8. Compile deps (installed locally, ESP32 core 3.3.11)

| Library | Version | Note |
|---|---|---|
| esp32 core | 3.3.11 | `esp32:esp32:esp32`; TWDT API v3 used |
| ArduinoJson | **7.4.2 (major 7 pinned)** | decision parse + telemetry build |
| HX711 Arduino Library | 0.7.5 | load cell |
| OneWire | 2.3.8 | DS18B20 bus |
| DallasTemperature | 4.0.6 | water/soil probes |
| DHT sensor library | 1.4.7 | + Adafruit Unified Sensor 1.1.15 |

Build: `arduino-cli compile --fqbn esp32:esp32:esp32 firmware/wroom_production` (size reported after
compile; compile-verified only — no hardware claim).
