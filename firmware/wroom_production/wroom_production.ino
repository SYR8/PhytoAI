// PhytoAI ESP32-WROOM — production firmware v1.1 (2026-09-19)
//
// WHAT:   The pot's "body": reads all sensors, reports telemetry to n8n over WiFi/HTTPS,
//         executes the returned watering/heating decision under local hard safety limits.
// INPUTS: GET  <base>/webhook/config           (sun times, dry_run, flash + preheat context,
//                                               max_pump_seconds)
//         POST <base>/webhook/core/sensor      (12-field telemetry body, see below)
// OUTPUTS: decision JSON (12 fields, Build Decision Response -- workflows/phytoai.json L327/L405)
//          pump relay CH1 (GPIO13), heater relay CH2 (GPIO16), status LED (GPIO2), serial logs
// LIMITS: heater hard cutoff 40.0 C; refuse start >= 39.5 C; actuator hard cap 120 s/pulse;
//         8 s task watchdog; dry_run (config or decision) gates ALL GPIO actuation; tank-empty
//         and invalid sensor readings always block the affected actuator.
// OPERATING RULES (owner-verified 2026-09-15):
//   1. The HX711 is NEVER auto-tared — not at boot, not on load/pot detection. Startup only
//      RESTORES a previously recorded empty-platform offset from NVS. Live weight is GROSS:
//      plant + soil + tray + plumbing (and water) sit on the platform and must never be
//      zeroed by an automatic tare. Unset offset => weight is reported "unset", never phantom.
//   2. Tare is an explicit INSTALLATION/RESET serial command only ('t', empty platform,
//      'y'-confirmed). It is never part of normal operation.
//   3. Watering captures wt_before_g, runs the pump, settles SETTLE_AFTER_PUMP_MS, then
//      captures wt_after_g and reports wt_delta_g = wt_after_g - wt_before_g. Estimated
//      yield (seconds x PUMP_FLOW_ML_PER_SEC) is kept SEPARATE as ml_est — never called
//      measured ml.
//   4. The decision schema has no completion acknowledgement: measured wt_delta_g is
//      LOCAL/LOG telemetry only and is NOT persisted by n8n (log-only, like all completions).
//   5. Heat first when requested; stop at the requested safe target (policy default 28.0 C)
//      or at the 40.0 C hard cutoff; refuse >= 39.5 C or an invalid probe; never water on an
//      invalid safety state (tank/soil/water probe must be valid and not empty).
//   6. Camera power is WIRED-ONLY: this firmware has no camera-battery assumptions, and no
//      battery gate/telemetry is used anywhere on the WROOM side.
//   7. Serial diagnostics: 'i' status, 's' debug send (one telemetry cycle now, same code path
//      as the schedule; dry_run still gates all GPIO), 'l' runtime actuator cap (5-600 s,
//      NVS-persisted), 'h' help. 't' stays the explicit INSTALLATION tare.
// SPEC:   docs/opencode-wroom-production-brief.md | Bench: docs/hw-bench-2026-09-15.md
//         Audit: docs/cross-audit-2026-09-15.md | Plan header format: Plan.md section 5.3
// FUTURE: OTA updates are NOT in v1 (no OTA/WiFi-ap/MQTT). Deep sleep is not used in v1.
// NOTE:   No serial/M5 envelope — the cloud is n8n over HTTPS; n8n answers this device's POST.
//
// Secrets: gitignored secrets.h (SECRET_WIFI_SSID, SECRET_WIFI_PASSWORD, SECRET_BASE_URL,
//          SECRET_WEBHOOK_PREFIX) — local file preferred, else ../esp32cam/secrets.h.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>
#include <Preferences.h>
#include "esp_task_wdt.h"
#include <time.h>

#if __has_include("secrets.h")
#include "secrets.h"
#elif __has_include("../esp32cam/secrets.h")
#include "../esp32cam/secrets.h"
#endif
#ifndef SECRET_WIFI_SSID
#define SECRET_WIFI_SSID      ""
#define SECRET_WIFI_PASSWORD  ""
#define SECRET_BASE_URL       ""
#define SECRET_WEBHOOK_PREFIX "/webhook-test"
#endif

// ---------------------------------------------------------------------------
// Pins (bench-verified 2026-09-15 — see brief section 1)
// ---------------------------------------------------------------------------
#define PIN_PUMP        13
#define PIN_HEATER      16
#define PIN_HX711_DT    26
#define PIN_HX711_SCK   33
#define PIN_ONEWIRE      4
#define PIN_SOIL_ADC    34
#define PIN_TANK        27
#define PIN_DHT22       14
#define PIN_LDR         25
#define PIN_LED          2

#define RELAY_ACTIVE_LOW true
#define TANK_EMPTY_LEVEL LOW

// ---------------------------------------------------------------------------
// Baked bench constants (docs/hw-bench-2026-09-15.md)
// ---------------------------------------------------------------------------
float HX711_SCALE_FACTOR = 1068.335f;
const int   SOIL_ADC_DRY = 4095;
const int   SOIL_ADC_WET = 1964;
const float PUMP_FLOW_ML_PER_SEC = 9.706f;
uint8_t waterTempAddress[8] = {0x28, 0x94, 0x6B, 0xCB, 0x00, 0x00, 0x00, 0xBF};
uint8_t soilTempAddress[8]  = {0x28, 0x83, 0xFC, 0xC8, 0x00, 0x00, 0x00, 0x0F};

