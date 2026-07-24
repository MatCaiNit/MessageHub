import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { broadcastToConversation } from '../sockets/socketHandler.js';
import { SOCKET_EVENTS } from '../sockets/socketEvents.js';

const MAX_GROUP_MEMBERS = 100; // gioi han thanh vien de tranh spam/nhom qua tai

// GET /api/conversations?page=1&limit=20

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

// POST /api/conversations/group - tao hoi thoai nhom moi voi 1 danh sach thanh vien
export const createGroup = async (req, res) => {
  try {
    const { name, participantIds, isPublic } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Thieu ten nhom' });
    }
    if (!Array.isArray(participantIds) || participantIds.length < 1) {
      return res.status(400).json({ message: 'Nhom can it nhat 1 thanh vien khac ngoai ban' });
    }

    // Loai bo trung lap va dam bao nguoi tao luon co trong nhom
    const uniqueIds = [...new Set([req.userId, ...participantIds.map(String)])];

    if (uniqueIds.length > MAX_GROUP_MEMBERS) {
      return res.status(400).json({ message: `Nhom toi da ${MAX_GROUP_MEMBERS} thanh vien` });
    }

    const validUsers = await User.find({ _id: { $in: uniqueIds } });
    if (validUsers.length !== uniqueIds.length) {
      return res.status(404).json({ message: 'Mot hoac nhieu thanh vien khong ton tai' });
    }

    let conversation = await Conversation.create({
      participants: uniqueIds,
      type: 'group',
      name: name.trim(),
      adminId: req.userId,
      isPublic: isPublic === false ? false : true, // mac dinh cong khai (ai co ID cung join duoc)
    });

    conversation = await conversation.populate('participants', 'username avatar isOnline type');
    res.status(201).json(conversation);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// POST /api/conversations/:id/join - tham gia 1 nhom da ton tai bang ID hoi thoai (kieu "ma moi")
export const joinGroup = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ message: 'Khong tim thay nhom voi ID nay' });
    }
    if (conversation.type !== 'group') {
      return res.status(400).json({ message: 'Hoi thoai nay khong phai la nhom' });
    }
    if (conversation.participants.map(String).includes(req.userId)) {
      return res.status(400).json({ message: 'Ban da la thanh vien cua nhom nay roi' });
    }
    if (!conversation.isPublic) {
      return res.status(403).json({ message: 'Nhom nay o che do rieng tu, chi admin moi them duoc thanh vien' });
    }
    if (conversation.participants.length >= MAX_GROUP_MEMBERS) {
      return res.status(400).json({ message: `Nhom da dat toi da ${MAX_GROUP_MEMBERS} thanh vien` });
    }

    conversation.participants.push(req.userId);
    await conversation.save();

    const populated = await conversation.populate('participants', 'username avatar isOnline type');

    await broadcastToConversation(id, SOCKET_EVENTS.GROUP_MEMBER_JOINED, {
      conversationId: id,
      userId: req.userId,
      conversation: populated,
    });

    res.status(200).json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// POST /api/conversations/:id/members - admin them truc tiep 1 thanh vien (dung cho nhom rieng tu isPublic=false)
