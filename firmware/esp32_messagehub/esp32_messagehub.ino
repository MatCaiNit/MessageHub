#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <DHT.h>      // Thu vien "DHT sensor library" cua Adafruit - can cai them
                      // trong Library Manager (Sketch > Include Library > Manage
                      // Libraries...), tim "DHT sensor library" by Adafruit. No
                      // se tu doi hoi cai them "Adafruit Unified Sensor" - Arduino
                      // IDE se hoi cai luon, cu Bam Install.
#include "Output.h"   // FIX: struct Output phai nam trong header rieng, nap
                      // truoc khi Arduino IDE tu sinh prototype cho cac ham
                      // ben duoi - de trong cung 1 file .ino se bi loi
                      // "Output does not name a type" nhu ban vua gap.

//  CHÂN GPIO
#define PIN_PIR      21   // PIR thực tế đang cắm ở D21
#define PIN_BOOT_BTN 0

// ====================== CAM BIEN MOI: NHIET/AM/AM THANH/KHOANG CACH =====
// Chon chan CHUA dung bang PIR(21)/BOOT(0)/LED(26) o tren.
#define PIN_DHT       4    // DHT22 (AM2302) - chan DATA, can 1 tro 10k keo len 3.3V
#define DHT_TYPE      DHT22
#define PIN_SOUND     34   // KY-038/KY-037 - chan AO (analog). GPIO34 la chan
                           // chi-doc (input-only) tren ESP32 nen rat hop de doc
                           // cam bien, khong dung de dieu khien duoc.
#define PIN_TRIG      5    // HC-SR04 - chan Trig (phat xung sieu am)
#define PIN_ECHO      18   // HC-SR04 - chan Echo (nhan xung phan hoi)
#define PIN_GAS       35   // MQ-2 - chan AO (analog). GPIO35 cung la chan
                           // chi-doc (input-only) nhu GPIO34, hop de doc cam
                           // bien ma khong dung de dieu khien duoc.

DHT dht(PIN_DHT, DHT_TYPE);

#define TELEMETRY_INTERVAL_MS 30000UL   // gui du lieu cam bien moi 30s
unsigned long lastTelemetryAt = 0;
// ==========================================================================

// ====================== DAU RA DIEU KHIEN ON/OFF =============
Output outputs[] = {
  { "led", 26, false, false },   // LED qua tro 220 ohm, da noi tren D26
};
const int OUTPUT_COUNT = sizeof(outputs) / sizeof(outputs[0]);

#define COMMAND_POLL_MS 4000UL
unsigned long lastCommandPoll = 0;

Output* findOutput(const char* id) {
  if (!id) return nullptr;
  for (int i = 0; i < OUTPUT_COUNT; i++) {
    if (strcmp(outputs[i].id, id) == 0) return &outputs[i];
  }
  return nullptr;
}

void setOutput(Output* out, bool on) {
  if (!out) return;
  out->state = on;
  bool level = out->activeLow ? !on : on;
  digitalWrite(out->pin, level ? HIGH : LOW);
  Serial.printf("[OUT] %s -> %s\n", out->id, on ? "BAT" : "TAT");
}
// ===============================================================

const unsigned long PIR_LOW_STABLE   = 5000;
const unsigned long PIR_MIN_INTERVAL = 10000;   // PIR_MIN_INTERVAL da la khoang cach toi thieu ~10s giua 2 lan phat hien
#define DEBUG_PIR_STATE  true

// ====================== MOI: CHUOI CHUYEN DONG 3 LAN LIEN TIEP ===
// Phat hien 3 lan chuyen dong LIEN TIEP, moi lan cach lan truoc khong qua
// MOTION_GAP_MAX_MS (~10-15s, PIR_MIN_INTERVAL o tren da dam bao toi thieu
// 10s giua 2 lan) thi nhay LED + bao ve app. Neu lau hon MOTION_GAP_MAX_MS
// ma khong co lan tiep theo thi coi nhu chuoi bi dut, dem lai tu dau -
// khong bao gi ca neu chua du 3 lan.
#define MOTION_SEQ_TARGET    3
#define MOTION_GAP_MAX_MS    15000UL
#define MOTION_BLINK_TARGET  "led"
#define MOTION_BLINK_TIMES   5
#define MOTION_BLINK_ON_MS   150
#define MOTION_BLINK_OFF_MS  150

