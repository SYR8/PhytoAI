#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>

#define PIN_DHT22        14
#define PIN_ONEWIRE       4
#define PIN_XKC_LEVEL    27
#define PIN_LIGHT_DO     25
#define PIN_SOIL_ADC     34
#define PIN_HX711_DT     26
#define PIN_HX711_SCK    33
#define PIN_RELAY_PUMP   13
#define PIN_RELAY_HEATER (-1)

#define TANK_EMPTY_LEVEL  HIGH
#define RELAY_ACTIVE_LOW  true

float HX711_SCALE_FACTOR = 0.0f;
int   SOIL_ADC_DRY = 0;
int   SOIL_ADC_WET = 0;
float PUMP_FLOW_ML_PER_SEC = 0.0f;

DHT dht(PIN_DHT22, DHT22);
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds(&oneWire);
HX711 scale;

int g_soilMax = -1;
int g_soilMin = -1;
int g_lastXkcRaw = -1;
bool g_sawXkcHigh = false;
bool g_sawXkcLow = false;
uint8_t g_dsAddr[8][8];
int g_dsCount = 0;

const __FlashStringHelper* lvlStr(int v) {
  if (v == HIGH) return F("HIGH");
  if (v == LOW) return F("LOW");
  return F("?");
}

bool relayOffLevel() { return RELAY_ACTIVE_LOW ? HIGH : LOW; }
bool relayOnLevel()  { return RELAY_ACTIVE_LOW ? LOW : HIGH; }

void relayPump(bool on) {
  digitalWrite(PIN_RELAY_PUMP, on ? relayOnLevel() : relayOffLevel());
}

bool hxWait(uint32_t ms) {
  uint32_t t0 = millis();
  while (millis() - t0 < ms) {
    if (scale.is_ready()) return true;
    delay(5);
  }
  return false;
}

long hxRawAvg(uint8_t n) {
  long sum = 0;
  uint8_t got = 0;
  for (uint8_t i = 0; i < n; i++) {
    if (!hxWait(1000)) break;
    sum += scale.read();
    got++;
  }
  return got ? (sum / got) : 0;
}

float hxUnits(uint8_t n) {
  if (!hxWait(1000)) return NAN;
  return scale.get_units(n);
}

int readXkcRaw() {
  int r = digitalRead(PIN_XKC_LEVEL);
  g_lastXkcRaw = r;
  if (r == HIGH) g_sawXkcHigh = true;
  else g_sawXkcLow = true;
  return r;
}

bool tankEmpty() {
  return readXkcRaw() == TANK_EMPTY_LEVEL;
}

void printAddr(const uint8_t* a) {
  for (int i = 0; i < 8; i++) {
    if (a[i] < 16) Serial.print('0');
    Serial.print(a[i], HEX);
    if (i < 7) Serial.print(' ');
  }
}

void printTemp(float t) {
  if (isnan(t) || t <= -100.0f || t >= 85.0f) {
    Serial.print(F("INVALID"));
  } else {
    Serial.print(t, 2);
    Serial.print(F(" C"));
  }
}

void scanDsQuiet() {
  ds.begin();
  int n = ds.getDeviceCount();
  g_dsCount = n > 8 ? 8 : n;
  for (int i = 0; i < g_dsCount; i++) {
    if (!ds.getAddress(g_dsAddr[i], i)) {
      g_dsCount = i;
      break;
    }
  }
}

