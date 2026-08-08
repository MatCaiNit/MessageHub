import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { conversationApi, userApi } from '../api';
import { useSocket } from '../context/SocketContext';

export function useConversations() {
  const { socket } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);

  const loadConversations = useCallback(async (reset = false) => {
    try {
      const p = reset ? 1 : page;
      const { data } = await conversationApi.list(p, 20);
      if (reset) {
        setConversations(data.conversations);
        setPage(1);
      } else {
        setConversations((prev) => [...prev, ...data.conversations]);
      }
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('useConversations load:', err);
    }
  }, [page]);

  // Load lai khi man hinh duoc focus
  useFocusEffect(useCallback(() => { loadConversations(true); }, []));

  // Cap nhat khi co tin nhan moi tu socket
  useEffect(() => {
    if (!socket) return;
    const handler = () => loadConversations(true);
    socket.on('receive_message', handler);
    return () => socket.off('receive_message', handler);
  }, [socket]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations(true);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const { data } = await conversationApi.list(next, 20);
      setConversations((prev) => [...prev, ...data.conversations]);
      setPage(next);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('useConversations loadMore:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Tim kiem user theo username
  const searchUsers = async (q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await userApi.search(q.trim());
      setSearchResults(data);
    } catch (_) {}
    setSearching(false);
  };

  // Tao conversation moi voi 1 user, tra ve conversation da tao
  const startConversation = async (user) => {
    try {
      const { data } = await conversationApi.create(user._id);
      setSearchQuery('');
      setSearchResults([]);
      setSearchMode(false);
      return data;
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message || err.message);
      return null;
    }
  };

  const toggleSearchMode = () => {
    setSearchMode((v) => !v);
    setSearchQuery('');
    setSearchResults([]);
  };

  return {
    conversations,
    hasMore,
    loadingMore,
    refreshing,
    searchQuery,
    searchResults,
    searching,
    searchMode,
    onRefresh,
    loadMore,
    searchUsers,
    startConversation,
    toggleSearchMode,
  };
}
