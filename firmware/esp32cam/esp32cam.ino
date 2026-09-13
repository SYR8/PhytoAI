// PhytoAI ESP32-CAM bench-test firmware (staged serial menu)
//
// Board: AI Thinker ESP32-CAM (OV2640) in an ESP32-CAM expansion/motherboard
// with built-in USB-to-serial (USB-C). Program directly over that USB - no
// external FTDI adapter and no manual IO0-to-GND jumper required.
// If auto-download fails: hold the IO0 button on the expansion board, press
// RST, release RST, release IO0, then upload.
//
// Production: the CAM is standalone on battery and has NO electrical
// connection to the WROOM board - they meet only in the cloud (n8n).

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include "esp_camera.h"

// ------------------------------- CONFIG --------------------------------
// Deployment values (Wi-Fi + tunnel URL) live in the gitignored secrets.h.
// If it is missing, placeholder defaults keep the sketch compiling.
//   firmware/esp32cam/secrets.h:
//     #define SECRET_WIFI_SSID      "..."
//     #define SECRET_WIFI_PASSWORD  "..."
//     #define SECRET_BASE_URL       "https://..."
//     #define SECRET_WEBHOOK_PREFIX "/webhook-test"
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef SECRET_WIFI_SSID
#define SECRET_WIFI_SSID       "CHANGE_ME"
#define SECRET_WIFI_PASSWORD   "CHANGE_ME"
#define SECRET_BASE_URL        "https://CHANGE_ME.trycloudflare.com"
#define SECRET_WEBHOOK_PREFIX  "/webhook-test"
#endif

const char* WIFI_SSID      = SECRET_WIFI_SSID;
const char* WIFI_PASSWORD  = SECRET_WIFI_PASSWORD;
const char* BASE_URL       = SECRET_BASE_URL;
const char* WEBHOOK_PREFIX = SECRET_WEBHOOK_PREFIX;
const char* DEVICE_ID      = "esp32-cam-01";

const char* PATH_PHOTO     = "/core/photo";
const char* PATH_SCAN      = "/yolo-scan";
const char* PATH_SCAN_DONE = "/yolo-scan/done";
const char* PATH_CONFIG    = "/config";

// Battery: two-resistor divider to GPIO33 (ADC1 - ADC2 conflicts with Wi-Fi).
// TODO(battery): divider resistor values are TBD hardware. Calibrate
// BATTERY_ADC_REF and BATTERY_DIVIDER_RATIO against a multimeter, and set
// BATTERY_EMPTY_V / BATTERY_FULL_V for the actual battery chemistry.
#define PIN_BATTERY_ADC       33
#define BATTERY_SAMPLES        5
#define BATTERY_ADC_REF_V      3.3f
#define BATTERY_DIVIDER_RATIO  2.0f
#define BATTERY_EMPTY_V        3.40f
#define BATTERY_FULL_V         4.20f

// TODO(button): provisional free, boot-safe GPIO (no strapping pin). Confirm
// it is free on your expansion board; GPIO14 is the fallback. Wire the button
// to GND and use the internal pull-up (active-LOW).
#define PIN_CAPTURE_BUTTON    13
#define BUTTON_DEBOUNCE_MS    50

// Bench note: on this unit the flash LED is OFF=LOW (HIGH lights it); if the
// 'f' torch toggles inverted, flip FLASH_LED_ON_LEVEL.
#define PIN_FLASH_LED         4
#define FLASH_LED_ON_LEVEL    HIGH
#define FLASH_LED_OFF_LEVEL   LOW

// Camera frame settings (PSRAM when present, DRAM fallback).
#define CAM_FRAME_SIZE_PSRAM  FRAMESIZE_SVGA
#define CAM_FRAME_SIZE_DRAM   FRAMESIZE_VGA
#define CAM_JPEG_QUALITY      12

// Standard AI Thinker ESP32-CAM pin definitions
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
// -----------------------------------------------------------------------

bool cameraReady = false;

struct MultipartField {
  const char* name;
  String value;
};

String isoNow() {
  time_t now = time(nullptr);
  if (now < 1600000000UL) return String("1970-01-01T00:00:00Z");
  struct tm tmv;
  gmtime_r(&now, &tmv);
  char buf[24];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmv);
  return String(buf);
}

void forceFlashLedOff() {
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, FLASH_LED_OFF_LEVEL);
}

void flashLedBlink() {
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, FLASH_LED_ON_LEVEL);
  delay(80);
  forceFlashLedOff();
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

void captureCameraWarmup() {
  for (int i = 0; i < 5; i++) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
    delay(100);
  }
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
  captureCameraWarmup();
  forceFlashLedOff();
  return true;
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