void printConstants() {
  Serial.println();
  Serial.println(F("=============== COPY THESE BACK ================="));
  Serial.print(F("1) TANK_EMPTY_LEVEL = "));
  Serial.print(lvlStr(TANK_EMPTY_LEVEL));
  Serial.print(F("   // last D27 raw="));
  Serial.print(lvlStr(g_lastXkcRaw));
  Serial.print(F("  seen HIGH="));
  Serial.print(g_sawXkcHigh ? 1 : 0);
  Serial.print(F(" LOW="));
  Serial.print(g_sawXkcLow ? 1 : 0);
  Serial.println(F("  (set to the raw level seen when the sensor is OUT of water)"));

  Serial.print(F("2) RELAY_ACTIVE_LOW = "));
  Serial.println(RELAY_ACTIVE_LOW ? F("true") : F("false"));
  Serial.println(F("   // from 'p': pump/relay reacted = true; silent = false"));

  Serial.print(F("3) HX711_SCALE_FACTOR = "));
  if (HX711_SCALE_FACTOR == 0.0f) Serial.println(F("(unset - run 'w')"));
  else Serial.println(HX711_SCALE_FACTOR, 3);

  Serial.print(F("4) SOIL_ADC_DRY = "));
  if (g_soilMax < 0) Serial.print(F("?")); else Serial.print(g_soilMax);
  Serial.print(F("   SOIL_ADC_WET = "));
  if (g_soilMin < 0) Serial.print(F("?")); else Serial.print(g_soilMin);
  Serial.println(F("   // session extremes: dry-air max / submerged min"));

  Serial.println(F("5) DS18B20 addresses:"));
  if (g_dsCount <= 0) {
    Serial.println(F("   (none found - run 'a')"));
  } else {
    ds.requestTemperatures();
    for (int i = 0; i < g_dsCount; i++) {
      Serial.print(F("   #"));
      Serial.print(i + 1);
      Serial.print(' ');
      printAddr(g_dsAddr[i]);
      Serial.print(F("  temp_c="));
      printTemp(ds.getTempC(g_dsAddr[i]));
      Serial.println();
    }
    Serial.println(F("   -> soilTempAddress = the address you warmed; waterTempAddress = the other"));
  }

  Serial.print(F("6) PUMP_FLOW_ML_PER_SEC = "));
  if (PUMP_FLOW_ML_PER_SEC <= 0.0f) Serial.println(F("(unset - run 'c')"));
  else Serial.println(PUMP_FLOW_ML_PER_SEC, 3);

  Serial.println(F("================================================="));
  Serial.println();
}

void readAllSensors() {
  Serial.println(F("-----------------------"));

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) {
    Serial.println(F("[DHT22] read failed (NaN) - check DATA->D14 S and 10k pull-up"));
  } else {
    Serial.print(F("[DHT22] air_temp_c="));
    Serial.print(t, 1);
    Serial.print(F("  humidity_pct="));
    Serial.println(h, 1);
  }

  if (g_dsCount <= 0) scanDsQuiet();
  if (g_dsCount <= 0) {
    Serial.println(F("[DS18B20] no probes found - run 'a'"));
  } else {
    ds.requestTemperatures();
    for (int i = 0; i < g_dsCount; i++) {
      Serial.print(F("[DS18B20] #"));
      Serial.print(i + 1);
      Serial.print(' ');
      printAddr(g_dsAddr[i]);
      Serial.print(F("  temp_c="));
      printTemp(ds.getTempC(g_dsAddr[i]));
      Serial.println();
    }
  }

  int x = readXkcRaw();
  Serial.print(F("[XKC] D27 raw="));
  Serial.print(lvlStr(x));
  Serial.print(F(" -> tank "));
  Serial.println(x == TANK_EMPTY_LEVEL ? F("EMPTY") : F("not empty"));

  int lv = digitalRead(PIN_LIGHT_DO);
  Serial.print(F("[LIGHT] D25 DO raw="));
  Serial.println(lv);

  int s = analogRead(PIN_SOIL_ADC);
  if (g_soilMax < 0 || s > g_soilMax) g_soilMax = s;
  if (g_soilMin < 0 || s < g_soilMin) g_soilMin = s;
  Serial.print(F("[SOIL] D34 raw="));
  Serial.print(s);
  if (SOIL_ADC_DRY > SOIL_ADC_WET && SOIL_ADC_DRY > 0) {
    int pct = map(s, SOIL_ADC_DRY, SOIL_ADC_WET, 0, 100);
    pct = constrain(pct, 0, 100);
    Serial.print(F("  ~"));
    Serial.print(pct);
    Serial.print('%');
  }
  Serial.print(F("  (session min="));
  Serial.print(g_soilMin);
  Serial.print(F(" max="));
  Serial.print(g_soilMax);
  Serial.println(')');

  Serial.print(F("[HX711] raw_avg5="));
  if (hxWait(1000)) {
    long raw = hxRawAvg(5);
    Serial.print(raw);
    if (HX711_SCALE_FACTOR != 0.0f) {
      Serial.print(F("  grams="));
      Serial.print((float)raw / HX711_SCALE_FACTOR, 1);
    }
  } else {
    Serial.print(F("(not ready)"));
  }
  Serial.println();
}

