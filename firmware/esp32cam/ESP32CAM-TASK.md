# ESP32-CAM Bench-Test Firmware — Task Spec

Status: TASK (not yet implemented) — opencode implements exactly this file.

## Goal

Create `firmware/esp32cam/esp32cam.ino` — a serial-menu bench-test sketch for the ESP32-CAM, same style as `firmware/wroom_calibration` (serial command menu, all constants in one config block at top).

## Hardware setup

- AI Thinker ESP32-CAM with OV2640, seated in an ESP32-CAM expansion/motherboard with built-in USB-to-serial (USB-C port).
- Programming over the expansion board's USB directly — NO external FTDI adapter, NO manual IO0-to-GND jumper.
- Header comment: if auto-download fails, hold the IO0 button on the expansion board while pressing RST, then flash.
- Standard AI Thinker ESP32-CAM pin definitions.
- Production: standalone on battery — NO electrical connection to the WROOM board. They meet only in the cloud (n8n).

## Architecture context (docs/Plan.md, README.md)

The CAM is a static battery-powered unit in a charging dock at the pot edge. It never moves autonomously (no servos, no pan/tilt). It talks ONLY to the n8n workflow over Wi-Fi via HTTPS POST, multipart/form-data JPEG.

## Webhook contracts (must match workflows/phytoai.json exactly)

1. `POST {BASE_URL}/core/photo` — daily photo, fire-and-forget.
   multipart JPEG + fields: `device_id`, `event_id`, `event_type`, `captured_at_utc`, `battery_percent`
2. `POST {BASE_URL}/yolo-scan` — weekly scan photo (legacy path name, keep it).
   multipart JPEG + fields: `device_id`, `captured_at_utc`, `battery_percent`.
   Response JSON: `status` ok / no_active_session + judge verdict — print to serial.
3. `POST {BASE_URL}/yolo-scan/done` — body: `device_id`, `photos_uploaded`, `started_at_utc`, `ended_at_utc`
4. `GET {BASE_URL}/config` — returns `next_sunrise_utc`, `next_sunset_utc`, `dry_run_mode`, `pot_latitude`, `pot_longitude`

## Rules

- `BASE_URL`, `WIFI_SSID`, `WIFI_PASSWORD`, `DEVICE_ID` (`"esp32-cam-01"`) are config constants at top, never hardcoded mid-code. BASE_URL stays config (Cloudflare tunnel URLs can change).
- `battery_percent`: two-resistor voltage divider to GPIO33 (ADC1 — ADC2 conflicts with Wi-Fi). Resistor values TBD hardware — `readBatteryPercent()` gets clearly marked calibration constants + TODO (calibrate against multimeter).
- Manual capture button: GPIO TBD — pick a free, boot-safe GPIO (avoid boot-strap pins), constant + TODO note, simple debounce in code.
- Flash LED (GPIO4): blink once on successful capture+upload as user feedback.

## Serial menu (staged bench test)

| Key | Action |
|-----|--------|
| `h` | health check: camera init test, frame capture test, print frame size — works with NO Wi-Fi |
| `w` | connect Wi-Fi, print IP + RSSI |
| `b` | battery ADC raw + computed percent, 5 samples |
| `p` | capture one photo, POST /core/photo (needs BASE_URL) |
| `s` | capture + POST /yolo-scan, print JSON response |
| `d` | POST /yolo-scandone test |
| `c` | GET /config, print response |

Each command prints clear serial output of what happened and any error. Reuse the clean line-based serial input handling from wroom_calibration.

## Explicitly out of scope (for now)

- Deep sleep / power management (production design, later stage)
- OTA updates
- Real battery divider values (hardware TODO)

## Commit

`feat: ESP32-CAM bench-test firmware (staged serial menu)` — then push.
