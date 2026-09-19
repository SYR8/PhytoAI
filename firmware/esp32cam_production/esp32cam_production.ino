// PhytoAI ESP32-CAM — production autonomous firmware v1.1 (2026-09-19)
//           (separate from the esp32cam.ino test baseline).
//
// Autonomy: Wi-Fi -> NTP (UTC) -> GET /config -> scheduled daily photo (POST /core/photo)
//           and scheduled weekly scan (POST /yolo-scan, then POST /yolo-scan/done).
//           The scan runs ONLY while /config reports scan_session_active=true (cloud
//           session opened by the weekly n8n trigger); a boot or any non-scan wake
//           never posts to /yolo-scan without it. Fixed wired camera: no positioning.
// Serial:   h=help s=send photo now c=scan now (session-gated) i=status; see 'h'.
// Safety:   NO actuators. This firmware never waters or heats; the camera is static
//           (no servo/pan-tilt/aiming). Watering/heating stay on the WROOM + n8n guardrails.
// Secrets:  read from the gitignored secrets.h (SECRET_WIFI_SSID, SECRET_WIFI_PASSWORD,
//           SECRET_BASE_URL, SECRET_WEBHOOK_PREFIX). Placeholders keep it compiling.
// Hardware: AI Thinker ESP32-CAM (OV2640), flash LED = GPIO4.
//
// Reliability summary (see firmware/esp32cam/PRODUCTION-TESTS.md for the test plan):
//   Wi-Fi: 3 tries x 20 s per pass, then deep-sleep 15 min and retry (RETRY_SOON_SECONDS).
//   NTP:   2 tries x 15 s; without a valid UTC clock no capture is attempted (retry soon).
//   HTTP:  60 s upload / 8 s config timeout; uploads retried 3x with 5 s exponential backoff.
//   Scan:  due ONLY inside the 90-min window after the target; gated on
//          scan_session_active=true from the latest /config. If the session is not open
//          yet the pass re-checks every 15 min inside the window and sends NO uploads;
//          a manual 'c' test also aborts with no uploads when the session is closed.
//          Bookkeeping prevents a second scan in the same week bucket; manual test scans
//          never record a miss. /yolo-scan has no idempotency key -> a retry after an
//          already-processing POST can duplicate; the miss is recorded and not retried.
//   Daily: event_id "cam-<YYYYMMDD>" is upserted by n8n, so reboots/retries cannot duplicate.
//   Sleep: deep sleep until the next event minus WAKE_LEAD_SECONDS, capped at 12 h per sleep.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include "esp_camera.h"
#include "esp_sleep.h"
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

const char* DEVICE_ID = "esp32-cam-01";
const char* PATH_PHOTO = "/core/photo";
const char* PATH_SCAN = "/yolo-scan";
const char* PATH_SCAN_DONE = "/yolo-scan/done";
const char* PATH_CONFIG = "/config";

#define DAILY_PHOTO_HOUR_UTC  10
#define DAILY_PHOTO_MIN_UTC   0
#define SCAN_WEEKDAY_UTC      1
#define SCAN_HOUR_UTC         6
#define SCAN_MIN_UTC          0
#define WAKE_LEAD_SECONDS     180
#define RETRY_SOON_SECONDS    900
#define SLEEP_CAP_SECONDS     43200
#define CLOCK_VALID_AFTER     1600000000UL

#define WIFI_RETRIES          3
#define WIFI_TIMEOUT_MS       20000
#define NTP_RETRIES           2
#define NTP_TIMEOUT_MS        15000
#define HTTP_TIMEOUT_MS       60000
#define CONFIG_TIMEOUT_MS     8000
#define UPLOAD_RETRIES        3
#define UPLOAD_BACKOFF_MS     5000
#define SCAN_WINDOW_MS        (90UL * 60UL * 1000UL)
#define SCAN_RETRY_INTERVAL_MS (10UL * 60UL * 1000UL)
#define DIAGNOSTIC_WINDOW_MS  15000
#define LIGHT_READING_MAX_AGE_S 21600

#ifndef ALWAYS_DIAGNOSTIC
#define ALWAYS_DIAGNOSTIC false
#endif
#ifndef DISABLE_DEEP_SLEEP
#define DISABLE_DEEP_SLEEP false
#endif

#define PIN_BATTERY_ADC       33
#define BATTERY_SAMPLES        5
#define BATTERY_ADC_REF_V      3.3f
#define BATTERY_DIVIDER_RATIO  2.0f
#define BATTERY_EMPTY_V        3.40f
#define BATTERY_FULL_V         4.20f

#define PIN_FLASH_LED         4
#define FLASH_LED_ON_LEVEL    HIGH
#define FLASH_LED_OFF_LEVEL   LOW

#define CAM_FRAME_SIZE_PSRAM  FRAMESIZE_UXGA
#define CAM_FRAME_SIZE_DRAM   FRAMESIZE_VGA
#define CAM_JPEG_QUALITY      10