int motionSeqCount = 0;
unsigned long lastMotionAt = 0;
// ===================================================================


Preferences prefs;
String apiKey   = "";
String deviceId = "";     // _id thuc cua Device trong MongoDB, dung de poll lenh
String deviceLabel = "";  // ten hien thi rieng cua board nay, VD "MessageHub-A4CF12"

int  lastPirState        = LOW;
unsigned long lastPirLowTime  = 0;
unsigned long lastTriggerTime = 0;
unsigned long lastDebugTime   = 0;
bool armed = false;

WiFiManager wm;

// FIX: dat 2 ham nay SAU khi apiKey/deviceId da duoc khai bao o tren (2 bien
// nay dung ben trong ham) - Arduino chi tu sinh prototype cho HAM, khong
// giup gi voi thu tu khai bao BIEN toan cuc.
const char* SERVER_BASE = "http://192.168.1.3:3000";
String messageUrl() { return String(SERVER_BASE) + "/api/messages/device"; }
String commandUrl() { return String(SERVER_BASE) + "/api/devices/" + deviceId + "/command"; }

bool sendMessage(const char* content, const char* type, JsonDocument* deviceDataDoc = nullptr);
void pollCommand();
void sendTelemetry();
float readDistanceCm();


String getUniqueDeviceLabel() {
  uint64_t chipId = ESP.getEfuseMac(); // MAC address duy nhat cua tung chip
  char buf[32];
  // Lay 6 hex cuoi cua chip id lam ma nhan dien ngan gon, de doc
  snprintf(buf, sizeof(buf), "MessageHub-%04X",
           (uint16_t)(chipId >> 32));
  return String(buf);
}


// WIFI PROVISIONING
void setupWiFiAndApiKey() {
  deviceLabel = getUniqueDeviceLabel();
  Serial.printf("[SETUP] Ten thiet bi (hotspot khi config): %s\n", deviceLabel.c_str());

  // Namespace flash rieng theo tung chip -> nhieu board khong ghi de len nhau
  // du dung chung 1 file code (moi board co Chip ID rieng)
  prefs.begin("msghub", false);
  apiKey   = prefs.getString("apikey", "");
  deviceId = prefs.getString("deviceid", "");

  // FIX: gioi han cu la 64 ky tu, nhung API key that (tien to "dvk_" + 64 ky
  // tu hex) dai ~68 ky tu nen bi cat, khong nhap du duoc. Tang len 100.
  WiFiManagerParameter customApiKey(
      "apikey", "API Key (lay tu tab Thiet bi tren web MessageHub)",
      apiKey.c_str(), 100);
  wm.addParameter(&customApiKey);

  // Device ID la ObjectId cua MongoDB (24 ky tu hex), tang len 40 cho du phong
  WiFiManagerParameter customDeviceId(
      "deviceid", "Device ID (cung xem o tab Thiet bi tren web MessageHub)",
      deviceId.c_str(), 40);
  wm.addParameter(&customDeviceId);

  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  if (digitalRead(PIN_BOOT_BTN) == LOW) {
    Serial.println("[SETUP] Nut BOOT dang giu - xoa config cu");
    wm.resetSettings();
    prefs.remove("apikey");
    prefs.remove("deviceid");
  }

  wm.setConfigPortalTimeout(180);

  Serial.printf("[SETUP] Dang ket noi WiFi (hoac mo hotspot \"%s\" de config)...\n",
                deviceLabel.c_str());

  // Ten hotspot = deviceLabel rieng cua tung board -> nhieu board
  // bat cung luc se co ten khac nhau tren danh sach WiFi cua dien thoai
  bool ok = wm.autoConnect(deviceLabel.c_str());

  if (!ok) {
    Serial.println("[SETUP] Khong ket noi duoc va het thoi gian cho config.");
    delay(5000);
    ESP.restart();
  }

  Serial.println("[SETUP] WiFi da ket noi!");
  Serial.printf("[SETUP] IP: %s\n", WiFi.localIP().toString().c_str());

  String enteredKey = String(customApiKey.getValue());
  enteredKey.trim();
  if (enteredKey.length() > 0) {
    apiKey = enteredKey;
    prefs.putString("apikey", apiKey);
    Serial.println("[SETUP] Da luu API key vao flash");
  }

  String enteredDeviceId = String(customDeviceId.getValue());
  enteredDeviceId.trim();
  if (enteredDeviceId.length() > 0) {
    deviceId = enteredDeviceId;
    prefs.putString("deviceid", deviceId);
    Serial.println("[SETUP] Da luu Device ID vao flash");
  }

  if (apiKey.length() == 0) {
    Serial.println("[SETUP] ⚠ CHUA CO API KEY! Giu nut BOOT 3s de vao lai config.");
  }
  if (deviceId.length() == 0) {
    Serial.println("[SETUP] ⚠ CHUA CO DEVICE ID! Se khong bat/tat duoc tu app cho toi khi nhap.");
  }
}