// ---------------------------------------------------------------------------
// Hard safety limits — compile-time constants; only the actuator cap is runtime-
// adjustable via serial 'l', and only within the compile-time 5-600 s bounds
// ---------------------------------------------------------------------------
const float    HEATER_CUTOFF_C = 40.0f;   // continuous cutoff while ON (hardware ceiling)
const float    HEATER_REFUSE_C = 39.5f;   // refuse to start at/above
const float    POLICY_TARGET_C_DEFAULT = 28.0f; // requested safe target when the decision carries none
const uint32_t ACTUATOR_CAP_S_DEFAULT = 120;  // factory default for the runtime actuator cap
const uint32_t ACTUATOR_CAP_S_MIN = 5;        // serial 'l' hard lower bound (seconds)
const uint32_t ACTUATOR_CAP_S_MAX = 600;      // serial 'l' hard upper bound (seconds)
uint32_t actuatorCapS = ACTUATOR_CAP_S_DEFAULT; // runtime cap; NVS-persisted by 'l'
const uint32_t SETTLE_AFTER_PUMP_MS = 3000; // weight settle before the post-watering sample
const char*    NVS_NS = "phytoai-wroom";
const uint32_t WDT_TIMEOUT_S   = 8;
const uint32_t SAMPLE_MS       = 2000;
const uint32_t HTTP_POST_TIMEOUT_MS = 15000;
const uint32_t HTTP_CONFIG_TIMEOUT_MS = 8000;
const uint32_t CONFIG_RETRY_MS = 15UL * 60UL * 1000UL;
const uint32_t FALLBACK_INTERVAL_MS = 12UL * 3600UL * 1000UL;
const float    DEFAULT_PREHEAT_LEAD_MIN = 25.0f;
const float    DEFAULT_MAX_PUMP_SECONDS = 60.0f;
const uint32_t CLOCK_VALID_AFTER = 1600000000UL;

// Optional one-time diagnostic telemetry POST after boot (ms after boot). DEFAULT OFF:
// keep it commented out for real operation — it forces an extra cycle outside the
// schedule and (with dry_run_mode=false) can actuate pump/heater. Bench diagnostics only.
// #define DEBUG_POST_AFTER_BOOT_MS 120000

DHT dht(PIN_DHT22, DHT22);
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds(&oneWire);
HX711 scale;
Preferences prefs;
bool hxOffsetKnown = false;   // true only when a recorded/installed empty-platform offset exists

struct Config {
  bool ok = false;
  bool dryRun = true;                 // fail-safe default
  float preheatLeadMin = DEFAULT_PREHEAT_LEAD_MIN;
  float preheatMarginC = 2.0f;
  float maxPumpSeconds = DEFAULT_MAX_PUMP_SECONDS;
  double flashDarkThreshold = -1;
  String nextSunrise;
  String nextSunset;
};

struct Reading {
  bool moistureValid = false;
  int  moisturePct = -1;
  int  soilRaw = -1;
  bool weightValid = false;
  float weightG = 0;
  bool airValid = false;
  float airT = 0;
  float airH = 0;
  bool waterValid = false;
  float waterT = 0;
  bool soilTempValid = false;
  float soilT = 0;
  int  lightLevel = -1;
  bool tankEmpty = false;
};

struct Decision {
  bool valid = false;
  bool needsWatering = false;
  float waterSec = 0;
  bool heaterOn = false;
  float maxHeaterSec = 0;
  float maxPumpSec = DEFAULT_MAX_PUMP_SECONDS;
  float maxWaterTempC = 0;   // requested safe target when present; 0 = use policy default
  bool dryRun = false;
  String species;
  String notes;
};

struct WaterResult {
  bool measured = false;
  float beforeG = NAN;
  float afterG = NAN;
  float deltaG = NAN;
};

Config cfg;
Reading lastReading;
unsigned long lastSampleMs = 0;
unsigned long lastConfigTryMs = 0;
unsigned long nextPostAtMs = 0;
bool nextPostIsSunrise = false;

#ifdef DEBUG_POST_AFTER_BOOT_MS
uint32_t debugPostAtMs = DEBUG_POST_AFTER_BOOT_MS;  // one-time boot POST (bench only)
#else
uint32_t debugPostAtMs = 0;                          // disabled (default)
#endif

bool relayOffLevel() { return RELAY_ACTIVE_LOW ? HIGH : LOW; }
bool relayOnLevel()  { return RELAY_ACTIVE_LOW ? LOW : HIGH; }
void relayPump(bool on)   { digitalWrite(PIN_PUMP, on ? relayOnLevel() : relayOffLevel()); }
void relayHeater(bool on) { digitalWrite(PIN_HEATER, on ? relayOnLevel() : relayOffLevel()); }

void wdtPet() { esp_task_wdt_reset(); }

void wdtSetup() {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t wcfg = {};
  wcfg.timeout_ms = WDT_TIMEOUT_S * 1000UL;
  wcfg.idle_core_mask = 0;
  wcfg.trigger_panic = true;
  if (esp_task_wdt_reconfigure(&wcfg) != ESP_OK) { esp_task_wdt_init(&wcfg); }
  if (esp_task_wdt_status(NULL) != ESP_OK) { esp_task_wdt_add(NULL); }
#else
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
  esp_task_wdt_add(NULL);
#endif
}

void ledWrite(bool on) { digitalWrite(PIN_LED, on ? HIGH : LOW); }

void ledBootPattern() {
  for (int i = 0; i < 3; i++) { ledWrite(true); delay(120); ledWrite(false); delay(120); }
}