#define CAM_PIN_PWDN    32
#define CAM_PIN_RESET   -1
#define CAM_PIN_XCLK     0
#define CAM_PIN_SIOD    26
#define CAM_PIN_SIOC    27
#define CAM_PIN_D7      35
#define CAM_PIN_D6      34
#define CAM_PIN_D5      39
#define CAM_PIN_D4      36
#define CAM_PIN_D3      21
#define CAM_PIN_D2      19
#define CAM_PIN_D1      18
#define CAM_PIN_D0       5
#define CAM_PIN_VSYNC   25
#define CAM_PIN_HREF    23
#define CAM_PIN_PCLK    22

Preferences prefs;
bool cameraReady = false;
bool g_torchOn = false;
String stLastDaily = "";
uint32_t stLastScanB = 0xFFFFFFFF;
uint32_t stScanMissB = 0xFFFFFFFF;

String cfgNextScanUtc = "";
String cfgNextSunriseUtc = "";
String cfgNextSunsetUtc = "";
String cfgLightUtc = "";
double cfgLight = -1;
double cfgThr = -1;
bool cfgFetched = false;
bool cfgScanSessionActive = false;   // scan_session_active as last seen in /config

struct MultipartField {
  const char* name;
  String value;
};

void flashLedOff() {
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, FLASH_LED_OFF_LEVEL);
}

void flashLedBlink() {
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, FLASH_LED_ON_LEVEL);
  delay(80);
  flashLedOff();
}

String isoNow() {
  time_t now = time(nullptr);
  if (now < CLOCK_VALID_AFTER) return String("1970-01-01T00:00:00Z");
  struct tm tmv;
  gmtime_r(&now, &tmv);
  char buf[24];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmv);
  return String(buf);
}

String dayKey(time_t t) {
  struct tm tmv;
  gmtime_r(&t, &tmv);
  char buf[12];
  strftime(buf, sizeof(buf), "%Y%m%d", &tmv);
  return String(buf);
}

uint32_t weekBucket(time_t t) {
  return (uint32_t)(t / 604800UL);
}

int batteryRawAvg() {
  long sum = 0;
  for (int i = 0; i < BATTERY_SAMPLES; i++) {
    sum += analogRead(PIN_BATTERY_ADC);
    delay(5);
  }
  return (int)(sum / BATTERY_SAMPLES);
}

float batteryVolts(int raw) {
  return (raw / 4095.0f) * BATTERY_ADC_REF_V * BATTERY_DIVIDER_RATIO;
}

