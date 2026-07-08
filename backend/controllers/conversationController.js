import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import User from '../models/userModel.js';


export const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.userId })
      .populate('participants', 'username avatar isOnline type')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

export const createConversation = async (req, res) => {
    try {
        const { participantId } = req.body;

        if(!participantId) {
            return res.status(400).json({ message: 'Thieu participantId' });
        }
        
        const otherUser = await User.findById(participantId);
        if(!otherUser) {
            return res.status(404).json({ message: 'Khong tim thay user' });
        }

        let conversation = await Conversation.findOne({
            type: 'direct',
            participants: { $all: [req.userId, participantId], $size: 2 }
        });

        if(!conversation) {
            conversation = await Conversation.create({
                participants: [req.userId, participantId],
                type: 'direct'
            });
        }

        conversation = await conversation.populate('participants', 'username avatar isOnline type');
        res.status(201).json(conversation);
    } catch (err) {
        res.status(500).json({ message: 'Loi server', error: err.message });
    }
};

export const getMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;

        const conversation = await Conversation.findById(id);
        if(!conversation) {
            return res.status(404).json({ message: 'Khong tim thay conversation' });
        }
        if(!conversation.participants.map(String).includes(req.userId)) {
            return res.status(403).json({ message: 'Khong co quyen truy cap conversation nay' });
        }

        const messages = await Message.find({ conversation: id })
            .populate('senderId', 'username avatar type')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json(messages.reverse());
    } catch (err) {
        res.status(500).json({ message: 'Loi server', error: err.message });
    }
};