export const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const conversation = await Conversation.findById(id);
    if (!conversation) return res.status(404).json({ message: 'Khong tim thay nhom' });
    if (conversation.type !== 'group') return res.status(400).json({ message: 'Hoi thoai nay khong phai la nhom' });
    if (String(conversation.adminId) !== req.userId) {
      return res.status(403).json({ message: 'Chi admin moi duoc them thanh vien' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Khong tim thay user' });

    if (conversation.participants.map(String).includes(userId)) {
      return res.status(400).json({ message: 'Nguoi nay da o trong nhom' });
    }
    if (conversation.participants.length >= MAX_GROUP_MEMBERS) {
      return res.status(400).json({ message: `Nhom da dat toi da ${MAX_GROUP_MEMBERS} thanh vien` });
    }

    conversation.participants.push(userId);
    await conversation.save();

    const populated = await conversation.populate('participants', 'username avatar isOnline type');

    await broadcastToConversation(id, SOCKET_EVENTS.GROUP_MEMBER_JOINED, {
      conversationId: id,
      userId,
      conversation: populated,
    });

    res.status(200).json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// POST /api/conversations/:id/leave - roi nhom. Neu admin roi, chuyen quyen cho thanh vien ke tiep (neu con ai)
export const leaveGroup = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findById(id);
    if (!conversation) return res.status(404).json({ message: 'Khong tim thay nhom' });
    if (conversation.type !== 'group') return res.status(400).json({ message: 'Hoi thoai nay khong phai la nhom' });
    if (!conversation.participants.map(String).includes(req.userId)) {
      return res.status(400).json({ message: 'Ban khong o trong nhom nay' });
    }

    conversation.participants = conversation.participants.filter((p) => String(p) !== req.userId);

    let disbanded = false;
    if (conversation.participants.length === 0) {
      // Nhom khong con ai - xoa luon
      await conversation.deleteOne();
      disbanded = true;
    } else {
      if (String(conversation.adminId) === req.userId) {
        conversation.adminId = conversation.participants[0]; // chuyen quyen admin cho nguoi ke tiep
      }
      await conversation.save();
    }

    if (!disbanded) {
      await broadcastToConversation(id, SOCKET_EVENTS.GROUP_MEMBER_LEFT, {
        conversationId: id,
        userId: req.userId,
        newAdminId: conversation.adminId,
      });
    }

    res.json({ message: disbanded ? 'Da roi nhom, nhom bi giai tan vi khong con thanh vien' : 'Da roi nhom' });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// DELETE /api/conversations/:id/members/:userId - admin kick 1 thanh vien ra khoi nhom
export const kickMember = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const conversation = await Conversation.findById(id);
    if (!conversation) return res.status(404).json({ message: 'Khong tim thay nhom' });
    if (conversation.type !== 'group') return res.status(400).json({ message: 'Hoi thoai nay khong phai la nhom' });
    if (String(conversation.adminId) !== req.userId) {
      return res.status(403).json({ message: 'Chi admin moi duoc xoa thanh vien' });
    }
    if (userId === req.userId) {
      return res.status(400).json({ message: 'Dung API roi nhom (/leave) thay vi tu kick chinh minh' });
    }
    if (!conversation.participants.map(String).includes(userId)) {
      return res.status(400).json({ message: 'Nguoi nay khong o trong nhom' });
    }

    conversation.participants = conversation.participants.filter((p) => String(p) !== userId);
    await conversation.save();

    await broadcastToConversation(id, SOCKET_EVENTS.GROUP_MEMBER_KICKED, {
      conversationId: id,
      userId,
      kickedBy: req.userId,
    });

    res.json({ message: 'Da xoa thanh vien khoi nhom' });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// PATCH /api/conversations/:id - admin doi ten/avatar/che do cong khai cua nhom
export const updateGroupInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, avatar, isPublic } = req.body;

    const conversation = await Conversation.findById(id);
    if (!conversation) return res.status(404).json({ message: 'Khong tim thay nhom' });
    if (conversation.type !== 'group') return res.status(400).json({ message: 'Hoi thoai nay khong phai la nhom' });
    if (String(conversation.adminId) !== req.userId) {
      return res.status(403).json({ message: 'Chi admin moi duoc sua thong tin nhom' });
    }

    if (typeof name === 'string' && name.trim()) conversation.name = name.trim();
    if (typeof avatar === 'string') conversation.avatar = avatar;
    if (typeof isPublic === 'boolean') conversation.isPublic = isPublic;

    await conversation.save();
    const populated = await conversation.populate('participants', 'username avatar isOnline type');

    await broadcastToConversation(id, SOCKET_EVENTS.GROUP_UPDATED, { conversation: populated });

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// GET /api/conversations/:id/members - xem danh sach thanh vien + ai la admin
export const getGroupMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await Conversation.findById(id).populate('participants', 'username avatar isOnline type');
    if (!conversation) return res.status(404).json({ message: 'Khong tim thay nhom' });
    if (!conversation.participants.map((p) => String(p._id)).includes(req.userId)) {
      return res.status(403).json({ message: 'Ban khong o trong nhom nay' });
    }

    res.json({
      members: conversation.participants,
      adminId: conversation.adminId,
      isPublic: conversation.isPublic,
    });
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