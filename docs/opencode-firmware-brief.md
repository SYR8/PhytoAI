# OpenCode Brief — PhytoAI Smart Pot: ESP32 WROOM Firmware

New task, separate from the n8n documentation work. Write the firmware for the ESP32 WROOM that reads all sensors, talks to the n8n webhooks, and drives the pump/heater relays under local safety rules. Start with a hardware test/calibration sketch (Deliverable 1), then the production firmware (Deliverable 2).

## 1. Hardware architecture (confirmed, as physically wired)

- ESP32 WROOM (DEVKIT V1 style, 30-pin) on a 30-pin expansion board
- Expansion board voltage jumper = **V5** → every `V` pin on D-headers supplies 5V
- Separate 8-pin power header provides 3.3V pins (used for HX711 VCC and DS18B20 bus power + pull-up)
- External 5V PSU feeds the expansion board power input; board distributes 5V / 3.3V / GND
- ALL sensors terminate on expansion-board D-headers; ALL loads terminate on relay screw terminals; no loose splices

## 2. Confirmed pin map (do not change)

| Device | Header/Pins | Wiring |
|---|---|---|
| DHT22 (air temp/humidity) | D14 | V→D14 V, G→D14 G, DATA→D14 S |
| 2x DS18B20 (soil + water temp) | D4 (shared 1-Wire bus) | Both DATA joined → D4 S; both GND → D4 G; both VCC → 3.3V; ONE 4.7 kΩ pull-up DATA→3.3V |
| XKC-Y25 water level sensor | D27 | Brown→D27 V (5V), Blue→D27 G, Yellow→D27 S |
| Photosensitive module | D25 | VCC→D25 V, GND→D25 G, DO→D25 S |
| Capacitive soil moisture V1.2 | D34 | Red→D34 V (5V), Black→D34 G, Yellow/AOUT→D34 S |
| HX711 amplifier | D26 + D33 | DT→D26 S, SCK→D33 S, GND→D26 G, VCC→3V pin on 8-pin power header |
| 4-channel relay module | D13 | VCC→D13 V (5V), GND→D13 G, IN1→D13 S |

Load cell → HX711: Red→E+, Black→E−, White→A−, Green→A+. B+/B− unused.

```cpp
#define PIN_DHT22        14   // DHT22 type
#define PIN_ONEWIRE       4   // 2x DS18B20 shared bus, 4.7k pull-up to 3.3V
#define PIN_XKC_LEVEL    27   // digital input
#define PIN_LIGHT_DO     25   // digital input
#define PIN_SOIL_ADC     34   // ADC1_CH6 input-only — MUST be ADC1 (ADC2 conflicts with WiFi)
#define PIN_HX711_DT     26
#define PIN_HX711_SCK    33
#define PIN_RELAY_PUMP   13   // relay CH1
// PIN_RELAY_HEATER: NOT ASSIGNED — heater hardware has not arrived.
// Design firmware so the heater GPIO is a single config constant; leave heater code
// compiled but inert until the pin is assigned.
```

## 3. Pump specs (from product listing — no flow rate stated)

Compact 3V–5V DC mini submersible pump, silent, USB-compatible, water+land use, with matching pipe. The listing gives **no flow rate**, so flow MUST be measured, not assumed: Deliverable 1 must include a pump-flow calibration that runs the pump exactly 10 s and computes ml/s from the load-cell weight gain (1 g ≈ 1 ml). Store result as `PUMP_FLOW_ML_PER_SEC`.

## 4. Unknown hardware constants the test sketch must discover

1. `TANK_EMPTY_LEVEL` — XKC polarity (HIGH or LOW when tank empty). Print raw GPIO27 while sensor touched to/removed from water; user sets the constant.
2. `RELAY_ACTIVE_LOW` — most 5V relay boards are active-LOW; verify with a 2 s pulse test; single constant to flip.
3. `HX711_SCALE_FACTOR` — from known-weight calibration (tare → place known grams → factor = raw/grams).
4. `SOIL_ADC_DRY` / `SOIL_ADC_WET` — raw analogRead(34) in dry air vs. submerged; map to 0–100 %.
5. DS18B20 addresses — scan the bus, user warms one probe to identify it, then hard-code `soilTempAddress` and `waterTempAddress`; ALWAYS read by address, never index.
6. `PUMP_FLOW_ML_PER_SEC` — via §3 calibration.

All six must be printed clearly by the test sketch so the user can copy them into the production firmware config block.

## 5. Deliverable 1 — hardware test/calibration sketch

Serial-menu-driven (115200 baud), nothing actuates without an explicit command:
- `r` read all sensors once; `l` loop readings every 2 s until keypress
- `a` scan DS18B20 bus: count, addresses (hex), live temps; guide the warm-probe identification
- `t` tare scale; `w` interactive known-weight calibration → prints HX711_SCALE_FACTOR
- `p` pump pulse 2 s, blocked when tankEmpty() true
- `c` pump flow calibration: tare → pump 10 s → settle 3 s → weigh delta → print ml/s (requires prior 'w')
- Boot with pump forced OFF before anything else