int batteryPercent(float volts) {
  float pct = (volts - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100.0f;
  if (pct < 0.0f) pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;
  return (int)(pct + 0.5f);
}

int batteryPercentNow() {
  return batteryPercent(batteryVolts(batteryRawAvg()));
}

void loadState() {
  prefs.begin("phytoai-cam", false);
  stLastDaily = prefs.getString("lastDaily", "");
  stLastScanB = prefs.getUInt("lastScanB", 0xFFFFFFFF);
  stScanMissB = prefs.getUInt("scanMissB", 0xFFFFFFFF);
}

void saveLastDaily(const String& v) {
  stLastDaily = v;
  prefs.putString("lastDaily", v);
}

void saveScanBucket(uint32_t b) {
  stLastScanB = b;
  prefs.putUInt("lastScanB", b);
}

void saveScanMiss(uint32_t b) {
  stScanMissB = b;
  prefs.putUInt("scanMissB", b);
}

bool jsonFindValue(const String& body, const char* key, String& out) {
  String pat = String("\"") + key + "\"";
  int i = body.indexOf(pat);
  if (i < 0) return false;
  int c = body.indexOf(':', i + pat.length());
  if (c < 0) return false;
  int j = c + 1;
  while (j < (int)body.length() && (body[j] == ' ' || body[j] == '\t' || body[j] == '\n' || body[j] == '\r')) j++;
  if (j >= (int)body.length()) return false;
  if (body.startsWith("null", j)) return false;
  if (body[j] == '"') {
    int e = body.indexOf('"', j + 1);
    if (e < 0) return false;
    out = body.substring(j + 1, e);
    return true;
  }
  int e = j;
  while (e < (int)body.length() && body[e] != ',' && body[e] != '}' && body[e] != ']' && body[e] != '\n' && body[e] != '\r') e++;
  out = body.substring(j, e);
  out.trim();
  return out.length() > 0;
}

bool jsonNumber(const String& body, const char* key, double& out) {
  String s;
  if (!jsonFindValue(body, key, s)) return false;
  out = s.toFloat();
  return true;
}

long isoToEpoch(const String& iso) {
  int y, mo, d, h, mi, se;
  if (sscanf(iso.c_str(), "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &se) != 6) return 0;
  struct tm tmv;
  memset(&tmv, 0, sizeof(tmv));
  tmv.tm_year = y - 1900;
  tmv.tm_mon = mo - 1;
  tmv.tm_mday = d;
  tmv.tm_hour = h;
  tmv.tm_min = mi;
  tmv.tm_sec = se;
  return (long)mktime(&tmv);
}

String fmtNum(double v) {
  long r = (long)(v + (v >= 0 ? 0.5 : -0.5));
  if (fabs(v - (double)r) < 0.001) return String(r);
  return String(v, 1);
}

String hostFromBaseUrl(const String& url) {
  String u = url;
  if (u.startsWith("https://")) u = u.substring(8);
  else if (u.startsWith("http://")) u = u.substring(7);
  int slash = u.indexOf('/');
  if (slash >= 0) u = u.substring(0, slash);
  int colon = u.indexOf(':');
  if (colon >= 0) u = u.substring(0, colon);
  return u;
}

String readHttpResponse(WiFiClientSecure& client, int& status) {
  status = -1;
  String statusLine = client.readStringUntil('\n');
  int sp1 = statusLine.indexOf(' ');
  if (sp1 > 0) status = statusLine.substring(sp1 + 1, sp1 + 4).toInt();
  bool chunked = false;
  long contentLen = -1;
  while (true) {
    String h = client.readStringUntil('\n');
    h.trim();
    if (h.length() == 0) break;
    String hl = h;
    hl.toLowerCase();
    if (hl.startsWith("transfer-encoding") && hl.indexOf("chunked") >= 0) chunked = true;
    else if (hl.startsWith("content-length")) contentLen = h.substring(h.indexOf(':') + 1).toInt();
  }
  const unsigned int MAX_BODY = 2048;
  String body;
  body.reserve(1024);
  if (chunked) {
    while (true) {
      String sz = client.readStringUntil('\n');
      sz.trim();
      long n = strtol(sz.c_str(), nullptr, 16);
      if (n <= 0) break;
      long remaining = n;
      while (remaining > 0) {
        int c = client.read();
        if (c < 0) break;
        if (body.length() < MAX_BODY) body += (char)c;
        remaining--;
      }
      client.readStringUntil('\n');
    }
  } else if (contentLen > 0) {
    long remaining = contentLen;
    while (remaining > 0) {
      int c = client.read();
      if (c < 0) break;
      if (body.length() < MAX_BODY) body += (char)c;
      remaining--;
    }
  } else {
    uint32_t t0 = millis();
    while (client.connected() && millis() - t0 < 5000) {
      if (client.available()) {
        int c = client.read();
        if (body.length() < MAX_BODY) body += (char)c;
        t0 = millis();
      } else {
        delay(10);
      }
    }
  }
  return body;
}

bool openConnection(WiFiClientSecure& client, uint32_t timeoutMs) {
  if (!String(SECRET_BASE_URL).startsWith("https://")) {
    Serial.println(F("[HTTP] SECRET_BASE_URL must be a configured https:// URL"));
    return false;
  }
  String host = hostFromBaseUrl(String(SECRET_BASE_URL));
  client.setInsecure();
  client.setTimeout(timeoutMs);
  if (!client.connect(host.c_str(), 443)) {
    Serial.println(F("[HTTP] connect failed"));
    return false;
  }
  return true;
}

bool postMultipart(const char* endpoint, MultipartField* fields, size_t nFields, camera_fb_t* fb, int& status, String& respBody) {
  WiFiClientSecure client;
  if (!openConnection(client, HTTP_TIMEOUT_MS)) return false;
  String boundary = "----PhytoAI" + String((uint32_t)esp_random(), HEX);
  String parts[8];
  size_t contentLength = 0;
  for (size_t i = 0; i < nFields; i++) {
    parts[i] = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + String(fields[i].name) + "\"\r\n\r\n" + fields[i].value + "\r\n";
    contentLength += parts[i].length();
  }
  String fileHeader = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"data\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
  String tail = "\r\n--" + boundary + "--\r\n";
  contentLength += fileHeader.length() + fb->len + tail.length();
  String host = hostFromBaseUrl(String(SECRET_BASE_URL));
  client.print(String("POST ") + SECRET_WEBHOOK_PREFIX + endpoint + " HTTP/1.1\r\n");
  client.print(String("Host: ") + host + "\r\n");
  client.print(String("Content-Type: multipart/form-data; boundary=") + boundary + "\r\n");
  client.print(String("Content-Length: ") + String((unsigned long)contentLength) + "\r\n");
  client.print(F("Connection: close\r\n\r\n"));
  for (size_t i = 0; i < nFields; i++) client.print(parts[i]);
  client.print(fileHeader);
  client.write(fb->buf, fb->len);
  client.print(tail);
  respBody = readHttpResponse(client, status);
  client.stop();
  return true;
}

bool postJson(const char* endpoint, const String& json, int& status, String& respBody) {
  WiFiClientSecure client;
  if (!openConnection(client, HTTP_TIMEOUT_MS)) return false;
  String host = hostFromBaseUrl(String(SECRET_BASE_URL));
  client.print(String("POST ") + SECRET_WEBHOOK_PREFIX + endpoint + " HTTP/1.1\r\n");
  client.print(String("Host: ") + host + "\r\n");
  client.print(F("Content-Type: application/json\r\n"));
  client.print(String("Content-Length: ") + String((unsigned long)json.length()) + "\r\n");
  client.print(F("Connection: close\r\n\r\n"));
  client.print(json);
  respBody = readHttpResponse(client, status);
  client.stop();
  return true;
}

bool httpGet(const char* endpoint, int& status, String& respBody) {
  WiFiClientSecure client;
  if (!openConnection(client, CONFIG_TIMEOUT_MS)) return false;
  String host = hostFromBaseUrl(String(SECRET_BASE_URL));
  client.print(String("GET ") + SECRET_WEBHOOK_PREFIX + endpoint + " HTTP/1.1\r\n");
  client.print(String("Host: ") + host + "\r\n");
  client.print(F("Accept: application/json\r\n"));
  client.print(F("Connection: close\r\n\r\n"));
  respBody = readHttpResponse(client, status);
  client.stop();
  return true;
}

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  for (int attempt = 1; attempt <= WIFI_RETRIES; attempt++) {
    Serial.print(F("[WiFi] attempt "));
    Serial.println(attempt);
    WiFi.begin(SECRET_WIFI_SSID, SECRET_WIFI_PASSWORD);
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS) delay(250);
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print(F("[WiFi] connected, IP="));
      Serial.print(WiFi.localIP());
      Serial.print(F("  RSSI="));
      Serial.println(WiFi.RSSI());
      return true;
    }
    delay(2000);
  }
  Serial.println(F("[WiFi] connect FAILED"));
  return false;
}