// ---------------------------------------------------------------------------
// WiFi / NTP
// ---------------------------------------------------------------------------
bool wifiConnect() {
  if (String(SECRET_WIFI_SSID).length() == 0) {
    Serial.println(F("[wifi] SECRET_WIFI_SSID is empty - configure secrets.h"));
    return false;
  }
  WiFi.mode(WIFI_STA);
  for (int attempt = 1; attempt <= 3; attempt++) {
    Serial.print(F("[wifi] attempt "));
    Serial.println(attempt);
    WiFi.begin(SECRET_WIFI_SSID, SECRET_WIFI_PASSWORD);
    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000UL) { wdtPet(); delay(250); }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print(F("[wifi] connected, IP "));
      Serial.println(WiFi.localIP());
      return true;
    }
  }
  return false;
}

bool clockValid() { return time(nullptr) >= (time_t)CLOCK_VALID_AFTER; }

bool ntpSync() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  for (int attempt = 1; attempt <= 2; attempt++) {
    unsigned long t0 = millis();
    while (!clockValid() && millis() - t0 < 15000UL) { wdtPet(); delay(250); }
    if (clockValid()) {
      time_t now = time(nullptr);
      struct tm tmv;
      gmtime_r(&now, &tmv);
      char buf[32];
      strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmv);
      Serial.print(F("[ntp] UTC now "));
      Serial.println(buf);
      return true;
    }
  }
  Serial.println(F("[ntp] sync failed"));
  return false;
}

String isoNow() {
  time_t now = time(nullptr);
  struct tm tmv;
  gmtime_r(&now, &tmv);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmv);
  return String(buf);
}

