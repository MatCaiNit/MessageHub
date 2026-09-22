import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';

// GET /api/sync?since=<ISO timestamp>
export const syncData = async (req, res) => {
  try {
    const { since } = req.query;

    if (!since) {
      return res.status(400).json({ message: 'Thieu tham so since' });
    }

    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return res.status(400).json({ message: 'since khong dung dinh dang ISO timestamp' });
    }

    // Tim tat ca hoi thoai ma user tham gia
    const conversations = await Conversation.find({ participants: req.userId }).select('_id');
    const conversationIds = conversations.map((c) => c._id);

    // Lay tat ca tin nhan moi hon "since" trong cac hoi thoai do
    const newMessages = await Message.find({
      conversationId: { $in: conversationIds },
      createdAt: { $gt: sinceDate },
    })
      .populate('senderId', 'username displayName avatar type')
      .sort({ createdAt: 1 });

    // Lay cac hoi thoai co cap nhat (tin nhan moi, thanh vien moi...) moi hon "since"
    const updatedConversations = await Conversation.find({
      participants: req.userId,
      updatedAt: { $gt: sinceDate },
    })
      .populate('participants', 'username displayName avatar isOnline type')
      .populate('lastMessage');

    res.json({
      newMessages,
      updatedConversations,
      syncedAt: new Date().toISOString(), // client luu lai moc nay cho lan sync tiep theo
    });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};