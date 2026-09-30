/*
 * ============================================================
 *  MessageHub - ESP32 Firmware v4.0
 * ============================================================
 *  Khac v3.0: ho tro NHIEU thiet bi dau ra (LED, relay, buzzer...)
 *  thay vi chi mot LED. Moi dau ra co mot outputId, backend va app
 *  dieu khien theo id nay.
 *
 *  Chuc nang:
 *   1. PIR dem so lan chuyen dong
 *      - <= MOTION_THRESHOLD lan : chi dem, khong lam gi
 *      - >  MOTION_THRESHOLD lan : BAT dau ra MOTION_TARGET ngay
 *        tai ESP32, sau do POST thong bao cho backend
 *   2. Poll lenh on/off tu app cho BAT KY dau ra nao
 *   3. Nut bam vat ly toggle dau ra BUTTON_TARGET
 *
 *  Thu vien: WiFiManager (tzapu, tuy chon), ArduinoJson (bblanchon)
 * ============================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ------------------------------------------------------------
//  CHON CHE DO KET NOI WIFI
//  - Giu dong duoi day  : dung WiFiManager (captive portal)
//  - Comment dong duoi  : dung SSID/password hard-code
// ------------------------------------------------------------
#define USE_WIFI_MANAGER

#ifdef USE_WIFI_MANAGER
  #include <WiFiManager.h>
  const char* AP_NAME = "MessageHub-Setup";
#else
  const char* WIFI_SSID = "Ten_wifi";
  const char* WIFI_PASS = "matkhau";
#endif

// ====================== DANH SACH DAU RA ===================
/*
 *  Them thiet bi = them mot dong vao mang nay.
 *  - id        : phai KHOP voi outputId trong Device.outputs tren backend
 *  - pin       : GPIO dieu khien
 *  - activeLow : true neu thiet bi bat khi chan xuong LOW
 *                (phan lon relay module 1 kenh la active-LOW)
 */
struct Output {
  const char* id;
  uint8_t     pin;
  bool        activeLow;
  bool        state;
};

Output outputs[] = {
  { "led",    26, false, false },   // LED bao trang thai, qua dien tro 220 ohm
  { "relay1", 25, true,  false },   // Relay module -> den that
  { "buzzer", 33, false, false },   // Con chip bao dong
};
const int OUTPUT_COUNT = sizeof(outputs) / sizeof(outputs[0]);

// Dau ra nao bi tac dong boi cam bien / nut bam
#define MOTION_TARGET      "led"
#define BUTTON_TARGET      "led"

// ====================== CAU HINH CHAN VAO ==================
#define PIR_PIN            27      // chan OUT cua PIR HC-SR501
#define BUTTON_PIN         14      // nut bam -> GND (INPUT_PULLUP)

// ====================== CAU HINH LOGIC =====================
#define MOTION_THRESHOLD   3       // > 3 lan moi bat MOTION_TARGET
#define COUNT_WINDOW_MS    60000UL // cua so dem 60s, qua thi reset bo dem
#define PIR_REARM_MS       5000UL  // PIR phai LOW lien tuc 5s moi cho dem lan ke
#define POLL_INTERVAL_MS   4000UL  // chu ky hoi lenh tu backend
#define DEBOUNCE_MS        50UL    // chong doi nut bam
#define PIR_WARMUP_MS      30000UL // PIR can thoi gian on dinh sau khi cap nguon

// ====================== CAU HINH BACKEND ===================
const char* BACKEND_URL = "http://192.168.1.10:5000";  // doi thanh IP/domain backend
const char* DEVICE_ID   = "PUT_DEVICE_MONGO_ID_HERE";  // _id cua Device trong MongoDB
const char* DEVICE_KEY  = "PUT_DEVICE_KEY_HERE";       // key gui qua header X-Device-Key

// ====================== TRANG THAI =========================
int  motionCount = 0;
unsigned long windowStart = 0;

bool pirArmed = false;
unsigned long pirLowSince = 0;

unsigned long lastPoll = 0;

bool lastButtonReading = HIGH;
bool buttonStable      = HIGH;
unsigned long lastDebounce = 0;

// ====================== HAM DAU RA =========================
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
  bool level = out->activeLow ? !on : on;   // relay active-LOW thi dao muc
  digitalWrite(out->pin, level ? HIGH : LOW);
  Serial.printf("[OUT] %s -> %s\n", out->id, on ? "BAT" : "TAT");
}

bool isOutputOn(const char* id) {
  Output* out = findOutput(id);
  return out ? out->state : false;
}

// ====================== BAO CHO BACKEND ====================
/*
 *  Gui kem trang thai TAT CA dau ra, de backend luu lai lam nguon
 *  su that cho app. Khong co buoc nay thi app chi doan trang thai.
 */
void notifyApp(const char* eventType) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Bo qua notify - chua co WiFi");
    return;
  }

  HTTPClient http;
  http.begin(String(BACKEND_URL) + "/api/devices/message");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  StaticJsonDocument<512> doc;
  doc["event"]       = eventType;
  doc["motionCount"] = motionCount;

  JsonArray arr = doc.createNestedArray("outputs");
  for (int i = 0; i < OUTPUT_COUNT; i++) {
    JsonObject o = arr.createNestedObject();
    o["outputId"] = outputs[i].id;
    o["state"]    = outputs[i].state;
  }

  String payload;
  serializeJson(doc, payload);

  int code = http.POST(payload);
  Serial.printf("[HTTP] notify(%s) -> %d\n", eventType, code);
  http.end();
}

