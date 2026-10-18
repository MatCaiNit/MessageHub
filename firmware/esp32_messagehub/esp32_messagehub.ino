#include <WiFi.h>
#include <WiFiMulti.h>      // MOI: nho nhieu mang WiFi, tu noi mang nao co song
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ESPmDNS.h>          // MOI: dung de tim may chay backend theo TEN (vd MAY-CUA-TOI.local)
                              // thay vi IP - IP doi theo tung mang WiFi, ten may thi khong.
#include <WiFiClientSecure.h> // MOI: ho tro server https:// (vd khi deploy backend len mang)
#include <DHT.h>      // Thu vien "DHT sensor library" cua Adafruit - can cai them
                      // trong Library Manager (Sketch > Include Library > Manage
                      // Libraries...), tim "DHT sensor library" by Adafruit. No
                      // se tu doi hoi cai them "Adafruit Unified Sensor" - Arduino
                      // IDE se hoi cai luon, cu Bam Install.
#include "Output.h"   // FIX: struct Output phai nam trong header rieng, nap
                      // truoc khi Arduino IDE tu sinh prototype cho cac ham
                      // ben duoi - de trong cung 1 file .ino se bi loi
                      // "Output does not name a type" nhu ban vua gap.
#include "Sensor.h"   // MOI: struct Sensor, cung ly do nam rieng header nhu Output.h

// ====================== CAM BIEN BO SUNG: ANH SANG / MUA / METAN / LUA / RUNG =====
// Thu vien can cai (Library Manager): "BH1750" by Christopher Laws.
#include <Wire.h>
#include <BH1750.h>

// GPIO21 dang dung cho PIR nen I2C dung chan khac (25/27), khong dung 21/22 mac dinh.
#define PIN_I2C_SDA   25   // BH1750 - SDA
#define PIN_I2C_SCL   27   // BH1750 - SCL
#define PIN_RAIN      32   // cam bien mua - AO  (ADC1)
#define PIN_MQ4       36   // MQ-4 - AO (ADC1, chi-doc) - qua cau chia ap 2 x 10k
#define PIN_FLAME     39   // cam bien lua - AO (ADC1, chi-doc)
#define PIN_VIB       13   // module rung SW-420 - DO

// Hieu chuan (do bang Serial roi sua cho dung voi cam bien cua ban):
#define RAIN_RAW_DRY    4095   // kho  -> 0 %
#define RAIN_RAW_WET    1000   // uot  -> 100 %
#define FLAME_RAW_NONE  4095   // khong co lua (AO cao)  -> 0 %
#define FLAME_RAW_FIRE   500   // lua sat cam bien (AO thap) -> 100 %
#define MQ4_MIN_VALID     30   // duoi muc nay coi nhu MQ-4 khong duoc cam
#define VIB_ACTIVE_LEVEL   HIGH   // SW-420: DO len HIGH khi rung (neu nguoc, doi thanh LOW)
// ==========================================================================

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

// ====================== MOI: BAT/TAT TUNG CAM BIEN =============
// Danh sach cac cam bien co the tam ngung tu app - KHONG lien quan den
// outputs[] o tren (do la LED/relay). Moi cam bien co "enabled": false
// nghia la ESP32 se KHONG doc/KHONG gui du lieu cam bien do len server
// nua, cho den khi app bat lai. Mac dinh moi lan khoi dong lai la BAT HET
// (giong outputs[] cung reset ve false moi lan reset) - trang thai thuc
// te luon do pendingSensorCommands tu app dieu khien lai sau khi ESP32 ket
// noi WiFi va poll lenh lan dau.
Sensor sensors[] = {
  { "pir",      "Cảm biến chuyển động (PIR)",       true },
  { "dht",      "Nhiệt độ & độ ẩm (DHT22)",          true },
  { "sound",    "Âm thanh (KY-037/038)",             true },
  { "distance", "Khoảng cách - vật thể (HC-SR04)",   true },
  { "gas",      "Khí gas / khói (MQ-2)",              true },
  { "light",    "Ánh sáng (BH1750)",                  true },
  { "rain",     "Mưa (cảm biến mưa)",                 true },
  { "mq4",      "Khí metan (MQ-4)",                   true },
  { "flame",    "Lửa (cảm biến hồng ngoại)",          true },
  { "vibration","Rung động (SW-420)",                 true },
};
const int SENSOR_COUNT = sizeof(sensors) / sizeof(sensors[0]);

// "present" = cam bien co THAT SU duoc cam/phat hien (khac "enabled" = nguoi dung
// bat/tat). App an hang bat/tat va the Dashboard cua cam bien present == false.
// Chi DHT22 va MQ-2 co the tu nhan biet vang mat (doc loi / gia tri ~0); PIR,
// am thanh, sieu am coi nhu luon co. Can 2 lan do lien tiep that bai moi coi la
// vang mat (tranh nhap nhay do 1 lan doc loi).
bool sensorPresent[SENSOR_COUNT];
bool sensorReportedPresent[SENSOR_COUNT];
int  sensorMiss[SENSOR_COUNT];

int sensorIndexOf(const char* id) {
  for (int i = 0; i < SENSOR_COUNT; i++) {
    if (strcmp(sensors[i].id, id) == 0) return i;
  }
  return -1;
}

