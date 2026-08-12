import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useConversations } from '../hooks/useConversations';
import { useMessages } from '../hooks/useMessages';
import { useTyping } from '../hooks/useTyping';
import { conversationApi, userApi } from '../api';
import Avatar from '../components/Avatar';
import MessageBubble from '../components/MessageBubble';
import TypingIndicator from '../components/TypingIndicator';
import { Icon } from '../utils/icons';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

// ─── Layout gốc ──────────────────────────────────────────────────────────────
export default function WebLayout() {
  const { me, logout } = useAuth();
  const { connected } = useSocket();
  const [activeConv, setActiveConv] = useState(null); // { _id, name, type }

  return (
    <View style={s.root}>
      {/* Sidebar trái */}
      <Sidebar
        me={me}
        connected={connected}
        logout={logout}
        activeConvId={activeConv?._id}
        onSelectConv={setActiveConv}
      />

      {/* Khung chat phải */}
      <View style={s.chatPanel}>
        {activeConv
          ? <ChatPanel conv={activeConv} me={me} />
          : <EmptyState />
        }
      </View>
    </View>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ me, connected, logout, activeConvId, onSelectConv }) {
  const {
    conversations, hasMore, loadingMore, refreshing,
    searchQuery, searchResults, searching, searchMode,
    onRefresh, loadMore, searchUsers, startConversation, toggleSearchMode,
  } = useConversations();

  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const handleStartChat = async (user) => {
    const conv = await startConversation(user);
    if (conv) {
      const other = conv.participants?.find((p) => p._id !== me._id);
      onSelectConv({ _id: conv._id, name: other?.username || 'Chat', type: conv.type });
    }
  };

  const getTitle = (conv) => {
    const other = conv.participants?.find((p) => p._id !== me._id);
    return conv.type === 'device' ? (conv.name || 'Thiết bị')
      : conv.type === 'group' ? conv.name
      : (other?.username || '...');
  };

  return (
    <View style={sb.sidebar}>
      {/* Header sidebar */}
      <View style={sb.header}>
        <View style={sb.headerTop}>
          <Text style={sb.appName}>MessageHub</Text>
          <View style={sb.headerActions}>
            <View style={[sb.statusDot, connected && sb.statusOn]} />
          </View>
        </View>
        <View style={sb.userRow}>
          <Avatar name={me?.username} size="sm" />
          <Text style={sb.username}>{me?.username}</Text>
          <TouchableOpacity onPress={() => {
            if (window.confirm('Bạn có muốn đăng xuất không?')) logout();
          }} style={sb.logoutBtn}>
            <Text style={sb.logoutText}>Thoát</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Thanh tìm kiếm */}
      <View style={sb.searchBox}>
        <View style={sb.searchInputWrap}>
          <Text style={sb.searchIcon}>🔍</Text>
          <TextInput
            style={sb.searchInput}
            placeholder="Tìm người để chat..."
            placeholderTextColor={C.dim}
            value={searchQuery}
            onChangeText={searchUsers}
            autoCapitalize="none"
          />
          {searching && <ActivityIndicator size="small" color={C.accent} />}
        </View>

        {/* Nút tạo nhóm */}
        <TouchableOpacity style={sb.newGroupBtn} onPress={() => setShowCreateGroup(true)}>
          <Text style={sb.newGroupText}>+ Nhóm</Text>
        </TouchableOpacity>
      </View>

      {/* Kết quả tìm kiếm */}
      {searchResults.length > 0 && (
        <View style={sb.searchResults}>
          {searchResults.map((u) => (
            <TouchableOpacity key={u._id} style={sb.searchItem} onPress={() => handleStartChat(u)}>
              <Avatar name={u.username} size="sm" />
              <View style={{ flex: 1 }}>
                <Text style={sb.searchName}>{u.username}</Text>
                <Text style={sb.searchEmail}>{u.email}</Text>
              </View>
              <Text style={sb.chatBtn}>Chat</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Tạo nhóm modal đơn giản */}
      {showCreateGroup && (
        <CreateGroupInline
          onClose={() => setShowCreateGroup(false)}
          onCreated={(conv) => {
            setShowCreateGroup(false);
            onSelectConv({ _id: conv._id, name: conv.name, type: 'group' });
          }}
        />
      )}

      {/* Danh sách hội thoại */}
      <FlatList
        data={conversations}
        keyExtractor={(item) => item._id}
        style={sb.convList}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={C.accent} style={{ padding: 10 }} /> : null
        }
        ListEmptyComponent={
          <View style={sb.emptyBox}>
            <Text style={sb.emptyIcon}>💬</Text>
            <Text style={sb.emptyText}>Chưa có cuộc trò chuyện</Text>
          </View>
        }
        renderItem={({ item }) => {
          const title = getTitle(item);
          const isActive = item._id === activeConvId;
          const lastContent = item.lastMessage?.isRecalled
            ? 'Tin nhắn đã thu hồi'
            : (item.lastMessage?.content || 'Chưa có tin nhắn');
          const time = item.lastMessage
            ? new Date(item.lastMessage.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            : '';

          return (
            <TouchableOpacity
              style={[sb.convItem, isActive && sb.convItemActive]}
              onPress={() => onSelectConv({ _id: item._id, name: title, type: item.type })}
            >
              <Avatar name={title} isDevice={item.type === 'device'} size="md" />
              <View style={sb.convBody}>
                <View style={sb.convTopRow}>
                  <Text style={[sb.convTitle, isActive && sb.convTitleActive]} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={sb.convTime}>{time}</Text>
                </View>
                <Text style={sb.convLast} numberOfLines={1}>{lastContent}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// ─── Tạo nhóm inline trong sidebar ───────────────────────────────────────────
function CreateGroupInline({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async (q) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    try {
      const { data } = await userApi.search(q);
      setResults(data);
    } catch (_) {}
  };

  const toggle = (u) => setSelected((prev) =>
    prev.find((m) => m._id === u._id) ? prev.filter((m) => m._id !== u._id) : [...prev, u]
  );

  const create = async () => {
    if (!name.trim()) { window.alert('Vui lòng nhập tên nhóm'); return; }
    if (selected.length === 0) { window.alert('Chọn ít nhất 1 thành viên'); return; }
    setLoading(true);
    try {
      const { data } = await conversationApi.createGroup(name.trim(), selected.map((m) => m._id));
      onCreated(data);
    } catch (err) {
      console.error('Create group error:', err.response?.data || err.message);
      window.alert('Lỗi: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={cg.wrap}>
      <View style={cg.header}>
        <Text style={cg.title}>Tạo nhóm mới</Text>
        <TouchableOpacity onPress={onClose}><Text style={cg.close}>✕</Text></TouchableOpacity>
      </View>
      <TextInput style={cg.nameInput} placeholder="Tên nhóm..." placeholderTextColor={C.dim}
        value={name} onChangeText={setName} />
      <TextInput style={cg.nameInput} placeholder="Tìm thành viên..." placeholderTextColor={C.dim}
        value={query} onChangeText={search} autoCapitalize="none" />
      {results.map((u) => (
        <TouchableOpacity key={u._id} style={cg.userRow} onPress={() => toggle(u)}>
          <Avatar name={u.username} size="sm" />
          <Text style={cg.uname}>{u.username}</Text>
          <Text style={cg.check}>{selected.find((m) => m._id === u._id) ? '✓' : '○'}</Text>
        </TouchableOpacity>
      ))}
      {selected.length > 0 && (
        <Text style={cg.selectedInfo}>Đã chọn: {selected.map((m) => m.username).join(', ')}</Text>
      )}
      <TouchableOpacity style={[cg.createBtn, (!name.trim() || !selected.length) && cg.disabled]}
        onPress={create} disabled={!name.trim() || !selected.length || loading}>
        {loading ? <ActivityIndicator color={C.white} /> : <Text style={cg.createText}>Tạo nhóm</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Khung chat phải ─────────────────────────────────────────────────────────
function ChatPanel({ conv, me }) {
  const [inputValue, setInputValue] = useState('');
  const {
    messages, hasMore, loadingOlder, flatListRef,
    loadMessages, loadOlder, sendMessage, recallMessage, deleteMessage,
  } = useMessages(conv._id);
  const { typingText, emitTyping, stopTyping } = useTyping(conv._id, conv.name);

  useEffect(() => {
    loadMessages(true);
    setInputValue('');
  }, [conv._id]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue('');
    stopTyping();
  };

  const handleKeyDown = (e) => {
    // Enter gửi, Shift+Enter xuống dòng
    if (e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) {
      e.preventDefault?.();
      handleSend();
    }
  };

  const onLongPress = (msg) => {
    const isMine = String(msg.senderId?._id || msg.senderId) === me._id;
    if (!isMine || msg.isRecalled) return;
    const choice = window.confirm('OK = Thu hồi (mọi người không thấy)\nCancel = Xoá phía mình');
    if (choice) {
      recallMessage(msg._id);
    } else {
      if (window.confirm('Xoá tin nhắn phía mình?')) deleteMessage(msg._id);
    }
  };

  return (
    <View style={cp.container}>
      {/* Header chat */}
      <View style={cp.header}>
        <Avatar name={conv.name} isDevice={conv.type === 'device'} size="sm" />
        <View style={cp.headerInfo}>
          <Text style={cp.headerName}>{conv.name}</Text>
          <Text style={cp.headerType}>
            {conv.type === 'device' ? '⚡ Thiết bị' : conv.type === 'group' ? '👥 Nhóm' : '● Đang hoạt động'}
          </Text>
        </View>
      </View>

      {/* Nút tải tin cũ */}
      {hasMore && (
        <TouchableOpacity style={cp.loadOlder} onPress={loadOlder} disabled={loadingOlder}>
          {loadingOlder
            ? <ActivityIndicator size="small" color={C.accent} />
            : <Text style={cp.loadOlderText}>↑ Tin nhắn cũ hơn</Text>
          }
        </TouchableOpacity>
      )}

      {/* Danh sách tin nhắn */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={cp.msgList}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const prevMsg = messages[index - 1];
          const isMine = String(item.senderId?._id || item.senderId) === me._id;
          const isSameSender = prevMsg &&
            (prevMsg.senderId?._id || prevMsg.senderId) === (item.senderId?._id || item.senderId);
          return (
            <MessageBubble
              message={item} isMine={isMine}
              isSameSender={isSameSender} onLongPress={onLongPress}
            />
          );
        }}
      />

      <TypingIndicator text={typingText} />

      {/* Input */}
      <View style={cp.inputArea}>
        <View style={cp.inputWrap}>
          <TextInput
            style={cp.input}
            placeholder="Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng)"
            placeholderTextColor={C.dim}
            value={inputValue}
            onChangeText={(t) => { setInputValue(t); emitTyping(); }}
            onKeyPress={handleKeyDown}
            multiline
            scrollEnabled
          />
        </View>
        <TouchableOpacity
          style={[cp.sendBtn, !inputValue.trim() && cp.sendBtnOff]}
          onPress={handleSend}
          disabled={!inputValue.trim()}
        >
          <Text style={{ fontSize: 18, color: inputValue.trim() ? C.white : C.dim }}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={es.container}>
      <Text style={es.icon}>💬</Text>
      <Text style={es.title}>Chào mừng đến MessageHub</Text>
      <Text style={es.sub}>Chọn một cuộc trò chuyện hoặc tìm người mới để bắt đầu</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  chatPanel: { flex: 1, borderLeftWidth: 1, borderLeftColor: C.border },
});

const sb = StyleSheet.create({
  sidebar: { width: 300, backgroundColor: C.panel, borderRightWidth: 1, borderRightColor: C.border },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  appName: { fontSize: FONT.lg, fontWeight: '800', color: C.accent },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
  statusOn: { backgroundColor: C.ok },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  username: { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: C.text },
  logoutBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border },
  logoutText: { fontSize: FONT.xs, color: C.dim },

  searchBox: { flexDirection: 'row', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.panel2, borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.border,
  },
  searchIcon: { fontSize: 12, marginRight: 6 },
  searchInput: { flex: 1, fontSize: FONT.sm, color: C.text },
  newGroupBtn: {
    backgroundColor: C.accentDim, borderRadius: RADIUS.sm,
    paddingHorizontal: 10, justifyContent: 'center',
    borderWidth: 1, borderColor: C.accent,
  },
  newGroupText: { fontSize: FONT.xs, color: C.accentText, fontWeight: '600' },

  searchResults: { borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 10, paddingBottom: 6 },
  searchItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  searchName: { fontSize: FONT.sm, fontWeight: '600', color: C.text },
  searchEmail: { fontSize: FONT.xs, color: C.dim },
  chatBtn: { fontSize: FONT.xs, color: C.accent, fontWeight: '600' },

  convList: { flex: 1 },
  convItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.borderLight,
    cursor: 'pointer',
  },
  convItemActive: { backgroundColor: C.accentDim },
  convBody: { flex: 1, overflow: 'hidden' },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  convTitle: { fontSize: FONT.sm, fontWeight: '600', color: C.text, flex: 1 },
  convTitleActive: { color: C.accentText },
  convTime: { fontSize: FONT.xs, color: C.dim },
  convLast: { fontSize: FONT.xs, color: C.dim },
  emptyBox: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: FONT.sm, color: C.dim, textAlign: 'center' },
});

const cg = StyleSheet.create({
  wrap: {
    margin: 8, backgroundColor: C.panel2, borderRadius: RADIUS.md,
    padding: 12, borderWidth: 1, borderColor: C.border, ...SHADOW.sm,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: FONT.sm, fontWeight: '700', color: C.text },
  close: { fontSize: FONT.sm, color: C.dim, padding: 4 },
  nameInput: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: FONT.sm, color: C.text, marginBottom: 8,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  uname: { flex: 1, fontSize: FONT.sm, color: C.text },
  check: { fontSize: FONT.sm, color: C.accent, fontWeight: '700' },
  selectedInfo: { fontSize: FONT.xs, color: C.accentText, marginVertical: 6 },
  createBtn: {
    backgroundColor: C.accent, borderRadius: RADIUS.sm,
    paddingVertical: 9, alignItems: 'center', marginTop: 4,
  },
  disabled: { backgroundColor: C.panel2 },
  createText: { color: C.white, fontWeight: '700', fontSize: FONT.sm },
});

const cp = StyleSheet.create({
  container: { flex: 1, flexDirection: 'column', backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border, ...SHADOW.sm,
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: FONT.base, fontWeight: '700', color: C.text },
  headerType: { fontSize: FONT.xs, color: C.dim, marginTop: 2 },

  loadOlder: { alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  loadOlderText: { fontSize: FONT.sm, color: C.accent },

  msgList: { paddingHorizontal: 20, paddingVertical: 12 },

  inputArea: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 14, backgroundColor: C.panel, borderTopWidth: 1, borderTopColor: C.border,
  },
  inputWrap: {
    flex: 1, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120,
  },
  input: { fontSize: FONT.base, color: C.text, minHeight: 22, maxHeight: 100, outlineWidth: 0 },
  sendBtn: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center', ...SHADOW.sm,
  },
  sendBtnOff: { backgroundColor: C.panel2 },
});

const es = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  icon: { fontSize: 56 },
  title: { fontSize: FONT.xl, fontWeight: '700', color: C.text },
  sub: { fontSize: FONT.base, color: C.dim, textAlign: 'center', maxWidth: 320 },
});