bool syncClock() {
  for (int attempt = 1; attempt <= NTP_RETRIES; attempt++) {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    uint32_t t0 = millis();
    while (time(nullptr) < CLOCK_VALID_AFTER && millis() - t0 < NTP_TIMEOUT_MS) delay(250);
    if (time(nullptr) >= CLOCK_VALID_AFTER) {
      Serial.print(String("[NTP] UTC now ") + isoNow() + "\n");
      return true;
    }
    Serial.println(F("[NTP] sync failed, retrying"));
  }
  Serial.println(F("[NTP] unavailable - skipping captures this pass"));
  return false;
}

bool pollConfig() {
  int status = -1;
  String body;
  cfgFetched = false;
  if (!httpGet(PATH_CONFIG, status, body) || status != 200) {
    Serial.println(F("[config] fetch failed (will fall back to defaults)"));
    return false;
  }
  cfgFetched = true;
  jsonFindValue(body, "next_sunrise_utc", cfgNextSunriseUtc);
  jsonFindValue(body, "next_sunset_utc", cfgNextSunsetUtc);
  if (!jsonFindValue(body, "scan_next_utc", cfgNextScanUtc)) jsonFindValue(body, "next_scan_utc", cfgNextScanUtc);
  jsonFindValue(body, "last_lightlevel_utc", cfgLightUtc);
  String sessionVal;
  cfgScanSessionActive = jsonFindValue(body, "scan_session_active", sessionVal) && sessionVal == "true";
  double v = 0;
  if (jsonNumber(body, "last_lightlevel", v)) cfgLight = v; else cfgLight = -1;
  if (jsonNumber(body, "flash_dark_threshold", v)) cfgThr = v; else cfgThr = -1;
  Serial.print(F("[config] ok"));
  if (cfgNextScanUtc.length()) Serial.print(String(" next_scan_utc=") + cfgNextScanUtc);
  Serial.print(String(" scan_session_active=") + (cfgScanSessionActive ? "true" : "false"));
  if (cfgLight >= 0) Serial.print(String(" light=") + fmtNum(cfgLight));
  Serial.println();
  return true;
}

bool decideFlashForShot(String& logLine) {
  time_t now = time(nullptr);
  long age = -1;
  if (cfgLightUtc.length() && now >= CLOCK_VALID_AFTER) {
    long t = isoToEpoch(cfgLightUtc);
    if (t > 0) {
      age = (long)now - t;
      if (age < 0) age = 0;
    }
  }
  if (cfgLight >= 0 && cfgThr >= 0 && !(age > LIGHT_READING_MAX_AGE_S)) {
    bool dark = cfgLight < cfgThr;
    logLine = "light=" + fmtNum(cfgLight) + " (age " + (age >= 0 ? String(age) + "s" : String("?")) + ") threshold=" + fmtNum(cfgThr) + " -> flash " + String(dark ? "ON" : "OFF") + " (sensor)";
    return dark;
  }
  long sr = cfgNextSunriseUtc.length() ? isoToEpoch(cfgNextSunriseUtc) : 0;
  long ss = cfgNextSunsetUtc.length() ? isoToEpoch(cfgNextSunsetUtc) : 0;
  if (now >= CLOCK_VALID_AFTER && sr > 0 && ss > 0) {
    bool night = ((long)now < sr) || ((long)now > ss);
    logLine = (cfgLight >= 0 ? String("light reading stale -> ") : String("no light reading -> ")) + "suntimes (" + (night ? "night" : "day") + ") -> flash " + String(night ? "ON" : "OFF") + " (suntimes)";
    return night;
  }
  logLine = "no light data -> flash ON (fallback)";
  return true;
}

