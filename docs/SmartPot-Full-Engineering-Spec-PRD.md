# Smart Pot — Full Engineering Specification (A to Z)

**Document purpose:** This file is written for an autonomous coding/build agent (or a human engineer) that needs to design, wire, program, and automate the Smart Pot project from zero, with no prior context. It covers hardware wiring, firmware behavior, and the full n8n cloud automation layer. Nothing about the competition this project is for is included — this is a pure engineering spec.

**How to use this document:** Read top to bottom. Sections are ordered hardware → firmware → cloud automation → data schema → open decisions. Wherever a design choice was not yet made by the project owner, it is explicitly marked `[OPEN DECISION]` — the agent should either ask the user or make a reasonable engineering choice and document it, never silently assume.

**A note on how prescriptive this document is (read this first):** This spec is deliberately written at two different levels of strictness, and the building agent should notice the difference:

- **Hard facts and constraints** (hardware inventory, wiring, GPIO pin assignments, safety lockouts, database fields that must exist) are stated as requirements to follow exactly. These are not creative-judgment areas — getting them "creatively different" just means a bug or a safety risk, not an improvement.
- **Reasoning and implementation logic** (how the AI decides watering amounts, how exactly a workflow is internally structured, what the AI prompt should say, how many historical rows to pull) are stated as **objectives the system must achieve**, not as copy-paste recipes. Where this document describes an example workflow with numbered steps, treat the numbered steps as "this is one reasonable way to satisfy the requirement," not as the only acceptable implementation. The building agent should feel free to design a better concrete solution, as long as the underlying requirement is still met. Wherever this applies, it is called out explicitly.

---

## 1. System Overview

The Smart Pot is an autonomous, AI-driven plant care device. It has two independent compute units:

1. **ESP32 WROOM** (the "body") — reads all physical sensors, controls the water pump, controls the water heater, and drives the three servo motors. This is the decision-executor: it does NOT make AI decisions locally, it just reports data and executes commands it receives back from the cloud.
2. **ESP32-CAM** (the "eye") — a separate, independently powered microcontroller with a camera. It captures images on two different schedules (a daily quick-check photo, and a weekly disease-scanning sequence) and uploads them to the cloud brain (n8n) for AI analysis.

Both devices talk to a central automation brain running on **n8n**, which is where all the "thinking" happens: interpreting sensor values, deciding whether to water, deciding whether to heat the water first, identifying the plant species from photos, running YOLO-based disease detection, and sending Telegram notifications. Nothing is hardcoded on the ESP32 side as a fixed threshold — the AI in n8n reasons dynamically using historical data stored in Google Sheets.

Two operating rhythms exist in this project simultaneously:

- **Daily rhythm** (every sunrise and every sunset): watering check, temperature harmonization, quick anomaly photo, species identification, light-level logging.
- **Weekly rhythm** (alternating every week, in a repeating 2-week cycle): one week the camera *maps* the plant's branch structure using a mapping YOLO model and the servos; the next week the camera *scans* the plant for disease using a second YOLO model, following the previously recorded map. Then the cycle repeats (map, scan, map, scan...).

A critical, non-negotiable requirement that runs through this entire system: **the watering decision must never be made from a single instant snapshot of sensor data alone.** Every watering decision must be informed by (a) the plant's watering history, (b) how long it has been since the last watering, and (c) what is known about this specific plant's species and its needs. This requirement is detailed fully in Section 15 and must be reflected concretely in the workflow described in Section 11.1 — not just stated as a principle.

---

## 2. Full Hardware Inventory

This is the confirmed, real hardware list already owned for this build:

| # | Component | Quantity | Role in the system |
|---|---|---|---|
| 1 | ESP32 WROOM (dev board) | 1 | Main controller — sensors, pump, heater, servos |
| 2 | ESP32 30-Pin Expansion Board | 1 | Screw-terminal breakout for the WROOM board, makes wiring sensors/actuators easier and more secure than jumper wires |
| 3 | ESP32-CAM (AI-Thinker style module) | 1 | Vision unit — daily photos + weekly YOLO scans |
| 4 | ESP32 Expansion Board (16 headers + 16 extra) | 1 | Secondary breakout board — used for the ESP32-CAM's wiring since the CAM module itself has very few exposed pins |
| 5 | USB 3.1 Type-C Socket | 1 | Panel-mount power input jack for the DC power brick |
| 6 | 5V 4-Channel Relay Module | 1 | Switches high-current/AC-adjacent loads: pump and heater, with 2 channels spare |
| 7 | DHT22 Sensor Module | 1 | Ambient air temperature + humidity |
| 8 | DC 3V Small Submersible Water Pump | 1 | Moves water from tank to plant |
| 9 | Capacitive Soil Moisture Sensor Module | 1 | Measures soil water content (analog output) |
| 10 | 3x SG90 Micro Servo Motor | 3 | 2 drive the ESP32-CAM arm (pan + tilt), 1 drives a GT2 belt that rotates the entire camera arm 360° around the pot rim |
| 11 | 5V 10W USB Aquarium Fish Tank Submersible Heater | 1 | Heats reservoir water before irrigation (heating only — no active cooling exists in this hardware set) |
| 12 | 2x DS18B20 Waterproof Temperature Sensor | 2 | One probe near the plant roots (soil temp), one probe inside the water reservoir (water temp) |
| 13 | 1kg Load Cell + HX711 Amplifier | 1 | Weighs the inner plant basin to detect moisture loss / cross-check the capacitive sensor |
| 14 | Photosensitive Sensor Module (3-pin, photoresistor/LDR, 3.3–5V) | 1 | Measures ambient light level at the pot's location — feeds the AI's light-condition reasoning |
| 15 | XKC-Y25-T12V Non-contact Liquid Level Sensor | 1 | Detects whether the hidden water tank is empty, mounted externally against the tank wall |