time_t parseIsoUtc(const String& s) {
  int y = 0, mo = 0, d = 0, h = 0, mi = 0, sec = 0;
  if (sscanf(s.c_str(), "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &sec) != 6) return 0;
  struct tm tmv = {};
  tmv.tm_year = y - 1900; tmv.tm_mon = mo - 1; tmv.tm_mday = d;
  tmv.tm_hour = h; tmv.tm_min = mi; tmv.tm_sec = sec; tmv.tm_isdst = 0;
  return mktime(&tmv);
}

// ---------------------------------------------------------------------------
// HTTP (n8n over the named tunnel)
// ---------------------------------------------------------------------------
String hostFromBaseUrl(const String& url) {
  String u = url;
  if (u.startsWith("https://")) u = u.substring(8);
  else if (u.startsWith("http://")) u = u.substring(7);
  int slash = u.indexOf('/');
  if (slash >= 0) u = u.substring(0, slash);
  return u;
}

bool httpRequest(const char* method, const String& endpoint, const String& body, String& out, uint32_t timeoutMs) {
  if (String(SECRET_BASE_URL).length() == 0) {
    Serial.println(F("[http] SECRET_BASE_URL not configured"));
    return false;
  }
  String url = String(SECRET_BASE_URL) + String(SECRET_WEBHOOK_PREFIX) + endpoint;
  WiFiClientSecure client;
  client.setInsecure(); // cert validation not pinned in v1 (documented)
  HTTPClient http;
  http.setTimeout(timeoutMs);
  if (!http.begin(client, url)) { Serial.println(F("[http] begin failed")); return false; }
  http.addHeader("Content-Type", "application/json");
  int code = String(method) == "GET" ? http.GET() : http.POST(body);
  wdtPet();
  bool ok = code >= 200 && code < 300;
  if (ok) out = http.getString();
  Serial.print(F("[http] "));
  Serial.print(method);
  Serial.print(' ');
  Serial.print(endpoint);
  Serial.print(F(" -> "));
  Serial.println(code);
  http.end();
  return ok;
}

bool fetchConfig() {
  lastConfigTryMs = millis();
  String body;
  if (!httpRequest("GET", "/config", "", body, HTTP_CONFIG_TIMEOUT_MS)) {
    Serial.println(F("[config] fetch failed - conservative defaults + forced dry-run this cycle"));
    cfg.ok = false;
    cfg.dryRun = true;
    return false;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.print(F("[config] json parse failed: "));
    Serial.println(err.c_str());
    cfg.ok = false;
    cfg.dryRun = true;
    return false;
  }
  Config c;
  c.ok = true;
  c.dryRun = doc["dry_run_mode"] | true;
  c.nextSunrise = String((const char*)(doc["next_sunrise_utc"] | ""));
  c.nextSunset = String((const char*)(doc["next_sunset_utc"] | ""));
  c.preheatLeadMin = doc["preheat_lead_minutes"] | DEFAULT_PREHEAT_LEAD_MIN;
  c.preheatMarginC = doc["preheat_margin_c"] | 2.0f;
  c.maxPumpSeconds = doc["max_pump_seconds"] | DEFAULT_MAX_PUMP_SECONDS;
  c.flashDarkThreshold = doc["flash_dark_threshold"] | -1.0;
  cfg = c;
  Serial.print(F("[config] ok dry_run="));
  Serial.print(cfg.dryRun ? F("true") : F("false"));
  Serial.print(F(" max_pump_seconds="));
  Serial.print(cfg.maxPumpSeconds, 1);
  Serial.print(F(" preheat="));
  Serial.print(cfg.preheatLeadMin, 1);
  Serial.print(F("min sunrise="));
  Serial.print(cfg.nextSunrise);
  Serial.print(F(" sunset="));
  Serial.println(cfg.nextSunset);
  return true;
}

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------
bool validTemp(float t) { return !(isnan(t) || t <= -100.0f || t >= 85.0f); }

// GROSS weight (offset-compensated): plant + soil + tray + plumbing + water. NAN when no
// recorded offset exists (rule 1/2) or the HX711 is not ready — never a phantom value.
float readWeightNow() {
  if (!hxOffsetKnown || !scale.is_ready()) return NAN;
  float g = scale.get_units(10);
  return isnan(g) ? NAN : g;
}

int soilMedian15() {
  int v[15];
  for (int i = 0; i < 15; i++) { v[i] = analogRead(PIN_SOIL_ADC); delay(2); wdtPet(); }
  for (int i = 1; i < 15; i++) {
    int key = v[i];
    int j = i - 1;
    while (j >= 0 && v[j] > key) { v[j + 1] = v[j]; j--; }
    v[j + 1] = key;
  }
  return v[7];
}

bool soilInitSafe() {
  for (int i = 0; i < 10; i++) { analogRead(PIN_SOIL_ADC); delay(20); wdtPet(); }
  int m = soilMedian15();
  Serial.print(F("[soil] safe init median="));
  Serial.println(m);
  return m > 0;
}

Reading readAllSensors() {
  Reading r;

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && !isnan(h)) { r.airValid = true; r.airT = t; r.airH = h; }

  ds.requestTemperatures();
  float wt = ds.getTempC(waterTempAddress);
  float st = ds.getTempC(soilTempAddress);
  if (validTemp(wt)) { r.waterValid = true; r.waterT = wt; }
  if (validTemp(st)) { r.soilTempValid = true; r.soilT = st; }

  r.soilRaw = soilMedian15();
  r.moistureValid = r.soilRaw > 0;
  if (r.moistureValid) {
    r.moisturePct = constrain(map(r.soilRaw, SOIL_ADC_DRY, SOIL_ADC_WET, 0, 100), 0, 100);
  }

  if (hxOffsetKnown && scale.is_ready()) {
    float g = scale.get_units(5);
    if (!isnan(g)) { r.weightValid = true; r.weightG = g; }
  }

  r.lightLevel = digitalRead(PIN_LDR);
  r.tankEmpty = (digitalRead(PIN_TANK) == TANK_EMPTY_LEVEL);
  return r;
}

void logReading(const Reading& r) {
  Serial.print(F("[sensors] soil_raw="));
  Serial.print(r.soilRaw);
  Serial.print(F(" soil_pct="));
  Serial.print(r.moistureValid ? String(r.moisturePct) : String("invalid"));
  Serial.print(F(" wt_g="));
  Serial.print(r.weightValid ? String(r.weightG, 1) : String("unset"));
  Serial.print(F(" air_c="));
  Serial.print(r.airValid ? String(r.airT, 1) : String("invalid"));
  Serial.print(F(" rh="));
  Serial.print(r.airValid ? String(r.airH, 0) : String("invalid"));
  Serial.print(F(" water_c="));
  Serial.print(r.waterValid ? String(r.waterT, 2) : String("invalid"));
  Serial.print(F(" soil_c="));
  Serial.print(r.soilTempValid ? String(r.soilT, 2) : String("invalid"));
  Serial.print(F(" light="));
  Serial.print(r.lightLevel);
  Serial.print(F(" tank_empty="));
  Serial.println(r.tankEmpty ? F("true") : F("false"));
}

String buildTelemetryJson(const Reading& r, const String& eventType, const String& eventId) {
  JsonDocument doc;
  doc["device_id"] = "esp32-wroom-01";
  doc["event_id"] = eventId;
  doc["event_type"] = eventType;
  doc["captured_at_utc"] = isoNow();
  if (r.moistureValid) doc["moisture_percent"] = r.moisturePct; else doc["moisture_percent"] = nullptr;
  if (r.weightValid) doc["weight_grams"] = serialized(String(r.weightG, 1)); else doc["weight_grams"] = nullptr;
  if (r.airValid) { doc["air_temp_c"] = serialized(String(r.airT, 1)); doc["air_humidity_percent"] = serialized(String(r.airH, 1)); }
  else { doc["air_temp_c"] = nullptr; doc["air_humidity_percent"] = nullptr; }
  if (r.soilTempValid) doc["soil_temp_c"] = serialized(String(r.soilT, 2)); else doc["soil_temp_c"] = nullptr;
  if (r.waterValid) doc["water_temp_c"] = serialized(String(r.waterT, 2)); else doc["water_temp_c"] = nullptr;
  doc["light_level"] = r.lightLevel;
  doc["tank_empty"] = r.tankEmpty;
  String out;
  serializeJson(doc, out);
  return out;
}

Decision parseDecision(const String& body) {
  Decision d;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) { Serial.print(F("[decision] json parse failed: ")); Serial.println(err.c_str()); return d; }
  if (doc["needs_watering"].isNull()) { Serial.println(F("[decision] missing needs_watering - rejected")); return d; }
  d.needsWatering = doc["needs_watering"] | false;
  d.waterSec = doc["water_duration_seconds"] | 0.0f;
  d.heaterOn = doc["heater_on"] | false;
  d.maxHeaterSec = doc["max_heater_seconds"] | 0.0f;
  d.maxPumpSec = doc["max_pump_seconds"] | DEFAULT_MAX_PUMP_SECONDS;
  d.maxWaterTempC = doc["max_water_temp_c"] | 0.0f;   // requested safe target when n8n provides it
  d.dryRun = doc["dry_run"] | false;
  d.species = String((const char*)(doc["species_guess"] | ""));
  d.notes = String((const char*)(doc["ai_notes"] | ""));
  d.valid = true;
  return d;
}