bool ensureCamera() {
  if (cameraReady) return true;
  camera_config_t config;
  memset(&config, 0, sizeof(config));
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_pwdn = CAM_PIN_PWDN;
  config.pin_reset = CAM_PIN_RESET;
  config.pin_xclk = CAM_PIN_XCLK;
  config.pin_sccb_sda = CAM_PIN_SIOD;
  config.pin_sccb_scl = CAM_PIN_SIOC;
  config.pin_d0 = CAM_PIN_D0;
  config.pin_d1 = CAM_PIN_D1;
  config.pin_d2 = CAM_PIN_D2;
  config.pin_d3 = CAM_PIN_D3;
  config.pin_d4 = CAM_PIN_D4;
  config.pin_d5 = CAM_PIN_D5;
  config.pin_d6 = CAM_PIN_D6;
  config.pin_d7 = CAM_PIN_D7;
  config.pin_vsync = CAM_PIN_VSYNC;
  config.pin_href = CAM_PIN_HREF;
  config.pin_pclk = CAM_PIN_PCLK;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  if (psramFound()) {
    config.frame_size = CAM_FRAME_SIZE_PSRAM;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size = CAM_FRAME_SIZE_DRAM;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }
  config.jpeg_quality = CAM_JPEG_QUALITY;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.print(F("[CAM] init failed, error 0x"));
    Serial.println(err, HEX);
    return false;
  }
  cameraReady = true;
  Serial.println(F("[CAM] initialized"));
  return true;
}

void captureCameraWarmup() {
  for (int i = 0; i < 30; i++) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
    delay(100);
  }
  sensor_t* s = esp_camera_sensor_get();
  if (s) {
    s->set_ae_level(s, -2);
    s->set_saturation(s, 0);
    s->set_brightness(s, 0);
  }
}

camera_fb_t* captureFrame(bool& flashLit) {
  if (!ensureCamera()) return nullptr;
  String decisionLog;
  bool dark = decideFlashForShot(decisionLog);
  Serial.print(F("[FLASH] "));
  Serial.println(decisionLog);
  flashLit = dark;
  bool lit = dark || g_torchOn;
  sensor_t* s = esp_camera_sensor_get();
  if (s) s->set_wb_mode(s, lit ? 1 : 0);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, lit ? FLASH_LED_ON_LEVEL : FLASH_LED_OFF_LEVEL);
  captureCameraWarmup();
  camera_fb_t* fb = esp_camera_fb_get();
  if (g_torchOn) digitalWrite(PIN_FLASH_LED, FLASH_LED_ON_LEVEL);
  else flashLedOff();
  if (!fb) Serial.println(F("[CAM] frame capture FAILED"));
  return fb;
}

time_t nextDailyTarget(time_t from) {
  struct tm tmv;
  gmtime_r(&from, &tmv);
  tmv.tm_hour = DAILY_PHOTO_HOUR_UTC;
  tmv.tm_min = DAILY_PHOTO_MIN_UTC;
  tmv.tm_sec = 0;
  tmv.tm_isdst = 0;
  time_t target = mktime(&tmv);
  if (target <= from) target += 86400;
  return target;
}

time_t localWeeklyScanAfter(time_t from) {
  struct tm tmv;
  gmtime_r(&from, &tmv);
  int wday = tmv.tm_wday;
  tmv.tm_hour = SCAN_HOUR_UTC;
  tmv.tm_min = SCAN_MIN_UTC;
  tmv.tm_sec = 0;
  tmv.tm_isdst = 0;
  time_t base = mktime(&tmv);
  int diff = (SCAN_WEEKDAY_UTC - wday + 7) % 7;
  time_t target = base + (time_t)diff * 86400;
  if (target < from) target += 7 * 86400;
  return target;
}

// Most recent local weekly target (Monday SCAN_HOUR_UTC) at or before `from`.
time_t localWeeklyScanBefore(time_t from) {
  struct tm tmv;
  gmtime_r(&from, &tmv);
  int wday = tmv.tm_wday;
  tmv.tm_hour = SCAN_HOUR_UTC;
  tmv.tm_min = SCAN_MIN_UTC;
  tmv.tm_sec = 0;
  tmv.tm_isdst = 0;
  time_t base = mktime(&tmv);
  int back = (wday - SCAN_WEEKDAY_UTC + 7) % 7;
  return base - (time_t)back * 86400;
}