void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("╔═════════════════════════════════════════════════╗");
  Serial.println("║  MessageHub ESP32 - Multi-device Provisioning  ║");
  Serial.println("╚═════════════════════════════════════════════════╝");

  pinMode(PIN_PIR, INPUT);

  for (int i = 0; i < OUTPUT_COUNT; i++) {
    pinMode(outputs[i].pin, OUTPUT);
    setOutput(&outputs[i], false);
  }

  // Cam bien moi
  dht.begin();
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  setupWiFiAndApiKey();

  Serial.println("[BOOT] PIR dang warm-up (60s)...");
  unsigned long start = millis();
  while (millis() - start < 60000) {
    if (millis() - lastDebugTime > 5000) {
      lastDebugTime = millis();
      int p = digitalRead(PIN_PIR);
      Serial.printf("[WARMUP] Con %lds - PIR = %s\n",
                    (60000 - (millis() - start)) / 1000,
                    p == HIGH ? "HIGH" : "LOW");
    }
    delay(100);
  }
  Serial.println("[BOOT] Warm-up xong");
  lastPirState = digitalRead(PIN_PIR);
  lastPirLowTime = millis();

  if (apiKey.length() > 0) {
    Serial.println("[BOOT] Gui tin chao server...");
    char hello[128];
    snprintf(hello, sizeof(hello),
             "V %s da online — PIR san sang phat hien chuyen dong",
             deviceLabel.c_str());

    StaticJsonDocument<128> bootData;
    bootData["event"] = "boot";
    JsonArray arr = bootData.createNestedArray("outputs");
    for (int i = 0; i < OUTPUT_COUNT; i++) {
      JsonObject o = arr.createNestedObject();
      o["outputId"] = outputs[i].id;
      o["state"]    = outputs[i].state;
    }

    if (sendMessage(hello, "device_event", &bootData)) {
      Serial.println("[BOOT] OK - firmware san sang!");
    } else {
      Serial.println("[BOOT] LOI - kiem tra API key + server URL + firewall");
    }
  } else {
    Serial.println("[BOOT] Bo qua - chua co API key.");
  }
}



// Nhay dau ra `id` mot vai lan roi tra ve DUNG trang thai truoc do (khong
// pha trang thai on/off nguoi dung dang dieu khien qua app).
void blinkOutput(const char* id, int times, int onMs, int offMs) {
  Output* out = findOutput(id);
  if (!out) return;
  bool prev = out->state;
  for (int i = 0; i < times; i++) {
    setOutput(out, true);
    delay(onMs);
    setOutput(out, false);
    delay(offMs);
  }
  setOutput(out, prev);
}

