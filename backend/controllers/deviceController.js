import Device from '../models/Device.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { generateApiKey } from '../utils/generateApiKey.js';

export const registerDevice = async (req, res) => {
  try {
    const { name, conversationId } = req.body;
    const ownerId = req.userId;

    const deviceUsername = `device_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const deviceUser = await User.create({
      username: deviceUsername,
      displayName: name,
      email: `${deviceUsername}@device.com`,
      passwordHash: 'device-account-no-login',
      type: 'device',
    });

    const { rawKey, keyHash } = generateApiKey();

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Khong tim thay cuoc tro chuyen de tham gia' });
      }
      if (conversation.type !== 'device') {
        return res.status(400).json({ message: 'Chi co the ghep thiet bi vao 1 hoi thoai loai device' });
      }
      if (String(conversation.adminId) !== String(ownerId)) {
        return res.status(403).json({ message: 'Ban khong phai admin cua hoi thoai nay' });
      }
      if (!conversation.participants.map(String).includes(String(deviceUser._id))) {
        conversation.participants.push(deviceUser._id);
        await conversation.save();
      }
    } else {
      conversation = await Conversation.create({
        participants: [ownerId, deviceUser._id],
        type: 'device',
        name,
        adminId: ownerId,
      });
    }

    const device = await Device.create({
      name,
      ownerId,
      apiKeyHash: keyHash,
      linkedUserAccountId: deviceUser._id,
      conversationId: conversation._id,
    });

    if (!conversationId) {
      conversation.deviceId = device._id;
      await conversation.save();
    }

    res.status(201).json({
      device,
      conversationId: conversation._id,
      apiKey: rawKey,
      message: 'Luu apiKey nay ngay - se khong hien thi lai lan sau',
    });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

export const listDeviceHubs = async (req, res) => {
  try {
    const hubs = await Conversation.find({ type: 'device', adminId: req.userId }).select(
      '_id name participants createdAt'
    );
    const hubsWithCount = await Promise.all(
      hubs.map(async (hub) => {
        const deviceCount = await Device.countDocuments({ conversationId: hub._id });
        return { _id: hub._id, name: hub.name, deviceCount, createdAt: hub.createdAt };
      })
    );
    res.json(hubsWithCount);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

export const listMyDevices = async (req, res) => {
  try {
    const devices = await Device.find({ ownerId: req.userId }).populate(
      'conversationId',
      'name participants'
    );
    res.json(devices);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

export const revokeDevice = async (req, res) => {
  try {
    const { id: deviceId } = req.params;
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    }
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen thu hoi thiet bi nay' });
    }

    device.isActive = false;
    await device.save();

    res.json({ message: 'Da thu hoi quyen truy cap cua thiet bi' });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

export const regenerateApiKey = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device) return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen thay doi api key cua thiet bi nay' });
    }
    const { rawKey, keyHash } = generateApiKey();
    device.apiKeyHash = keyHash;
    device.isActive = true;
    await device.save();

    res.json({ apiKey: rawKey, message: 'Luu apiKey moi ngay - se khong hien thi lai lan sau' });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

export const addMember = async (req, res) => {
  try {
    const { userId, deviceId: addDeviceId } = req.body;
    if (!userId && !addDeviceId) {
      return res.status(400).json({ message: 'Can truyen userId hoac deviceId de them vao hoi thoai' });
    }

    const device = await Device.findById(req.params.id);
    if (!device) return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen them thanh vien vao thiet bi nay' });
    }

    const conversation = await Conversation.findById(device.conversationId);
    if (!conversation) return res.status(404).json({ message: 'Khong tim thay cuoc tro chuyen cua thiet bi' });

    let targetUserId;

    if (addDeviceId) {
      // Them 1 thiet bi khac (cua chinh nguoi goi) vao chung hoi thoai nay
      const otherDevice = await Device.findById(addDeviceId);
      if (!otherDevice) return res.status(404).json({ message: 'Khong tim thay thiet bi de them vao' });
      if (String(otherDevice.ownerId) !== req.userId) {
        return res.status(403).json({ message: 'Ban khong phai admin cua thiet bi nay nen khong the keo vao nhom' });
      }
      targetUserId = otherDevice.linkedUserAccountId;
    } else {
      const userToAdd = await User.findById(userId);
      if (!userToAdd) return res.status(404).json({ message: 'Khong tim thay user de them vao' });
      targetUserId = userToAdd._id;
    }

    if (conversation.participants.map(String).includes(String(targetUserId))) {
      return res.status(400).json({ message: 'Da la thanh vien cua cuoc tro chuyen nay roi' });
    }

    conversation.participants.push(targetUserId);
    await conversation.save();

    const populated = await conversation.populate('participants', 'username displayName avatar isOnline type');
    res.json({ message: 'Da them thanh vien vao cuoc tro chuyen cua thiet bi', conversation: populated });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// LUU Y: phan than ham nay (sau doan kiem tra quyen) minh suy ra theo dung
// pattern cua addMember o tren vi khong lay lai duoc nguyen van tu repo khi
// doc qua project_search (ham nay von khong nam trong danh sach loi da bao) —
// ban doi chieu lai doan filter participants ben duoi voi file that cua ban.
export const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const device = await Device.findById(id);
    if (!device) return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen xoa thanh vien khoi thiet bi nay' });
    }

    const conversation = await Conversation.findById(device.conversationId);
    if (!conversation) return res.status(404).json({ message: 'Khong tim thay cuoc tro chuyen cua thiet bi' });

    conversation.participants = conversation.participants.filter(
      (p) => String(p) !== String(userId)
    );
    await conversation.save();

    const populated = await conversation.populate('participants', 'username displayName avatar isOnline type');
    res.json({ message: 'Da xoa thanh vien khoi cuoc tro chuyen cua thiet bi', conversation: populated });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

/**
 * App bam nut on/off -> ghi lenh cho vao hang doi.
 * Route: PATCH /api/devices/:id/command   (middleware: protect - JWT)
 * Body : { outputId: 'relay1', state: true }
 *
 * FIX: codebase nay dung Device.ownerId (string, so voi req.userId - cung la
 * string), KHONG co field device.owner va KHONG co req.user object. Ban goc
 * minh viet `device.owner.toString() !== req.user._id.toString()` se luon
 * throw "Cannot read properties of undefined" vi ca hai deu khong ton tai.
 */
export const setDeviceCommand = async (req, res) => {
  try {
    const { outputId, state } = req.body;

    if (typeof outputId !== 'string' || !outputId.trim()) {
      return res.status(400).json({ message: 'Thieu outputId' });
    }
    if (typeof state !== 'boolean') {
      return res.status(400).json({ message: 'state phai la true hoac false' });
    }

    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    }

    // Chi chu so huu moi duoc dieu khien
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen dieu khien thiet bi nay' });
    }

    // outputId phai ton tai tren thiet bi, neu khong ESP32 se bo qua lenh
    const output = device.outputs.find((o) => o.outputId === outputId);
    if (!output) {
      return res.status(400).json({
        message: `Thiet bi khong co dau ra '${outputId}'`,
        available: device.outputs.map((o) => o.outputId),
      });
    }

    // Moi dau ra chi giu MOT lenh moi nhat. Nguoi dung bam lien tuc
    // thi chi lenh cuoi cung co hieu luc, khong don thanh hang doi dai.
    device.pendingCommands = device.pendingCommands.filter(
      (c) => c.outputId !== outputId
    );
    device.pendingCommands.push({ outputId, state, createdAt: new Date() });

    await device.save();

    res.json({
      message: 'Da gui lenh, thiet bi se thuc thi trong vai giay',
      outputId,
      state,
      label: output.label,
    });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

/**
 * ================== MOI: BAT/TAT TUNG CAM BIEN ==================
 * App bam nut on/off cho 1 CAM BIEN (khong phai dau ra) -> ghi lenh cho
 * vao hang doi rieng pendingSensorCommands, giong het setDeviceCommand o
 * tren nhung cho sensors[] thay vi outputs[].
 * Route: PATCH /api/devices/:id/sensor-command   (middleware: protect - JWT)
 * Body : { sensorId: 'dht', enabled: false }
 */
export const setSensorCommand = async (req, res) => {
  try {
    const { sensorId, enabled } = req.body;

    if (typeof sensorId !== 'string' || !sensorId.trim()) {
      return res.status(400).json({ message: 'Thieu sensorId' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled phai la true hoac false' });
    }

    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    }

    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen dieu khien thiet bi nay' });
    }

    // sensorId phai ton tai tren thiet bi (firmware tu khai bao luc boot),
    // neu khong ESP32 se bo qua lenh nay.
    const sensor = device.sensors.find((sv) => sv.sensorId === sensorId);
    if (!sensor) {
      return res.status(400).json({
        message: `Thiet bi khong co cam bien '${sensorId}'`,
        available: device.sensors.map((sv) => sv.sensorId),
      });
    }

    // Moi cam bien chi giu MOT lenh moi nhat, giong co che cua pendingCommands
    device.pendingSensorCommands = device.pendingSensorCommands.filter(
      (c) => c.sensorId !== sensorId
    );
    device.pendingSensorCommands.push({ sensorId, enabled, createdAt: new Date() });

    await device.save();

    res.json({
      message: 'Da gui lenh, thiet bi se thuc thi trong vai giay',
      sensorId,
      enabled,
      label: sensor.label,
    });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};
// ===================================================================

/**
 * ESP32 poll dinh ky de lay cac lenh dang cho; lay xong thi clear.
 * Route: GET /api/devices/:id/command   (middleware: deviceProtect - X-Device-Key)
 * Tra  : { commands: [ { outputId, state } ], sensorCommands: [ { sensorId, enabled } ] }
 *
 * MOI: tra them sensorCommands trong CUNG 1 lan poll (ESP32 khong can goi
 * them request rieng cho cam bien) - giu nguyen field "commands" cu de
 * khong pha firmware/App ban nao chi biet doc outputs.
 */
export const getDeviceCommand = async (req, res) => {
  try {
    // deviceProtect gan req.device sau khi so khop X-Device-Key
    const device = req.device;
    if (!device) {
      return res.status(401).json({ message: 'Thiet bi chua duoc xac thuc' });
    }

    const commands = device.pendingCommands.map((c) => ({
      outputId: c.outputId,
      state: c.state,
    }));
    const sensorCommands = device.pendingSensorCommands.map((c) => ({
      sensorId: c.sensorId,
      enabled: c.enabled,
    }));

    if (commands.length > 0) {
      device.pendingCommands = [];
    }
    if (sensorCommands.length > 0) {
      device.pendingSensorCommands = [];
    }

    // Dung chinh lan poll nay lam heartbeat
    device.lastSeenAt = new Date();
    await device.save();

    res.json({ commands, sensorCommands });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

/**
 * App doi chieu trang thai thuc (device.outputs[].state, device.sensors[].enabled)
 * sau khi gui lenh.
 * Route: GET /api/devices/:id   (middleware: protect - JWT)
 *
 * FIX: cung loi device.owner/req.user nhu setDeviceCommand o tren.
 */
export const getDeviceById = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id).select('-apiKeyHash');
    if (!device) {
      return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    }
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen xem thiet bi nay' });
    }
    res.json(device);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

/**
 * Lich su cac lan doc cam bien (dung de ve bieu do tren Dashboard).
 * Route: GET /api/devices/:id/telemetry?limit=50   (middleware: protect - JWT)
 * Tra  : { readings: [ { readings: {...}, createdAt } ], latest: {...}, latestAt } theo
 *        thu tu THOI GIAN TANG DAN (cu -> moi), tien cho viec ve truc X tren bieu do.
 *
 * Du lieu lay tu Message (type: 'device_telemetry'), khong can them collection rieng
 * vi sendDeviceMessage() da luu 1 Message cho moi lan telemetry gui len.
 */
export const getDeviceTelemetryHistory = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id).select('ownerId conversationId lastTelemetry lastTelemetryAt');
    if (!device) {
      return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    }
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen xem thiet bi nay' });
    }

    // ?range=live (mac dinh) | 1h | 6h | 24h | 7d
    //  - live : N ban ghi moi nhat (?limit=, toi da 200), moi ban ghi 1 diem
    //  - con lai: lay TOAN BO ban ghi trong khoang thoi gian, gop thanh toi da
    //    ~30-56 "xo" (bucket) theo thoi gian, moi xo = trung binh -> bieu do
    //    luon phu het khoang thoi gian da chon, khong bi cat o 30 ban ghi cuoi.
    const RANGES = {
      '1h':  { ms: 60 * 60 * 1000,           buckets: 30 },
      '6h':  { ms: 6 * 60 * 60 * 1000,       buckets: 36 },
      '24h': { ms: 24 * 60 * 60 * 1000,      buckets: 48 },
      '7d':  { ms: 7 * 24 * 60 * 60 * 1000,  buckets: 56 },
    };
    const range = RANGES[req.query.range] ? req.query.range : 'live';

    let rawPoints; // [{ t: ms, r: {key: value} }] tang dan theo thoi gian

    if (range === 'live') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
      const messages = await Message.find({
        conversationId: device.conversationId,
        type: 'device_telemetry',
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('deviceData createdAt')
        .lean();
      rawPoints = messages.reverse().map((m) => ({
        t: new Date(m.createdAt).getTime(),
        r: m.deviceData?.readings || {},
      }));
    } else {
      const cfg = RANGES[range];
      const since = new Date(Date.now() - cfg.ms);
      // 7 ngay * 2 ban ghi/phut ~ 20160 -> tran 30000 de an toan bo nho
      const messages = await Message.find({
        conversationId: device.conversationId,
        type: 'device_telemetry',
        createdAt: { $gte: since },
      })
        .sort({ createdAt: 1 })
        .limit(30000)
        .select('deviceData createdAt')
        .lean();
      rawPoints = messages.map((m) => ({
        t: new Date(m.createdAt).getTime(),
        r: m.deviceData?.readings || {},
      }));
    }

    // Thong ke (TB / thap nhat / cao nhat) tinh tren DU LIEU GOC, khong phai
    // tren du lieu da gop xo -> so lieu chinh xac cho ca khoang thoi gian.
    // Cac khoa "dem so lan" (moi diem = so lan trong 1 lan gui): gop xo bang TONG, khong phai TB
    const COUNT_KEYS = new Set(['motionCount', 'vibrationCount']);
    const acc = {};
    rawPoints.forEach((p) => {
      Object.entries(p.r).forEach(([k, v]) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return;
        if (!acc[k]) acc[k] = { sum: 0, min: v, max: v, count: 0 };
        acc[k].sum += v;
        acc[k].count += 1;
        if (v < acc[k].min) acc[k].min = v;
        if (v > acc[k].max) acc[k].max = v;
      });
    });
    const stats = {};
    Object.entries(acc).forEach(([k, a]) => {
      stats[k] = { avg: a.sum / a.count, sum: a.sum, min: a.min, max: a.max, count: a.count };
    });

    let readings;
    if (range === 'live') {
      readings = rawPoints.map((p) => ({ readings: p.r, createdAt: new Date(p.t) }));
    } else {
      const cfg = RANGES[range];
      const bucketMs = cfg.ms / cfg.buckets;
      const start = Date.now() - cfg.ms;
      const buckets = new Map(); // index -> { tSum, n, sums: {k: {s, c}} }
      rawPoints.forEach((p) => {
        const idx = Math.min(cfg.buckets - 1, Math.max(0, Math.floor((p.t - start) / bucketMs)));
        if (!buckets.has(idx)) buckets.set(idx, { tSum: 0, n: 0, sums: {} });
        const b = buckets.get(idx);
        b.tSum += p.t;
        b.n += 1;
        Object.entries(p.r).forEach(([k, v]) => {
          if (typeof v !== 'number' || !Number.isFinite(v)) return;
          if (!b.sums[k]) b.sums[k] = { s: 0, c: 0 };
          b.sums[k].s += v;
          b.sums[k].c += 1;
        });
      });
      readings = [...buckets.keys()]
        .sort((a, b) => a - b)
        .map((idx) => {
          const b = buckets.get(idx);
          const r = {};
          Object.entries(b.sums).forEach(([k, a]) => { r[k] = COUNT_KEYS.has(k) ? a.s : a.s / a.c; });
          return { readings: r, createdAt: new Date(b.tSum / b.n), samples: b.n };
        });
    }

    res.json({
      range,
      readings,
      stats,
      latest: device.lastTelemetry || null,
      latestAt: device.lastTelemetryAt || null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};