Libraries: Adafruit DHT, OneWire, DallasTemperature, bogde HX711. Use `analogSetAttenuation(ADC_11db)` for GPIO34.

## 6. Deliverable 2 — production firmware

### n8n webhook contracts (match exactly)
Base URL is CONFIG, never hardcoded: `<base>/webhook/<path>` (test: `/webhook-test/<path>`).

POST coresensor (synchronous decision) — request:
```json
{
  "deviceid": "esp32-wroom-01",
  "eventid": "sunrise-2026-09-12",
  "eventtype": "sunrise",
  "capturedatutc": "2026-09-12T04:12:00Z",
  "moisturepercent": 42.5, "weightgrams": 812.3,
  "airtempc": 21.4, "airhumiditypercent": 58.2,
  "soiltempc": 19.8, "watertempc": 18.1,
  "lightlevel": 640, "tankempty": false
}
```
Response (tolerate ≥120 s HTTP timeout — AI latency):
```json
{
  "eventid": "...", "needswatering": true, "waterdurationseconds": 12,
  "heateron": true, "temperaturetolerancec": 2.5, "maxheaterseconds": 600,
  "waterwarmerthansoilaction": "proceed", "speciesguess": "...",
  "ainotes": "...", "recheckhours": null, "dryrun": true
}
```

GET config → `{ nextsunriseutc, nextsunsetutc, dryrunmode, potlatitude, potlongitude }`. Wake ~10 min before next sun event; NTP sync on wake; all timestamps UTC ISO-8601. If `recheckhours` is set in a response, schedule a sooner re-poll.

### Local safety rules (never server-overridden)
1. Never pump when XKC reports tank empty — checked locally AND server enforces.
2. Heater hard cap 600 s per session, always (local cap even if server says more).
3. Minimum re-water interval 6 h (default; overridable only downward-in-time by config value).
4. Water warmer than soil beyond `temperaturetolerancec` → defer unless response says "proceed".
5. Reject DS18B20 fault values (-127.0 and 85.0 °C); mark reading invalid, never act on it.
6. `dryrun: true` in response → zero actuation, log only.
7. Record `WateringAborted` (reason) and `FinalWaterTempC` (water temp immediately before watering) per event.

### Event fields (Google Sheets Events columns the data must map to)
EventID, Timestamp, EventType, MoisturePercent, SoilTempC, WaterTempC, AirTempC, AirHumidityPercent, WeightGrams, LightLevel, TankEmpty, WateringTriggered, WaterDurationSeconds, HeaterUsed, HeaterDurationSeconds, SpeciesGuess, SpeciesConfidence, PhotoFileID, AnomalyDetected, AnomalyDescription, AI_Notes, ReasoningSummary, WateringAborted, FinalWaterTempC

## 7. Out of scope here

ESP32-CAM firmware (daily photo POST corephoto, weekly scan POST yolo-scan, battery percent, capture button) is a SEPARATE device and task — do not build it now. No servos exist in this system.

## 8. Verification

- Deliverable 1 compiles for "ESP32 Dev Module" and its six discovered constants are printable/copyable.
- Deliverable 2 dry-run tested against `/webhook-test/coresensor` with `dryrun: true` before any live run.
- Tank-empty path demonstrated: with XKC reporting empty, pump cannot run even if response says water.

**Owner-verified test status (2026-09-14):**
- **Deliverable 1** (`firmware/wroom_calibration/wroom_calibration.ino`) — **Part 1 (upload) DONE:** flashed to the ESP32-WROOM; board boots, sketch runs, Wi-Fi/serial output works. **Part 2 (sensor-by-sensor verification) PARTIAL:** sensors not depending on missing hardware were read and returned values; **HX711 load cell NOT tested** (blocked — waiting on 2 extra screws for the scale mount; `HX711_SCALE_FACTOR` stays provisional `305.070f`); **water-heater path NOT tested** (heater module not delivered — `heater_on` / `max_heater_seconds=600` validated only in dry-run). Results were reported back but the set is **INCOMPLETE** (scale + heater rows open).
- **ESP32-CAM** (`firmware/esp32cam/esp32cam.ino`) — test sketch written and bench-tested **DONE**: camera init, Wi-Fi connect, webhook upload path verified.
- Outstanding: (1) re-run the WROOM sensor test for the HX711 when the screws arrive and replace the provisional scale factor; (2) test heater wiring/relay when the module arrives and verify the 600 s cutoff + water-temp readings; (3) attach both results to the same result sheet so the sensor test is fully DONE before production firmware is written.
