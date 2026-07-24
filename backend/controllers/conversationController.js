import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

// GET /api/conversations?page=1&limit=20 - lay danh sach hoi thoai cua user hien tai (phan trang)
// Sap xep theo updatedAt giam dan nen hoi thoai co tin nhan moi nhat luon o dau - dung cho lazy load
export const getConversations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const conversations = await Conversation.find({ participants: req.userId })
      .populate('participants', 'username avatar isOnline type')
      .populate('lastMessage')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalCount = await Conversation.countDocuments({ participants: req.userId });

    res.json({
      conversations,
      page,
      hasMore: page * limit < totalCount, // client dung field nay de biet co con du lieu de "dong bo" tiep khong
    });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// POST /api/conversations - tao hoi thoai moi (hoac tra ve hoi thoai da co) voi 1 user khac
export const createConversation = async (req, res) => {
  try {
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ message: 'Thieu participantId' });
    }

    const otherUser = await User.findById(participantId);
    if (!otherUser) {
      return res.status(404).json({ message: 'Khong tim thay user' });
    }

    // Kiem tra da co conversation direct giua 2 nguoi nay chua
    let conversation = await Conversation.findOne({
      type: 'direct',
      participants: { $all: [req.userId, participantId], $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.userId, participantId],
        type: 'direct',
      });
    }

    conversation = await conversation.populate('participants', 'username avatar isOnline type');
    res.status(201).json(conversation);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// GET /api/conversations/:id/messages?page=1&limit=30 - lay lich su tin nhan (phan trang, moi nhat truoc)
export const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ message: 'Khong tim thay hoi thoai' });
    }
    if (!conversation.participants.map(String).includes(req.userId)) {
      return res.status(403).json({ message: 'Ban khong co quyen xem hoi thoai nay' });
    }

    const messages = await Message.find({ conversationId: id })
      .populate('senderId', 'username avatar type')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalCount = await Message.countDocuments({ conversationId: id });

    res.json({
      messages: messages.reverse(), // tra ve theo thu tu tang dan thoi gian de hien thi
      page,
      hasMore: page * limit < totalCount, // con tin nhan cu hon de "tai them" khong
    });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};
