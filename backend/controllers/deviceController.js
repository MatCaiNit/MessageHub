import Device from '../models/Device.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
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
      // Ghep thiet bi moi vao 1 hoi thoai "device" da co san (nhieu thiet bi chung 1 chat)
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

    // Chi gan deviceId "dai dien" cho hoi thoai khi day la hoi thoai moi tao rieng cho 1 thiet bi
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

// GET /api/devices/hubs - danh sach cac hoi thoai loai "device" ma user nay la admin,
// dung de chon "ghep thiet bi moi vao hoi thoai co san" thay vi luon tao hoi thoai moi
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


export const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const device = await Device.findById(id);
    if (!device) return res.status(404).json({ message: 'Khong tim thay thiet bi' });
    if (String(device.ownerId) !== req.userId) {
      return res.status(403).json({ message: 'Khong co quyen xoa thanh vien khoi thiet bi nay' });
    }
    if (String(device.linkedUserAccountId) === userId) {
      return res.status(400).json({ message: 'Khong the xoa chinh tai khoan cua thiet bi nay' });
    }

    const conversation = await Conversation.findById(device.conversationId);
    if (!conversation) return res.status(404).json({ message: 'Khong tim thay cuoc tro chuyen cua thiet bi' });

    conversation.participants = conversation.participants.filter((pid) => String(pid) !== String(userId));
    await conversation.save();

    res.json({ message: 'Da xoa thanh vien khoi cuoc tro chuyen cua thiet bi', conversation });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};