void waitForEnter() {
  Serial.setTimeout(120000);
  Serial.readStringUntil('\n');
}

void drainSerial() {
  delay(200);
  while (Serial.available()) Serial.read();
}

float readSerialFloat() {
  Serial.setTimeout(60000);
  String s = Serial.readStringUntil('\n');
  s.trim();
  return s.toFloat();
}

void commandScanDs() {
  Serial.println(F("[DS18B20] scanning D4 bus..."));
  ds.begin();
  int n = ds.getDeviceCount();
  Serial.print(F("[DS18B20] devices found: "));
  Serial.println(n);
  if (n == 0) {
    Serial.println(F("  check: DATA->D4 S, GND->D4 G, VCC->3.3V, 4.7k pull-up DATA->3.3V"));
    g_dsCount = 0;
    printConstants();
    return;
  }
  g_dsCount = n > 8 ? 8 : n;
  ds.requestTemperatures();
  for (int i = 0; i < g_dsCount; i++) {
    if (!ds.getAddress(g_dsAddr[i], i)) {
      Serial.print(F("  #"));
      Serial.print(i + 1);
      Serial.println(F(" address read failed"));
      g_dsCount = i;
      break;
    }
    Serial.print(F("  #"));
    Serial.print(i + 1);
    Serial.print(F(" addr="));
    printAddr(g_dsAddr[i]);
    Serial.print(F("  temp_c="));
    printTemp(ds.getTempC(g_dsAddr[i]));
    Serial.println();
  }
  Serial.println(F("  Identify: warm ONE probe in your hand ~20 s, run 'a' again;"));
  Serial.println(F("  the address whose temperature rose is that probe."));
  printConstants();
}

void commandTare() {
  drainSerial();
  Serial.println(F("[HX711] taring - keep the scale still..."));
  if (!hxWait(2000)) {
    Serial.println(F("  HX711 not ready - check DT->D26 S, SCK->D33 S, VCC->3V pin, GND->D26 G"));
    return;
  }
  scale.tare(10);
  Serial.println(F("  tared."));
  printConstants();
}

void commandCalibrateWeight() {
  drainSerial();
  Serial.println(F("[CAL] known-weight calibration"));
  if (!hxWait(2000)) {
    Serial.println(F("  HX711 not ready - check DT->D26 S, SCK->D33 S, VCC->3V pin, GND->D26 G"));
    return;
  }
  Serial.print(F("  Enter known weight in grams, then press ENTER: "));
  float grams = readSerialFloat();
  if (grams <= 0.0f) {
    Serial.println(F("  invalid weight - abort"));
    return;
  }
  Serial.println(F("  Remove ALL weight from the scale, then press ENTER to tare..."));
  waitForEnter();
  scale.tare(10);
  Serial.println(F("  tared."));
  Serial.print(F("  Place the "));
  Serial.print(grams, 1);
  Serial.println(F(" g weight, then press ENTER to measure..."));
  waitForEnter();
  long raw = hxRawAvg(20);
  if (raw == 0) {
    Serial.println(F("  read failed - abort"));
    return;
  }
  HX711_SCALE_FACTOR = (float)raw / grams;
  scale.set_scale(HX711_SCALE_FACTOR);
  Serial.print(F("  raw_avg20="));
  Serial.print(raw);
  Serial.print(F("  HX711_SCALE_FACTOR="));
  Serial.println(HX711_SCALE_FACTOR, 3);
  Serial.println(F("  negative factor = load cell wired in reverse; keep the sign you measured."));
  printConstants();
}

void commandPumpPulse() {
  int x = readXkcRaw();
  Serial.print(F("[PUMP] D27 raw="));
  Serial.print(lvlStr(x));
  Serial.print(F("  TANK_EMPTY_LEVEL="));
  Serial.print(lvlStr(TANK_EMPTY_LEVEL));
  if (x == TANK_EMPTY_LEVEL) {
    Serial.println(F("  -> tank EMPTY: 2 s pulse BLOCKED"));
    return;
  }
  Serial.println(F("  -> 2 s pulse ON"));
  relayPump(true);
  delay(2000);
  relayPump(false);
  Serial.println(F("  pump OFF."));
  Serial.println(F("  If the pump/relay did NOT react: board is ACTIVE-HIGH -> set RELAY_ACTIVE_LOW=false."));
  printConstants();
}

