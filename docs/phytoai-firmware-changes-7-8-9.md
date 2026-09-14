# PhytoAI — Firmware-Stage Changes 7–9 (closed-loop actuation)

**Status of this document:** design specification for the firmware stage. Nothing here is implemented yet. No n8n workflow/node changes, no sheet edits, no credential changes, and no firmware code in this pass. The live `phytoai` workflow remains **INACTIVE**, `dry_run_mode=true`, with no executions.

**Shared principle for all three changes:** **the cloud reasons, the firmware controls, and last-resort safety lives on the device in code.** n8n and the AI set targets and limits; they are never in the real-time actuation path. The AI remains the only authority on *whether* to water.

**Actuator switching:** the design uses the **existing 5V 4-channel relay module** (CH1 = pump, CH2 = heater, CH3/CH4 spare). **No MOSFETs are added.** MOSFET replacement of the relay is only reconsidered if bench characterization proves the relay cannot be driven by the 3.3 V ESP32 logic. Relay polarity and logic-level compatibility are **unconfirmed** until the board is characterized (see H1).

---

## 0. Decisions locked in this review

| Topic | Decision |
|---|---|
| Pump voltage contradiction | **Resolved:** listing states "DC 3V–5V Silent Mini Submersible Pump" — running it at 5 V on the shared rail is in spec. Actual current, stall current, flow rate (L/min) and tubing ID are measured on the bench (H2 bench item). |
| Result reporting path | **Approved:** new `POST /core/sensor/result` endpoint. No AI call on result; synchronous `onReceived` ack `{"status":"ok"}`; the workflow upserts the `Events` row by `EventID`. |
| 28 °C vs 30 °C cutoff | **Resolved:** firmware hard cutoff = **28 °C**, aligned to the workflow guardrail ("firmware wins"). It is a **redundant last-resort** — normal operation is bounded by the ≤ 25 °C target and the heater's fixed 26 °C thermostat. The workflow `maxWaterTempC` guardrail is aligned to **28** and the 30 °C value is removed. |
| `max_pump_seconds` | **Resolved:** single source of truth = **60 s** (`SystemConfig` key `max_pump_seconds`, mirrored in the Safety Guardrails constant and surfaced in the decision response). |
| Pre-heat stop target | **Resolved:** heat until `water_temp_c ≥ soil_temp_c − 1 °C`, with the stop target **clamped ≤ 25 °C** so the loop always terminates before the heater's fixed 26 °C thermostat plateau. |
| Hysteresis | **Resolved:** **2 °C** firmware constant (heater may re-enable only below `28 − 2 = 26 °C`). |
| `preheat_margin_c` | **Approved default 2 °C** — new `SystemConfig` key, exposed via `GET /config`. |
| `preheat_lead_minutes` | **Approved default 25 min** — new `SystemConfig` key, exposed via `GET /config`. |
| No-rise abort threshold | Defined in **grams + seconds during HX711 calibration**; not hardcoded yet. |
| Events columns | Append `WaterAddedGrams` (already added by the owner), `WateringAborted`, `FinalWaterTempC`. **`HeaterDurationSeconds` is repurposed** to carry actual heater seconds — no separate `HeatingSeconds` column is added. |
| SystemConfig additions | `max_pump_seconds` (60), `preheat_margin_c` (2), `preheat_lead_minutes` (25), `max_water_temp_c` (28, documentation/visibility), `heater_hysteresis_c` (2, documentation). |
| Heater element type | **Resolved (H3):** built-in **fixed thermostat at ~26 °C** (supply DC 5 V/2 A) — **not** thermostat-less. The thermostat is an independent physical layer; the firmware heating target is **clamped ≤ 25 °C** so the loop always ends before the plateau (at a target ≥ 26 °C the element plateaus and only the 600 s timeout would end the cycle). The **28 °C firmware cutoff is kept as a redundant last-resort** (documented as such). |
| DS18B20 probes (H5) | **Resolved:** both probes are **waterproof stainless-steel probe-on-cable** types (suitable for the submerged tank probe and the root-zone probe). |
| Tank volume (H6) | **Resolved:** tank ≈ **500 ml**. At ~10 W this is ≈ **1 °C per 3.5 min**, so the 25-min pre-heat window covers ≈ 7 °C of delta before losses (feasibility confirmed). Heater physical fit inside 500 ml remains a mounting check. |
| Abort enums | **Approved as fixed:** `watering_aborted` ∈ {`null`, `"no_weight_rise"`, `"max_time_reached"`, `"tank_empty"`, `"probe_invalid"`, `"pump_error"`}; `heater_aborted` ∈ {`null`, `"probe_invalid"`, `"tank_empty"`, `"max_time_reached"`, `"cutoff"`}. |
| Firmware dry-run refusal | **Approved:** the firmware refuses all actuation when the response carries `dry_run: true` — a second, device-local layer on top of the workflow's zeroing. |
| `temperature_tolerance_c` / `water_warmer_than_soil_action` | **Approved: keep** in the response contract, **informational-only** for firmware (the explicit `target_water_temp_c` governs the stop condition). |
| `last_watered_utc` on completion | **Approved:** the workflow sets it when a `/core/sensor/result` payload confirms completion; the Plan §2.2 note is updated in the Phase-6 docs sync. |

---

## 1. Change 7 — Closed-loop watering by weight

### 7.1 Context