// Scan is due ONLY inside the 90-min window after the target. The caller applies
// the cloud session gate (scan_session_active) separately.
bool scanDue(time_t now) {
  long t = cfgNextScanUtc.length() ? isoToEpoch(cfgNextScanUtc) : 0;
  if (t > 0) return now >= t && (long)now - t <= (long)(SCAN_WINDOW_MS / 1000);
  time_t local = localWeeklyScanBefore(now);
  return now >= local && (long)now - local <= (long)(SCAN_WINDOW_MS / 1000);
}

// Next future target for wake scheduling (config override first, else next Monday).
time_t nextScanTarget(time_t now) {
  long t = cfgNextScanUtc.length() ? isoToEpoch(cfgNextScanUtc) : 0;
  if (t > 0 && t >= now) return (time_t)t;
  return localWeeklyScanAfter(now);
}

bool postDailyPhoto() {
  time_t now = time(nullptr);
  String eventId = String("cam-") + dayKey(now);
  bool flashLit = false;
  camera_fb_t* fb = captureFrame(flashLit);
  if (!fb) return false;
  MultipartField fields[5] = {
    {"device_id", DEVICE_ID},
    {"event_id", eventId},
    {"event_type", "photo"},
    {"captured_at_utc", isoNow()},
    {"battery_percent", String(batteryPercentNow())}
  };
  bool ok = false;
  for (int attempt = 1; attempt <= UPLOAD_RETRIES && !ok; attempt++) {
    int status = -1;
    String respBody;
    if (postMultipart(PATH_PHOTO, fields, 5, fb, status, respBody)) {
      Serial.print(String("[photo] attempt ") + attempt + " status=" + status);
      if (respBody.length()) Serial.print(String(" body=") + respBody);
      Serial.println();
      if (status == 200 || status == 201) ok = true;
    } else {
      Serial.println(String("[photo] attempt ") + attempt + " transport failure");
    }
    if (!ok) delay(UPLOAD_BACKOFF_MS * attempt);
  }
  esp_camera_fb_return(fb);
  flashLedOff();
  if (ok) {
    saveLastDaily(dayKey(now));
    flashLedBlink();
    Serial.println(String("[photo] uploaded event_id=") + eventId);
  } else {
    Serial.println(F("[photo] upload FAILED - will retry soon (same event_id, no duplicate)"));
  }
  return ok;
}

bool postScanDone(const String& startedIso) {
  String json = String("{\"device_id\":\"") + DEVICE_ID +
                "\",\"photos_uploaded\":1" +
                ",\"started_at_utc\":\"" + startedIso +
                "\",\"ended_at_utc\":\"" + isoNow() + "\"}";
  for (int attempt = 1; attempt <= UPLOAD_RETRIES; attempt++) {
    int status = -1;
    String respBody;
    if (postJson(PATH_SCAN_DONE, json, status, respBody)) {
      Serial.print(String("[scan-done] attempt ") + attempt + " status=" + status);
      if (respBody.length()) Serial.print(String(" body=") + respBody);
      Serial.println();
      if (status == 200 || status == 201) return true;
    }
    delay(UPLOAD_BACKOFF_MS * attempt);
  }
  Serial.println(F("[scan-done] failed (session may close later via workflow timeout)"));
  return false;
}

bool postScanWindow(bool manual) {
  time_t now = time(nullptr);
  uint32_t bucket = weekBucket(now);
  if (!manual && stLastScanB == bucket) {
    Serial.println(F("[scan] already completed this week bucket"));
    return true;
  }
  bool flashLit = false;
  camera_fb_t* fb = captureFrame(flashLit);
  if (!fb) return false;
  String capturedIso = isoNow();
  MultipartField fields[3] = {
    {"device_id", DEVICE_ID},
    {"captured_at_utc", capturedIso},
    {"battery_percent", String(batteryPercentNow())}
  };
  uint32_t startMs = millis();
  uint32_t backoffMs = UPLOAD_BACKOFF_MS;
  bool done = false;
  bool failed = false;
  while (millis() - startMs < SCAN_WINDOW_MS) {
    int status = -1;
    String respBody;
    bool sent = postMultipart(PATH_SCAN, fields, 3, fb, status, respBody);
    if (sent && (status == 200 || status == 201)) {
      String st;
      bool hasStatus = jsonFindValue(respBody, "status", st);
      if (!hasStatus || st == "ok") {
        Serial.println(String("[scan] accepted status=") + status + " body=" + respBody);
        done = true;
        break;
      }
      if (st == "no_active_session") {
        Serial.println(F("[scan] no_active_session - session not open yet, retrying"));
        delay(SCAN_RETRY_INTERVAL_MS);
        continue;
      }
      Serial.println(String("[scan] unexpected status body=") + respBody + " - retrying");
      delay(SCAN_RETRY_INTERVAL_MS);
      continue;
    }
    Serial.print(String("[scan] attempt failed (status=") + status + ") - backoff ");
    Serial.print(backoffMs / 1000);
    Serial.println(F(" s"));
    delay(backoffMs);
    backoffMs = min(backoffMs * 2, 60000UL);
    failed = true;
  }
  esp_camera_fb_return(fb);
  flashLedOff();
  if (done) {
    saveScanBucket(bucket);
    flashLedBlink();
    postScanDone(capturedIso);
    return true;
  }
  if (!manual) saveScanMiss(bucket);
  Serial.println(manual ? F("[scan] manual test ended without success - no miss recorded")
                        : (failed ? F("[scan] window ended without success - recorded miss for this week")
                                  : F("[scan] window ended (session never opened) - recorded miss for this week")));
  return false;
}