void commandPumpFlowCal() {
  drainSerial();
  if (HX711_SCALE_FACTOR == 0.0f) {
    Serial.println(F("[FLOW] run 'w' first (scale not calibrated)"));
    return;
  }
  int x = readXkcRaw();
  if (x == TANK_EMPTY_LEVEL) {
    Serial.println(F("[FLOW] tank EMPTY - blocked"));
    return;
  }
  if (!hxWait(2000)) {
    Serial.println(F("[FLOW] HX711 not ready"));
    return;
  }
  Serial.println(F("[FLOW] Remove weight; press ENTER to tare..."));
  waitForEnter();
  scale.tare(10);
  float startg = hxUnits(20);
  Serial.print(F("[FLOW] start grams="));
  Serial.println(startg, 1);
  Serial.println(F("[FLOW] pump ON for 10 s..."));
  relayPump(true);
  uint32_t t0 = millis();
  while (millis() - t0 < 10000UL) delay(200);
  relayPump(false);
  Serial.println(F("[FLOW] pump OFF - settling 3 s..."));
  delay(3000);
  float endg = hxUnits(20);
  float delta = fabs(endg - startg);
  Serial.print(F("[FLOW] end grams="));
  Serial.print(endg, 1);
  Serial.print(F("  delta="));
  Serial.print(delta, 1);
  Serial.println(F(" g"));
  if (isnan(delta) || delta < 0.5f) {
    Serial.println(F("[FLOW] no meaningful rise - prime pump / check tubing; result not stored"));
    printConstants();
    return;
  }
  PUMP_FLOW_ML_PER_SEC = delta / 10.0f;
  Serial.print(F("[FLOW] PUMP_FLOW_ML_PER_SEC="));
  Serial.println(PUMP_FLOW_ML_PER_SEC, 3);
  printConstants();
}

void liveLoop() {
  Serial.println(F("[LIVE] readings every 2 s - press any key to stop"));
  while (!Serial.available()) {
    readAllSensors();
    delay(2000);
  }
  while (Serial.available()) Serial.read();
  Serial.println(F("[LIVE] stopped"));
}

void printMenu() {
  Serial.println(F("Commands:"));
  Serial.println(F("  r = read all sensors once"));
  Serial.println(F("  l = live readings every 2 s (any key stops)"));
  Serial.println(F("  a = scan DS18B20 bus (addresses + temps)"));
  Serial.println(F("  t = tare scale"));
  Serial.println(F("  w = known-weight calibration"));
  Serial.println(F("  p = pump pulse 2 s (blocked when tank empty)"));
  Serial.println(F("  c = pump flow calibration 10 s (run 'w' first)"));
}

void setup() {
  pinMode(PIN_RELAY_PUMP, OUTPUT);
  digitalWrite(PIN_RELAY_PUMP, relayOffLevel());
#if PIN_RELAY_HEATER >= 0
  pinMode(PIN_RELAY_HEATER, OUTPUT);
  digitalWrite(PIN_RELAY_HEATER, relayOffLevel());
#endif

  Serial.begin(115200);
  delay(400);
  Serial.println();
  Serial.println(F("PhytoAI WROOM - Deliverable 1 hardware test/calibration"));
  Serial.println(F("[SAFETY] pump relay forced OFF at boot; relay assumed ACTIVE-LOW."));
  Serial.println(F("         If the pump runs now: cut power, set RELAY_ACTIVE_LOW=false, re-flash."));

  pinMode(PIN_XKC_LEVEL, INPUT);
  pinMode(PIN_LIGHT_DO, INPUT);
  pinMode(PIN_SOIL_ADC, INPUT);

#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  analogSetAttenuation(ADC_ATTEN_DB_12);
#else
  analogSetAttenuation(ADC_11db);
#endif

  dht.begin();
  scanDsQuiet();
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);

  printMenu();
  printConstants();
}

void loop() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    switch (c) {
      case 'r': case 'R': readAllSensors(); printConstants(); break;
      case 'l': case 'L': liveLoop(); printConstants(); break;
      case 'a': case 'A': commandScanDs(); break;
      case 't': case 'T': commandTare(); break;
      case 'w': case 'W': commandCalibrateWeight(); break;
      case 'p': case 'P': commandPumpPulse(); break;
      case 'c': case 'C': commandPumpFlowCal(); break;
      default: break;
    }
  }
}