The current design is open-loop: the Decision Agent returns `water_duration_seconds`, the firmware runs the pump for that long, and the system only learns afterwards (from the next event's weight/moisture) what actually happened. Upgrade: the load cell (HX711) measures the water delivered **while watering**; the firmware runs a closed loop against a gram target. `water_duration_seconds` is redefined as the **fallback/ceiling**, exactly like `max_heater_seconds: 600` for the heater.

### 7.2 Decision-response additions (`POST /core/sensor`)

```json
"target_water_grams": 60,
"max_pump_seconds": 60
```

- `target_water_grams` — primary instruction (number; **null/0 when `needs_watering=false`, tank-empty, or dry-run**).
- `max_pump_seconds` — number; surfaces the guardrail ceiling (currently 60). Firmware stops at the gram target OR this ceiling, whichever comes first. Never exceeded.
- `water_duration_seconds` remains in the response as the documented fallback/ceiling semantics.

### 7.3 Firmware closed loop

1. Initialize all relay outputs **de-energized (OFF)** before any sensor or actuator work (see §5.3).
2. Tare the load cell on boot (cheap HX711 cells drift over weeks; deltas over a ~2-minute watering window are accurate, absolute long-term values are not).
3. On a watering command: settle/verify tank condition → record baseline weight (median of N pre-pump samples) → pump relay ON → sample the HX711 at ≤1 s intervals → stop at `target_water_grams` or `max_pump_seconds`, whichever first.
4. No-rise abort: if the filtered weight rise stays below `NO_RISE_GRAMS` for `NO_RISE_SECONDS`, stop the pump and set `watering_aborted` (both constants fixed after HX711 calibration).
5. Report the actual delta as `water_added_grams` via `POST /core/sensor/result` (§4.3).
6. Stop the pump slightly before the exact target if bench tests show coast/siphon overshoot; document the compensation constant after calibration.

### 7.4 HX711 anti-vibration and calibration (required)

**Anti-vibration measures (design):**
- Mechanically decouple the tubing from the pot and the scale: route tubing with a strain-relief loop so pump vibration and hose tugging are not transmitted through the pot/scale path.
- Ignore the first samples after pump start (settle delay); use a baseline median taken **before** the pump turns on.
- Filter: moving median / trimmed mean over N samples (HX711 default 10 SPS; 80 SPS only if the RATE pin is used — confirm on the specific board).
- Stop on the **filtered** delta, not a single sample.
- Keep the pump and its mounting bracket mechanically isolated from the load-cell platform.

**Calibration procedure:**
- Known-mass check: place calibrated masses (e.g., 100 g and 500 g) on the pot/scale and verify reading linearity and offset.
- Record repeatability and noise floor in grams; derive the **no-rise abort constants** (`NO_RISE_GRAMS`, `NO_RISE_SECONDS`) from measured noise, not guessed.
- Document the tare-on-boot policy and expected drift.
- **Drainage/saucer note:** if the pot drains into a saucer or the tubing rests on the pot, the net mass change may under- or over-state the water retained by the substrate. Calibration and interpretation must account for this; the firmware reports *measured weight delta*, not a botanical "water retained" figure.

### 7.5 Result reporting

Firmware posts the outcome to `POST /core/sensor/result` (full contract in §4.3):

- `water_added_grams` — measured weight delta during the last watering.
- `watering_aborted` — `null`, `"no_weight_rise"`, `"max_time_reached"`, `"tank_empty"`, `"probe_invalid"`, or `"pump_error"` (enum fixed — see §4.3).
- `watering_seconds` — actual pump ON time.

### 7.6 Sheets changes

`Events` gains (see §6):
- `WaterAddedGrams` — **already added by the owner**.
- `WateringAborted` — to be added.
- `FinalWaterTempC` — to be added.
- `HeaterDurationSeconds` — existing column, **repurposed** to carry actual heater seconds (currently always 0).

### 7.7 Phase-5 workflow changes for Change 7

- `Decision Parser`: add `target_water_grams` to schema/example.
- `Normalize Decision Output`: add `target_water_grams`.
- `Decision Agent` prompt: reason the target amount (small for dry-tolerant species, larger for thirsty ones, never absurd) and emit it as `target_water_grams`; `water_duration_seconds` stays the fallback/ceiling.
- `Safety Guardrails`: clamp `target_water_grams` (per-event cap), zero/null under dry-run/tank-empty, and emit the final values.
- `Build Decision Response`: add `target_water_grams` and `max_pump_seconds`.
- Result receiver for `/core/sensor/result` (see §7, item 6).
- `Build Event Row`: map `WaterAddedGrams`, `WateringAborted`, `HeaterDurationSeconds` from the result.
- `Build Context` + History Analyst: extend "effect of last watering" to compare `WaterAddedGrams` against the resulting moisture delta, replacing the "roughly proportional to seconds" assumption.

---

## 2. Change 8 — Closed-loop water heating with absolute firmware cutoff

### 2.1 Context

The workflow already *decides* about heating (`heater_on`, `temperature_tolerance_c`, `water_warmer_than_soil_action`, capped by `max_heater_seconds=600` and a max-water-temperature guardrail). This change specifies the **in-flight control loop** on the ESP32: who watches the tank probe and who decides the exact moment to switch the heater off. Goal: heat tank water to roughly root-zone temperature so watering never cold-shocks the roots — with safety that depends on neither the cloud, nor the AI, nor the heater's own electronics (the built-in 26 °C thermostat is an independent physical layer, not the safety mechanism).

**Relay reality check.** A relay is a switch: it does not regulate temperature, limit current, or make the heater safe by itself. The DS18B20 loop, the ≤ 25 °C target clamp, and the 28 °C cutoff are the actual control, and the de-energized coil (fail-OFF) is the only fail-safe. The heater has a **built-in fixed thermostat at ~26 °C** (H3, resolved) — an independent physical layer that is not relied on for safety. The heater must remain **fully submerged**, mounted below the lowest normal water line and below the tank-empty float's trigger level. Never energize the heater when the tank is empty or when the water-probe reading is invalid.

### 2.2 Decision-response addition (`POST /core/sensor`)

```json
"target_water_temp_c": 19.8
```

- Typically the current `soil_temp_c` (heat the water to what the roots already are), made explicit so firmware never infers it.
- Workflow clamps it to **≤ 25 °C** (below the heater's 26 °C thermostat plateau — see §2.4).
- Existing fields keep their meaning: `heater_on`, `temperature_tolerance_c`, `max_heater_seconds` (600), `water_warmer_than_soil_action` ("proceed"|"defer"). Firmware maps these to its explicit target: heating is requested only when `heater_on=true`; the stop condition is always `target_water_temp_c` (or timeout, or cutoff). `temperature_tolerance_c` and `water_warmer_than_soil_action` are **kept in the contract and are informational-only for firmware (owner-approved)**; they do not override the explicit target.

### 2.3 Firmware closed loop

On a decision with `heater_on: true`:

1. Read the tank DS18B20 (water) and root-zone DS18B20 (soil).
2. Validate the water probe: reading is **invalid** if NaN or ≤ −100 °C (also treat the DS18B20 power-on default 85 °C as suspect on a first read). On invalid: heater stays OFF, abort, report `heater_aborted: "probe_invalid"`.
3. Heater relay ON → sample the tank probe at ≤5 s intervals.
4. Stop at the **first** of: tank temp reaches `target_water_temp_c` (success, always ≤ 25 °C) / `max_heater_seconds` (600) elapsed / tank temp reaches the **absolute cutoff 28 °C** / `tank_empty` becomes true / probe becomes invalid. The ≤ 25 °C target ensures the loop terminates before the heater's 26 °C thermostat plateau; at a target ≥ 26 °C the element would plateau and only the 600 s timeout would end the cycle.
5. Couple the result with a safety pause before any pump action (see §2.6).
6. Report `final_water_temp_c` and `heating_seconds` via `POST /core/sensor/result` (§4.3).

### 2.4 The absolute firmware cutoff — redundant last-resort

A hardcoded, cloud-independent maximum tank temperature: **28 °C** (firmware constant; the cloud-side `maxWaterTempC` guardrail is aligned to 28 and can never raise the firmware limit). This is a **redundant last-resort**: normal operation is bounded by the ≤ 25 °C target and the heater's fixed 26 °C thermostat, so 28 °C can only be reached if the thermostat fails (or the probe/heater misbehaves). It is kept precisely for that failure case.

- If the tank probe ever reads ≥ 28 °C — during heating, between cycles, whatever the cause — the heater relay de-energizes and stays OFF until the temperature falls below **26 °C** (28 − 2 °C hysteresis).
- If the probe reads invalid, the heater de-energizes immediately (no temperature reasoning on bad data).
- **This is the first firmware code to be tested** (verify cutoff at ≤27.9 °C before any watering logic exists), and the fail-safe must be verified physically: with the control wire unplugged mid-heating, the heater must go cold (**fail OFF, never fail ON**).

### 2.5 Relay implementation and wiring

- **Channel assignment:** CH1 = pump, CH2 = heater, CH3/CH4 = spare (left de-energized).
- **Wiring:** contacts switch the load's power line — `COM → +5 V`, `NO → load +`, `load − → GND`; `NC` unused. The relay coil is powered from the shared 5 V rail; the ESP32 GPIO drives only the input stage.
- **Polarity and logic level are unconfirmed** until the board is characterized (H1): do not assume 3.3 V-compatible inputs and do not assume active-LOW. Characterize with a meter/LED before any load is connected.
- **Boot-safe initialization plan (pending H1):**
  - Firmware must drive the relay input GPIOs to their de-energized state as the **first** initialization action, before sensors, Wi-Fi, or any other peripheral.
  - Because ESP32 GPIOs float during reset/boot, an **external pull-resistor on each relay input** to the de-energized level is planned (pull-up if the board is active-LOW, pull-down if active-HIGH). The exact resistor value/orientation is fixed after characterization.
  - PRD pin proposal (unconfirmed until H8): CH1 = GPIO25, CH2 = GPIO26, CH3 = GPIO14, CH4 = GPIO13.
- **Contact protection:** verify whether the relay board already has flyback/snubber protection for DC inductive loads; if not, add a flyback diode across each switched DC load (a component, not a module). No extra relay module is added unless H1 proves this board electrically incompatible.
- Spare channels must be explicitly initialized OFF and never toggled by logic.

### 2.6 Heat-then-water sequencing (mandatory default)

Pump and heater must **never draw simultaneously**:

- Heater relay OFF → wait **≥ 5 s** → pump relay ON.
- Applies to event-time top-up heating as well as normal watering.
- This sequencing stays mandatory until the PSU is measured to have sufficient headroom (H4); it is the safe default regardless.

### 2.7 Power

- Heater: 5 V, ≈10 W → **2 A** nominal.
- PSU decision: keep heat-then-water sequencing (§2.6) and verify the 5 V rail under worst-case load. If measurement shows margin, sequencing may be relaxed; until then it is the rule.
- **USB-C PD caveat:** the input is a USB 3.1 Type-C socket. A standard USB-C source without PD negotiation provides 5 V up to **3 A**; a 4–5 A 5 V rail is not guaranteed through a passive USB-C socket. The actual DC brick/charger rating and PD behavior are open (H4); if higher sustained current is needed, a dedicated 5 V supply may be required — decide after measuring.
- The ESP32-CAM has an independent 5 V branch (2 A peak). If it shares the same brick, account for it in the worst-case budget.
- **Expansion-board wiring (H8):** the heater and pump current must **not** route through the ESP32 expansion board's 5 V pins. Distribute 5 V **directly from the PSU to the relay board's** load/COM side; route **only the GPIO control signals** through the expansion board.
- **Barrel-jack warning (H8):** the ESP32 30-pin expansion board's barrel jack is a **6.5 V+ regulated input — never feed it 5 V**. Power the ESP32 via **micro-USB or the 5 V pin**.
- Heater physical fit inside the ~500 ml tank is a mounting check (H6).

---

## 3. Change 9 — Pre-heating ahead of scheduled events

### 3.1 Context

Watering events are tied to sunrise/sunset; the WROOM knows the schedule in advance (`GET /config` → `next_sunrise_utc` / `next_sunset_utc`; devices already wake ~10 min early). Owner requirement: if tank water is too cold relative to the root zone, heating starts **ahead of** the event so watering happens on time; if no heating is needed, the event proceeds normally — water only if the decision says so.

### 3.2 Pre-heat window (firmware)

- Wake earlier for conditioning: **~25 min before** the scheduled event (`preheat_lead_minutes`, SystemConfig, default 25). The existing ~10-min event wake is unchanged.
- Read tank probe and root-zone probe.
- If water probe or soil probe is invalid → skip pre-heating; the event proceeds normally.
- If `water_temp_c < soil_temp_c − preheat_margin_c` (default margin 2 °C) → run the Change-8 closed loop with target `soil_temp_c − 1 °C` **clamped ≤ 25 °C**; hard limits unchanged (600 s, 28 °C cutoff, hysteresis 2 °C, tank-empty and invalid-probe guards).
- If water is already within the margin, or the target would be ≥ 25 °C (at/above the 26 °C thermostat plateau, or hot soil), do nothing.

### 3.3 The decision flow is untouched

At the event, firmware POSTs `/core/sensor` exactly as today. The Decision Agent sees the conditioned water and typically returns `heater_on: false` — watering starts immediately. If the water is still too cold (window too short), the response's `heater_on: true` top-up applies, still capped at 600 s and always followed by the ≥5 s heat-then-water pause (§2.6).

**The AI remains the only authority on *whether* to water.** Pre-heating is physical preparation, not a watering decision. Pre-heated water that ends up unused costs a few watt-minutes and cools back harmlessly.

### 3.4 If pre-heating cannot reach the target in time

- Pre-heating **never delays or suppresses the event POST**. The conditioning window is best-effort.
- The event flow runs at its normal time; if the water is still too cold, the Decision Agent's response governs, and any `heater_on: true` top-up runs under the Change-8 loop limits before watering.
- Physical context (H6 resolved, tank ≈ 500 ml): ~10 W raises ~500 ml by roughly **1 °C per 3.5 minutes**, so a 25-min window can cover on the order of **~7 °C** of delta before losses. Feasibility of the pre-heat window is therefore confirmed for realistic soil/water gaps; if a required delta exceeds what the window can deliver, the top-up path covers the rest. Heater physical fit inside the 500 ml tank is a mounting check.
- The result report records `heating_seconds` + `final_water_temp_c` so the cloud can learn how often the window was insufficient.

### 3.5 Guards (firmware-local, unconditional)

- Never pre-heat when `tank_empty` is true.
- Never pre-heat when the heater is not confirmed submerged. Confirmation is **by mounting rule** (heater physically mounted below the float's trigger level; `tank_empty=false` then implies covered) — there is no separate submersion sensor in the current hardware. If the owner wants positive confirmation, adding a sensor is a separate design item.
- The ≤ 25 °C target clamp, the heater's 26 °C thermostat plateau, the 28 °C cutoff (redundant last-resort), 2 °C hysteresis, and the 600 s ceiling apply exactly as in Change 8.
- Never pre-heat when either temperature probe is invalid.

### 3.6 Wake scheduling (firmware)

Two wake types: the **pre-heat wake** at `preheat_lead_minutes` (default 25 min) before a scheduled event, and the **event wake** at ~10 min before the event (existing behavior). The schedule comes from `GET /config` → `next_sunrise_utc` / `next_sunset_utc`.

**Recommended mechanism: deep sleep + timer wakeup, with SNTP re-sync on every wake.**

- Deep sleep gives the lowest idle current and is sufficient because the WROOM is idle between events; wake is by the internal RTC timer.
- **Light sleep is not recommended as the primary mechanism:** its power saving over deep sleep is small when the radio is off between events, and it complicates deterministic wake timing and state retention.
- **An external RTC (DS3231 over I2C) is not required now.** Keep it as a future resilience upgrade (already noted in the PRD) if NTP is unavailable for long stretches. Revisit after H4/H8.
- **Timer accuracy and drift:** the ESP32 deep-sleep timer runs off the RTC slow clock (internal RC oscillator ≈ ±5% typical, worse over temperature; an external 32.768 kHz crystal on the board improves it if fitted). Over a 12 h sleep this can drift by minutes. Mitigations:
  - SNTP re-sync on **every** wake (the radio comes up for the event POST anyway); recompute the next sleep schedule from `GET /config` after each sync.
  - Keep a safety margin (e.g., wake 1–2 min earlier than strictly required).
  - If a sleep span exceeds the single-shot timer range of the target core, chain sleep cycles (wake → check remaining time → sleep again). Verify the exact limit during bench bring-up.
- **Wake sequence:** wake → Wi-Fi + SNTP → `GET /config` (refresh sun times) → if `tank_empty=false`, probes valid, and `water_temp_c < soil_temp_c − preheat_margin_c`, run the pre-heat loop (Change 9) → sleep to the event wake (or stay awake when the remaining time is shorter than the minimum sleep) → event wake → `POST /core/sensor` → actuate under guardrails → `POST /core/sensor/result` → all relays OFF → next sleep.
- **Actuator safety across sleep:** all relay outputs are de-energized before entering deep sleep; sleep must never occur while the heater or pump is energized. Deep-sleep wake resets the MCU, so the fail-OFF boot initialization (§2.5) runs on every cycle.
- **Timekeeping fallback:** if NTP fails on wake, use the last known time plus elapsed sleep; if the schedule cannot be trusted (sync failed and last-known time is stale beyond a documented limit), skip pre-heating and run only the event flow when a sync succeeds.
- **Bench verification:** measure wake-timing drift over 24 h against a reference clock and confirm NTP correction before trusting the pre-heat window.

---

## 4. Consolidated webhook contracts

### 4.1 `POST /core/sensor` — request (existing; unchanged in this pass)

```json
{
  "device_id": "esp32-wroom-01",
  "event_id": "sunrise-2026-08-22",
  "event_type": "sunrise",
  "captured_at_utc": "2026-08-22T04:12:00Z",
  "moisture_percent": 42.5,
  "weight_grams": 812.3,
  "air_temp_c": 21.4,
  "air_humidity_percent": 58.2,
  "soil_temp_c": 19.8,
  "water_temp_c": 18.1,
  "light_level": 640,
  "tank_empty": false
}
```

### 4.2 `POST /core/sensor` — response (additions marked ★)

```json
{
  "event_id": "sunrise-2026-08-22",
  "needs_watering": true,
  "water_duration_seconds": 60,
  "target_water_grams": 60,
  "max_pump_seconds": 60,
  "heater_on": true,
  "temperature_tolerance_c": 2.5,
  "target_water_temp_c": 19.8,
  "max_heater_seconds": 600,
  "water_warmer_than_soil_action": "proceed",
  "species_guess": "Monstera deliciosa",
  "ai_notes": "...",
  "recheck_hours": null,
  "dry_run": true
}
```

- ★ `target_water_grams` — null/0 when not watering, tank-empty, or dry-run.
- ★ `max_pump_seconds` — guardrail ceiling (60).
- ★ `target_water_temp_c` — typically `soil_temp_c`, clamped ≤ 25 °C (below the heater's 26 °C thermostat plateau); null when no heating.
- `dry_run: true` and zeroed actuation whenever `dry_run_mode` is `true` (the cloud zeroes targets; the firmware **also** refuses to actuate in a dry-run build — owner-approved second layer).
- Firmware must tolerate ≥120 s HTTP timeout (AI latency).

### 4.3 `POST /core/sensor/result` — NEW (firmware → n8n, fire-and-forget with synchronous ack)

Request:
```json
{
  "device_id": "esp32-wroom-01",
  "event_id": "sunrise-2026-08-22",
  "captured_at_utc": "2026-08-22T04:16:41Z",
  "water_added_grams": 58.4,
  "watering_aborted": null,
  "watering_seconds": 41,
  "final_water_temp_c": 19.6,
  "heating_seconds": 214,
  "heater_aborted": null
}
```

- No AI call. The workflow upserts the `Events` row by `EventID`.
- Response (synchronous, `onReceived`): `{"status":"ok"}`.
- `watering_aborted` ∈ {`null`, `"no_weight_rise"`, `"max_time_reached"`, `"tank_empty"`, `"probe_invalid"`, `"pump_error"`} — **fixed, owner-approved**.
- `heater_aborted` ∈ {`null`, `"probe_invalid"`, `"tank_empty"`, `"max_time_reached"`, `"cutoff"`} — **fixed, owner-approved**.
- `HeaterDurationSeconds` in `Events` is populated from `heating_seconds` (see §6).

### 4.4 `GET /config` — additions (soft config; non-authoritative)

```json
{
  "preheat_margin_c": 2,
  "preheat_lead_minutes": 25,
  "max_pump_seconds": 60,
  "next_scan_utc": "2026-08-24T06:30:00Z"
}
```

- `next_scan_utc` (Change 10) — the scheduled weekly scan capture time; the CAM wakes at this time and POSTs `/yolo-scan` autonomously. The schedule announcement (`scan_scheduled`) fires T−30 min before it.

The ≤ 25 °C target clamp, the heater's 26 °C thermostat plateau, the 28 °C hard cutoff (redundant last-resort), the 2 °C hysteresis, and the 600 s heater ceiling are firmware constraints, not cloud-configurable (the workflow also clamps the target to ≤ 25 °C).

---

## 5. Consolidated safety behavior (firmware-local)

1. **Boot fail-OFF:** all relay outputs de-energized as the first initialization action; external pull-resistors pending H1; verify with control-wire and power-loss tests.
2. **Tank-empty interlock:** heater and pump may never be energized when `tank_empty` is true; if `tank_empty` becomes true mid-cycle, de-energize immediately and abort.
3. **Invalid-probe abort:** water probe NaN or ≤ −100 °C (or suspect first-read 85 °C) → heater OFF immediately, abort, report.
4. **Absolute cutoff:** 28 °C hard, cloud-independent (redundant last-resort — normal operation is bounded by the ≤ 25 °C target and the heater's 26 °C thermostat); re-enable only below 26 °C.
5. **Never simultaneous:** heater OFF ≥ 5 s before pump ON.
6. **Ceilings:** `max_pump_seconds` (60) and `max_heater_seconds` (600) are never exceeded.
7. **Submersion:** heater mounted below the float trigger level, fully submerged; never energized otherwise.
8. **Thermostat (independent layer, not the safety):** the heater's built-in fixed ~26 °C thermostat self-limits the element; the firmware target is clamped ≤ 25 °C and never relies on the thermostat to end a cycle.

Workflow-side safety stays unchanged: `tank_empty` force-off, `min_rewater_interval_hours`, hard caps, dry-run zeroing — all deterministic code no AI output can override. All gram/degree targets pass through the same guardrails.

---

## 6. Consolidated Sheets schema changes

### 6.1 `Events` (append as last columns)

| Column | Status | Meaning |
|---|---|---|
| `WaterAddedGrams` | **already added by owner** | measured weight delta during the last watering |
| `WateringAborted` | to be added | abort reason string (`null`/empty when normal) |
| `FinalWaterTempC` | to be added | tank water temperature at the end of heating or watering |
| `HeaterDurationSeconds` | exists — **repurposed** | actual heater ON seconds (currently always 0); no separate `HeatingSeconds` column is added |

### 6.2 `SystemConfig` (new keys)

| Key | Value | Purpose |
|---|---|---|
| `max_pump_seconds` | `60` | single source of truth for the pump ceiling; surfaced in the response |
| `preheat_margin_c` | `2` | pre-heat trigger margin; exposed via `GET /config` |
| `preheat_lead_minutes` | `25` | pre-heat wake lead; exposed via `GET /config` |
| `max_water_temp_c` | `28` | documentation/visibility; the firmware hard cap remains 28 |
| `heater_hysteresis_c` | `2` | documentation; firmware constant |

The owner adds these keys when this document is final. The actual sheet is not edited by this pass.

---

## 7. Phase-5 workflow change list (Changes 7–11; do not apply yet)

### 7.1 Changes 7–9 — closed-loop actuation (firmware-facing workflow changes)

1. `Decision Parser`: add `target_water_grams`.
2. `Normalize Decision Output`: add `target_water_grams`.
3. `Decision Agent` prompt: emit `target_water_grams`; keep `water_duration_seconds` as fallback/ceiling.
4. `Safety Guardrails`: **read `max_pump_seconds` from SystemConfig (single source of truth; fall back to 60 only if the key is missing/blank) instead of the hardcoded `maxPumpSeconds = 60`**; clamp `target_water_grams`; zero/null under dry-run and tank-empty; emit `target_water_grams_final`, `max_pump_seconds_final`, `target_water_temp_c_final` (clamped ≤ 25); **change `maxWaterTempC` from 30 to 28**.
5. `Build Decision Response`: add `target_water_grams`, `max_pump_seconds`, `target_water_temp_c`.
6. **New endpoint receiver:** `Webhook "POST /core/sensor/result"` (`responseMode: onReceived`) → normalize the payload → Google Sheets **upsert the Events row by `EventID`** (write `WaterAddedGrams`, `WateringAborted`, `FinalWaterTempC`, `HeaterDurationSeconds`); no AI call; ack `{"status":"ok"}`. Also set `last_watered_utc` on confirmed completion (removes the provisional caveat for completed waterings).
7. `Build Event Row`: map the new fields from the result.
8. `Build Context` + History Analyst prompt: use `WaterAddedGrams` vs moisture delta (actual flow-rate learning).
9. `GET /config` (`Device Config` branch): expose `preheat_margin_c`, `preheat_lead_minutes`, `max_pump_seconds` from SystemConfig; **also add `next_scan_utc` (Change 10, item 15)**.
10. Plan.md §4.1/§2.1/§2.2/§5.2/§11 + README updates (see §10).

### 7.2 Change 10 — scheduled camera captures, no permission gate (Branch C)

11. **Delete the positioning HITL chain:** `Build Position Camera Row`, `Append Position Camera`, `Wait Camera Positioned`, `Camera Positioned?`, the `Build Open Session Row` / `Build Expire Row` pair, and `Expire Position Notification`; drop the `scan_position` notification type.
12. **Scheduler path (Weekly Scan trigger, T−30 min):** keep the battery check; **if `scan_session_active` is already `true` at trigger time, treat it as stale (weekly cron; the close path clears the flag) → log `stale scan session reset` (log line, no notification) and continue**; set `scan_session_active=true` (SystemConfig upsert) and append an **informational** `scan_scheduled` Notifications row — `status=done`, **no `response_options`, no `resume_url`**, no Wait. (The battery path keeps `scan_postponed`.)
13. **Close path:** delete the "return camera to charging dock" notification (`Build Return Camera Row`, `Append Return Camera`); keep `scan_session_active=false` via `Build Close Session Row` → `Update Close Session` → `Respond Scan Done`, rewired from `Scan Sweep Done` / `Read SystemConfig D2`.
14. **Quality safety net:** after `Normalize Vision Output`, add an IF on poor `framing_quality` → append an informational notification (type **`scan_quality`** — approved, `status=done`, no buttons) advising to check camera docking; the scan completes and logs regardless.
15. **`GET /config`:** add `next_scan_utc` (computed from the weekly-scan schedule) alongside `next_sunrise_utc` / `next_sunset_utc`.
16. **Wait inventory:** 3 → **2** (`Wait Verdict Response`, `Wait Followup Response`, both 7 d). Plan §8 Q3 (long-Wait timeouts) narrows to those two HITLs.
17. **Schedule definition (approved):** canonical capture = **Mon 06:00 UTC**; a single schedule trigger fires **Mon 05:30 UTC (T−30)** for the announcement + session open; `next_scan_utc` = trigger + 30 min, computed and exposed via `GET /config`; the CAM wakes at `next_scan_utc`.

### 7.3 Change 11 — placement & care review in the daily photo loop (Branch B)

18. `Photo Parser` + `Photo Analysis Agent` prompt: add `placement_ok` (bool), `placement_recommendation` (string|null), `placement_urgency` ("none" | "soon" | "urgent"), `care_needs` (array of strings).
19. `Normalize Photo Output`: add the four fields (null-safe).
20. `Build Multimodal Context`: add the code-only **stress-signal fact block** (sustained high air temperature, direct-sun LDR signature around solar noon, soil temperature vs. species comfort, humidity extremes, rapid moisture drop) — facts only, **no thresholds/actions in code**.
21. **Conditional judge branch:** new IF on thinker flags (`placement_ok=false` OR `placement_urgency≠none` OR non-trivial `care_needs`) → `Read AgentNotes Placement` → `Build Placement Prompt` → **`Placement Reviewer`** (agent #7, shared LM) with **`Placement Parser`** (name confirmed; `outputParserStructured`, own schema: `placement_change_recommended`, `urgency`, `recommendation`, `reasoning`) → `Normalize Placement Output` → `Build Placement Notes Rows` → `Append AgentNotes`; then IF `placement_change_recommended` → `Build Placement Advice Row` → `Append Placement Advice`. The IF gates the **entire** chain (reader → agent → parser → notes writer → advice append) so nothing executes on clean days.
22. **Shared-LM wiring:** add `Placement Reviewer` + `Placement Parser` to `OpenRouter Gemma` `[ai_languageModel]` — target count 12 → **14**.
23. **AgentNotes pattern (confirmed against live):** own reader (`Read AgentNotes Placement`, agent = `Placement Reviewer`, status = `active`) + own writer (`Build Placement Notes Rows`) into the shared `Append AgentNotes` sink. The live sink currently receives 5 writer branches on its single input and runs per arriving batch, so a 6th branch follows the same pattern. The prompt labels its own notes **UNVERIFIED HYPOTHESES**.
24. **Advisory output:** Notifications type `placement_advice`, informational (`status=done`, no buttons); urgent flag when urgency = `urgent` (future push). The placement/care summary is also logged into the event's `ai_notes` via **`Build Photo Update Row` (merge point approved)**; **no new Sheets columns**.
25. **Notifications type list:** remove `scan_position` and `scan_return_dock`; add `scan_scheduled`, `placement_advice`, and **`scan_quality`**.

### 7.4 Implementation requirements and remaining sync notes

- **Conditional cost gating (implementation requirement):** the thinker-flag IF must gate the entire `Placement Reviewer` chain (AgentNotes reader → agent → parser → notes writer → advice append) so nothing executes on clean days.
- **Stale-session guard (approved):** at T−30, `scan_session_active=true` at trigger time is stale by definition (weekly cron; the close path clears the flag) → log `stale scan session reset` (no notification) and open the new session; the close path is unchanged.
- **Scan timing (approved):** capture Mon 06:00 UTC; single trigger 05:30 UTC (T−30); `next_scan_utc` = trigger + 30 min.
- **Agent count / docs:** Plan and README still describe "5 specialists" and the old scan HITL gate; the Phase-6 sync (§10) must fix the enumerations (7 wired agents incl. Photo Analysis + Placement Reviewer) and the Branch C narrative.

### 7.5 Phase-5 verification items

26. After deleting `Build Open Session Row`, audit **every remaining branch input** into the shared `Update SystemConfig` upsert node (scheduler flag write, close-path flag write, photo/scan flag writes) and confirm the rewire.

---

## 8. Firmware-stage implementation order

1. Bench characterization: DS18B20 address discovery; HX711 calibration with known masses; relay board polarity/threshold/coil current.
2. Relay cold-start + fail-OFF proof (dummy load: LED/lamp), including ESP32 reset/brown-out and control-wire-disconnect.
3. Heater safety module only: cutoff at ≤27.9 °C, hysteresis, tank-empty interlock, invalid-probe abort (bench, thermometer, no plant).
4. Pre-heat loop (Change 9) reusing the heater safety module; no watering.
5. Pump + HX711 closed loop (Change 7) with real water; flow/current characterization and no-rise abort.
6. Integrated actuation sequence (heat → ≥5 s → water), dry-run honored, relay init OFF.
7. Result reporting integration once the Phase-5 `/core/sensor/result` receiver exists.

Safety first, each loop in isolation, integration last.

---

## 9. Tests required before connecting the heater or pump

1. **Relay logic (no load):** input threshold at 3.3 V; active level; coil current; boot/reset state; fail-OFF on control unplug and power loss; flyback/snubber check; COM/NO continuity and wiring.
2. **PSU bench:** 5 V rail droop under simulated max load (heater 2 A + pump + ESP32); relay switching transients; no brown-outs; CAM branch interaction; USB-C PD actual capability.
3. **Heater in water (no plant):** verify the built-in ~26 °C thermostat plateau; confirm a ≤ 25 °C target terminates the loop **before** the plateau; verify the 28 °C cutoff logic via a simulated high probe reading (last-resort path); hysteresis re-enable below 26 °C; probe-disconnect → off immediately; `tank_empty=true` → off; submerged mounting check; measure real °C/min rise.
4. **Pump in water:** inrush/stall current, prime/airlock behavior, flow rate, no-run when `tank_empty`; verify tubing mechanical isolation from the scale.
5. **HX711:** calibration with known mass, repeatability, vibration noise while the pump runs; set filter + no-rise constants; verify stop accuracy vs target grams; document drainage/saucer effects.
6. **Integrated dry-run:** with `dry_run_mode=true`, confirm zero actuation even with nonzero targets, and that the workflow stays inactive throughout.

---

## 10. Documentation updates (when this document is approved)

- **Plan.md:** firmware stage gains the three tasks; §4.1 contract updated in both directions; §2.1 `Events` gains `WaterAddedGrams`, `WateringAborted`, `FinalWaterTempC`; §2.2 gains the new SystemConfig keys **and updates the `last_watered_utc` note — it is written on confirmed completion via `/core/sensor/result` (the provisional caveat applies only until the firmware result path exists)**; §5.2 prompt gains `target_water_grams`; §11 hardware notes gain the relay/heater/HX711/expansion-board items (incl. the 26 °C thermostat and the ≤ 25 °C target clamp); the safety section lists the 28 °C absolute cutoff as a redundant last-resort alongside the 600 s cap; Branch A notes the closed loops.
- **README.md / PRD pump wording:** change the pump description to "rated 3V–5V per listing" (`README.md` hardware summary; `SmartPot-Full-Engineering-Spec-PRD.md` hardware inventory line for the pump).
- **Hardware notes:** HX711 drift caveat (tare on boot; trust deltas); heater mounting rule (fully submerged, below the float trigger; fit in ~500 ml); heater 26 °C built-in thermostat + firmware ≤ 25 °C target + 28 °C redundant cutoff; PSU sizing / heat-then-water sequencing / USB-C PD caveat; relay fail-OFF verification; relay wiring (COM/NO) and polarity-unknown note; **expansion-board wiring: no pump/heater current through the board's 5 V pins; barrel jack is 6.5 V+ only, never 5 V — power the ESP32 via micro-USB or the 5 V pin**; wake-scheduling note.
- **README:** one line in the council description — "code guards physics, the scale verifies them, the firmware watches the thermometer."
- **Plan.md (Changes 10–11 sync, Phase 6):** §2.3 Notifications type list — remove `scan_position` and `scan_return_dock`, add `scan_scheduled`, `placement_advice`, `scan_quality`; §3.2 Branch B — add the placement/care review (stress-signal facts, conditional `Placement Reviewer` + `Placement Parser`, advisory `placement_advice` row merged via `Build Photo Update Row`, no new columns); §3.3 Branch C scheduler path — remove the position-HITL gate, add the T−30 informational `scan_scheduled` row + scheduler-set `scan_session_active`; document the 05:30 UTC trigger / 06:00 UTC capture, `next_scan_utc` = trigger + 30 min, and the stale-session reset; §3.3 close path and §4.4 — remove the return-to-dock notification; §4.5 / `GET /config` — add `next_scan_utc`; new §5.6 — Placement Reviewer prompt/schema (`Placement Parser` name confirmed); §5.2 — Photo prompt gains the four placement fields; §8 Q3 — narrow to the two 7-day verdict/follow-up Waits; §1/agent enumerations — fix specialist/agent counts (**7 wired agents incl. Photo Analysis + Placement Reviewer**); Wait-node inventory 3 → 2.
- **README (Changes 10–11 sync, Phase 6):** **Branch C steps 2/3/8 + the council list are affected** — remove the "position the camera" HITL + timeout/expired path and the "return camera to dock" step; announce `scan_scheduled`; note the framing-quality safety net (`scan_quality`); Branch B/photo — mention placement & care advice; council paragraph — add `Placement Reviewer` and the advisory line; agent list fix to 7 wired agents.

---

## 11. Hardware questions

### 11.1 Resolved

| # | Item | Resolution |
|---|---|---|
| H2 | Pump | Rated **DC 3–5 V per listing** — running at 5 V on the shared rail is in spec. Bench measurements (current, stall current, flow rate, tubing ID) remain a bench item. |
| H3 | Heater | Has a built-in **fixed thermostat at ~26 °C** (supply DC 5 V/2 A) — **not** thermostat-less. Firmware target clamped **≤ 25 °C**; **28 °C** cutoff kept as redundant last-resort. |
| H5 | DS18B20 probes | Both are **waterproof stainless-steel probe-on-cable** types (tank + root zone). |
| H6 | Tank | Volume ≈ **500 ml**; at ~10 W that is ≈ 1 °C per 3.5 min, so the 25-min pre-heat window covers ≈ 7 °C of delta before losses (feasibility confirmed). Heater physical fit is a mounting check. |
| H8 (partial) | Expansion board | ESP32 30-pin expansion board identified. Notes: (1) pump/heater current must **not** route through the board's 5 V pins — distribute 5 V directly from the PSU to the relay board, GPIO control signals only through the board; (2) the barrel jack is a **6.5 V+ regulated input — never feed it 5 V**; power the ESP32 via micro-USB or the 5 V pin. Remaining: confirm free GPIOs (25/26/13/14). |

### 11.2 Still open (blocking for wiring)

| # | Item | Exact info needed |
|---|---|---|
| H1 | Relay board | Photos (top + bottom) with silkscreen; brand/model; chip markings; input trigger voltage spec (is 3.3 V enough?); active-HIGH/LOW; JD-VCC / opto-isolation jumper; per-channel coil current; contact rating; on-board flyback diodes |
| H4 | PSU / power | DC brick or USB-C charger label (5 V, A); PD behavior; USB-C socket wiring; expansion-board regulator rating |
| H7 | Load-cell mounting | Photos of pot/cell arrangement; whether pump/tubing mechanically touch the pot or scale. **Blocked 2026-09-14:** waiting on 2 scale-mount screws → HX711 calibration not yet done; `HX711_SCALE_FACTOR` remains provisional `305.070f` |
| H8 (rest) | Expansion board | Confirm free GPIOs GPIO25/26/13/14 and the board's 5 V-pin behavior |
| H9 | Relay board power | Confirm VCC can share the 5 V rail and that the rail can supply coil currents |

No heater/pump wiring is final until **H1 and H4** are answered (H7 affects the weight-loop calibration, not the actuator wiring).

### 11.3 Test status (owner-verified 2026-09-14)

- **ESP32-WROOM calibration** (`firmware/wroom_calibration/wroom_calibration.ino`) — **Part 1 (upload) DONE:** flashed, boots, Wi-Fi/serial OK. **Part 2 (sensor-by-sensor) PARTIAL:** sensors without missing hardware returned values; **HX711 load cell NOT tested** (blocked on the 2 scale-mount screws; `HX711_SCALE_FACTOR` stays provisional `305.070f`); **heater path NOT tested** (module not delivered; `max_heater_seconds=600` validated only in dry-run). Result set reported but **INCOMPLETE** (scale + heater rows open).
- **ESP32-CAM** (`firmware/esp32cam/esp32cam.ino`) — test sketch **DONE:** bench-tested (camera init, Wi-Fi connect, webhook upload verified).
- **Outstanding before production firmware:** (1) re-run the WROOM sensor test for HX711 when the screws arrive → calibrate → replace the provisional scale factor; (2) test heater wiring/relay when the module arrives → verify the 600 s cutoff and water-temp readings; (3) attach both results to the same result sheet so the sensor test is marked fully DONE.