// ---------------------------------------------------------------------------
// Actuation (heater first, then pump) — WDT petted, LED patterns, hard limits
// ---------------------------------------------------------------------------
uint32_t clampSec(float requested, float cfgCap) {
  float v = requested;
  if (v > cfgCap) v = cfgCap;
  if (v > (float)actuatorCapS) v = (float)actuatorCapS;
  if (v < 0) v = 0;
  return (uint32_t)v;
}

WaterResult runPumpMeasured(uint32_t seconds) {
  WaterResult res;
  res.beforeG = readWeightNow();                    // gross weight before watering
  Serial.print(F("[pump] ON for "));
  Serial.print(seconds);
  Serial.print(F(" s (wt_before_g="));
  if (isnan(res.beforeG)) Serial.print(F("unset")); else Serial.print(res.beforeG, 1);
  Serial.println(')');
  relayPump(true);
  uint32_t t0 = millis();
  uint32_t lastBlink = t0;
  bool led = false;
  while (millis() - t0 < seconds * 1000UL) {
    wdtPet();
    if (millis() - lastBlink >= 150UL) { led = !led; ledWrite(led); lastBlink = millis(); }
    delay(10);
  }
  relayPump(false);
  ledWrite(false);
  Serial.println(F("[pump] OFF - settling before post-watering weight..."));
  uint32_t ts = millis();
  while (millis() - ts < SETTLE_AFTER_PUMP_MS) { wdtPet(); delay(50); }
  res.afterG = readWeightNow();
  if (!isnan(res.beforeG) && !isnan(res.afterG)) {
    res.measured = true;
    res.deltaG = res.afterG - res.beforeG;
  }
  return res;
}

bool runHeater(uint32_t seconds, float targetC) {
  Serial.print(F("[heater] ON for "));
  Serial.print(seconds);
  Serial.print(F(" s (target "));
  Serial.print(targetC, 1);
  Serial.print(F(" C / hard cutoff "));
  Serial.print(HEATER_CUTOFF_C, 1);
  Serial.println(F(" C)"));
  relayHeater(true);
  uint32_t t0 = millis();
  uint32_t lastSecond = t0;
  uint32_t lastBlink = t0;
  bool led = false;
  bool cut = false;
  bool reached = false;
  while (millis() - t0 < seconds * 1000UL) {
    wdtPet();
    if (millis() - lastBlink >= 750UL) { led = !led; ledWrite(led); lastBlink = millis(); }
    if (millis() - lastSecond >= 1000UL) {
      lastSecond += 1000UL;
      ds.requestTemperatures();
      float wt = ds.getTempC(waterTempAddress);
      Serial.print(F("[heater] on "));
      Serial.print((millis() - t0) / 1000UL);
      Serial.print(F(" s water_c="));
      Serial.println(validTemp(wt) ? String(wt, 2) : String("invalid"));
      if (validTemp(wt) && wt >= HEATER_CUTOFF_C) { cut = true; break; }
      if (validTemp(wt) && wt >= targetC) { reached = true; break; }
    }
    delay(10);
  }
  relayHeater(false);
  ledWrite(false);
  if (cut) Serial.println(F("[heater] CUTOFF at 40.0 C - OFF"));
  else if (reached) Serial.println(F("[heater] safe target reached - OFF"));
  else Serial.println(F("[heater] OFF"));
  return !(cut || reached);
}

void printNumOrNull(float v, uint8_t dp) {
  if (isnan(v)) Serial.print(F("null")); else Serial.print(v, dp);
}