bool openConnection(WiFiClientSecure& client) {
  if (!BASE_URL || String(BASE_URL).startsWith("https://CHANGE_ME")) {
    Serial.println(F("[HTTP] BASE_URL is not configured"));
    return false;
  }
  if (!String(BASE_URL).startsWith("https://")) {
    Serial.println(F("[HTTP] BASE_URL must be https://"));
    return false;
  }
  String host = hostFromBaseUrl(String(BASE_URL));
  client.setInsecure();
  client.setTimeout(15000);
  if (!client.connect(host.c_str(), 443)) {
    Serial.println(F("[HTTP] connect failed"));
    return false;
  }
  return true;
}

bool postMultipart(const char* endpoint, MultipartField* fields, size_t nFields, camera_fb_t* fb, int& status, String& respBody) {
  WiFiClientSecure client;
  if (!openConnection(client)) return false;
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
  String host = hostFromBaseUrl(String(BASE_URL));
  client.print(String("POST ") + WEBHOOK_PREFIX + endpoint + " HTTP/1.1\r\n");
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
  if (!openConnection(client)) return false;
  String host = hostFromBaseUrl(String(BASE_URL));
  client.print(String("POST ") + WEBHOOK_PREFIX + endpoint + " HTTP/1.1\r\n");
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
  if (!openConnection(client)) return false;
  String host = hostFromBaseUrl(String(BASE_URL));
  client.print(String("GET ") + WEBHOOK_PREFIX + endpoint + " HTTP/1.1\r\n");
  client.print(String("Host: ") + host + "\r\n");
  client.print(F("Accept: application/json\r\n"));
  client.print(F("Connection: close\r\n\r\n"));
  respBody = readHttpResponse(client, status);
  client.stop();
  return true;
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("[WiFi] already connected, IP="));
    Serial.print(WiFi.localIP());
    Serial.print(F("  RSSI="));
    Serial.print(WiFi.RSSI());
    Serial.println(F(" dBm"));
    return true;
  }
  Serial.print(F("[WiFi] connecting to "));
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[WiFi] connect FAILED"));
    return false;
  }
  Serial.print(F("[WiFi] connected, IP="));
  Serial.print(WiFi.localIP());
  Serial.print(F("  RSSI="));
  Serial.print(WiFi.RSSI());
  Serial.println(F(" dBm"));
  Serial.println(F("[NTP] syncing UTC time..."));
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  time_t now = time(nullptr);
  t0 = millis();
  while (now < 1600000000UL && millis() - t0 < 10000) {
    delay(200);
    now = time(nullptr);
  }
  if (now < 1600000000UL) Serial.println(F("[NTP] sync FAILED (timestamps will be epoch)"));
  else Serial.print(String("[NTP] UTC now ") + isoNow() + "\n");
  return true;
}

camera_fb_t* captureFrame() {
  if (!ensureCamera()) return nullptr;
  captureCameraWarmup();
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) Serial.println(F("[CAM] frame capture FAILED"));
  return fb;
}

void doPhotoPost() {
  if (!connectWiFi()) return;
  camera_fb_t* fb = captureFrame();
  if (!fb) return;
  char eventId[48];
  snprintf(eventId, sizeof(eventId), "cam-bench-%lu", (unsigned long)time(nullptr));
  MultipartField fields[5] = {
    {"device_id", DEVICE_ID},
    {"event_id", eventId},
    {"event_type", "photo"},
    {"captured_at_utc", isoNow()},
    {"battery_percent", String(batteryPercent(batteryVolts(batteryRawAvg())))}
  };
  int status = -1;
  String respBody;
  bool sent = postMultipart(PATH_PHOTO, fields, 5, fb, status, respBody);
  esp_camera_fb_return(fb);
  forceFlashLedOff();
  if (!sent) return;
  Serial.print(F("[POST /core/photo] status="));
  Serial.println(status);
  if (respBody.length()) Serial.print(String("  body: ") + respBody + "\n");
  if (status == 200 || status == 201) flashLedBlink();
}

void cmdHealth() {
  if (!ensureCamera()) return;
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println(F("[CAM] frame capture FAILED"));
    return;
  }
  Serial.print(F("[CAM] OK - frame "));
  Serial.print(fb->width);
  Serial.print('x');
  Serial.print(fb->height);
  Serial.print(F(" bytes="));
  Serial.println(fb->len);
  esp_camera_fb_return(fb);
  forceFlashLedOff();
}

void cmdBattery() {
  Serial.print(F("[BAT] samples: "));
  long sum = 0;
  for (int i = 0; i < BATTERY_SAMPLES; i++) {
    int raw = analogRead(PIN_BATTERY_ADC);
    sum += raw;
    Serial.print(raw);
    if (i < BATTERY_SAMPLES - 1) Serial.print(F(", "));
    delay(5);
  }
  int avg = (int)(sum / BATTERY_SAMPLES);
  float volts = batteryVolts(avg);
  Serial.println();
  Serial.print(F("[BAT] raw_avg="));
  Serial.print(avg);
  Serial.print(F("  battery_v="));
  Serial.print(volts, 2);
  Serial.print(F("  percent="));
  Serial.print(batteryPercent(volts));
  Serial.println(F("%  (TODO: calibrate divider/empty/full)"));
}