// Cap nhat trang thai "co mat" cua 1 cam bien sau moi lan doc. Cam bien dang bi
// nguoi dung tat thi khong doc nen giu nguyen trang thai cu.
void updatePresence(const char* id, bool detected) {
  int i = sensorIndexOf(id);
  if (i < 0 || !sensors[i].enabled) return;
  if (detected) { sensorMiss[i] = 0; sensorPresent[i] = true; }
  else if (++sensorMiss[i] >= 2) { sensorPresent[i] = false; }
}

Sensor* findSensor(const char* id) {
  if (!id) return nullptr;
  for (int i = 0; i < SENSOR_COUNT; i++) {
    if (strcmp(sensors[i].id, id) == 0) return &sensors[i];
  }
  return nullptr;
}

// Doc nhanh trang thai bat/tat cua 1 cam bien theo id. Mac dinh TRA VE true
// (fail-open) neu id khong ton tai trong mang - tranh vo tinh lam "cam" mot
// cam bien chi vi go sai id o dau do.
bool sensorEnabled(const char* id) {
  Sensor* sv = findSensor(id);
  return sv ? sv->enabled : true;
}

// Gan mang outputs[] hien tai vao 1 JsonDocument (dung chung cho ca su kien
// "boot" va "command_applied" - tranh lap code).
void appendOutputsJson(JsonDocument &doc) {
  JsonArray arr = doc.createNestedArray("outputs");
  for (int i = 0; i < OUTPUT_COUNT; i++) {
    JsonObject o = arr.createNestedObject();
    o["outputId"] = outputs[i].id;
    o["state"]    = outputs[i].state;
  }
}

// Gan mang sensors[] hien tai vao 1 JsonDocument - backend doc deviceData.sensors
// de dong bo Device.sensors[].enabled (xem messageController.js).
void appendSensorsJson(JsonDocument &doc) {
  JsonArray arr = doc.createNestedArray("sensors");
  for (int i = 0; i < SENSOR_COUNT; i++) {
    JsonObject o = arr.createNestedObject();
    o["sensorId"] = sensors[i].id;
    o["label"]    = sensors[i].label;
    o["enabled"]  = sensors[i].enabled;
    o["present"]  = sensorPresent[i];
  }
}
// ===================================================================

// FIX dem chuyen dong: bo dieu kien "armed" (phai LOW on dinh 5s) va nang
// khoang cach toi thieu len 10s. HC-SR501 tu no da co thoi gian giu HIGH
// (bien tro Time) + ~2.5s khoa sau khi ve LOW, nen 2 lan kich hoat lien tiep
// da cach nhau >= ~6-13s; them 5s + 10s o ngoai lam chuoi 3 lan gan nhu khong
// bao gio hoan thanh trong 15s. Gio moi canh LEN (LOW->HIGH) = 1 lan.
const unsigned long PIR_MIN_INTERVAL = 1000;
#define DEBUG_PIR_STATE  true

// ====================== MOI: CHUOI CHUYEN DONG 3 LAN LIEN TIEP ===
// Phat hien 3 lan chuyen dong LIEN TIEP, moi lan cach lan truoc khong qua
// MOTION_GAP_MAX_MS (~10-15s, PIR_MIN_INTERVAL o tren da dam bao toi thieu
// 10s giua 2 lan) thi nhay LED + bao ve app. Neu lau hon MOTION_GAP_MAX_MS
// ma khong co lan tiep theo thi coi nhu chuoi bi dut, dem lai tu dau -
// khong bao gi ca neu chua du 3 lan.
#define MOTION_SEQ_TARGET    3
#define MOTION_GAP_MAX_MS    30000UL   // toi da giua 2 lan trong chuoi (nang 15s -> 30s)
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

// Ngat bat canh LEN cua PIR: loop() co the bi chan vai giay boi HTTP/TLS (nhat la
// khi server nam tren Render qua https), xung HIGH ngan se bi bo lo neu chi doc
// digitalRead() trong loop. ISR chi dat co, viec con lai lam trong loop().
portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;   // bao ve bo dem dung chung voi ngat (cach chuan tren ESP32)
volatile bool pirEdgeFlag = false;
volatile unsigned long pirEdgeCount = 0;   // so canh LEN tu lan gui telemetry truoc (cho bieu do Dashboard)
// Loc nhieu: chi tinh la 1 lan chuyen dong khi xung HIGH keo dai >= 150 ms. PIR that cho xung
// ~2-3 s tro len; gai nhieu (WiFi phat song, sut nguon, nhiet tu MQ-2/MQ-4) chi vai micro-giay.
#define PIR_MIN_PULSE_US 150000UL
volatile unsigned long pirRiseUs = 0;
void IRAM_ATTR pirIsr() {
  unsigned long now = micros();
  if (digitalRead(PIN_PIR) == HIGH) {
    pirRiseUs = now;                                   // canh LEN: ghi moc
  } else {                                             // canh XUONG: do do rong xung
    if (pirRiseUs != 0 && (now - pirRiseUs) >= PIR_MIN_PULSE_US) {
      pirEdgeFlag = true;
      pirEdgeCount++;
    }
    pirRiseUs = 0;
  }
}

WiFiManager wm;