void executeDecision(const Decision& d, const Reading& r, bool configDryRun) {
  bool dry = d.dryRun || configDryRun || !cfg.ok;
  uint32_t pumpSec = d.needsWatering ? clampSec(d.waterSec, d.maxPumpSec) : 0;
  uint32_t heatSec = d.heaterOn ? clampSec(d.maxHeaterSec, d.maxHeaterSec) : 0;
  float targetC = (d.maxWaterTempC > 0.0f) ? d.maxWaterTempC : POLICY_TARGET_C_DEFAULT;
  float mlEst = pumpSec * PUMP_FLOW_ML_PER_SEC;   // ESTIMATE only (rule 3/4)

  if (pumpSec > 0 && r.tankEmpty) { Serial.println(F("[pump] blocked: tank empty")); pumpSec = 0; mlEst = 0; }
  if (pumpSec > 0 && !r.moistureValid) { Serial.println(F("[pump] blocked: soil reading invalid")); pumpSec = 0; mlEst = 0; }
  if (pumpSec > 0 && !r.waterValid) { Serial.println(F("[pump] blocked: invalid water probe (unsafe state)")); pumpSec = 0; mlEst = 0; }

  if (dry) {
    // Rule 4: completions are log-only; a dry run reports NO measured delta.
    Serial.print(F("[act] completion {\"simulated\":true,\"needs_watering\":"));
    Serial.print(d.needsWatering ? F("true") : F("false"));
    Serial.print(F(",\"water_sec\":"));
    Serial.print(pumpSec);
    Serial.print(F(",\"ml_est\":"));
    Serial.print(mlEst, 1);
    Serial.print(F(",\"heater_sec\":"));
    Serial.print(heatSec);
    Serial.println(F(",\"wt_before_g\":null,\"wt_after_g\":null,\"wt_delta_g\":null}"));
    return;
  }

  if (heatSec > 0) {
    if (!r.waterValid) { Serial.println(F("[heater] refused: invalid water probe")); }
    else if (r.waterT >= HEATER_REFUSE_C) {
      Serial.print(F("[heater] refused: water already >= "));
      Serial.print(HEATER_REFUSE_C, 1);
      Serial.println(F(" C"));
    } else {
      runHeater(heatSec, targetC);
    }
  }

  WaterResult w;
  if (pumpSec > 0) w = runPumpMeasured(pumpSec);

  Serial.print(F("[act] completion {\"simulated\":false,\"needs_watering\":"));
  Serial.print(d.needsWatering ? F("true") : F("false"));
  Serial.print(F(",\"water_sec\":"));
  Serial.print(pumpSec);
  Serial.print(F(",\"ml_est\":"));
  Serial.print(mlEst, 1);
  Serial.print(F(",\"heater_sec\":"));
  Serial.print(heatSec);
  Serial.print(F(",\"wt_before_g\":"));
  printNumOrNull(w.beforeG, 1);
  Serial.print(F(",\"wt_after_g\":"));
  printNumOrNull(w.afterG, 1);
  Serial.print(F(",\"wt_delta_g\":"));
  printNumOrNull(w.measured ? w.deltaG : NAN, 1);
  Serial.println('}');
  if (pumpSec > 0) {
    if (w.measured) Serial.println(F("  [note] wt_delta_g is measured locally; log-only (no ack field in the schema, NOT persisted by n8n). ml_est is an estimate."));
    else Serial.println(F("  [gap] post-watering weight could not be verified (no offset / probe not ready) - wt_delta_g unavailable."));
  }
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------
void computeNextPost() {
  time_t now = time(nullptr);
  time_t sr = parseIsoUtc(cfg.nextSunrise);
  time_t ss = parseIsoUtc(cfg.nextSunset);
  time_t best = 0;
  bool isSunrise = false;
  if (sr > now && (best == 0 || sr < best)) { best = sr; isSunrise = true; }
  if (ss > now && (best == 0 || ss < best)) { best = ss; isSunrise = false; }
  unsigned long leadMs = (unsigned long)(cfg.preheatLeadMin * 60000.0f);
  if (best == 0) {
    nextPostAtMs = millis() + FALLBACK_INTERVAL_MS;
    nextPostIsSunrise = false;
    Serial.println(F("[sched] no valid sun times - fallback interval 12 h"));
    return;
  }
  time_t postAt = best - (time_t)(leadMs / 1000UL);
  if (postAt <= now) { nextPostAtMs = millis() + 60000UL; nextPostIsSunrise = isSunrise; Serial.println(F("[sched] event lead passed - posting in 60 s")); return; }
  nextPostAtMs = millis() + (unsigned long)(postAt - now) * 1000UL;
  nextPostIsSunrise = isSunrise;
  Serial.print(F("[sched] next post in "));
  Serial.print((unsigned long)(postAt - now));
  Serial.println(F(" s"));
}

void printNextPost() {
  if (!clockValid() || nextPostAtMs == 0) { Serial.println(F("[sched] next POST: unknown")); return; }
  unsigned long remainingS = (nextPostAtMs > millis()) ? (nextPostAtMs - millis()) / 1000UL : 0UL;
  time_t at = time(nullptr) + (time_t)remainingS;
  struct tm tmv;
  gmtime_r(&at, &tmv);
  char hhmm[8];
  strftime(hhmm, sizeof(hhmm), "%H:%M", &tmv);
  Serial.print(F("[sched] next POST at "));
  Serial.print(nextPostIsSunrise ? F("sunrise ") : F("sunset "));
  Serial.print(hhmm);
  Serial.print(F(" UTC (in "));
  Serial.print(remainingS);
  Serial.println(F(" s)"));
}

void decisionCycle() {
  Serial.println(F("[cycle] posting telemetry..."));
  Reading r = readAllSensors();
  lastReading = r;
  String eventId = "wroom-" + String((uint32_t)time(nullptr));
  String eventType = nextPostIsSunrise ? "sunrise" : "sunset";
  String body = buildTelemetryJson(r, eventType, eventId);

  String resp;
  bool ok = false;
  for (int attempt = 1; attempt <= 3 && !ok; attempt++) {
    ok = httpRequest("POST", "/core/sensor", body, resp, HTTP_POST_TIMEOUT_MS);
    if (!ok) { Serial.print(F("[cycle] post attempt ")); Serial.print(attempt); Serial.println(F(" failed")); delay(5000); }
    wdtPet();
  }
  if (!ok) { Serial.println(F("[cycle] no valid decision (post failed) - NO actuation this cycle")); fetchConfig(); computeNextPost(); return; }

  Decision d = parseDecision(resp);
  if (!d.valid) { Serial.println(F("[cycle] decision invalid - NO actuation this cycle")); fetchConfig(); computeNextPost(); return; }

  Serial.print(F("[decision] needs_watering="));
  Serial.print(d.needsWatering ? F("true") : F("false"));
  Serial.print(F(" water_sec="));
  Serial.print(d.waterSec, 1);
  Serial.print(F(" heater_on="));
  Serial.print(d.heaterOn ? F("true") : F("false"));
  Serial.print(F(" max_heater_sec="));
  Serial.print(d.maxHeaterSec, 1);
  Serial.print(F(" max_pump_sec="));
  Serial.print(d.maxPumpSec, 1);
  Serial.print(F(" dry_run="));
  Serial.print(d.dryRun ? F("true") : F("false"));
  Serial.print(F(" species="));
  Serial.println(d.species);

  executeDecision(d, r, cfg.dryRun);
  fetchConfig();
  computeNextPost();
}

// ---------------------------------------------------------------------------
// Serial commands — installation + diagnostics only; normal operation is autonomous
// ---------------------------------------------------------------------------
void loadActuatorCap() {
  prefs.begin(NVS_NS, true);
  uint32_t saved = prefs.getUInt("act_cap_s", ACTUATOR_CAP_S_DEFAULT);
  prefs.end();
  if (saved < ACTUATOR_CAP_S_MIN || saved > ACTUATOR_CAP_S_MAX) {
    actuatorCapS = ACTUATOR_CAP_S_DEFAULT;
    Serial.print(F("[limit] stored actuator cap invalid ("));
    Serial.print(saved);
    Serial.print(F(" s) - using default "));
    Serial.print(ACTUATOR_CAP_S_DEFAULT);
    Serial.println(F(" s"));
    return;
  }
  actuatorCapS = saved;
  if (actuatorCapS != ACTUATOR_CAP_S_DEFAULT) {
    Serial.print(F("[limit] restored actuator cap from NVS: "));
    Serial.print(actuatorCapS);
    Serial.println(F(" s"));
  }
}

void commandInstallTare() {
  Serial.println(F("[HX711] INSTALLATION/RESET TARE - NOT normal operation."));
  Serial.println(F("        Remove the pot, plant, tray and hoses: tare with the platform EMPTY."));
  Serial.print(F("        This records the empty-platform offset (live weight stays GROSS afterwards)."));
  Serial.println(F("        Press 'y' to confirm, any other key aborts:"));
  unsigned long t0 = millis();
  while (!Serial.available() && millis() - t0 < 60000UL) { wdtPet(); delay(50); }
  if (!Serial.available()) { Serial.println(F("        timeout - aborted (no changes)")); return; }
  char c = Serial.read();
  if (c != 'y' && c != 'Y') { Serial.println(F("        aborted (no changes)")); return; }
  if (!scale.is_ready()) { Serial.println(F("        HX711 not ready - aborted")); return; }
  scale.tare(10);
  hxOffsetKnown = true;
  prefs.begin(NVS_NS, false);
  prefs.putLong("hx_offset", scale.get_offset());
  prefs.end();
  Serial.print(F("        empty-platform offset recorded: "));
  Serial.println(scale.get_offset());
  Serial.println(F("        (stored in NVS; restored at boot without re-taring)"));
}

void commandSetActuatorCap() {
  Serial.print(F("[limit] current actuator cap: "));
  Serial.print(actuatorCapS);
  Serial.print(F(" s (hard bounds "));
  Serial.print(ACTUATOR_CAP_S_MIN);
  Serial.print('-');
  Serial.print(ACTUATOR_CAP_S_MAX);
  Serial.println(F(" s)"));
  Serial.println(F("[limit] enter new cap in seconds, then press Enter (non-numeric input aborts):"));
  String input;
  bool gotLine = false;
  unsigned long t0 = millis();
  while (!gotLine && millis() - t0 < 60000UL) {
    wdtPet();
    while (Serial.available()) {
      char c = (char)Serial.read();
      if (c == '\r') continue;
      if (c == '\n') {
        if (input.length() > 0) { gotLine = true; break; }
        continue;
      }
      if (input.length() < 12) input += c;
    }
    delay(20);
  }
  if (!gotLine) { Serial.println(F("[limit] timeout - aborted (no changes)")); return; }
  input.trim();
  for (size_t i = 0; i < input.length(); i++) {
    if (!isDigit((unsigned char)input[i])) {
      Serial.print(F("[limit] rejected: \""));
      Serial.print(input);
      Serial.println(F("\" is not a number - no changes"));
      return;
    }
  }
  long v = input.toInt();
  if (v < (long)ACTUATOR_CAP_S_MIN || v > (long)ACTUATOR_CAP_S_MAX) {
    Serial.print(F("[limit] rejected: "));
    Serial.print(v);
    Serial.print(F(" s is outside the safe bounds "));
    Serial.print(ACTUATOR_CAP_S_MIN);
    Serial.print('-');
    Serial.print(ACTUATOR_CAP_S_MAX);
    Serial.println(F(" s - no changes"));
    return;
  }
  actuatorCapS = (uint32_t)v;
  prefs.begin(NVS_NS, false);
  prefs.putUInt("act_cap_s", actuatorCapS);
  prefs.end();
  Serial.print(F("[limit] confirmed new actuator cap: "));
  Serial.print(actuatorCapS);
  Serial.println(F(" s (persisted to NVS; applies to pump and heater)"));
}

void commandDebugSend() {
  Serial.println(F("[s] debug send: one full telemetry cycle via the scheduled code path"));
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[s] WiFi down - reconnecting..."));
    if (!wifiConnect()) { Serial.println(F("[s] aborted: no WiFi")); return; }
  }
  if (!clockValid()) {
    Serial.println(F("[s] NTP clock invalid - syncing..."));
    if (!ntpSync()) { Serial.println(F("[s] aborted: no valid UTC clock")); return; }
  }
  Serial.println(F("[s] GET /config first, then POST /core/sensor (12-field telemetry)"));
  fetchConfig();
  Serial.print(F("[s] actuation gating for this forced cycle: dry_run="));
  Serial.println(cfg.dryRun ? F("true (GPIO stays off)") : F("false (decision decides)"));
  decisionCycle();
  printNextPost();
}

