import Device from '../models/device.js';
import { hashApiKey } from '../utils/generateToken.js';

export const deviceProtect = async (req, res, next) => {
  const apiKey = req.headers['x-device-key'];

  if (!apiKey) {
    return res.status(401).json({ message: 'Thiếu X-Device-Key trong header' });
  }

  try {
    const keyHash = hashApiKey(apiKey);
    const device = await Device.findOne({ apiKey: keyHash });

    if (!device) {
      return res.status(401).json({ message: 'API key khong hop le', code: 'API_KEY_INVALID' });
    }
    if (!device.isActive) {
      return res.status(403).json({ message: 'Thiet bi da bi thu hoi quyen truy cap', code: 'DEVICE_REVOKED' });
    }

    req.deviceId = device._id;
    req.device = device;
    req.conversationId = device.conversationId;

    Device.findByIdAndUpdate(device._id, { lastSeenAt: new Date() }).exec();
    next();
  } catch (err) {
    res.status(500).json({ message: 'Loi xac thuc thiet bi', error: err.message });
  }
};