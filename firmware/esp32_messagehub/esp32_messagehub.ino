#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>


const char* SERVER_URL = "http://192.168.1.4:3000/api/messages/device";

//  CHÂN GPIO
#define PIN_PIR      21
#define PIN_BOOT_BTN 0

const unsigned long PIR_LOW_STABLE   = 5000;
const unsigned long PIR_MIN_INTERVAL = 10000;
#define DEBUG_PIR_STATE  true


Preferences prefs;
String apiKey = "";
String deviceLabel = "";  // ten hien thi rieng cua board nay, VD "MessageHub-A4CF12"

int  lastPirState        = LOW;
unsigned long lastPirLowTime  = 0;
unsigned long lastTriggerTime = 0;
unsigned long lastDebugTime   = 0;
bool armed = false;

WiFiManager wm;


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
  apiKey = prefs.getString("apikey", "");

  WiFiManagerParameter customApiKey(
      "apikey", "API Key (lay tu tab Thiet bi tren web MessageHub)",
      apiKey.c_str(), 64);
  wm.addParameter(&customApiKey);

  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  if (digitalRead(PIN_BOOT_BTN) == LOW) {
    Serial.println("[SETUP] Nut BOOT dang giu - xoa config cu");
    wm.resetSettings();
    prefs.remove("apikey");
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

  if (apiKey.length() == 0) {
    Serial.println("[SETUP] ⚠ CHUA CO API KEY! Giu nut BOOT 3s de vao lai config.");
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
    if (sendMessage(hello, "device_event", "{\"event\":\"boot\"}")) {
      Serial.println("[BOOT] OK - firmware san sang!");
    } else {
      Serial.println("[BOOT] LOI - kiem tra API key + server URL + firewall");
    }
  } else {
    Serial.println("[BOOT] Bo qua - chua co API key.");
  }
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
    Serial.println("[PIR]  Phat hien chuyen dong!");
    sendMessage(" Phat hien chuyen dong", "device_event",
                "{\"sensor\":\"PIR\",\"location\":\"phong_khach\"}");
  }

  lastPirState = currentState;
  delay(50);
}



bool sendMessage(const char* content, const char* type,
                 const char* deviceDataJson) {
  if (WiFi.status() != WL_CONNECTED || apiKey.length() == 0) return false;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", apiKey);
  http.setTimeout(5000);

  StaticJsonDocument<256> doc;
  doc["content"] = content;
  doc["type"]    = type;
  if (deviceDataJson && strlen(deviceDataJson) > 0) {
    StaticJsonDocument<128> ddoc;
    if (!deserializeJson(ddoc, deviceDataJson)) {
      doc["deviceData"] = ddoc.as<JsonObject>();
    }
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
