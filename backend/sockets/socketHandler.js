import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { SOCKET_EVENTS } from './socketEvents.js';
import { sendPushToUser } from '../services/pushService.js';

// Luu map userId -> socketId de biet ai dang online
export const onlineUsers = new Map();

// Bien io duoc gan lai sau khi initSocket chay, de cac module khac (vi du messageController)
// co the goi broadcastToConversation() ma khong can truyen io qua nhieu lop tham so
let ioInstance = null;

// Ham dung chung: gui 1 event toi TAT CA participants cua 1 conversation
// Dung cho ca tin nhan tu nguoi dung (qua socket) LAN tin nhan tu thiet bi (qua REST + apiKey)
export const broadcastToConversation = async (conversationId, event, payload) => {
  if (!ioInstance) return;

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return;

  conversation.participants.forEach((participantId) => {
    ioInstance.to(String(participantId)).emit(event, payload);
  });

  // Neu day la 1 tin nhan moi, gui push notification cho nhung ai dang OFFLINE
  // (khong co trong onlineUsers) va khong phai nguoi gui
  if (event === SOCKET_EVENTS.RECEIVE_MESSAGE) {
    notifyOfflineParticipants(conversation, payload);
  }
};

const notifyOfflineParticipants = async (conversation, message) => {
  const senderId = String(message.senderId?._id || message.senderId);
  const offlineIds = conversation.participants
    .map(String)
    .filter((pid) => pid !== senderId && !onlineUsers.has(pid));

  if (offlineIds.length === 0) return;

  const offlineUsers = await User.find({ _id: { $in: offlineIds } });
  const senderName = message.senderId?.username || 'Ai do';
  const preview = (message.content || '').slice(0, 80);

  await Promise.all(
    offlineUsers.map((u) =>
      sendPushToUser(u, {
        title: conversation.type === 'group' ? conversation.name || 'Nhom chat' : senderName,
        body: conversation.type === 'group' ? `${senderName}: ${preview}` : preview,
        data: { conversationId: String(conversation._id) },
      })
    )
  );
};

export const initSocket = (io) => {
  ioInstance = io;

  // Middleware xac thuc: client (human) phai gui accessToken khi ket noi
  // Luu y: thiet bi (ESP32) KHONG ket noi Socket.IO, chi goi REST API bang apiKey (xem deviceAuth.js)
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Khong co token'));

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Token khong hop le'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`User ${userId} da ket noi (socket: ${socket.id})`);

    onlineUsers.set(userId, socket.id);
    socket.join(userId); // moi user co 1 "room" rieng trung voi userId cua ho

    await User.findByIdAndUpdate(userId, { isOnline: true });
    socket.broadcast.emit(SOCKET_EVENTS.USER_ONLINE, { userId });

    // --- Su kien: gui tin nhan (tu nguoi dung, qua socket) ---
    socket.on(SOCKET_EVENTS.SEND_MESSAGE, async (data) => {
      try {
        const { conversationId, content, replyTo } = data;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, { message: 'Khong tim thay hoi thoai' });
        }
        if (!conversation.participants.map(String).includes(userId)) {
          return socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, { message: 'Ban khong thuoc hoi thoai nay' });
        }

        const message = await Message.create({
          conversationId,
          senderId: userId,
          content,
          type: 'text',
          replyTo: replyTo || null,
        });

        conversation.lastMessage = message._id;
        await conversation.save();

        const populatedMessage = await message.populate('senderId', 'username avatar type');

        conversation.participants.forEach((participantId) => {
          io.to(String(participantId)).emit(SOCKET_EVENTS.RECEIVE_MESSAGE, populatedMessage);
        });
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, { message: 'Gui tin nhan that bai', error: err.message });
      }
    });

    // --- Su kien: dang go (typing indicator) ---
    socket.on(SOCKET_EVENTS.TYPING, ({ conversationId, recipientId }) => {
      io.to(recipientId).emit(SOCKET_EVENTS.USER_TYPING, { conversationId, userId });
    });

    socket.on(SOCKET_EVENTS.STOP_TYPING, ({ conversationId, recipientId }) => {
      io.to(recipientId).emit(SOCKET_EVENTS.USER_STOP_TYPING, { conversationId, userId });
    });

    // --- Su kien: ngat ket noi ---
    socket.on('disconnect', async () => {
      console.log(`User ${userId} da ngat ket noi`);
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      socket.broadcast.emit(SOCKET_EVENTS.USER_OFFLINE, { userId });
    });
  });
};