void commandStatus() {
  Serial.print(F("[status] uptime_s="));
  Serial.print(millis() / 1000UL);
  Serial.print(F(" wifi="));
  Serial.print(WiFi.status() == WL_CONNECTED ? F("up") : F("down"));
  Serial.print(F(" dry_run="));
  Serial.print(cfg.dryRun ? F("true") : F("false"));
  Serial.print(F(" hx_offset="));
  if (hxOffsetKnown) Serial.print(scale.get_offset()); else Serial.print(F("unset"));
  Serial.print(F(" factor="));
  Serial.print(HX711_SCALE_FACTOR, 3);
  Serial.print(F(" actuator_cap_s="));
  Serial.print(actuatorCapS);
  Serial.print(F(" tank_empty="));
  Serial.print(lastReading.tankEmpty ? F("true") : F("false"));
  Serial.print(F(" water_c="));
  Serial.println(lastReading.waterValid ? String(lastReading.waterT, 2) : String("invalid"));
}

void handleSerial() {
  if (Serial.available() <= 0) return;
  char c = Serial.read();
  switch (c) {
    case 't': case 'T': commandInstallTare(); break;
    case 'l': case 'L': commandSetActuatorCap(); break;
    case 's': case 'S': commandDebugSend(); break;
    case 'i': case 'I': commandStatus(); break;
    case 'h': case 'H': case '?':
      Serial.println(F("commands: t=INSTALLATION tare (EMPTY platform), l=actuator cap 5-600 s (NVS), s=send telemetry cycle now, i=status, h=help"));
      break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Arduino entry points
// ---------------------------------------------------------------------------
void setup() {
  pinMode(PIN_PUMP, OUTPUT);   digitalWrite(PIN_PUMP, relayOffLevel());
  pinMode(PIN_HEATER, OUTPUT); digitalWrite(PIN_HEATER, relayOffLevel());
  pinMode(PIN_LED, OUTPUT);    ledWrite(false);

  Serial.begin(115200);
  delay(400);
  loadActuatorCap();
  Serial.println();
  Serial.println(F("PhytoAI WROOM production v1.1 (2026-09-19)"));
  Serial.println(F("[safety] pump CH1 + heater CH2 forced OFF; dry-run gates all actuation"));
  Serial.print(F("[safety] heater hard cutoff 40.0 C, refuse 39.5 C, actuator cap "));
  Serial.print(actuatorCapS);
  Serial.println(F(" s ('l' = 5-600 s, NVS), 8 s WDT"));
  Serial.println(F("[rules] no auto-tare (gross weight); 't'=INSTALLATION tare, 'l'=actuator cap, 's'=debug send, 'i'=status, 'h'=help"));
  Serial.println(F("[rules] camera is wired-only: no battery assumptions in this firmware"));

  pinMode(PIN_TANK, INPUT);
  pinMode(PIN_LDR, INPUT);
  analogSetAttenuation(ADC_11db);

  wdtSetup();
  ledBootPattern();

  dht.begin();
  ds.begin();
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  scale.set_scale(HX711_SCALE_FACTOR);
  // Rule 1: NEVER auto-tare (boot or load detection). Only restore a RECORDED
  // empty-platform offset — the pot/soil/tray/plumbing stay part of the gross weight.
  prefs.begin(NVS_NS, true);
  long savedOffset = prefs.getLong("hx_offset", 0);
  prefs.end();
  if (savedOffset != 0) { scale.set_offset(savedOffset); hxOffsetKnown = true; }
  Serial.print(F("[hx711] "));
  if (hxOffsetKnown) {
    Serial.print(F("restored empty-platform offset "));
    Serial.print(savedOffset);
    Serial.println(F(" - live weight is GROSS (pot+soil+tray+plumbing+water)"));
  } else {
    Serial.println(F("no recorded offset - weight reported 'unset'; run INSTALLATION tare 't' once (empty platform)"));
  }
  soilInitSafe();
  ds.requestTemperatures();

  bool wifi = wifiConnect();
  bool clock = wifi && ntpSync();
  if (wifi) { fetchConfig(); }
  else { cfg.ok = false; cfg.dryRun = true; Serial.println(F("[config] no WiFi - forced dry-run + defaults")); }
  (void)clock;

  lastReading = readAllSensors();
  logReading(lastReading);
  lastSampleMs = millis();
  computeNextPost();
}

void loop() {
  wdtPet();
  handleSerial();

  if (millis() - lastSampleMs >= SAMPLE_MS) {
    lastSampleMs = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[wifi] lost - reconnecting"));
      if (!wifiConnect()) { cfg.dryRun = true; cfg.ok = false; }
    }
    lastReading = readAllSensors();
    logReading(lastReading);
  }

  if (millis() - lastConfigTryMs >= CONFIG_RETRY_MS) {
    if (WiFi.status() == WL_CONNECTED) fetchConfig();
  }

  if (debugPostAtMs > 0 && millis() >= debugPostAtMs) {
    debugPostAtMs = 0;   // one-time diagnostic; default off (see DEBUG_POST_AFTER_BOOT_MS)
    Serial.println(F("[debug] DEBUG_POST_AFTER_BOOT_MS fired - one telemetry cycle (dry_run still gates GPIO)"));
    commandDebugSend();
  }

  if (clockValid() && millis() >= nextPostAtMs) {
    decisionCycle();
  }
}
