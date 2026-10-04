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

    // THAY DOI MOI: dong bo trang thai outputs tu payload cua ESP32 vao
    // Device.outputs, de app doc duoc trang thai THAT (khong chi doan qua
    // optimistic update). Thieu buoc nay thi nut toggle tren app se lech
    // ngay khi cam bien/nut vat ly tu bat den ma khong qua app.
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

    // ================== MOI: LUU LAN DOC CAM BIEN GAN NHAT ==================
    // ESP32 gui type "device_telemetry" voi deviceData.readings = { temperature,
    // humidity, soundLevel, distanceCm, ... } (xem sendTelemetry() trong firmware).
    // Luu de Dashboard tren app doc "chi so hien tai" ma khong can quet lai
    // toan bo lich su tin nhan moi lan mo man hinh.
    if (type === 'device_telemetry' && deviceData && typeof deviceData.readings === 'object') {
      const device = req.device;
      device.lastTelemetry = deviceData.readings;
      device.lastTelemetryAt = new Date();
      await device.save();
    }
    // ==========================================================================

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