// ============ DEM CHUYEN DONG -> TAC DUNG LEN DAU RA =======
void onMotionDetected() {
  unsigned long now = millis();

  // Qua cua so thoi gian ma chua du nguong -> dem lai tu dau
  if (motionCount > 0 && now - windowStart > COUNT_WINDOW_MS) {
    Serial.println("[PIR] Het cua so dem, reset bo dem");
    motionCount = 0;
  }
  if (motionCount == 0) windowStart = now;

  motionCount++;
  Serial.printf("[PIR] Chuyen dong lan %d (nguong %d)\n", motionCount, MOTION_THRESHOLD);

  // Duoi hoac bang nguong: chi dem, KHONG lam gi ca
  if (motionCount <= MOTION_THRESHOLD) return;

  // Vuot nguong: bat dau ra muc tieu ngay tai ESP32, roi moi bao app
  Output* target = findOutput(MOTION_TARGET);
  if (target && !target->state) {
    setOutput(target, true);
    notifyApp("motion_threshold_exceeded");
  }
}

void readPir() {
  bool motion = digitalRead(PIR_PIN) == HIGH;
  unsigned long now = millis();

  if (motion) {
    pirLowSince = 0;
    if (pirArmed) {
      pirArmed = false;            // khoa lai, tranh dem don khi PIR giu HIGH
      onMotionDetected();
    }
  } else {
    if (pirLowSince == 0) pirLowSince = now;
    if (!pirArmed && now - pirLowSince >= PIR_REARM_MS) {
      pirArmed = true;
      Serial.println("[PIR] Re-arm");
    }
  }
}

// ====================== NUT BAM ============================
void checkButton() {
  bool reading = digitalRead(BUTTON_PIN);

  if (reading != lastButtonReading) lastDebounce = millis();

  if (millis() - lastDebounce > DEBOUNCE_MS && reading != buttonStable) {
    buttonStable = reading;
    if (buttonStable == LOW) {     // canh xuong = vua nhan
      Output* target = findOutput(BUTTON_TARGET);
      if (target) {
        setOutput(target, !target->state);
        notifyApp("button_toggle");
      }
    }
  }
  lastButtonReading = reading;
}

// ============ POLL LENH ON/OFF TU APP ======================
/*
 *  Backend tra ve: { "commands": [ { "outputId": "relay1", "state": true }, ... ] }
 *  Mot lan poll co the nhan nhieu lenh cho nhieu dau ra khac nhau.
 */
void pollCommand() {
  if (millis() - lastPoll < POLL_INTERVAL_MS) return;
  lastPoll = millis();
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(String(BACKEND_URL) + "/api/devices/" + DEVICE_ID + "/command");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  int code = http.GET();
  bool applied = false;

  if (code == 200) {
    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, http.getString()) == DeserializationError::Ok) {
      JsonArray commands = doc["commands"].as<JsonArray>();

      for (JsonObject c : commands) {
        const char* outputId = c["outputId"];
        bool wanted = c["state"];

        Output* out = findOutput(outputId);
        if (!out) {
          Serial.printf("[CMD] Bo qua - khong co dau ra '%s'\n", outputId ? outputId : "?");
          continue;
        }
        if (out->state == wanted) continue;   // da dung trang thai, khong lam gi

        setOutput(out, wanted);
        applied = true;

        // Tat dau ra cua cam bien tu app = reset bo dem, bat chu ky moi
        if (!wanted && strcmp(out->id, MOTION_TARGET) == 0) {
          motionCount = 0;
        }
      }
    }
  }
  http.end();

  // Bao lai trang thai THUC sau khi thuc thi
  if (applied) notifyApp("command_applied");
}

// ====================== KET NOI WIFI =======================
void connectWiFi() {
#ifdef USE_WIFI_MANAGER
  WiFiManager wm;
  wm.setConfigPortalTimeout(180);            // tu thoat portal sau 3 phut
  if (!wm.autoConnect(AP_NAME)) {
    Serial.println("[WiFi] Cau hinh that bai, khoi dong lai...");
    ESP.restart();
  }
#else
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Dang ket noi");

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] That bai, khoi dong lai...");
    ESP.restart();
  }
#endif

  Serial.printf("[WiFi] Da ket noi: %s | IP: %s\n",
                WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
}

// ====================== SETUP / LOOP =======================
void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(PIR_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Khoi tao moi dau ra ve trang thai TAT (ton trong activeLow)
  for (int i = 0; i < OUTPUT_COUNT; i++) {
    pinMode(outputs[i].pin, OUTPUT);
    setOutput(&outputs[i], false);
  }

  Serial.printf("\n[BOOT] MessageHub ESP32 v4.0 - %d dau ra\n", OUTPUT_COUNT);

  connectWiFi();

  Serial.println("[PIR] Dang khoi dong cam bien, cho 30s on dinh...");
  delay(PIR_WARMUP_MS);
  pirArmed = true;
  Serial.println("[PIR] San sang");

  notifyApp("boot");   // bao trang thai ban dau cho backend
}

void loop() {
  readPir();
  checkButton();
  pollCommand();
  delay(20);
}
