#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

const char* SERVER_URL = "http://192.168.1.3:3000/api/messages/device";

#define PIN_PIR      21
#define PIN_BOOT_BTN 0

const unsigned long PIR_LOW_STABLE   = 5000;
const unsigned long PIR_MIN_INTERVAL = 10000;
#define DEBUG_PIR_STATE  true

Preferences prefs;
String apiKey = "";
String deviceLabel = "";

int  lastPirState        = LOW;
unsigned long lastPirLowTime  = 0;
unsigned long lastTriggerTime = 0;
unsigned long lastDebugTime   = 0;
bool armed = false;

WiFiManager wm;

String getUniqueDeviceLabel() {
  uint64_t chipId = ESP.getEfuseMac();
  char buf[32];
  snprintf(buf, sizeof(buf), "MessageHub-%04X", (uint16_t)(chipId >> 32));
  return String(buf);
}

void setupWiFiAndApiKey() {
  deviceLabel = getUniqueDeviceLabel();
  Serial.printf("[SETUP] Ten thiet bi: %s\n", deviceLabel.c_str());

  prefs.begin("msghub", false);

  // ─── FIX: kiem tra nut BOOT va XOA config TRUOC khi doc apiKey cu ───
  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  bool forceReset = (digitalRead(PIN_BOOT_BTN) == LOW);

  if (forceReset) {
    Serial.println("[SETUP] Nut BOOT dang giu - XOA config cu TRUOC khi hien form");
    wm.resetSettings();
    prefs.remove("apikey");
    prefs.end();
    prefs.begin("msghub", false); // mo lai sau khi xoa, dam bao doc ra rong
  }

  // Bay gio moi doc apiKey - neu vua reset thi chac chan la rong
  apiKey = prefs.getString("apikey", "");
  Serial.printf("[SETUP] API key doc tu flash (truoc khi vao form): [%s] (%d ky tu)\n",
                apiKey.c_str(), apiKey.length());

  // Form se hien apiKey nay lam gia tri mac dinh trong o nhap
  // Neu vua reset -> apiKey rong -> o nhap se TRONG, khong con nham lan
  WiFiManagerParameter customApiKey(
      "apikey", "API Key (lay tu tab Thiet bi tren web MessageHub)",
      apiKey.c_str(), 100);
  wm.addParameter(&customApiKey);

  wm.setConfigPortalTimeout(180);

  Serial.printf("[SETUP] Dang ket noi WiFi (hoac mo hotspot \"%s\")...\n",
                deviceLabel.c_str());

  bool ok = wm.autoConnect(deviceLabel.c_str());

  if (!ok) {
    Serial.println("[SETUP] Khong ket noi duoc, khoi dong lai sau 5s...");
    delay(5000);
    ESP.restart();
  }

  Serial.println("[SETUP] WiFi da ket noi!");
  Serial.printf("[SETUP] IP: %s\n", WiFi.localIP().toString().c_str());

  // Doc gia tri THAT SU nguoi dung vua nhap/dan tren form
  String enteredKey = String(customApiKey.getValue());
  enteredKey.trim(); // xoa khoang trang dau/cuoi neu co

  Serial.println("=================================");
  Serial.printf("[DEBUG] Gia tri nhap tren form: [%s]\n", enteredKey.c_str());
  Serial.printf("[DEBUG] Do dai: %d ky tu\n", enteredKey.length());
  Serial.println("=================================");

  if (enteredKey.length() > 0) {
    apiKey = enteredKey;
    prefs.putString("apikey", apiKey);
    Serial.println("[SETUP] Da luu API key MOI vao flash");
  } else {
    Serial.println("[SETUP] ⚠ Form apiKey de trong - giu nguyen key cu (neu co)");
  }

  Serial.println("=================================");
  Serial.printf("[DEBUG] API key SE DUNG de gui tin: [%s]\n", apiKey.c_str());
  Serial.printf("[DEBUG] Do dai: %d ky tu\n", apiKey.length());
  Serial.println("=================================");

  if (apiKey.length() == 0) {
    Serial.println("[SETUP] ⚠ CHUA CO API KEY! Giu nut BOOT 3s de vao lai config.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("╔═════════════════════════════════════════════════╗");
  Serial.println("║  MessageHub ESP32 - Fix API key form caching   ║");
  Serial.println("╚═════════════════════════════════════════════════╝");

  pinMode(PIN_PIR, INPUT_PULLDOWN);

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
             "🟢 %s da online — PIR san sang", deviceLabel.c_str());
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
    Serial.println("[PIR] 🚨 Phat hien chuyen dong!");
    sendMessage("🚨 Phat hien chuyen dong", "device_event",
                "{\"sensor\":\"PIR\"}");
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
