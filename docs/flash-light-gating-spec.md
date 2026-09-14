# Flash Light Gating — Design Spec

Status: approved | Date: 2026-09-14 | Touches: n8n workflow (Branch A + E), esp32cam firmware, SystemConfig

## Problem

The ESP32-CAM flash LED fired during every capture regardless of torch state (firmware bug),
causing purple/white-blown photos. Root-cause fix plus a real feature: the flash should only
fire when the room is **actually dark** — measured, not assumed. Sun times alone are
insufficient (closed blinds, grow lights, weather).

## Key decision

Darkness is decided from the **LDR on the ESP32-WROOM** (`lightlevel` in every `coresensor`
payload). The daily photo always runs right after the sensor payload (plan flow order), so
n8n holds a light reading that is seconds-to-minutes old when the CAM wakes. The CAM never
touches Google Sheets — it reads config exclusively via the n8n **Device Config webhook**
(`GET config`), same as it already does for sun times.

## Data flow

```
WROOM (LDR) --coresens or POST--> n8n Branch A --upsert--> SystemConfig.last_lightlevel
                                                              |
ESP32-CAM --GET config--> n8n Branch E --reads---------------+
          <-- JSON { last_lightlevel, flash_dark_threshold, sun times, ... }
          |
          isDark = last_lightlevel < flash_dark_threshold  --> flash ON/OFF for this shot
```

## SystemConfig keys (user seeds manually)

| Key                   | Initial value | Written by | Notes |
|-----------------------|---------------|------------|-------|
| `last_lightlevel`     | (empty)       | Branch A, every sensor event | Raw LDR value, 0-4095 scale |
| `flash_dark_threshold`| 500           | User-tunable in sheet | Starting guess; calibrate by observing `last_lightlevel` over a few days |

## n8n changes

1. **Build Config Updates** (Branch A Code node): add unconditional upsert
   `Key=last_lightlevel`, `Value=String(lightlevel)`, `LastUpdated=now`.
2. **Device Config webhook response** (Branch E, `GET config`): add
   `last_lightlevel` (number), `flash_dark_threshold` (number). Existing response
   fields (`nextsunriseutc`, `nextsunsetutc`, `dryrunmode`, location) unchanged.
3. Workflow stays INACTIVE during edits; export + commit after verification.

## Firmware changes (esp32cam/esp32cam.ino)

1. **Bug fix**: gate the flash GPIO in the capture path. Flash is OFF during capture
   unless explicitly armed for that shot. Torch toggle (`f`) unaffected; an auto-armed
   flash turns off right after capture.
2. **Decision logic** on wake, before capture:
   - `GET config` (with timeout).
   - If `last_lightlevel` present and fresh: `isDark = last_lightlevel < flash_dark_threshold`.
   - Else fall back to sun times: `isDark = (now < nextsunriseutc) || (now > nextsunsetutc)`.
   - Else (config fetch failed): flash ON — a flash-lit photo beats a black one.
3. **WB follows flash**: flash armed → `set_wb_mode(1)` (sunny, tuned for the white LED);
   ambient shot → `set_wb_mode(0)` (auto). AE level stays -2, UXGA, JPEG quality 10,
   30-frame warmup (from commit 49645be) unchanged.
4. **Logging**: one serial line per capture, e.g.
   `light=180 (age 42s) threshold=500 -> flash ON` — must show which branch decided
   (sensor / suntimes / fallback).

## Test plan

1. Seed the two SystemConfig rows.
2. Trigger a `coresensor` test event (or wait for one) → check `last_lightlevel` updates.
3. Room bright → `p` on CAM → serial says `flash OFF`, photo neutral colors.
4. Lights off / blinds closed (or cover the LDR before the sensor event) → `p` →
   serial says `flash ON`, photo lit, no purple cast.
5. Unplug Wi-Fi / bad URL once → serial shows fallback branch, flash ON, photo usable.

## Known limitations

- LDR sits at the pot, not at the camera — usually the same room light, documented caveat.
- `flash_dark_threshold` starts as a guess (500); tune after observing real values.
- Photo-at-solar-noon scheduling (better light, decoupled from the sensor event) is a
  future WROOM-side change, deliberately out of scope here.
