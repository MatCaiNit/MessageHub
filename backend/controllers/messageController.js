import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { broadcastToConversation } from '../sockets/socketHandler.js';
import { SOCKET_EVENTS } from '../sockets/socketEvents.js';

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

    await Conversation.findByIdAndUpdate(conversationId, { lastMessage: message._id });

    const populatedMessage = await message.populate('senderId', 'username avatar type');

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
