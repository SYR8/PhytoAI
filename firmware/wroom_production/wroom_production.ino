// PhytoAI ESP32-WROOM — production firmware v1 (2026-09-15)
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
// Hard safety limits — compile-time constants, never parameters/serial/OTA
// ---------------------------------------------------------------------------
const float    HEATER_CUTOFF_C = 40.0f;   // continuous cutoff while ON (hardware ceiling)
const float    HEATER_REFUSE_C = 39.5f;   // refuse to start at/above
const uint32_t ACTUATOR_CAP_S  = 120;     // pump and heater hard cap per pulse
const uint32_t WDT_TIMEOUT_S   = 8;
const uint32_t SAMPLE_MS       = 2000;
const uint32_t HTTP_POST_TIMEOUT_MS = 15000;
const uint32_t HTTP_CONFIG_TIMEOUT_MS = 8000;
const uint32_t CONFIG_RETRY_MS = 15UL * 60UL * 1000UL;
const uint32_t FALLBACK_INTERVAL_MS = 12UL * 3600UL * 1000UL;
const float    DEFAULT_PREHEAT_LEAD_MIN = 25.0f;
const float    DEFAULT_MAX_PUMP_SECONDS = 60.0f;
const uint32_t CLOCK_VALID_AFTER = 1600000000UL;

DHT dht(PIN_DHT22, DHT22);
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds(&oneWire);
HX711 scale;

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
  bool dryRun = false;
  String species;
  String notes;
};

Config cfg;
Reading lastReading;
unsigned long lastSampleMs = 0;
unsigned long lastConfigTryMs = 0;
unsigned long nextPostAtMs = 0;
bool nextPostIsSunrise = false;

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

  if (scale.is_ready()) {
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
  if (v > (float)ACTUATOR_CAP_S) v = (float)ACTUATOR_CAP_S;
  if (v < 0) v = 0;
  return (uint32_t)v;
}

void runPump(uint32_t seconds) {
  Serial.print(F("[pump] ON for "));
  Serial.print(seconds);
  Serial.println(F(" s"));
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
  Serial.println(F("[pump] OFF"));
}

bool runHeater(uint32_t seconds) {
  Serial.print(F("[heater] ON for "));
  Serial.print(seconds);
  Serial.print(F(" s (cutoff "));
  Serial.print(HEATER_CUTOFF_C, 1);
  Serial.println(F(" C)"));
  relayHeater(true);
  uint32_t t0 = millis();
  uint32_t lastSecond = t0;
  uint32_t lastBlink = t0;
  bool led = false;
  bool cut = false;
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
    }
    delay(10);
  }
  relayHeater(false);
  ledWrite(false);
  Serial.println(cut ? F("[heater] CUTOFF at 40.0 C - OFF") : F("[heater] OFF"));
  return !cut;
}

void executeDecision(const Decision& d, const Reading& r, bool configDryRun) {
  bool dry = d.dryRun || configDryRun || !cfg.ok;
  uint32_t pumpSec = d.needsWatering ? clampSec(d.waterSec, d.maxPumpSec) : 0;
  uint32_t heatSec = d.heaterOn ? clampSec(d.maxHeaterSec, d.maxHeaterSec) : 0;

  if (pumpSec > 0 && r.tankEmpty) { Serial.println(F("[pump] blocked: tank empty")); pumpSec = 0; }
  if (pumpSec > 0 && !r.moistureValid) { Serial.println(F("[pump] blocked: soil reading invalid")); pumpSec = 0; }

  if (dry) {
    Serial.print(F("[act] completion {\"simulated\":true,\"needs_watering\":"));
    Serial.print(d.needsWatering ? F("true") : F("false"));
    Serial.print(F(",\"water_sec\":"));
    Serial.print(pumpSec);
    Serial.print(F(",\"heater_sec\":"));
    Serial.print(heatSec);
    Serial.print(F(",\"ml\":"));
    Serial.print(pumpSec * PUMP_FLOW_ML_PER_SEC, 1);
    Serial.println('}');
    return;
  }

  if (heatSec > 0) {
    if (!r.waterValid) { Serial.println(F("[heater] refused: invalid water probe")); }
    else if (r.waterT >= HEATER_REFUSE_C) {
      Serial.print(F("[heater] refused: water already >= "));
      Serial.print(HEATER_REFUSE_C, 1);
      Serial.println(F(" C"));
    } else {
      runHeater(heatSec);
    }
  }

  if (pumpSec > 0) runPump(pumpSec);

  Serial.print(F("[act] completion {\"simulated\":false,\"water_sec\":"));
  Serial.print(pumpSec);
  Serial.print(F(",\"heater_sec\":"));
  Serial.print(heatSec);
  Serial.print(F(",\"ml\":"));
  Serial.print(pumpSec * PUMP_FLOW_ML_PER_SEC, 1);
  Serial.println('}');
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
// Arduino entry points
// ---------------------------------------------------------------------------
void setup() {
  pinMode(PIN_PUMP, OUTPUT);   digitalWrite(PIN_PUMP, relayOffLevel());
  pinMode(PIN_HEATER, OUTPUT); digitalWrite(PIN_HEATER, relayOffLevel());
  pinMode(PIN_LED, OUTPUT);    ledWrite(false);

  Serial.begin(115200);
  delay(400);
  Serial.println();
  Serial.println(F("PhytoAI WROOM production v1 (2026-09-15)"));
  Serial.println(F("[safety] pump CH1 + heater CH2 forced OFF; dry-run gates all actuation"));
  Serial.println(F("[safety] heater hard cutoff 40.0 C, refuse 39.5 C, 120 s actuator cap, 8 s WDT"));

  pinMode(PIN_TANK, INPUT);
  pinMode(PIN_LDR, INPUT);
  analogSetAttenuation(ADC_11db);

  wdtSetup();
  ledBootPattern();

  dht.begin();
  ds.begin();
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  scale.tare(10);                       // boot-offset (calibration-sketch fix)
  scale.set_scale(HX711_SCALE_FACTOR);
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

  if (clockValid() && millis() >= nextPostAtMs) {
    decisionCycle();
  }
}