bool diagnosticMode = false;

String isoUtc(time_t t) {
  struct tm tmv;
  gmtime_r(&t, &tmv);
  char buf[24];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmv);
  return String(buf);
}

String flashModeString() {
  if (g_torchOn) return String("TORCH");
  if (cfgLight >= 0 && cfgThr >= 0) return String("auto(sensor)");
  if (cfgNextSunriseUtc.length() && cfgNextSunsetUtc.length()) return String("auto(suntimes)");
  return String("auto(fallback ON)");
}

void printNextEvents() {
  time_t now = time(nullptr);
  if (now < CLOCK_VALID_AFTER) { Serial.println(F("[sched] clock invalid - next events unknown")); return; }
  Serial.print(String("[sched] next daily photo at ") + isoUtc(nextDailyTarget(now)) + " UTC");
  Serial.println(String(" | next weekly scan at ") + isoUtc(nextScanTarget(now)) + " UTC (session-gated)");
}

void commandStatus() {
  time_t now = time(nullptr);
  Serial.println(F("--- status ---"));
  Serial.print(String("[status] device=") + DEVICE_ID + " wifi=" + (WiFi.status() == WL_CONNECTED ? "up" : "down") + " utc=" + isoNow() + "\n");
  Serial.print(String("[status] last_daily=") + (stLastDaily.length() ? stLastDaily : String("-")) +
               " last_scan_bucket=" + (stLastScanB == 0xFFFFFFFF ? String("-") : String(stLastScanB)) +
               " scan_miss_bucket=" + (stScanMissB == 0xFFFFFFFF ? String("-") : String(stScanMissB)) + "\n");
  Serial.print(String("[status] scan_session_active=") + (cfgScanSessionActive ? "true" : "false") + " (as last seen in /config; config_fetched=" + (cfgFetched ? "yes" : "no") + ")\n");
  Serial.print(String("[status] flash_mode=") + flashModeString() + " torch=" + (g_torchOn ? "ON" : "OFF") + "\n");
  Serial.print(String("[status] free_heap=") + ESP.getFreeHeap() + " free_psram=" + (psramFound() ? String(ESP.getFreePsram()) : String("none")) + "\n");
  printNextEvents();
}

void commandSendNow() {
  Serial.println(F("[s] send now: GET /config, one daily photo via the scheduled path"));
  if (!connectWifi()) { Serial.println(F("[s] aborted: no WiFi")); return; }
  if (!syncClock()) { Serial.println(F("[s] aborted: no valid UTC clock")); return; }
  pollConfig();
  postDailyPhoto();
  printNextEvents();
}

void commandScanNow() {
  Serial.println(F("[c] scan now: GET /config, require scan_session_active=true, then the scan sweep"));
  if (!connectWifi()) { Serial.println(F("[c] aborted: no WiFi")); return; }
  if (!syncClock()) { Serial.println(F("[c] aborted: no valid UTC clock")); return; }
  pollConfig();
  if (!cfgScanSessionActive) {
    Serial.println(F("[scan] cloud session not active - scan would be rejected"));
    Serial.println(F("[c] aborted: no uploads sent"));
    printNextEvents();
    return;
  }
  Serial.println(F("[scan] cloud session ACTIVE - running the sweep now"));
  postScanWindow(true);
  printNextEvents();
}

void printMenu() {
  Serial.println(F("Commands: h=help s=send photo now c=scan now (needs session) i=status w=wifi n=ntp g=get config b=battery d=scan-done test f=torch r=reboot"));
}