// FIX: dat 2 ham nay SAU khi apiKey/deviceId da duoc khai bao o tren (2 bien
// nay dung ben trong ham) - Arduino chi tu sinh prototype cho HAM, khong
// giup gi voi thu tu khai bao BIEN toan cuc.
// ====================== MOI: DIA CHI SERVER KHONG PHU THUOC IP ==========
// FIX loi "doi WiFi la sai IP": truoc day dia chi server gan cung
// "http://192.168.1.4:3000" - IP cua may chay backend doi theo tung mang WiFi.
// Gio serverBase nhap 1 LAN trong trang cau hinh WiFi (hotspot cua ESP32) va
// luu vao flash. Co 2 cach nhap, deu dung duoc o MOI mang WiFi:
//   1) Ten may:  http://TEN-MAY-TINH.local:3000   (ESP32 tu tim IP qua mDNS
//      moi lan ket noi - IP doi bao nhieu cung khong anh huong; yeu cau mang
//      cho phep mDNS, thuong la WiFi nha/hotspot dien thoai)
//   2) Dia chi cong khai: https://ten-ban.onrender.com  (backend deploy len
//      mang / ngrok / cloudflare tunnel - chay duoc ca tren WiFi truong hoc,
//      quan ca phe chan thiet bi thay nhau)
// MOI: mac dinh tro thang vao server da deploy tren Render -> chay o MOI mang WiFi.
// Muon doi server mac dinh: sua SERVER_DEFAULT va TANG SERVER_CFG_VER de ESP32
// bo gia tri cu da luu trong flash (neu khong, flash cu se ghi de len mac dinh).
#define SERVER_DEFAULT  "https://messagehub-z2da.onrender.com"
#define SERVER_CFG_VER  2
String serverBase     = SERVER_DEFAULT;   // portal/flash neu co se ghi de len day
String serverResolved = "";   // serverBase sau khi doi ".local" thanh IP (cache)

// ====================== MOI: NHO NHIEU MANG WIFI + WATCHDOG ==============
// Luu toi da MAX_SAVED_WIFI mang (moi mang vua noi thanh cong dua len dau).
// Khi khoi dong / mat mang, ESP32 tu noi vao mang co song trong danh sach,
// khong can mo portal. Chi mo portal khi KHONG mang nao ket noi duoc.
#define MAX_SAVED_WIFI        3
#define WIFI_OFFLINE_RESTART_MS 180000UL    // mat WiFi qua 3 phut -> khoi dong lai
#define SERVER_KICK_MS          120000UL    // WiFi ok nhung server khong tra loi 2 phut -> ngat/noi lai WiFi
#define SERVER_RESTART_MS       600000UL    // ... 10 phut -> khoi dong lai

WiFiMulti wifiMulti;
bool wifiMultiReady = false;
unsigned long lastServerOk = 0;   // lan cuoi server tra loi (bat ky ma HTTP nao)

String wifiKey(const char* prefix, int i) { return String(prefix) + String(i); }

void saveCurrentNetwork() {
  String ssid = WiFi.SSID();
  if (ssid.length() == 0) return;
  String pass = WiFi.psk();

  String ss[MAX_SAVED_WIFI], pp[MAX_SAVED_WIFI];
  for (int i = 0; i < MAX_SAVED_WIFI; i++) {
    ss[i] = prefs.getString(wifiKey("ssid", i).c_str(), "");
    pp[i] = prefs.getString(wifiKey("pass", i).c_str(), "");
  }

  String ns[MAX_SAVED_WIFI], np[MAX_SAVED_WIFI];
  int n = 0;
  ns[n] = ssid; np[n] = pass; n++;                       // mang hien tai len dau
  for (int i = 0; i < MAX_SAVED_WIFI && n < MAX_SAVED_WIFI; i++) {
    if (ss[i].length() > 0 && ss[i] != ssid) { ns[n] = ss[i]; np[n] = pp[i]; n++; }
  }
  for (int i = 0; i < MAX_SAVED_WIFI; i++) {
    if (i < n) {
      prefs.putString(wifiKey("ssid", i).c_str(), ns[i]);
      prefs.putString(wifiKey("pass", i).c_str(), np[i]);
    } else {
      prefs.remove(wifiKey("ssid", i).c_str());
      prefs.remove(wifiKey("pass", i).c_str());
    }
  }
  Serial.printf("[WIFI] Da nho mang \"%s\" (%d mang trong danh sach)\n", ssid.c_str(), n);
}

void clearSavedNetworks() {
  for (int i = 0; i < MAX_SAVED_WIFI; i++) {
    prefs.remove(wifiKey("ssid", i).c_str());
    prefs.remove(wifiKey("pass", i).c_str());
  }
}

// Thu noi vao cac mang da nho. true neu noi duoc.
bool connectKnownNetworks(unsigned long timeoutMs) {
  WiFi.mode(WIFI_STA);
  if (!wifiMultiReady) {
    int count = 0;
    for (int i = 0; i < MAX_SAVED_WIFI; i++) {
      String ssid = prefs.getString(wifiKey("ssid", i).c_str(), "");
      if (ssid.length() == 0) continue;
      String pass = prefs.getString(wifiKey("pass", i).c_str(), "");
      wifiMulti.addAP(ssid.c_str(), pass.c_str());
      count++;
    }
    if (count == 0) return false;
    wifiMultiReady = true;
    Serial.printf("[WIFI] Thu %d mang da nho...\n", count);
  }
  return wifiMulti.run(timeoutMs) == WL_CONNECTED;
}
// ===================================================================