// Goi moi khi PIR bat duoc 1 lan chuyen dong hop le (da qua debounce/re-arm
// o loop() ben duoi). Chi hanh dong (nhay LED + bao app) khi du 3 lan LIEN
// TIEP, cach nhau khong qua MOTION_GAP_MAX_MS - duoi 3 lan thi khong lam gi.
void onMotionDetected() {
  unsigned long now = millis();

  if (lastMotionAt != 0 && (now - lastMotionAt) > MOTION_GAP_MAX_MS) {
    // Qua lau ke tu lan truoc -> chuoi cu bi dut, tinh lai tu dau
    Serial.println("[PIR] Chuoi bi dut (cach qua lau), dem lai tu dau");
    motionSeqCount = 0;
  }
  lastMotionAt = now;
  motionSeqCount++;

  Serial.printf("[PIR] Chuyen dong lan %d/%d trong chuoi\n", motionSeqCount, MOTION_SEQ_TARGET);

  if (motionSeqCount >= MOTION_SEQ_TARGET) {
    Serial.println("[PIR] Du 3 lan lien tiep -> nhay LED + bao app");
    blinkOutput(MOTION_BLINK_TARGET, MOTION_BLINK_TIMES, MOTION_BLINK_ON_MS, MOTION_BLINK_OFF_MS);

    StaticJsonDocument<128> data;
    data["event"] = "motion_sequence_detected";
    data["count"] = motionSeqCount;
    sendMessage(" Phat hien chuyen dong 3 lan lien tiep!", "device_event", &data);

    motionSeqCount = 0;   // reset, san sang cho chuoi tiep theo
  }
  // Duoi 3 lan: chi dem trong Serial, KHONG nhay LED, KHONG bao app
}


// Do khoang cach bang HC-SR04 (cm). Tra ve -1 neu khong doc duoc (qua xa/loi).
float readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // timeout 25ms ~ toi da do duoc khoang 4m, du dung trong nha
  long duration = pulseIn(PIN_ECHO, HIGH, 25000UL);
  if (duration <= 0) return -1;
  return duration * 0.0343f / 2.0f;   // van toc am thanh ~343 m/s
}

// Doc ca 4 cam bien roi gui 1 goi telemetry duy nhat len server.
// Dung deviceData.readings de FE (Dashboard) doc va ve bieu do.
void sendTelemetry() {
  float temperature = dht.readTemperature();   // NaN neu doc loi
  float humidity     = dht.readHumidity();     // NaN neu doc loi
  int   soundRaw      = analogRead(PIN_SOUND); // 0-4095
  float distanceCm     = readDistanceCm();      // -1 neu khong do duoc
  int   gasRaw         = analogRead(PIN_GAS);   // 0-4095, MQ-2 (khi gas/khoi)

  StaticJsonDocument<256> data;
  data["event"] = "telemetry";
  JsonObject readings = data.createNestedObject("readings");
  if (!isnan(temperature)) readings["temperature"] = temperature;
  if (!isnan(humidity))    readings["humidity"]    = humidity;
  readings["soundLevel"] = soundRaw;
  if (distanceCm >= 0)     readings["distanceCm"]  = distanceCm;
  readings["gasLevel"]    = gasRaw;

  char content[160];
  snprintf(content, sizeof(content),
           "Nhiet do %.1f°C, do am %.0f%%, am thanh %d, khoang cach %.0fcm, khi gas %d",
           isnan(temperature) ? 0.0f : temperature,
           isnan(humidity) ? 0.0f : humidity,
           soundRaw,
           distanceCm < 0 ? 0.0f : distanceCm,
           gasRaw);

  sendMessage(content, "device_telemetry", &data);
}


