import Device from '../models/Device.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import { generateApiKey } from '../utils/generateToken.js';


export const registerDevice = async (req, res) => {
  try {
    const { name } = req.body;
    const ownerId = req.userId;

    const deviceUsername = `device_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const deviceUser = await User.create({
      username: deviceUsername,
      email: `${deviceUsername}@device.com`,
      passwordHash: 'device-account-no-login',
      type: 'device',
    });

    const { rawKey, keyHash } = generateApiKey();

    const conversation = await Conversation.create({
      participants: [ownerId, deviceUser._id],
      type: 'device',
      name,
      adminId: ownerId,
    });

    const device = await Device.create({
      name,
      ownerId,
      apiKeyHash: keyHash,
      linkedUserAccountId: deviceUser._id,
      conversationId: conversation._id,
    });

    conversation.deviceId = device._id;
    await conversation.save();

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
    if (conversation.participants.map(String).includes(req.userId)) {
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
