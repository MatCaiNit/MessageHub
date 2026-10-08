import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Device from '../models/Device.js';
import { broadcastToConversation } from '../sockets/socketHandler.js';
import { SOCKET_EVENTS } from '../sockets/socketEvents.js';

// POST /api/messages/upload
export const uploadAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Khong co file duoc gui len' });
    const url = `/uploads/${req.file.filename}`;
    const fixedOriginalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    res.status(201).json({
      url,
      fileName: fixedOriginalName,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// Doan tu outputId suy ra loai dau ra khi ESP32 tu khai bao lan dau (boot)
const guessOutputKind = (outputId) => {
  const id = outputId.toLowerCase();
  if (id.includes('led')) return 'led';
  if (id.includes('relay')) return 'relay';
  if (id.includes('buzzer') || id.includes('coi')) return 'buzzer';
  return 'other';
};


const guessSensorKind = (sensorId) => {
  const id = sensorId.toLowerCase();
  if (id.includes('pir')) return 'pir';
  if (id.includes('dht')) return 'dht';
  if (id.includes('sound')) return 'sound';
  if (id.includes('distance')) return 'distance';
  if (id.includes('gas')) return 'gas';
  return 'other';
};


// POST /api/messages/device
export const sendDeviceMessage = async (req, res) => {
  try {
    const { content, type, deviceData } = req.body;
    const conversationId = req.conversationId; // duoc gan boi middleware deviceAuth.js
    const deviceUser = req.device.linkedUserAccountId;

    const message = await Message.create({
      conversationId,
      senderId: deviceUser,
      content,
      type: type || 'device_event',
      deviceData: deviceData || null,
    });


    if (deviceData && Array.isArray(deviceData.outputs)) {
      const device = req.device;
      const known = new Set(device.outputs.map((o) => o.outputId));
      let changed = false;

      for (const incoming of deviceData.outputs) {
        if (typeof incoming?.outputId !== 'string') continue;
        if (typeof incoming?.state !== 'boolean') continue;

        if (known.has(incoming.outputId)) {
          // Da khai bao roi -> chi cap nhat state neu khac
          const output = device.outputs.find((o) => o.outputId === incoming.outputId);
          if (output.state !== incoming.state) {
            output.state = incoming.state;
            changed = true;
          }
        } else {
          // Dau ra moi, firmware tu khai bao lan dau (vi du luc boot)
          device.outputs.push({
            outputId: incoming.outputId,
            label: incoming.outputId,
            kind: guessOutputKind(incoming.outputId),
            state: incoming.state,
          });
          known.add(incoming.outputId);
          changed = true;
        }
      }

      if (changed) await device.save();
    }


    if (deviceData && Array.isArray(deviceData.sensors)) {
      const device = req.device;
      const knownSensors = new Set(device.sensors.map((sv) => sv.sensorId));
      let sensorsChanged = false;

      for (const incoming of deviceData.sensors) {
        if (typeof incoming?.sensorId !== 'string') continue;
        if (typeof incoming?.enabled !== 'boolean') continue;

        if (knownSensors.has(incoming.sensorId)) {
          const sensor = device.sensors.find((sv) => sv.sensorId === incoming.sensorId);
          if (sensor.enabled !== incoming.enabled) {
            sensor.enabled = incoming.enabled;
            sensorsChanged = true;
          }
          // Cap nhat nhan hien thi neu firmware co gui kem (vd lan dau khai bao)
          if (typeof incoming.label === 'string' && incoming.label && sensor.label !== incoming.label) {
            sensor.label = incoming.label;
            sensorsChanged = true;
          }
        } else {
          device.sensors.push({
            sensorId: incoming.sensorId,
            label: incoming.label || incoming.sensorId,
            kind: guessSensorKind(incoming.sensorId),
            enabled: incoming.enabled,
          });
          knownSensors.add(incoming.sensorId);
          sensorsChanged = true;
        }
      }

      if (sensorsChanged) await device.save();
    }

    if (type === 'device_telemetry' && deviceData && typeof deviceData.readings === 'object') {
      const device = req.device;
      device.lastTelemetry = deviceData.readings;
      device.lastTelemetryAt = new Date();
      await device.save();
    }

    await Conversation.findByIdAndUpdate(conversationId, { lastMessage: message._id });

    const populatedMessage = await message.populate('senderId', 'username displayName avatar type');

    await broadcastToConversation(conversationId, SOCKET_EVENTS.RECEIVE_MESSAGE, populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// DELETE /api/messages/:id - xoa tin nhan phia nguoi gui
export const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Khong tim thay tin nhan' });

    if (String(message.senderId) !== req.userId) {
      return res.status(403).json({ message: 'Ban chi duoc xoa tin nhan cua chinh minh' });
    }

    message.isDeleted = true;
    await message.save();

    await broadcastToConversation(message.conversationId, SOCKET_EVENTS.MESSAGE_DELETED, {
      messageId: message._id,
      conversationId: message.conversationId,
    });

    res.json({ message: 'Da xoa tin nhan' });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// PATCH /api/messages/:id/recall - thu hoi tin nhan (moi nguoi trong hoi thoai deu thay "tin nhan da thu hoi")
export const recallMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Khong tim thay tin nhan' });

    if (String(message.senderId) !== req.userId) {
      return res.status(403).json({ message: 'Ban chi duoc thu hoi tin nhan cua chinh minh' });
    }

    message.isRecalled = true;
    await message.save();

    await broadcastToConversation(message.conversationId, SOCKET_EVENTS.MESSAGE_RECALLED, {
      messageId: message._id,
      conversationId: message.conversationId,
    });

    res.json({ message: 'Da thu hoi tin nhan' });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// PATCH /api/messages/:id/seen - danh dau da xem
export const markAsSeen = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Khong tim thay tin nhan' });

    const alreadySeen = message.seenBy.some((s) => String(s.userId) === req.userId);
    if (!alreadySeen) {
      message.seenBy.push({ userId: req.userId, seenAt: new Date() });
      await message.save();

      await broadcastToConversation(message.conversationId, SOCKET_EVENTS.MESSAGE_SEEN, {
        messageId: message._id,
        conversationId: message.conversationId,
        userId: req.userId,
        seenAt: new Date(),
      });
    }

    res.json({ message: 'Da danh dau xem' });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};