// Doi serverBase thanh URL dung duoc ngay. Neu host la "xxx.local" thi hoi mDNS
// de lay IP hien tai cua may do; cac dang khac (IP, ten mien, https) giu nguyen.
String resolveServerBase() {
  String base = serverBase;
  base.trim();
  while (base.endsWith("/")) base.remove(base.length() - 1);

  int schemeEnd = base.indexOf("://");
  if (schemeEnd < 0) { base = "http://" + base; schemeEnd = 4; }
  String scheme   = base.substring(0, schemeEnd + 3);
  String rest     = base.substring(schemeEnd + 3);          // host[:port][/path]
  int slash       = rest.indexOf('/');
  String hostPort = slash < 0 ? rest : rest.substring(0, slash);
  String path     = slash < 0 ? "" : rest.substring(slash);
  int colon       = hostPort.indexOf(':');
  String host     = colon < 0 ? hostPort : hostPort.substring(0, colon);
  String port     = colon < 0 ? "" : hostPort.substring(colon);

  if (!host.endsWith(".local")) return base;                // IP / ten mien: dung nguyen
  if (serverResolved.length() > 0) return serverResolved;   // da tim thay truoc do

  String name = host.substring(0, host.length() - 6);       // bo duoi ".local"
  IPAddress ip = MDNS.queryHost(name.c_str(), 3000);
  if ((uint32_t)ip == 0) {
    Serial.printf("[SERVER] Khong tim thay '%s.local' tren mang nay (may tinh da bat chua? "
                  "cung WiFi chua? mang co chan mDNS khong?)\n", name.c_str());
    return base;
  }
  serverResolved = scheme + ip.toString() + port + path;
  Serial.printf("[SERVER] %s.local -> %s\n", name.c_str(), serverResolved.c_str());
  return serverResolved;
}

// Goi khi 1 request that bai: xoa cache de lan sau tim lai IP moi (may tinh
// co the vua doi IP, hoac ESP32 vua chuyen sang mang WiFi khac).
void invalidateServerCache() { serverResolved = ""; }

// http:// dung WiFiClient thuong, https:// dung WiFiClientSecure (khong kiem tra
// chung chi - du cho do an; de bao mat that thi nap root CA vao).
bool beginHttp(HTTPClient &http, WiFiClient &plain, WiFiClientSecure &secure, const String &url) {
  bool ok;
  if (url.startsWith("https://")) {
    secure.setInsecure();
    ok = http.begin(secure, url);
  } else {
    ok = http.begin(plain, url);
  }
  if (ok) {
    // Moi request mo/dong ket noi rieng: tranh loi lwip "pbuf_free" do tai su dung
    // ket noi bi server dong giua chung (keep-alive).
    http.setReuse(false);
    http.addHeader("Connection", "close");
  }
  return ok;
}
// ===================================================================

String messageUrl() { return resolveServerBase() + "/api/messages/device"; }
String commandUrl() { return resolveServerBase() + "/api/devices/command"; }

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
  apiKey     = prefs.getString("apikey", "");
  deviceId   = prefs.getString("deviceid", "");
  serverBase = prefs.getString("server", serverBase);

  // Doi SERVER_DEFAULT/SERVER_CFG_VER trong code -> ghi de server cu luu trong flash
  if (prefs.getInt("srvver", 0) != SERVER_CFG_VER) {
    serverBase = SERVER_DEFAULT;
    prefs.putString("server", serverBase);
    prefs.putInt("srvver", SERVER_CFG_VER);
    Serial.printf("[SETUP] Cap nhat server mac dinh: %s\n", serverBase.c_str());
  }

  // FIX: gioi han cu la 64 ky tu, nhung API key that (tien to "dvk_" + 64 ky
  // tu hex) dai ~68 ky tu nen bi cat, khong nhap du duoc. Tang len 100.
  WiFiManagerParameter customApiKey(
      "apikey", "API Key (lay tu tab Thiet bi tren web MessageHub)",
      apiKey.c_str(), 100);
  wm.addParameter(&customApiKey);

  // BO Device ID: server tu nhan ra thiet bi tu API key (X-Device-Key), ESP32
  // poll lenh qua GET /api/devices/command - chi can 1 key duy nhat.

  // MOI: dia chi server - nhap 1 lan, dung duoc o moi mang WiFi (xem giai thich
  // o khoi "DIA CHI SERVER KHONG PHU THUOC IP" phia tren).
  WiFiManagerParameter customServer(
      "server",
      "Server (vd http://TEN-MAY-TINH.local:3000 hoac https://ten-ban.onrender.com)",
      serverBase.c_str(), 100);
  wm.addParameter(&customServer);

  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  if (digitalRead(PIN_BOOT_BTN) == LOW) {
    Serial.println("[SETUP] Nut BOOT dang giu - xoa config cu");
    wm.resetSettings();
    clearSavedNetworks();
    prefs.remove("apikey");
    prefs.remove("deviceid");
    prefs.remove("server");
    apiKey = ""; deviceId = ""; serverBase = SERVER_DEFAULT;
  }

  wm.setConfigPortalTimeout(180);

  // FIX danh sach WiFi bi thieu/gioi han trong trang config:
  //  - setRemoveDuplicateAPs(false): mac dinh thu vien GOP cac AP trung ten
  //    (router + repeater/mesh cung SSID) thanh 1 dong -> nhin nhu "thieu".
  //  - setMinimumSignalQuality(0): khong an mang song yeu (hien ca mang xa).
  //  - WIFI_STA truoc khi quet: bao dam radio o che do quet day du.
  // Luu y: ESP32 CHI quet duoc WiFi 2.4 GHz, mang 5 GHz khong bao gio hien.
  // Mang an SSID (hidden) phai go tay: bam "Configure WiFi" roi nhap ten.
  WiFi.mode(WIFI_STA);
  wm.setRemoveDuplicateAPs(false);
  wm.setMinimumSignalQuality(0);

  Serial.printf("[SETUP] Dang ket noi WiFi (hoac mo hotspot \"%s\" de config)...\n",
                deviceLabel.c_str());

  // Ten hotspot = deviceLabel rieng cua tung board -> nhieu board
  // bat cung luc se co ten khac nhau tren danh sach WiFi cua dien thoai
  // 1) Thu cac mang da nho (nhanh, khong can portal)
  // 2) Khong mang nao noi duoc -> autoConnect (thu mang cu cua WiFiManager,
  //    roi mo hotspot de nhap mang moi)
  bool ok = connectKnownNetworks(20000);
  if (ok) {
    Serial.printf("[WIFI] Da noi \"%s\"\n", WiFi.SSID().c_str());
  } else {
    ok = wm.autoConnect(deviceLabel.c_str());
  }

  if (ok) saveCurrentNetwork();   // nho mang vua noi (dua len dau danh sach)

  if (!ok) {
    Serial.println("[SETUP] Khong ket noi duoc va het thoi gian cho config.");
    delay(5000);
    ESP.restart();
  }

  Serial.println("[SETUP] WiFi da ket noi!");
  Serial.printf("[SETUP] IP: %s\n", WiFi.localIP().toString().c_str());

  // Bat mDNS de co the hoi IP cua may tinh theo ten (.local) - phai goi SAU khi co WiFi
  if (MDNS.begin(deviceLabel.c_str())) {
    Serial.println("[SETUP] mDNS san sang");
  } else {
    Serial.println("[SETUP] ⚠ Khong bat duoc mDNS - chi dung duoc dia chi IP/ten mien that");
  }

  String enteredServer = String(customServer.getValue());
  enteredServer.trim();
  if (enteredServer.length() > 0) {
    serverBase = enteredServer;
    prefs.putString("server", serverBase);
    serverResolved = "";
    Serial.printf("[SETUP] Server: %s\n", serverBase.c_str());
  }

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



