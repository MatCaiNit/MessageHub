import Device from '../models/Device.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import { generateApiKey } from '../utils/generateApiKey.js';


// POST /api/devices
// Body: { name, conversationId? }
//   - Neu KHONG co conversationId: tao thiet bi + tao conversation MOI (hanh vi cu, khong doi)
//   - Neu CO conversationId: join thiet bi moi vao 1 conversation device DA TON TAI
//     -> nhieu thiet bi vat ly se cung xuat hien chung trong 1 cuoc tro chuyen,
//        moi thiet bi van co "user ao" rieng (linkedUserAccountId) nen tin nhan
//        cua tung thiet bi van hien dung ten + avatar rieng tren khung chat
//        (MessageBubble da ho tro san viec nay, khong can sua frontend)
export const registerDevice = async (req, res) => {
  try {
    const { name, conversationId } = req.body;
    const ownerId = req.userId;

    // Tao user ao dai dien cho thiet bi nay (luon tao moi, du dung chung
    // hay rieng conversation) -> moi thiet bi co danh tinh rieng khi hien tin nhan
    const deviceUsername = `device_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const deviceUser = await User.create({
      username: deviceUsername,
      email: `${deviceUsername}@device.com`,
      passwordHash: 'device-account-no-login',
      type: 'device',
    });

    const { rawKey, keyHash } = generateApiKey();

    let conversation;

    if (conversationId) {
      // ─── Che do JOIN: gan thiet bi moi vao 1 "hub" da co san ───
      conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return res.status(404).json({ message: 'Khong tim thay cuoc tro chuyen de tham gia' });
      }
      if (conversation.type !== 'device') {
        return res.status(400).json({ message: 'Chi co the ghep thiet bi vao mot cuoc tro chuyen loai thiet bi' });
      }
      // Chi chu so huu cuoc tro chuyen thiet bi (adminId) moi duoc them thiet bi moi vao
      if (String(conversation.adminId) !== String(ownerId)) {
        return res.status(403).json({ message: 'Ban khong co quyen them thiet bi vao cuoc tro chuyen nay' });
      }

      // Them user ao cua thiet bi moi vao danh sach participants (neu chua co)
      if (!conversation.participants.map(String).includes(String(deviceUser._id))) {
        conversation.participants.push(deviceUser._id);
        await conversation.save();
      }
    } else {
      // ─── Che do cu: tao conversation MOI rieng cho thiet bi nay ───
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

    // Chi gan conversation.deviceId khi tao moi (1 conversation nhieu thiet bi
    // thi khong the chi tro ve 1 deviceId duy nhat nua)
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

// GET /api/devices/hubs
// Tra ve danh sach cac cuoc tro chuyen loai "device" hien co cua user
// (dung khi FE muon cho nguoi dung chon "them vao hub co san" thay vi tao moi)
export const listDeviceHubs = async (req, res) => {
  try {
    const hubs = await Conversation.find({
      type: 'device',
      adminId: req.userId,
    }).select('_id name participants createdAt');

    // Dem so thiet bi thuc su dang gan vao moi hub (participants tru chinh chu)
    const hubsWithCount = await Promise.all(
      hubs.map(async (hub) => {
        const deviceCount = await Device.countDocuments({ conversationId: hub._id });
        return {
          _id: hub._id,
          name: hub.name,
          deviceCount,
          createdAt: hub.createdAt,
        };
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
    const { deviceId } = req.params;
    if (!deviceId) {
      return res.status(400).json({ message: 'Thieu deviceId' });
    }

    // FIX: thieu dong lay device truoc khi dung - gay ReferenceError
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
    const { userId } = req.body;

    const device = await Device.findById(req.params.id);
    if (!device) return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen them thanh vien vao thiet bi nay' });
    }

    const userToAdd = await User.findById(userId);
    if (!userToAdd) return res.status(404).json({ message: 'Khong tim thay user de them vao' });

    const conversation = await Conversation.findById(device.conversationId);

    // FIX: kiem tra dung `userId` (nguoi moi them), khong phai `req.userId` (chu so huu)
    if (conversation.participants.map(String).includes(userId)) {
      return res.status(400).json({ message: 'User da la thanh vien cua cuoc tro chuyen' });
    }

    conversation.participants.push(userId);
    await conversation.save();

    res.json({ message: 'Da them thanh vien vao cuoc tro chuyen cua thiet bi', conversation });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};


export const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.body;

    const device = await Device.findById(id);
    if (!device) return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen xoa thanh vien khoi thiet bi nay' });
    }
    if (String(device.ownerId) === userId) {
      return res.status(400).json({ message: 'Khong the tu xoa chinh chu so huu' });
    }

    const conversation = await Conversation.findById(device.conversationId);
    if (!conversation) return res.status(404).json({ message: 'Khong tim thay cuoc tro chuyen cua thiet bi' });

    conversation.participants = conversation.participants.filter((id) => String(id) !== String(userId));
    await conversation.save();

    res.json({ message: 'Da xoa thanh vien khoi cuoc tro chuyen cua thiet bi', conversation });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};