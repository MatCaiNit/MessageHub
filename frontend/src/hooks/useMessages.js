import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { conversationApi, messageApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export function useMessages(conversationId) {
  const { me } = useAuth();
  const { socket } = useSocket();

  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const flatListRef = useRef(null);

  // Load tin nhan (reset = true khi mo man hinh, false khi tai them)
  const loadMessages = useCallback(async (reset = false) => {
    try {
      const p = reset ? 1 : page;
      const { data } = await conversationApi.getMessages(conversationId, p, 30);
      if (reset) {
        setMessages(data.messages);
        setPage(1);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150);
      } else {
        setMessages((prev) => [...data.messages, ...prev]);
      }
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('useMessages loadMessages:', err);
    }
  }, [conversationId, page]);

  // Tai tin nhan cu hon
  const loadOlder = async () => {
    if (!hasMore || loadingOlder) return;
    setLoadingOlder(true);
    const next = page + 1;
    try {
      const { data } = await conversationApi.getMessages(conversationId, next, 30);
      setMessages((prev) => [...data.messages, ...prev]);
      setPage(next);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('useMessages loadOlder:', err);
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendMessage = useCallback((payload) => {
    if (!socket) return;
    const opts = typeof payload === 'string' ? { content: payload } : (payload || {});
    const content = (opts.content || '').trim();
    const hasAttachments = Array.isArray(opts.attachments) && opts.attachments.length > 0;
    if (!content && !hasAttachments) return;
    socket.emit('send_message', {
      conversationId,
      content,
      replyTo: opts.replyTo || null,
      mentions: opts.mentions || [],
      attachments: opts.attachments || [],
      type: opts.type,
    });
  }, [socket, conversationId]);

  // Thu hoi tin nhan
  const recallMessage = async (messageId) => {
    try {
      await messageApi.recall(messageId);
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message || err.message);
    }
  };

  // Xoa tin nhan (phia minh)
  const deleteMessage = async (messageId) => {
    try {
      await messageApi.delete(messageId);
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message || err.message);
    }
  };

  // Lang nghe socket event: nhan tin, thu hoi, xoa
  useEffect(() => {
    if (!socket) return;

    const onReceive = (msg) => {
      if (String(msg.conversationId) !== String(conversationId)) return;
      setMessages((prev) => prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]);
      flatListRef.current?.scrollToEnd({ animated: true });
    };
    const onRecalled = ({ messageId }) =>
      setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, isRecalled: true } : m));
    const onDeleted = ({ messageId }) =>
      setMessages((prev) => prev.filter((m) => m._id !== messageId));

    socket.on('receive_message', onReceive);
    socket.on('message_recalled', onRecalled);
    socket.on('message_deleted', onDeleted);
    return () => {
      socket.off('receive_message', onReceive);
      socket.off('message_recalled', onRecalled);
      socket.off('message_deleted', onDeleted);
    };
  }, [socket, conversationId]);

  return {
    messages,
    hasMore,
    loadingOlder,
    flatListRef,
    loadMessages,
    loadOlder,
    sendMessage,
    recallMessage,
    deleteMessage,
    me,
  };
}