void runDiagnostic() {
  delay(200);
  while (Serial.available()) Serial.read();
  Serial.println(F("[diag] commissioning/diagnostic mode (no deep sleep)"));
  printMenu();
  commandStatus();
  while (true) {
    if (!Serial.available()) {
      delay(50);
      continue;
    }
    char c = Serial.read();
    switch (c) {
      case 'h': printMenu(); break;
      case 'w': connectWifi(); break;
      case 'n': if (connectWifi()) syncClock(); break;
      case 'g': if (connectWifi()) pollConfig(); break;
      case 'b': Serial.print(String("[battery] raw_avg=") + batteryRawAvg() + " percent=" + batteryPercentNow() + "\n"); break;
      case 's': commandSendNow(); break;
      case 'c': commandScanNow(); break;
      case 'i': case 't': commandStatus(); break;
      case 'd': if (connectWifi()) postScanDone(isoNow()); break;
      case 'f': g_torchOn = !g_torchOn; pinMode(PIN_FLASH_LED, OUTPUT); digitalWrite(PIN_FLASH_LED, g_torchOn ? FLASH_LED_ON_LEVEL : FLASH_LED_OFF_LEVEL); Serial.println(g_torchOn ? F("[flash] ON (torch)") : F("[flash] OFF")); break;
      case 'r': Serial.println(F("[diag] rebooting")); delay(200); ESP.restart(); break;
      default: break;
    }
  }
}

void sleepUntil(time_t wakeAt) {
  if (DISABLE_DEEP_SLEEP || ALWAYS_DIAGNOSTIC) return;
  time_t now = time(nullptr);
  long secs = (long)wakeAt - (long)now;
  if (secs < 30) secs = 30;
  if (secs > SLEEP_CAP_SECONDS) secs = SLEEP_CAP_SECONDS;
  Serial.print(String("[sleep] ") + secs + " s until " + isoNow() + "\n");
  Serial.flush();
  if (cameraReady) {
    esp_camera_deinit();
    cameraReady = false;
  }
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, FLASH_LED_OFF_LEVEL);
  esp_sleep_enable_timer_wakeup((uint64_t)secs * 1000000ULL);
  esp_deep_sleep_start();
}

void runAutonomousPass() {
  if (!connectWifi()) {
    sleepUntil(time(nullptr) + RETRY_SOON_SECONDS);
    return;
  }
  if (!syncClock()) {
    sleepUntil(time(nullptr) + RETRY_SOON_SECONDS);
    return;
  }
  pollConfig();
  time_t now = time(nullptr);

  bool dailyDone = (stLastDaily == dayKey(now));
  time_t dailyTarget = nextDailyTarget(now - 86400);
  if (!dailyDone && now >= dailyTarget) {
    Serial.println(F("[plan] daily photo due"));
    postDailyPhoto();
  }

  uint32_t bucket = weekBucket(time(nullptr));
  bool scanHandled = (stLastScanB == bucket) || (stScanMissB == bucket);
  if (!scanHandled && scanDue(time(nullptr))) {
    if (cfgScanSessionActive) {
      Serial.println(F("[plan] weekly scan due + cloud session ACTIVE"));
      postScanWindow(false);
    } else {
      Serial.println(F("[scan] due but cloud session not active - no uploads, re-check soon"));
    }
  }

  now = time(nullptr);
  dailyDone = (stLastDaily == dayKey(now));
  bucket = weekBucket(now);
  scanHandled = (stLastScanB == bucket) || (stScanMissB == bucket);
  time_t nextDaily = dailyDone ? nextDailyTarget(now) : (now < nextDailyTarget(now - 86400) ? nextDailyTarget(now - 86400) : now + RETRY_SOON_SECONDS);
  time_t nextScan;
  if (scanHandled) nextScan = localWeeklyScanAfter(now + 60);
  else if (scanDue(now)) nextScan = now + RETRY_SOON_SECONDS;   // session not open yet - re-check inside the window
  else nextScan = nextScanTarget(now);
  if (nextScan < now) nextScan = now + RETRY_SOON_SECONDS;
  time_t nextEvent = nextDaily < nextScan ? nextDaily : nextScan;
  time_t wakeAt = nextEvent - WAKE_LEAD_SECONDS;
  if (wakeAt < now + 30) wakeAt = now + 30;
  sleepUntil(wakeAt);
}

void setup() {
  Serial.begin(115200);
  delay(400);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, FLASH_LED_OFF_LEVEL);
  analogSetAttenuation(ADC_11db);
  loadState();
  Serial.println();
  Serial.println(F("PhytoAI ESP32-CAM production firmware v1.1 (autonomous, session-gated scan)"));
  Serial.print(String("device_id=") + DEVICE_ID + " | base_url_configured=" + (String(SECRET_BASE_URL).length() > 0 ? "yes" : "no") + "\n");
  printMenu();

  uint32_t waitStart = millis();
  while (millis() - waitStart < DIAGNOSTIC_WINDOW_MS) {
    if (Serial.available()) {
      diagnosticMode = true;
      break;
    }
    delay(50);
  }
  if (ALWAYS_DIAGNOSTIC) diagnosticMode = true;
  if (diagnosticMode) {
    runDiagnostic();
    return;
  }

  runAutonomousPass();
  delay(200);
  ESP.restart();
}

void loop() {
  if (diagnosticMode) {
    delay(1000);
  } else {
    delay(10000);
  }
}