void loop() {
  unsigned long now = millis();

  static unsigned long bootHoldStart = 0;
  if (digitalRead(PIN_BOOT_BTN) == LOW) {
    if (bootHoldStart == 0) bootHoldStart = now;
    if (now - bootHoldStart > 3000) {
      Serial.println("[RESET] Xoa config, khoi dong lai portal");
      wm.resetSettings();
      prefs.remove("apikey");
      prefs.remove("deviceid");
      delay(500);
      ESP.restart();
    }
  } else {
    bootHoldStart = 0;
  }

  if (WiFi.status() != WL_CONNECTED) {
    delay(200);
    return;
  }

  if (apiKey.length() == 0) {
    delay(500);
    return;
  }

  pollCommand();

  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    sendTelemetry();
  }

  int currentState = digitalRead(PIN_PIR);

  if (DEBUG_PIR_STATE && (now - lastDebugTime > 3000)) {
    lastDebugTime = now;
    unsigned long lowSince = (currentState == LOW) ? (now - lastPirLowTime) : 0;
    Serial.printf("[DEBUG] PIR = %s | armed = %s | LOW duoc %lums\n",
                  currentState == HIGH ? "HIGH" : "LOW",
                  armed ? "YES" : "NO", lowSince);
  }

  if (currentState == LOW) {
    if (lastPirState == HIGH) lastPirLowTime = now;
    if (!armed && (now - lastPirLowTime) >= PIR_LOW_STABLE) {
      armed = true;
      Serial.println("[PIR] ✓ Armed");
    }
  }

  if (currentState == HIGH && lastPirState == LOW
      && armed && (now - lastTriggerTime) >= PIR_MIN_INTERVAL) {
    lastTriggerTime = now;
    armed = false;
    onMotionDetected();
  }

  lastPirState = currentState;
  delay(50);
}


// ====================== POLL LENH ON/OFF TU APP ================
/*
 *  Backend tra ve: { "commands": [ { "outputId": "led", "state": true }, ... ] }
 *  Can Device ID that (khong chi API key) vi route nay la
 *  GET /api/devices/:id/command.
 */
void pollCommand() {
  if (deviceId.length() == 0) return;               // chua nhap Device ID
  if (millis() - lastCommandPoll < COMMAND_POLL_MS) return;
  lastCommandPoll = millis();

  HTTPClient http;
  http.begin(commandUrl());
  http.addHeader("X-Device-Key", apiKey);
  http.setTimeout(5000);

  int code = http.GET();
  bool applied = false;

  if (code == 200) {
    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, http.getString()) == DeserializationError::Ok) {
      JsonArray commands = doc["commands"].as<JsonArray>();
      for (JsonObject cmd : commands) {
        const char* outputId = cmd["outputId"];
        bool wanted = cmd["state"];

        Output* out = findOutput(outputId);
        if (!out) {
          Serial.printf("[CMD] Bo qua - khong co dau ra '%s'\n", outputId ? outputId : "?");
          continue;
        }
        if (out->state == wanted) continue;

        setOutput(out, wanted);
        applied = true;
      }
    }
  } else if (code > 0) {
    Serial.printf("[CMD] Poll loi - status %d\n", code);
  }
  http.end();

  // Bao lai trang thai THUC sau khi thuc thi, de app doc duoc ngay
  if (applied) {
    StaticJsonDocument<128> data;
    data["event"] = "command_applied";
    JsonArray arr = data.createNestedArray("outputs");
    for (int i = 0; i < OUTPUT_COUNT; i++) {
      JsonObject o = arr.createNestedObject();
      o["outputId"] = outputs[i].id;
      o["state"]    = outputs[i].state;
    }
    sendMessage("Da cap nhat trang thai thiet bi", "device_event", &data);
  }
}
// ================================================================


bool sendMessage(const char* content, const char* type, JsonDocument* deviceDataDoc) {
  if (WiFi.status() != WL_CONNECTED || apiKey.length() == 0) return false;

  HTTPClient http;
  http.begin(messageUrl());
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", apiKey);
  http.setTimeout(5000);

  StaticJsonDocument<384> doc;
  doc["content"] = content;
  doc["type"]    = type;
  if (deviceDataDoc != nullptr) {
    doc["deviceData"] = deviceDataDoc->as<JsonObject>();
  }
  String body;
  serializeJson(doc, body);

  Serial.print("[HTTP] POST body: ");
  Serial.println(body);

  int code = http.POST(body);
  bool ok = (code >= 200 && code < 300);

  if (ok) {
    Serial.printf("[HTTP] OK (%d)\n", code);
  } else {
    Serial.printf("[HTTP] LOI - status %d\n", code);
    if (code > 0) {
      Serial.println(http.getString());
    } else {
      Serial.printf("[HTTP] Loi mang: %s\n", http.errorToString(code).c_str());
    }
  }

  http.end();
  return ok;
}