// ---------------- Doi tuong cam bien mo rong ----------------
BH1750 lightMeter;

// Khoi tao cam bien I2C (goi o setup va thu lai neu truoc do khong thay).
// Tra ve true neu cam bien tra loi.
bool beginLight() { return lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); }

volatile unsigned long vibCount = 0;
volatile unsigned long vibLastUs = 0;
void IRAM_ATTR vibIsr() {
  unsigned long t = micros();
  if (t - vibLastUs > 20000) { vibCount++; vibLastUs = t; }   // chong doi 20 ms
}

// Doi gia tri tho ADC sang phan tram theo 2 moc hieu chuan (kep 0-100).
int rawToPercent(int raw, int rawLow, int rawHigh) {
  long p = (long)(raw - rawLow) * 100L / (rawHigh - rawLow);
  if (p < 0) p = 0;
  if (p > 100) p = 100;
  return (int)p;
}

int readAnalogAvg(int pin) {
  long sum = 0;
  for (int i = 0; i < 8; i++) { sum += analogRead(pin); delay(2); }
  return (int)(sum / 8);
}


void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("╔═════════════════════════════════════════════════╗");
  Serial.println("║  MessageHub ESP32 - Multi-device Provisioning  ║");
  Serial.println("╚═════════════════════════════════════════════════╝");

  pinMode(PIN_PIR, INPUT);

  for (int i = 0; i < SENSOR_COUNT; i++) {
    sensorPresent[i] = true;           // mac dinh coi la co; telemetry se cap nhat
    sensorReportedPresent[i] = true;   // khop voi tin "boot" gui len ben duoi
    sensorMiss[i] = 0;
  }

  for (int i = 0; i < OUTPUT_COUNT; i++) {
    pinMode(outputs[i].pin, OUTPUT);
    setOutput(&outputs[i], false);
  }

  // Cam bien moi (pin luon duoc khoi tao du cam bien dang bat hay tam tat -
  // "tam tat" chi la khong DOC/khong GUI du lieu, khong anh huong phan cung)
  dht.begin();
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  // ---- Cam bien mo rong ----
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  { int i = sensorIndexOf("light"); if (i >= 0) sensorPresent[i] = beginLight(); }
  pinMode(PIN_RAIN, INPUT);
  pinMode(PIN_MQ4, INPUT);
  pinMode(PIN_FLAME, INPUT);
  pinMode(PIN_VIB, INPUT_PULLDOWN);
  attachInterrupt(digitalPinToInterrupt(PIN_VIB), vibIsr, (VIB_ACTIVE_LEVEL == HIGH) ? RISING : FALLING);
  // Cac sensorReportedPresent khop voi trang thai vua do de khong gui "sensors_changed" thua
  for (int i = 0; i < SENSOR_COUNT; i++) sensorReportedPresent[i] = sensorPresent[i];

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
  lastServerOk = millis();   // moc cho watchdog server
  pirEdgeFlag = false;
  attachInterrupt(digitalPinToInterrupt(PIN_PIR), pirIsr, CHANGE);
  lastPirState = digitalRead(PIN_PIR);
  lastPirLowTime = millis();

  if (apiKey.length() > 0) {
    Serial.println("[BOOT] Gui tin chao server...");
    char hello[128];
    snprintf(hello, sizeof(hello),
             "V %s da online — PIR san sang phat hien chuyen dong",
             deviceLabel.c_str());

    // MOI: tang kich thuoc buffer vi bootData gio co THEM mang sensors[]
    // (ngoai outputs[] cu) - 128 byte la khong du, se bi cat du lieu lang le.
    DynamicJsonDocument bootData(3072);
    bootData["event"] = "boot";
    appendOutputsJson(bootData);
    appendSensorsJson(bootData);

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

#define GAS_MIN_VALID 30   // duoi muc nay coi nhu MQ-2 khong duoc cam (can dien tro keo xuong)
#define SOUND_MIN_VALID 30 // nhu tren cho KY-037/038 (muc nen luc cam thuong >> 30; can dien tro keo xuong)

// Kiem tra mot chan SO co dang duoc cam bien DIEU KHIEN hay dang HO (khong cam):
// doc chan khi bat dien tro keo LEN roi keo XUONG. Neu cam bien dang day chan
// (HIGH hoac LOW) thi 2 lan doc GIONG nhau; neu chan ho thi doc theo dien tro
// (HIGH roi LOW) nen KHAC nhau. Dung cho HC-SR04 (Echo) va PIR (OUT).
// KHONG dung duoc cho GPIO34-39 (khong co dien tro keo ben trong).
bool pinDriven(int pin) {
  pinMode(pin, INPUT_PULLUP);
  delayMicroseconds(200);
  int a = digitalRead(pin);
  pinMode(pin, INPUT_PULLDOWN);
  delayMicroseconds(200);
  int b = digitalRead(pin);
  pinMode(pin, INPUT);
  return a == b;
}

// Cam bien dang duoc bat VA co mat -> dung duoc.
bool sensorUsable(const char* id) {
  int i = sensorIndexOf(id);
  return i < 0 || (sensors[i].enabled && sensorPresent[i]);
}

// Doc cac cam bien (DHT22/am thanh/sieu am/gas) roi gui 1 goi telemetry duy
// nhat len server. CHI doc + gui cam bien nao dang sensors[].enabled == true -
// cam bien da bi "tam tat" tu app se KHONG xuat hien trong readings nua, va
// Dashboard tren app se tu an the/chi so tuong ung (xem DashboardScreen.js).
void sendTelemetry() {
  bool dhtOn  = sensorEnabled("dht");
  bool soundOn = sensorEnabled("sound");
  bool distOn  = sensorEnabled("distance");
  bool gasOn   = sensorEnabled("gas");

  float temperature = NAN;
  float humidity     = NAN;
  int   soundRaw      = 0;
  float distanceCm     = -1;
  int   gasRaw         = 0;

  if (dhtOn) {
    temperature = dht.readTemperature();   // NaN neu doc loi
    humidity     = dht.readHumidity();     // NaN neu doc loi
  }
  if (soundOn) {
    long ssum = 0;
    for (int i = 0; i < 8; i++) { ssum += analogRead(PIN_SOUND); delay(2); }
    soundRaw = (int)(ssum / 8);                        // 0-4095
  }
  if (distOn)  distanceCm = readDistanceCm();        // -1 neu khong do duoc
  if (gasOn) {
    // Lay trung binh 8 mau cho do nhieu. MQ-2 dang cam: AO luon > GAS_MIN_VALID
    // (khong khi sach van ~vai tram). Thao MQ-2 ra + dien tro keo xuong 100k
    // GPIO35->GND: chan doc ~0 -> coi la "khong co cam bien", khong gui so rac.
    long sum = 0;
    for (int i = 0; i < 8; i++) { sum += analogRead(PIN_GAS); delay(2); }
    gasRaw = (int)(sum / 8);   // 0-4095
    Serial.printf("[GAS] gia tri doc duoc = %d (nguong coi la co MQ-2: >= %d)\n", gasRaw, GAS_MIN_VALID);
  }

  DynamicJsonDocument data(1024);
  data["event"] = "telemetry";
  JsonObject readings = data.createNestedObject("readings");
  if (dhtOn && !isnan(temperature)) readings["temperature"] = temperature;
  if (dhtOn && !isnan(humidity))    readings["humidity"]    = humidity;
  if (soundOn && soundRaw >= SOUND_MIN_VALID) readings["soundLevel"] = soundRaw;
  if (distOn && distanceCm >= 0)    readings["distanceCm"]  = distanceCm;
  if (gasOn && gasRaw >= GAS_MIN_VALID) readings["gasLevel"] = gasRaw;
  else if (gasOn) Serial.println("[GAS] Khong thay MQ-2 (gia tri ~0) - bo qua lan gui nay");

  // PIR: so lan phat hien chuyen dong tu lan gui truoc (bieu do Dashboard)
  if (sensorEnabled("pir")) {
    portENTER_CRITICAL(&isrMux);
    unsigned long mc = pirEdgeCount;
    pirEdgeCount = 0;
    portEXIT_CRITICAL(&isrMux);
    readings["motionCount"] = (int)mc;
  }

  // ---------------- CAM BIEN MO RONG ----------------
  if (sensorEnabled("light")) {
    int li = sensorIndexOf("light");
    if (!sensorPresent[li]) beginLight();
    float lux = lightMeter.readLightLevel();          // < 0 neu loi
    bool ok = lux >= 0;
    if (ok) readings["lightLux"] = lux;
    updatePresence("light", ok);
  }
  if (sensorEnabled("rain")) {
    int raw = readAnalogAvg(PIN_RAIN);
    readings["rainPercent"] = rawToPercent(raw, RAIN_RAW_DRY, RAIN_RAW_WET);
    Serial.printf("[RAIN] raw=%d\n", raw);
  }
  if (sensorEnabled("mq4")) {
    int raw = readAnalogAvg(PIN_MQ4);
    Serial.printf("[MQ4] raw=%d\n", raw);
    bool ok = raw >= MQ4_MIN_VALID;
    if (ok) readings["methaneLevel"] = raw;
    updatePresence("mq4", ok);
  }
  if (sensorEnabled("flame")) {
    int raw = readAnalogAvg(PIN_FLAME);
    Serial.printf("[FLAME] raw=%d\n", raw);
    readings["flameLevel"] = rawToPercent(raw, FLAME_RAW_NONE, FLAME_RAW_FIRE);
  }
  if (sensorEnabled("vibration")) {
    portENTER_CRITICAL(&isrMux);
    unsigned long n = vibCount;
    vibCount = 0;
    portEXIT_CRITICAL(&isrMux);
    readings["vibrationCount"] = (int)n;   // so lan rung tu lan gui truoc
  }

  // Cap nhat "co mat" cho cam bien tu nhan biet duoc, roi bao server neu doi
  // (app se an/hien hang bat/tat + the Dashboard tuong ung).
  if (dhtOn) updatePresence("dht", !isnan(temperature) || !isnan(humidity));
  if (gasOn) updatePresence("gas", gasRaw >= GAS_MIN_VALID);
  if (soundOn) updatePresence("sound", soundRaw >= SOUND_MIN_VALID);
  // HC-SR04: do duoc (>=0) la co mat; khong do duoc thi xem chan Echo co duoc day khong
  // (huong ra khoang trong van tra -1 nhung chan Echo van duoc cam bien giu o muc LOW).
  if (distOn) updatePresence("distance", distanceCm >= 0 || pinDriven(PIN_ECHO));
  // PIR: KHONG tu phat hien rut cam (phep thu chan cho ket qua sai voi HC-SR501 -> PIR bi
  // danh dau vang mat roi bi bo qua). PIR luon coi la co mat.

  bool presenceChanged = false;
  for (int i = 0; i < SENSOR_COUNT; i++) {
    if (sensorPresent[i] != sensorReportedPresent[i]) presenceChanged = true;
  }
  if (presenceChanged) {
    DynamicJsonDocument ev(3072);
    ev["event"] = "sensors_changed";
    appendSensorsJson(ev);
    if (sendMessage("Cap nhat danh sach cam bien", "device_event", &ev)) {
      for (int i = 0; i < SENSOR_COUNT; i++) sensorReportedPresent[i] = sensorPresent[i];
    }
  }

  // Tat ca cam bien doc deu dang bi tam tat -> khong co gi de gui, bo qua
  // luon lan nay (tranh gui 1 message rong moi 30s).
  if (readings.size() == 0) {
    Serial.println("[TELEMETRY] Tat ca cam bien dang tam tat - bo qua lan gui nay");
    return;
  }

  sendMessage("Cap nhat du lieu cam bien (xem chi tiet tren Dashboard)",
              "device_telemetry", &data);
}


void loop() {
  unsigned long now = millis();

  static unsigned long bootHoldStart = 0;
  if (digitalRead(PIN_BOOT_BTN) == LOW) {
    if (bootHoldStart == 0) bootHoldStart = now;
    if (now - bootHoldStart > 3000) {
      Serial.println("[RESET] Xoa config, khoi dong lai portal");
      wm.resetSettings();
      clearSavedNetworks();
      prefs.remove("apikey");
      prefs.remove("deviceid");
      prefs.remove("server");
      delay(500);
      ESP.restart();
    }
  } else {
    bootHoldStart = 0;
  }

  // ---- WATCHDOG WiFi: mat mang thi tu noi lai, qua lau thi khoi dong lai ----
  static unsigned long offlineSince = 0, lastWifiTry = 0;
  if (WiFi.status() != WL_CONNECTED) {
    if (offlineSince == 0) {
      offlineSince = now;
      lastWifiTry = 0;
      Serial.println("[WIFI] Mat ket noi - dang tu noi lai...");
    }
    if (now - lastWifiTry >= 10000) {
      lastWifiTry = now;
      if (wifiMultiReady) wifiMulti.run(8000);
      else WiFi.reconnect();
    }
    if (now - offlineSince > WIFI_OFFLINE_RESTART_MS) {
      Serial.println("[WIFI] Mat mang qua lau -> khoi dong lai");
      delay(300);
      ESP.restart();
    }
    delay(200);
    return;
  }
  if (offlineSince != 0) {
    offlineSince = 0;
    invalidateServerCache();      // IP may chu co the doi theo mang -> tim lai
    lastServerOk = now;
    Serial.printf("[WIFI] Da noi lai \"%s\" - IP %s\n",
                  WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  }

  // ---- WATCHDOG server: WiFi ok nhung server khong tra loi ----
  // (Render free ngu dong co the mat 30-60s luc dau nen cho 2 phut moi can thiep)
  static bool kicked = false;
  if (apiKey.length() == 0) lastServerOk = now;   // chua co API key thi khong gui gi -> khong theo doi
  if (now - lastServerOk < SERVER_KICK_MS) kicked = false;
  if (now - lastServerOk > SERVER_RESTART_MS) {
    Serial.println("[SERVER] Khong lien lac duoc 10 phut -> khoi dong lai");
    delay(300);
    ESP.restart();
  } else if (!kicked && now - lastServerOk > SERVER_KICK_MS) {
    kicked = true;
    Serial.println("[SERVER] Khong lien lac duoc 2 phut -> ngat/noi lai WiFi");
    invalidateServerCache();
    WiFi.disconnect();
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

  // Doc chan PIR MOI lan loop (de khi bat lai cam bien tu trang thai tam tat
  // thi khong bi "nhay" theo 1 canh xung cu da bi bo lo luc dang tat).
  int currentState = digitalRead(PIN_PIR);

  if (sensorUsable("pir")) {
    if (DEBUG_PIR_STATE && (now - lastDebugTime > 3000)) {
      lastDebugTime = now;
      Serial.printf("[DEBUG] PIR = %s | chuoi = %d/%d\n",
                    currentState == HIGH ? "HIGH" : "LOW",
                    motionSeqCount, MOTION_SEQ_TARGET);
    }

    // Moi canh LEN (LOW -> HIGH) = 1 lan chuyen dong. Canh duoc bat bang NGAT
    // (pirIsr) nen khong bi mat du loop() dang bi chan boi HTTP/TLS len server.
    if (pirEdgeFlag) {
      Serial.println("[PIR] Xung HIGH hop le (co chuyen dong)");
      portENTER_CRITICAL(&isrMux);
      pirEdgeFlag = false;
      portEXIT_CRITICAL(&isrMux);
      if ((now - lastTriggerTime) >= PIR_MIN_INTERVAL) {
        lastTriggerTime = now;
        onMotionDetected();
      }
    }
  } else {
    pirEdgeFlag = false;   // cam bien dang tat -> bo qua xung
  }


  lastPirState = currentState;
  delay(50);
}


// ====================== POLL LENH TU APP (OUTPUT + CAM BIEN) ===
/*
 *  Backend tra ve trong 1 lan poll duy nhat:
 *  { "commands":       [ { "outputId": "led", "state": true }, ... ],
 *    "sensorCommands": [ { "sensorId": "dht", "enabled": false }, ... ] }
 *  Chi can API key: route GET /api/devices/command nhan ra thiet bi tu X-Device-Key.
 */
void pollCommand() {
  if (apiKey.length() == 0) return;                 // chua nhap API key
  if (millis() - lastCommandPoll < COMMAND_POLL_MS) return;
  lastCommandPoll = millis();

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  beginHttp(http, plainClient, secureClient, commandUrl());
  http.addHeader("X-Device-Key", apiKey);
  http.setTimeout(5000);

  int code = http.GET();
  if (code > 0) lastServerOk = millis();
  if (code <= 0) invalidateServerCache();   // khong toi duoc server -> lan sau tim lai IP
  bool appliedOutput = false;
  bool appliedSensor = false;

  if (code == 200) {
    // MOI: tang tu 512 len 768 vi response gio co them mang sensorCommands
    DynamicJsonDocument doc(1024);
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
        appliedOutput = true;
      }

      // MOI: lenh bat/tat CAM BIEN, cung format voi commands[] o tren
      JsonArray sensorCommands = doc["sensorCommands"].as<JsonArray>();
      for (JsonObject cmd : sensorCommands) {
        const char* sensorId = cmd["sensorId"];
        bool wanted = cmd["enabled"];

        Sensor* sv = findSensor(sensorId);
        if (!sv) {
          Serial.printf("[CMD] Bo qua - khong co cam bien '%s'\n", sensorId ? sensorId : "?");
          continue;
        }
        if (sv->enabled == wanted) continue;

        sv->enabled = wanted;
        Serial.printf("[SENSOR] %s -> %s\n", sv->id, wanted ? "BAT" : "TAM TAT");
        appliedSensor = true;
      }
    }
  } else if (code > 0) {
    Serial.printf("[CMD] Poll loi - status %d\n", code);
  }
  http.end();

  // Bao lai trang thai THUC sau khi thuc thi (ca output lan cam bien), de
  // app doc duoc ngay ma khong phai doi den lan telemetry/boot tiep theo.
  if (appliedOutput || appliedSensor) {
    DynamicJsonDocument data(3072);
    data["event"] = "command_applied";
    appendOutputsJson(data);
    appendSensorsJson(data);
    sendMessage("Da cap nhat trang thai thiet bi", "device_event", &data);
  }
}
// ================================================================


bool sendMessage(const char* content, const char* type, JsonDocument* deviceDataDoc) {
  if (WiFi.status() != WL_CONNECTED || apiKey.length() == 0) return false;

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  beginHttp(http, plainClient, secureClient, messageUrl());
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", apiKey);
  http.setTimeout(5000);

  // MOI: tang tu 384 len 512 - deviceData gio co the mang ca outputs[] va
  // sensors[] cung luc (boot / command_applied), can them cho.
  DynamicJsonDocument doc(6144);
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
  if (code > 0) lastServerOk = millis();
  if (code <= 0) invalidateServerCache();   // khong toi duoc server -> lan sau tim lai IP
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
