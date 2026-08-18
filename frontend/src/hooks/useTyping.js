// frontend/src/hooks/useTyping.js
import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { conversationApi } from '../api';

// Fix chinh:
// - Truoc day emit `{ recipientId: '' }` -> server lam `io.to('').emit(...)` -> khong ai nhan
// - Bay gio fetch list participants cua conversation 1 lan khi mount,
//   roi voi moi lan typing, emit rieng cho tung nguoi (tru chinh minh)
// - Server BE chi lam `io.to(recipientId).emit(...)` nen phai emit N lan cho N nguoi
export function useTyping(conversationId, senderName) {
  const { socket } = useSocket();
  const { me } = useAuth();

  const [typingText, setTypingText] = useState('');
  const [recipientIds, setRecipientIds] = useState([]);
  const typingTimeout = useRef(null);
  const isTypingActive = useRef(false);

  // Fetch danh sach thanh vien de biet phai emit typing cho ai
  // (endpoint /:id/members hoat dong cho ca direct, group, device conversation)
  useEffect(() => {
    if (!conversationId || !me?._id) return;
    let cancelled = false;

    conversationApi
      .getGroupMembers(conversationId)
      .then(({ data }) => {
        if (cancelled) return;
        const ids = (data.members || [])
          .map((u) => String(u._id))
          .filter((id) => id !== String(me._id));
        setRecipientIds(ids);
      })
      .catch(() => {
        // Neu 403 (khong thuoc conversation) hoac loi mang -> bo qua
        // Typing khong hoat dong nhung cac chuc nang khac van chay
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, me?._id]);

  // Lang nghe su kien "nguoi khac dang nhap" tu server
  useEffect(() => {
    if (!socket) return;

    const onTyping = ({ conversationId: cId, userId }) => {
      if (String(cId) !== String(conversationId)) return;
      if (String(userId) === String(me?._id)) return; // bo qua chinh minh
      setTypingText(`${senderName} đang nhập...`);
    };
    const onStopTyping = ({ conversationId: cId, userId }) => {
      if (String(cId) !== String(conversationId)) return;
      if (String(userId) === String(me?._id)) return;
      setTypingText('');
    };

    socket.on('user_typing', onTyping);
    socket.on('user_stop_typing', onStopTyping);
    return () => {
      socket.off('user_typing', onTyping);
      socket.off('user_stop_typing', onStopTyping);
    };
  }, [socket, conversationId, senderName, me?._id]);

  // Emit typing cho tung recipient (BE chi to() 1 room / lan)
  const emitToAll = (eventName) => {
    if (!socket || recipientIds.length === 0) return;
    recipientIds.forEach((rid) => {
      socket.emit(eventName, { conversationId, recipientId: rid });
    });
  };

  // Goi ham nay moi khi nguoi dung go chu vao input
  const emitTyping = () => {
    if (!socket) return;

    // De tranh spam socket khi go lien tuc: chi emit `typing` 1 lan cho toi khi stopped
    if (!isTypingActive.current) {
      emitToAll('typing');
      isTypingActive.current = true;
    }

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      emitToAll('stop_typing');
      isTypingActive.current = false;
    }, 1500);
  };

  // Goi khi nguoi dung gui tin (de tat typing indicator ngay lap tuc)
  const stopTyping = () => {
    clearTimeout(typingTimeout.current);
    if (isTypingActive.current) {
      emitToAll('stop_typing');
      isTypingActive.current = false;
    }
  };

  return { typingText, emitTyping, stopTyping };
}