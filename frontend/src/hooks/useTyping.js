import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';

export function useTyping(conversationId, senderName) {
  const { socket } = useSocket();
  const [typingText, setTypingText] = useState('');
  const typingTimeout = useRef(null);

  // Lang nghe su kien "nguoi khac dang nhap" tu server
  useEffect(() => {
    if (!socket) return;

    const onTyping = ({ conversationId: cId }) => {
      if (String(cId) !== String(conversationId)) return;
      setTypingText(`${senderName} đang nhập...`);
    };
    const onStopTyping = ({ conversationId: cId }) => {
      if (String(cId) !== String(conversationId)) return;
      setTypingText('');
    };

    socket.on('user_typing', onTyping);
    socket.on('user_stop_typing', onStopTyping);
    return () => {
      socket.off('user_typing', onTyping);
      socket.off('user_stop_typing', onStopTyping);
    };
  }, [socket, conversationId, senderName]);

  // Goi ham nay moi khi nguoi dung go chu vao input
  const emitTyping = () => {
    if (!socket) return;
    socket.emit('typing', { conversationId, recipientId: '' });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('stop_typing', { conversationId, recipientId: '' });
    }, 1500);
  };

  // Goi khi nguoi dung gui tin (de tat typing indicator ngay lap tuc)
  const stopTyping = () => {
    clearTimeout(typingTimeout.current);
    socket?.emit('stop_typing', { conversationId, recipientId: '' });
  };

  return { typingText, emitTyping, stopTyping };
}