void cmdScan() {
  if (!connectWiFi()) return;
  camera_fb_t* fb = captureFrame();
  if (!fb) return;
  MultipartField fields[3] = {
    {"device_id", DEVICE_ID},
    {"captured_at_utc", isoNow()},
    {"battery_percent", String(batteryPercent(batteryVolts(batteryRawAvg())))}
  };
  int status = -1;
  String respBody;
  bool sent = postMultipart(PATH_SCAN, fields, 3, fb, status, respBody);
  esp_camera_fb_return(fb);
  forceFlashLedOff();
  if (!sent) return;
  Serial.print(F("[POST /yolo-scan] status="));
  Serial.println(status);
  if (respBody.length()) Serial.print(String("  response: ") + respBody + "\n");
  if (status == 200 || status == 201) flashLedBlink();
}

void cmdScanDone() {
  if (!connectWiFi()) return;
  String now = isoNow();
  String json = String("{\"device_id\":\"") + DEVICE_ID +
                "\",\"photos_uploaded\":1" +
                ",\"started_at_utc\":\"" + now +
                "\",\"ended_at_utc\":\"" + now + "\"}";
  int status = -1;
  String respBody;
  if (!postJson(PATH_SCAN_DONE, json, status, respBody)) return;
  Serial.print(F("[POST /yolo-scan/done] status="));
  Serial.println(status);
  if (respBody.length()) Serial.print(String("  body: ") + respBody + "\n");
}

void cmdConfig() {
  if (!connectWiFi()) return;
  int status = -1;
  String respBody;
  if (!httpGet(PATH_CONFIG, status, respBody)) return;
  Serial.print(F("[GET /config] status="));
  Serial.println(status);
  if (respBody.length()) Serial.print(String("  response: ") + respBody + "\n");
}

void cmdFlashToggle() {
  static bool torchOn = false;
  torchOn = !torchOn;
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, torchOn ? FLASH_LED_ON_LEVEL : FLASH_LED_OFF_LEVEL);
  Serial.print(F("[FLASH] "));
  Serial.println(torchOn ? F("ON (torch)") : F("OFF"));
}

bool buttonPressedEdge() {
  static bool lastRead = false;
  static bool stable = false;
  static uint32_t changedAt = 0;
  bool raw = (digitalRead(PIN_CAPTURE_BUTTON) == LOW);
  if (raw != lastRead) {
    changedAt = millis();
    lastRead = raw;
  }
  if (millis() - changedAt > BUTTON_DEBOUNCE_MS && raw != stable) {
    stable = raw;
    if (stable) return true;
  }
  return false;
}

void printMenu() {
  Serial.println();
  Serial.println(F("Commands:"));
  Serial.println(F("  h = health check (camera init + frame capture, no Wi-Fi)"));
  Serial.println(F("  w = connect Wi-Fi (IP + RSSI + NTP)"));
  Serial.println(F("  b = battery ADC raw + percent (5 samples)"));
  Serial.println(F("  p = capture + POST /core/photo"));
  Serial.println(F("  s = capture + POST /yolo-scan (prints response)"));
  Serial.println(F("  d = POST /yolo-scan/done"));
  Serial.println(F("  c = GET /config"));
  Serial.println(F("  f = flash LED toggle (torch)"));
}

void setup() {
  Serial.begin(115200);
  delay(400);
  forceFlashLedOff();
  pinMode(PIN_CAPTURE_BUTTON, INPUT_PULLUP);
  analogSetAttenuation(ADC_11db);
  Serial.println();
  Serial.println(F("PhytoAI ESP32-CAM bench test (staged)"));
  Serial.print(F("device_id="));
  Serial.println(DEVICE_ID);
  printMenu();
}

void loop() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    switch (c) {
      case 'h': case 'H': cmdHealth(); break;
      case 'w': case 'W': connectWiFi(); break;
      case 'b': case 'B': cmdBattery(); break;
      case 'p': case 'P': doPhotoPost(); break;
      case 's': case 'S': cmdScan(); break;
      case 'd': case 'D': cmdScanDone(); break;
      case 'c': case 'C': cmdConfig(); break;
      case 'f': case 'F': cmdFlashToggle(); break;
      default: break;
    }
  }
  if (buttonPressedEdge()) {
    Serial.println(F("[BTN] capture button pressed"));
    doPhotoPost();
  }
}