### Explicitly NOT in the current hardware (do not assume these exist)

- No EC (nutrient/electrical conductivity) sensor — user has not decided on this yet. `[OPEN DECISION — see Section 18]`
- No battery / boost converter — the system is fully mains-powered through the DC brick, no backup power exists. A power outage means the ESP32 loses all state (mitigate with NTP re-sync and idempotent logic, see Section 8).
- No cooling element (Peltier, fan, etc.) — only a heater exists. If reservoir water is ever *warmer* than the soil/root temperature, the system physically cannot cool it down. This must be handled in software logic, not hardware (see Section 8.3).

---

## 3. Power Architecture

**Confirmed setup:**
- A DC power brick feeds a USB-C socket (panel-mounted, item #5).
- The USB-C socket output goes into the **ESP32 Expansion Board**, which is configured/jumpered to output a regulated 5V rail.
- The ESP32 WROOM is powered from this 5V rail via the expansion board's VIN/5V header.

**Not yet decided / not yet wired:**
- The **ESP32-CAM has no power connection yet**. This must be solved because the ESP32-CAM can draw current spikes up to ~2A during Wi-Fi transmission and flash-LED use, which the WROOM's own regulator is not meant to supply.

**Recommended solution (engineering proposal, since the user asked the agent to decide this):**

Run a **second, independent 5V feed directly from the same DC brick / USB-C junction** to the ESP32-CAM, rather than powering it from the WROOM's expansion board. Concretely:

```
DC Power Brick
      │
      ▼
  USB-C Socket (5V, needs to supply at least 3A total headroom)
      │
      ├────────────► ESP32 30-Pin Expansion Board (5V IN) ──► ESP32 WROOM
      │                                                          │
      │                                                          ├──► Relay Module VCC (5V)
      │                                                          ├──► Servo power rail (5V) — see note below
      │                                                          ├──► HX711 VCC (5V)
      │                                                          ├──► DHT22 VCC (3.3V or 5V per module spec)
      │                                                          ├──► DS18B20 VCC (3.3V, powered from WROOM board)
      │                                                          ├──► Photoresistor Module VCC (3.3V or 5V per module spec)
      │                                                          └──► XKC-Y25-T12V Level Sensor — see power note below
      │
      └────────────► ESP32-CAM Expansion Board (16+16 header board) (5V IN) ──► ESP32-CAM module
```

Both branches must share a **common ground (GND)** — this is non-negotiable. If the WROOM and the CAM do not share ground, all analog readings and communication will be unreliable or fail outright.

**Servo power warning:** Do not power all 3 SG90 servos directly from the ESP32's onboard 5V pin. Servos draw current spikes when moving that can brown out the whole board. Power the servos from the same 5V rail as the relay module (i.e., straight off the expansion board's 5V terminal, not through the ESP32 chip's own regulator), and add a bulk capacitor (e.g., 470–1000µF electrolytic) across the servo 5V/GND rail close to the servos to absorb current spikes.

**XKC-Y25-T12V power note:** Despite the "T12V" naming, most XKC-Y25 variants accept a wide input range (typically 5–12V); however, this must be **verified against the specific datasheet for the T12V variant** before wiring, since running it below its rated minimum voltage may cause unreliable detection. `[OPEN DECISION: confirm whether this exact module accepts 5V, or whether it strictly needs 12V — if it needs a true 12V supply, it cannot share the 5V rail and will need either a small boost converter or a separate 12V tap from the DC brick if the brick supports multiple voltages.]` The sensor's output signal (typically an open-collector or transistor-switched output, HIGH/LOW depending on water presence) is 5V/3.3V-logic-safe on most variants and can go straight into a WROOM GPIO regardless of its own supply voltage — but this too should be checked against the specific datasheet.

**PSU sizing:** The DC brick must be rated for at least 3A at 5V to safely cover: ESP32 WROOM (~250mA), ESP32-CAM (~2A peak), relay module coil currents (~200–300mA under load), 3x SG90 servos (~600mA–1A moving simultaneously worst case), HX711+load cell (negligible), DHT22/DS18B20/photoresistor (negligible), XKC-Y25-T12V (~10–50mA). `[OPEN DECISION: confirm actual DC brick rating — if it is under 3A, the CAM and servos should be power-sequenced instead of run simultaneously, see Section 9]`

---

## 4. GPIO / Pin Assignment — ESP32 WROOM

No pins were previously assigned. The agent should wire and configure the firmware using this proposed map. Pins were chosen to avoid ESP32 strapping pins (GPIO0, 2, 12, 15) and to keep ADC-only inputs (GPIO34–39) reserved for analog sensors.

| Function | GPIO | Notes |
|---|---|---|
| Capacitive soil moisture sensor (analog) | GPIO34 | Input-only ADC1 channel — correct choice for analog read |
| Photoresistor / light sensor (analog) | GPIO35 | Input-only ADC1 channel — reads the 3-pin photoresistor module's analog output; if the specific module only has a digital (threshold) output pin instead of analog, use a digital GPIO instead and note that the AI will only get a binary bright/dark signal rather than a graded light level |
| DS18B20 OneWire bus (both probes) | GPIO4 | Both temperature probes share one OneWire bus; distinguish them in firmware by their unique 64-bit ROM address (read once during setup and hardcode the two addresses in firmware) |
| DHT22 data pin | GPIO27 | Digital, needs a 10kΩ pull-up resistor between VCC and data line if the module doesn't already include one |
| HX711 DT (data) | GPIO32 | Load cell amplifier data line |
| HX711 SCK (clock) | GPIO33 | Load cell amplifier clock line |
| XKC-Y25-T12V liquid level sensor (digital output) | GPIO36 | Input-only ADC1 pin used purely as a digital input here (HIGH/LOW = water present/absent); safe choice since this pin has no internal pull-up/pull-down, so confirm the sensor's output is push-pull (actively drives both HIGH and LOW) rather than open-collector — if open-collector, add an external pull-up resistor (e.g., 10kΩ to 3.3V) |
| Relay Channel 1 — Water Pump | GPIO25 | Active-LOW typical on most 4-channel relay boards — verify polarity before wiring |
| Relay Channel 2 — Water Heater | GPIO26 | Same polarity note as above |
| Relay Channel 3 — Reserved | GPIO14 | Free for future EC sensor circuit power switching |
| Relay Channel 4 — Reserved | GPIO13 | Free for future expansion (e.g., grow light, secondary pump) |
| Servo 1 — Camera arm pan | GPIO18 | PWM-capable pin |
| Servo 2 — Camera arm tilt | GPIO19 | PWM-capable pin |
| Servo 3 — 360° pot rotation (GT2 belt drive) | GPIO23 | PWM-capable pin |
| I2C SDA (reserved) | GPIO21 | Not used yet — reserved for a future RTC module (see Section 17) |
| I2C SCL (reserved) | GPIO22 | Same as above |
| Onboard status LED | GPIO2 | Useful for visual debugging (boot status, error blink codes) |

**Wiring note on DS18B20 sharing one bus:** Both probes (root/soil probe and water-tank probe) connect their data lines together to GPIO4, with a single 4.7kΩ pull-up resistor between GPIO4 and 3.3V. This is standard OneWire practice and avoids needing a second GPIO. The firmware distinguishes "soil probe" from "water probe" purely by which unique hardware address responds — this address must be discovered once (a simple Arduino OneWire address-scanning sketch) and then hardcoded as two named constants (`SOIL_TEMP_ADDR`, `WATER_TEMP_ADDR`).

**Wiring note on the liquid level sensor placement:** Per its non-contact design, the XKC-Y25-T12V should be mounted on the **outside wall of the water tank**, at the height corresponding to the minimum acceptable water level — not inside the water itself.

---

## 5. ESP32-CAM Wiring

The ESP32-CAM module (AI-Thinker-style, as implied by the hardware list) has a fixed, non-negotiable pin layout for its camera interface — those pins cannot be reassigned. What the agent needs to wire manually:

- **Power:** 5V and GND from the independent CAM power branch described in Section 3, landing on the ESP32-CAM's own 16+16 expansion board.
- **GPIO0:** Must be pulled LOW only during firmware flashing (boot mode select), then left floating/HIGH for normal operation. If a physical wiring harness is built, include a simple button or jumper for GPIO0 to make future re-flashing possible without rewiring.
- **Onboard flash LED (GPIO4 on most AI-Thinker boards):** Can be used as a manual "taking photo" indicator but note that GPIO4 on the CAM module is a *different physical chip* from the WROOM's GPIO4 — they are not related despite the same number.
- The ESP32-CAM does **not** communicate with the ESP32 WROOM via direct wiring in this design. Both devices talk to **n8n independently over Wi-Fi/HTTP**. `[OPEN DECISION: this is the recommended design since it mirrors what already works well in the author's other project (a room-monitoring system using the same ESP32-CAM → n8n webhook pattern) — but if tighter real-time coordination is ever needed, a UART link between the two boards could be added later.]`

---

## 6. Servo / Camera Arm Mechanical Wiring

Three SG90 micro servos are used, with two different mechanical jobs:

1. **Servo 1 + Servo 2 — Camera pan/tilt:** Mounted on the 3D-printed arm itself, giving the ESP32-CAM two degrees of freedom (pan and tilt) so it can look at different heights and angles on the plant without moving the whole arm.
2. **Servo 3 — 360° pot rotation:** Mounted inside the pot base, connected to a GT2 timing belt hidden under the rim/ridge of the pot. This belt is connected to the arm assembly itself, so rotating this servo spins the entire camera arm around the full circumference of the pot, letting the camera see every side of the plant, not just one angle.

Combined, these three servos give the camera **three total degrees of freedom**: pan, tilt, and full rotation around the plant. This is exactly what the YOLO mapping/scanning system (Section 10) depends on — the "map" built in week 1 is really a saved list of (pan, tilt, rotation) triplets that successfully framed a branch or leaf.

**Mechanical note:** A full 360° continuous rotation is not natively possible with a standard SG90 (which is a positional servo, ~180° range). `[OPEN DECISION: the agent must either (a) modify/hack the SG90 into a continuous-rotation servo, (b) replace it with a proper continuous-rotation or geared 360° servo/stepper for the belt-drive job, or (c) gear the belt ratio so that the SG90's 180° of rotation maps to a full 360° of pot rotation via a 1:2 pulley ratio. Option (c) is the simplest fix that keeps the existing SG90 hardware.]`

---

## 7. Relay Channel Assignments

| Channel | Load | Behavior |
|---|---|---|
| 1 | DC 3V Submersible Water Pump | Switched ON for a computed duration (in seconds) whenever the AI decides watering is needed, and only if the liquid level sensor confirms the tank is not empty (see Section 18 safety logic) |
| 2 | 5V 10W Aquarium Heater | Switched ON whenever the water temperature is below the soil/root temperature beyond a tolerance the AI defines dynamically (see Section 8.3); switched OFF once temperatures are close enough |
| 3 | Reserved / unused | Free for a future sensor or actuator |
| 4 | Reserved / unused | Free for a future sensor or actuator |

**Important safety detail:** Relay boards typically switch the load's power line, not signal — verify with a multimeter whether the specific 4-channel board is active-HIGH or active-LOW before writing firmware. Include flyback diode protection if not already present on the relay board (most pre-built relay modules already include this).

---

## 8. ESP32 WROOM Firmware Behavior Specification

### 8.1 Wake Schedule

The system does not need to run 24/7 at full power. It operates on a **twice-daily schedule**, tied to sunrise and sunset:

- Roughly **10 minutes before sunrise** and **10 minutes before sunset** each day, the ESP32 WROOM wakes up (from deep sleep, if deep sleep is used) and begins the routine described in 8.2.
- Sunrise/sunset times are **not fixed clock times** — they shift daily and by location. `[OPEN DECISION: user must supply the pot's physical location]`. **The n8n-calculates-it approach is recommended** since it keeps the ESP32 firmware simpler and lets the AI/cloud side own all scheduling logic.
- Because there is no RTC module and no battery backup, the ESP32 must **re-sync time via NTP** on every wake-up before trusting any time-based logic.

### 8.2 Sunrise/Sunset Routine (runs identically at both events)

1. **Wake up** ~10 minutes before the scheduled sunrise or sunset time.
2. **Reconnect Wi-Fi and re-sync NTP time.**
3. **Read the soil moisture sensor**, the **photoresistor (ambient light level)**, and the **liquid level sensor** (tank empty/not-empty) — and cross-reference moisture with the load cell weight reading.
4. **Send this sensor data to n8n.** This is the point where the "must not decide from a single snapshot" requirement (Section 1, Section 15) kicks in — n8n's response is not allowed to be based purely on this instant's numbers; it must incorporate history, last-watered time, and species (see Section 11.1 and Section 15 for exactly what this requires).
5. **If the AI says no watering is needed:** skip to step 9 (photo + report), then go back to sleep.
6. **If the AI says watering is needed:**
   a. **First check the liquid level sensor.** If it reports the tank is empty, **do not run the pump** — skip directly to logging an empty-tank alert (Section 18) and go to step 9.
   b. If water is available, read both DS18B20 probes: the one near the roots/soil, and the one in the water reservoir.
   c. Compare the two temperatures. If the water is colder than the soil/root temperature by more than the AI-defined tolerance, **activate the heater relay (Channel 2)** and keep polling the water temperature every few seconds until it is within tolerance of the root temperature.
   d. **If the water is already warmer than the soil** — this must be handled purely in software; the AI/firmware should either (i) proceed anyway if the AI decides the difference is not harmful, or (ii) delay watering until the next scheduled event and log the anomaly. `[OPEN DECISION, left to AI judgment]`.
   e. Once temperatures are matched (or the AI overrides and proceeds anyway), **activate the pump relay (Channel 1)** for the AI-computed duration.
   f. Turn off the heater (if it was on) and the pump once done.
7. **Log the full event** (all sensor readings including light level and tank-empty status, whether watering happened, how long, whether heating was needed and for how long) to Google Sheets (Section 14).
8. **Trigger the ESP32-CAM** to take its quick daily photo (see Section 9.1).
9. **Go back to deep sleep** until the next scheduled event.

### 8.3 Temperature-Matching Logic (Detail)

The firmware's job is only to **report** both temperatures and **execute** heater ON/OFF commands it receives from n8n. The **AI in n8n** should reason about what tolerance is safe *for this specific plant species*, given the season and recent sensor history — not apply one fixed number for every plant and every day. The firmware loops: read water temp → check against the tolerance value n8n sent down → heater on/off → repeat every few seconds → stop once matched or a hard firmware-level safety timeout (recommended: 10 minutes) is reached.

### 8.4 Watering Amount Logic

The firmware does not decide *how much* to water — it only executes a pump run-time (in seconds) that n8n computes and sends back. No fixed formula should be hardcoded anywhere in the firmware. The pump must never be commanded to run if the liquid level sensor reports the tank empty, regardless of what the AI returns — this is a firmware-level hard override (see Section 18).

### 8.5 Species Identification (Daily)

During the **daily quick photo**, the AI vision step should determine the plant's species (or best guess), store it, and reuse it across future decisions (temperature tolerance, moisture expectations, light expectations) — without ever hardcoding species-specific rules in firmware.

---

## 9. ESP32-CAM Firmware Behavior Specification

### 9.1 Daily Quick-Check Photo

At each of the two daily events, the CAM wakes up, connects to Wi-Fi, takes **one photo**, and uploads it to an n8n webhook, alongside a reference to that event's sensor payload. Purpose: (a) a quick visual sanity check, and (b) feeding species identification. `[OPEN DECISION: recommend adding a default home position the servos return to before every daily photo, for visual consistency across days]`.

### 9.2 Weekly YOLO Disease-Scanning Cycle (2-week rotating cycle)

**Week A — "Mapping Week":** the CAM sweeps pan/tilt/rotation to cover the entire visible surface of the plant, running a mapping YOLO model at each position to confirm whether a branch/leaf is clearly in frame. Confirmed positions `(pan, tilt, rotation)` are recorded with a label and stored in `BranchMap`.

**Week B — "Scanning Week":** the CAM revisits every stored `BranchMap` position, takes a photo at each, and runs a disease-detection YOLO model on it (recommended to run in the cloud via n8n rather than on-device, given the ESP32-CAM's limited compute). Results are logged into `DiseaseScans`, and any flagged disease is surfaced in the next Telegram notification.

**Cycle continuation:** after Week B, the next week becomes a new Week A (re-mapping, since the plant will have grown or changed). This repeats indefinitely.

---

## 10. Data Flow — Full Picture

```
ESP32 WROOM ──(HTTP POST, sensor JSON incl. light level + tank level)──► n8n Webhook: "SmartPot-Core"
ESP32-CAM   ──(HTTP POST, multipart image + form fields)──► n8n Webhook: "SmartPot-Core" (daily) 
                                                          or "SmartPot-YOLO-Map" (Week A)
                                                          or "SmartPot-YOLO-Scan" (Week B)

n8n ──(reads)──► Google Sheets: recent Events history, last-watered timestamp, current species + config
n8n ──(AI reasoning: OpenRouter/any LLM+vision model, unspecified by design)──► decision JSON
n8n ──(HTTP response back to ESP32 WROOM)──► pump duration, heater on/off, temp tolerance
n8n ──(writes)──► Google Sheets (event logs, branch map, disease scans, config)
n8n ──(writes)──► Google Drive (all photos, referenced by File ID from Sheets)
n8n ──(sends)──► Telegram (watering summary, anomaly alerts, disease alerts, empty-tank alerts)
```

No AI model is specified anywhere in this design on purpose — every n8n AI node in Section 11 should be built so the model/provider is a swappable credential/parameter, not hardcoded into the workflow logic.

---

## 11. n8n Workflow Specifications

Four workflows are proposed. **Read the note at the top of this document again before implementing this section**: the numbered steps below describe one reasonable way to satisfy each requirement, not a mandatory recipe. The parts that are hard requirements are called out explicitly; everything else is a suggested shape the building agent is free to improve on.

### 11.1 Workflow: `SmartPot-Core` (runs at every sunrise/sunset event)

**Hard requirement for this workflow (not optional, not open to reinterpretation):** before any watering decision is made, the workflow must look up and provide to the AI reasoning step: (1) a window of recent historical events for this plant (not just the current instant's sensor readings), (2) the timestamp of the last time the plant was actually watered and how much time has passed since then, and (3) the plant's current best-known species (or "unknown" if not yet identified) together with whatever species-specific expectations are already known/stored. The AI's watering decision must be conditioned on all three of these, not computed from the live sensor snapshot in isolation. How exactly this lookup is implemented (number of Sheets read nodes, how many past rows to pull, how the prompt is structured) is left to the building agent's judgment — the requirement is the outcome (history-aware, species-aware, time-since-last-watering-aware decisions), not the specific node graph.

One reasonable shape for this workflow:

1. **Webhook node** — receives sensor JSON from ESP32 WROOM (moisture %, weight grams, air temp/humidity, soil temp, water temp, light level, tank-empty boolean, timestamp, event type = sunrise/sunset).
2. **Webhook node (parallel branch)** — receives the daily quick photo from the ESP32-CAM, tagged with the same event timestamp.
3. **Merge node** — joins the sensor data and photo data into one record once both have arrived.
4. **Database lookup step(s)** — before reasoning happens, read from `SystemConfig` the current `SpeciesGuess`, `SpeciesConfidence`, and `last_watered_utc`; and read a recent window (e.g., last 5–10 rows, though the exact number is left to the agent) from the `Events` sheet. Compute (or let the AI compute) the elapsed time since `last_watered_utc`.
5. **AI Agent node (vision + reasoning)** — receives the merged sensor+photo payload **plus** the historical window, last-watered elapsed time, and species context from step 4, and is prompted to return strict JSON containing: `needs_watering` (bool), `water_duration_seconds` (number), `species_guess` (string), `species_confidence` (0–1), `temperature_tolerance_c` (number), `anomaly_detected` (bool), `anomaly_description` (string or null), `ai_notes` (string), and `reasoning_summary` (a short string explaining *why* it made this decision, referencing the history/species/timing it was given — useful for debugging and for verifying the requirement above is actually being honored, not just declared).
6. **JSON parser node** — validates/cleans the AI's JSON output before anything downstream trusts it.
7. **IF node — tank_empty?** — checked first: if the WROOM reported the tank empty, override any AI watering decision to `false`, and route to the empty-tank Telegram alert.
8. **IF node — needs_watering?** — branches to the temperature-check sub-flow if true, or responds `{needs_watering: false}` immediately if false.
9. **Google Drive node** — uploads the daily photo, returns a File ID.
10. **Google Sheets node (append)** — writes one row to `Events`, and updates `last_watered_utc` in `SystemConfig` if watering occurred.
11. **Telegram node** — sends a summary message, only if something is worth reporting.

### 11.2 Workflow: `SmartPot-YOLO-Map` (runs during Week A)

1. **Webhook node** — receives a stream of candidate photos from the ESP32-CAM during its mapping sweep, each tagged with `(pan_angle, tilt_angle, rotation_angle)`.
2. **Mapping YOLO model node** — detects whether something worth remembering is in frame.
3. **IF node — detection confirmed?** — only confirmed positions continue.
4. **Google Drive node** — stores the confirmed reference photo.
5. **Google Sheets node (append)** — writes a row to `BranchMap`.
6. **Telegram node** — sends one summary message at the end of the full sweep.

### 11.3 Workflow: `SmartPot-YOLO-Scan` (runs during Week B)

1. **Webhook node (trigger)** — starts the scan; responds with the full list of stored positions from `BranchMap`.
2. **Webhook node (receiver)** — receives each photo tagged with which `BranchMap` position it corresponds to.
3. **Disease-detection YOLO model node** — runs on each incoming photo.
4. **Google Drive node** — stores each scan photo.
5. **Google Sheets node (append)** — writes a row to `DiseaseScans` per photo.
6. **Aggregate node** — compiles a single end-of-scan summary.
7. **Telegram node** — sends the final scan summary.

### 11.4 Workflow: `SmartPot-Telegram-Setup` (one-time setup helper)

1. Open Telegram, search for **@BotFather**, send `/newbot`, get a **bot token**.
2. Send at least one message to the new bot from the account that should receive notifications.
3. Call `https://api.telegram.org/bot<TOKEN>/getUpdates` to find the numeric **chat ID**.
4. In n8n, create a **Telegram credential** using the bot token.
5. Use that credential in every Telegram node across the three workflows above.

---

## 12. Google Drive Storage Convention

One shared Drive folder for the whole project, with three subfolders: `DailyPhotos/`, `MapPhotos/`, `ScanPhotos/`. Every uploaded photo's Drive File ID is always written into the corresponding Google Sheets row in the same automation run.

---

## 13. Telegram Notification Examples

Illustrative only — the AI's `ai_notes` field should generate the actual wording dynamically:

> 🌱 Sunrise check complete. It's been 3 days since the last watering and soil moisture is trending down faster than usual for this species, so I watered for 12 seconds. Water was 3°C colder than the roots, so I warmed it first.

> ⚠️ Anomaly detected during sunset check: a leaf appears to be drooping more than usual. Based on the last 5 events, moisture has been stable, so this may be a light or temperature issue rather than water — worth a manual look.

> 🚱 Watering skipped: the water tank is empty. Please refill it before the next scheduled check.

> 🔍 Weekly disease scan complete (Scan Week): 14 positions checked, all clear.

> 🐛 Disease scan flagged a possible issue at position "branch 3, lower-left": early signs of leaf spot detected (confidence 0.78).

---

## 14. Google Sheets Database Schema

### Sheet: `Events` (one row per sunrise/sunset event)

| Column | Type | Meaning |
|---|---|---|
| Timestamp | datetime | When the event ran |
| EventType | text | `sunrise` or `sunset` |
| MoisturePercent | number | Soil moisture reading |
| SoilTempC | number | DS18B20 root probe reading |
| WaterTempC | number | DS18B20 water tank probe reading |
| AirTempC | number | DHT22 reading |
| AirHumidityPercent | number | DHT22 reading |
| WeightGrams | number | Load cell reading |
| LightLevel | number | Photoresistor reading |
| TankEmpty | boolean | XKC-Y25-T12V reading |
| WateringTriggered | boolean | Did the pump run? |
| WaterDurationSeconds | number | Pump run-time |
| HeaterUsed | boolean | Was the heater activated? |
| HeaterDurationSeconds | number | Heater run-time |
| SpeciesGuess | text | AI's current best guess |
| SpeciesConfidence | number (0–1) | Confidence of that guess |
| PhotoFileID | text | Drive File ID |
| AnomalyDetected | boolean | Visual anomaly flag |
| AnomalyDescription | text | Free-text explanation |
| AI_Notes | text | Telegram summary text |
| ReasoningSummary | text | Why the AI made this decision — must reference history/species/timing per Section 11.1's hard requirement, useful for auditing that the requirement is actually honored |

### Sheet: `BranchMap` (rebuilt every Mapping Week)

| Column | Type | Meaning |
|---|---|---|
| PositionID | text | Unique ID for this servo position |
| PanAngle | number | Servo 1 angle |
| TiltAngle | number | Servo 2 angle |
| RotationAngle | number | Servo 3 angle |
| Label | text | e.g. "branch 1" |
| CapturedTimestamp | datetime | When recorded |
| ReferencePhotoFileID | text | Drive File ID |
| Active | boolean | Still valid for the next Scan Week? |

### Sheet: `DiseaseScans` (one row per photo during a Scanning Week)

| Column | Type | Meaning |
|---|---|---|
| Timestamp | datetime | When taken |
| PositionID | text | Foreign key to `BranchMap` |
| PhotoFileID | text | Drive File ID |
| DiseaseDetected | boolean | Model output |
| DiseaseType | text | Classification, if any |
| ConfidenceScore | number (0–1) | Model confidence |
| ActionRecommended | text | AI-generated suggestion |

### Sheet: `SystemConfig` (key-value store)

| Column | Type | Meaning |
|---|---|---|
| Key | text | e.g. `last_species_guess`, `species_confidence`, `current_temp_tolerance_c`, `next_sunrise_utc`, `next_sunset_utc`, `current_cycle_week`, `pot_latitude`, `pot_longitude`, `last_tank_empty_alert_sent`, `last_watered_utc` |
| Value | text | The stored value |
| LastUpdated | datetime | Last change |

`last_watered_utc` is a required key — it is what makes the "how long since last watering" part of the hard requirement in Section 11.1 actually possible to compute.

---

## 15. AI Decision-Making Philosophy

No fixed thresholds should be hardcoded anywhere in this system, with the sole exception of the hard safety overrides in Section 18. Every judgment call should be made by the AI reasoning step, using:

1. The current sensor readings.
2. **The historical rows in `Events`, and specifically how long it has been since `last_watered_utc`** — this is a hard requirement (Section 11.1), not a nice-to-have. A decision that only looks at the current instant's moisture reading, ignoring watering history entirely, does not satisfy this spec.
3. **The current best-guess species and its known care characteristics** — also a hard requirement for the same reason. Watering a succulent and a fern to the same rule is exactly the failure mode this system is meant to avoid.

The building agent has full freedom in *how* it structures the prompt, *how many* historical rows it pulls, and *how* it represents species knowledge (e.g., asking the LLM to use its own general plant-care knowledge once a species is identified, rather than maintaining a hardcoded species table) — but it must not skip the requirement that these three inputs feed the decision.

---

## 16. Species Identification Logic

Runs as part of the daily photo analysis, every day. `SpeciesGuess`/`SpeciesConfidence` in `SystemConfig` update on a "most confident guess wins" basis. Once a confident guess exists, it feeds back into watering amount, temperature tolerance, and light-level reasoning (Section 15).

---

## 17. Known Gaps & Open Engineering Decisions

1. **EC (nutrient) sensor** — not decided. Relay Channel 3 (GPIO14) reserved for it; would need an additional ADC pin (e.g., GPIO39).
2. **No cooling element** — see Section 8.3.
3. **No RTC module** — recommend a DS3231 (I2C, GPIO21/22) as a future resilience addition.
4. **Pot and tank physical dimensions** — not yet decided; affects pump calibration and level-sensor mounting height.
5. **3D enclosure design** — not started.
6. **SG90 360° rotation limitation** — see Section 6.
7. **DC brick current rating** — needs confirmation at ≥3A.
8. **XKC-Y25-T12V exact voltage requirement** — needs datasheet confirmation.
9. **Photoresistor module output type** — analog vs. digital, needs confirmation.

---

## 18. Safety Notes

- **Dry-run protection:** the pump must **never** be commanded ON if the XKC-Y25-T12V reports the tank empty — a firmware-level hard override that takes priority over any AI decision, checked locally immediately before executing any pump command.
- **Empty-tank alerting without spam:** use `last_tank_empty_alert_sent` in `SystemConfig` to only alert once every N hours (e.g., 12) rather than every check.
- **Heater safety timeout:** hard-coded firmware-level maximum on-time (recommended: 10 minutes), independent of AI logic.
- **Electrical isolation:** the dry electronics bay must be fully sealed off from the water tank and irrigation path. The XKC-Y25-T12V's non-contact/external-mount design does not compromise this seal.
- **Common ground discipline:** every powered subsystem must share one common ground point back to the DC brick's negative rail.

---

## 19. Build Order / Assembly Checklist

1. Wire the DC brick → USB-C socket → ESP32 Expansion Board 5V rail (already done).
2. Add the second, independent 5V branch to the ESP32-CAM's own expansion board.
3. Confirm the XKC-Y25-T12V's actual voltage requirement before wiring it.
4. Wire and bench-test each sensor individually, including the liquid level sensor against both a full and an empty test container.
5. Wire and bench-test the relay module with pump and heater on a bench.
6. Wire and bench-test the 3 servos, resolve the 360°-rotation mechanical question.
7. Flash a minimal "read all sensors, print to Serial" firmware to the WROOM.
8. Flash a minimal "connect to Wi-Fi, take one photo, POST it to a test webhook" firmware to the ESP32-CAM.
9. Build the four n8n workflows against test/mock data, including a mock `Events` history and mock `last_watered_utc` to verify the history-aware decision logic actually behaves differently depending on that mock data (this is the concrete test for the Section 11.1 hard requirement — if changing the mock history doesn't change the AI's decision, the requirement is not actually implemented).
10. Complete the Telegram bot setup.
11. Do a full end-to-end dry run, including deliberately testing the empty-tank lockout.
12. Only after the full chain is verified, move on to the 3D-printed enclosure and permanent mechanical assembly.

---

## 20. Glossary

- **WROOM:** The main ESP32 development board handling sensors and actuators.
- **CAM:** The ESP32-CAM module handling all photography and vision tasks.
- **Mapping Week / Week A:** The week the system builds a fresh spatial map of the plant.
- **Scanning Week / Week B:** The week the system revisits the saved map positions for disease detection.
- **n8n:** The cloud automation platform hosting all AI reasoning, data logging, and notification logic.
- **GT2 belt:** A toothed timing belt linking Servo 3 to the rotating camera-arm assembly.
- **OneWire bus:** The single-wire digital protocol used by DS18B20 temperature sensors.
- **XKC-Y25-T12V:** A non-contact liquid level sensor used to prevent the pump from running dry.
