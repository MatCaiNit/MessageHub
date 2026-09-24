import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, ScrollView, Image, Linking,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useConversations } from '../hooks/useConversations';
import { useMessages } from '../hooks/useMessages';
import { useTyping } from '../hooks/useTyping';
import { conversationApi, userApi, deviceApi, authApi, messageApi, resolveFileUrl } from '../api';
import client from '../api/client';
import Avatar from '../components/Avatar';
import MessageBubble from '../components/MessageBubble';
import TypingIndicator from '../components/TypingIndicator';
import { Icon } from '../utils/icons';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

// ─── Layout gốc ──────────────────────────────────────────────────────────────
export default function WebLayout() {
  const { me, logout } = useAuth();
  const { connected, socket } = useSocket();

  const [tab, setTab] = useState('chat');
  const [activeConv, setActiveConv] = useState(null);
  const [unreadMap, setUnreadMap] = useState({}); // { convId: count }

  // Ref cho activeConv để dùng trong socket handler (tránh closure cũ)
  const activeConvRef = useRef(activeConv);
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  // ─ THÔNG BÁO: xin permission 1 lần khi vào app ─
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window
        && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // ─ Lắng nghe socket ở root: hiện notification + tăng badge unread ─
  useEffect(() => {
    if (!socket || !me?._id) return;

    const onNewMessage = (msg) => {
      // Bỏ tin của chính mình
      const senderId = String(msg.senderId?._id || msg.senderId);
      if (senderId === me._id) return;

      const isViewing = activeConvRef.current?._id === msg.conversationId
                        && typeof document !== 'undefined'
                        && document.hasFocus();

      // Nếu đang xem conv này + tab đang focus → không notify + không tăng badge
      if (isViewing) return;

      // Tăng badge unread
      setUnreadMap((prev) => ({
        ...prev,
        [msg.conversationId]: (prev[msg.conversationId] || 0) + 1,
      }));

      // Hiện browser notification
      if (typeof window !== 'undefined' && 'Notification' in window
          && Notification.permission === 'granted') {
        try {
          const senderName = msg.senderId?.username || 'Ai đó';
          const notif = new Notification(`💬 ${senderName}`, {
            body: (msg.content || '').substring(0, 120),
            tag: msg.conversationId, // ghi đè notif cũ cùng conv
            silent: false,
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
          // Tự đóng sau 5s
          setTimeout(() => notif.close(), 5000);
        } catch (_) {}
      }

      // Ping âm thanh nhẹ (Web Audio API - không cần file)
      playPingSound();
    };

    socket.on('receive_message', onNewMessage);
    return () => socket.off('receive_message', onNewMessage);
  }, [socket, me?._id]);

  // Khi chọn conv → clear unread của conv đó
  const selectConv = (conv) => {
    setActiveConv(conv);
    if (conv?._id) {
      setUnreadMap((prev) => {
        if (!prev[conv._id]) return prev;
        const { [conv._id]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const switchTab = (newTab) => {
    if (newTab !== tab) selectConv(null);
    setTab(newTab);
  };

  return (
    <View style={s.root}>
      <Rail active={tab} onChange={switchTab} connected={connected} me={me} unreadTotal={sumUnread(unreadMap)} />

      {tab === 'chat' && (
        <>
          <Sidebar
            me={me}
            activeConvId={activeConv?._id}
            onSelectConv={selectConv}
            unreadMap={unreadMap}
          />
          <View style={s.chatPanel}>
            {activeConv
              ? <ChatPanel conv={activeConv} me={me} onLeftConversation={() => selectConv(null)} />
              : <EmptyState
                  icon="💬"
                  title="Chọn một cuộc trò chuyện"
                  sub="Hoặc tìm một người dùng mới để bắt đầu chat"
                />
            }
          </View>
        </>
      )}

      {tab === 'devices' && (
        <>
          <DevicesSidebar
            activeConvId={activeConv?._id}
            onSelectDevice={(device) => selectConv({
              _id: device.conversationId?._id || device.conversationId,
              name: device.name,
              type: 'device',
            })}
          />
          <View style={s.chatPanel}>
            {activeConv
              ? <ChatPanel conv={activeConv} me={me} onLeftConversation={() => selectConv(null)} />
              : <EmptyState
                  icon="⚡"
                  title="Chọn một thiết bị"
                  sub="Xem tin nhắn ESP32 gửi lên, hoặc quản lý API key"
                />
            }
          </View>
        </>
      )}

      {tab === 'profile' && (
        <View style={s.profileWrap}>
          <ProfilePanel me={me} onLogout={logout} />
        </View>
      )}
    </View>
  );
}

// Helper: tổng unread across all conv
function sumUnread(map) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

// Web Audio API - phát 1 tiếng "ping" ngắn, không cần file mp3
let audioCtx = null;
function playPingSound() {
  if (typeof window === 'undefined') return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880; // A5
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } catch (_) {}
}

// ─── Rail dọc trái ───────────────────────────────────────────────────────────
function Rail({ active, onChange, connected, me, unreadTotal }) {
  const items = [
    { id: 'chat',    icon: '💬', label: 'Tin nhắn', badge: unreadTotal },
    { id: 'devices', icon: '⚡', label: 'Thiết bị' },
    { id: 'profile', icon: '👤', label: 'Cá nhân'  },
  ];

  return (
    <View style={r.rail}>
      <View style={r.logoBox}>
        <Text style={r.logoIcon}>💬</Text>
      </View>

      <View style={r.items}>
        {items.map((it) => {
          const isActive = it.id === active;
          const hasBadge = it.badge && it.badge > 0;
          return (
            <TouchableOpacity
              key={it.id}
              style={[r.item, isActive && r.itemActive]}
              onPress={() => onChange(it.id)}
              title={it.label}
            >
              <View style={{ position: 'relative' }}>
                <Text style={[r.icon, isActive && r.iconActive]}>{it.icon}</Text>
                {hasBadge && (
                  <View style={r.badge}>
                    <Text style={r.badgeText}>{it.badge > 99 ? '99+' : it.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[r.label, isActive && r.labelActive]}>{it.label}</Text>
              {isActive && <View style={r.dot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={r.bottom}>
        <View style={[r.status, connected && r.statusOn]} />
      </View>
    </View>
  );
}

// ─── Sidebar Messages ───────────────────────────────────────────────────────
function Sidebar({ me, activeConvId, onSelectConv, unreadMap }) {
  const {
    conversations, loadingMore,
    searchQuery, searchResults, searching,
    loadMore, searchUsers, startConversation,
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
      <View style={sb.header}>
        <Text style={sb.headerTitle}>Tin nhắn</Text>
      </View>

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

        <TouchableOpacity style={sb.newGroupBtn} onPress={() => setShowCreateGroup(true)}>
          <Text style={sb.newGroupText}>+ Nhóm</Text>
        </TouchableOpacity>
      </View>

      {searchResults.length > 0 && (
        <View style={sb.searchResults}>
          {searchResults.map((u) => (
            <TouchableOpacity key={u._id} style={sb.searchItem} onPress={() => handleStartChat(u)}>
              <Avatar name={u.username} size="md" />
              <View style={{ flex: 1 }}>
                <Text style={sb.searchName}>{u.username}</Text>
                <Text style={sb.searchEmail}>{u.email}</Text>
              </View>
              <Text style={sb.chatBtn}>Chat</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showCreateGroup && (
        <CreateGroupInline
          onClose={() => setShowCreateGroup(false)}
          onCreated={(conv) => {
            setShowCreateGroup(false);
            onSelectConv({ _id: conv._id, name: conv.name, type: 'group' });
          }}
        />
      )}

      <FlatList
        data={conversations}
        keyExtractor={(item) => item._id}
        style={sb.convList}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={C.accent} style={{ padding: 12 }} /> : null
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
          const unread = unreadMap[item._id] || 0;
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
              activeOpacity={0.7}
            >
              <Avatar name={title} isDevice={item.type === 'device'} size="lg" />
              <View style={sb.convBody}>
                <View style={sb.convTopRow}>
                  <Text style={[sb.convTitle,
                    (isActive || unread) && sb.convTitleActive]}
                    numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={[sb.convTime, unread > 0 && sb.convTimeUnread]}>{time}</Text>
                </View>
                <View style={sb.convBottomRow}>
                  <Text style={[sb.convLast, unread > 0 && sb.convLastUnread]} numberOfLines={1}>
                    {lastContent}
                  </Text>
                  {unread > 0 && (
                    <View style={sb.unreadBadge}>
                      <Text style={sb.unreadBadgeText}>{unread > 99 ? '99+' : unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// ─── Sidebar Devices ─────────────────────────────────────────────────────────
function DevicesSidebar({ activeConvId, onSelectDevice }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [shownKey, setShownKey] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await deviceApi.listMine();
      setDevices(data);
    } catch (err) {
      console.error('DevicesSidebar load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (name, hubConversationId) => {
    try {
      const { data } = await deviceApi.register(name, hubConversationId);
      setShownKey({ title: `Thiết bị "${data.device.name}" đã tạo`, apiKey: data.apiKey });
      setShowAdd(false);
      load();
    } catch (err) {
      window.alert('Lỗi: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleRevoke = async (device) => {
    if (!window.confirm(`Thu hồi "${device.name}"?\nThiết bị sẽ không gửi được tin nhắn nữa.`)) return;
    try {
      await deviceApi.revoke(device._id);
      load();
    } catch (err) {
      window.alert('Lỗi: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleRegenerate = async (device) => {
    if (!window.confirm(`Tạo lại API key cho "${device.name}"?\nKey cũ sẽ ngừng hoạt động.`)) return;
    try {
      const { data } = await deviceApi.regenerateKey(device._id);
      setShownKey({ title: `API key mới cho "${device.name}"`, apiKey: data.apiKey });
      load();
    } catch (err) {
      window.alert('Lỗi: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <View style={sb.sidebar}>
      <View style={sb.header}>
        <Text style={sb.headerTitle}>Thiết bị</Text>
        <TouchableOpacity style={ds.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={ds.addBtnText}>+ Thêm</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={sb.emptyBox}><ActivityIndicator color={C.accent} /></View>
      ) : devices.length === 0 ? (
        <View style={sb.emptyBox}>
          <Text style={sb.emptyIcon}>⚡</Text>
          <Text style={sb.emptyText}>Chưa có thiết bị nào</Text>
          <TouchableOpacity style={ds.emptyAddBtn} onPress={() => setShowAdd(true)}>
            <Text style={ds.emptyAddBtnText}>+ Thêm thiết bị đầu tiên</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {devices.map((d) => {
            const isActive = (d.conversationId?._id || d.conversationId) === activeConvId;
            const lastSeen = d.lastSeenAt
              ? new Date(d.lastSeenAt).toLocaleString('vi-VN', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })
              : 'Chưa kết nối';

            return (
              <View key={d._id} style={[ds.devItem, isActive && ds.devItemActive, !d.isActive && ds.devItemRevoked]}>
                <TouchableOpacity
                  style={ds.devMain}
                  onPress={() => onSelectDevice(d)}
                >
                  <View style={ds.devIcon}>
                    <Text style={{ fontSize: 24 }}>⚡</Text>
                  </View>
                  <View style={{ flex: 1, overflow: 'hidden' }}>
                    <View style={ds.devNameRow}>
                      <Text style={[ds.devName, isActive && ds.devNameActive]} numberOfLines={1}>{d.name}</Text>
                      <View style={[ds.pill, d.isActive ? ds.pillOk : ds.pillOff]}>
                        <Text style={[ds.pillText, d.isActive ? ds.pillTextOk : ds.pillTextOff]}>
                          {d.isActive ? 'ON' : 'OFF'}
                        </Text>
                      </View>
                    </View>
                    <Text style={ds.devMeta}>{lastSeen}</Text>
                  </View>
                </TouchableOpacity>

                <View style={ds.devActions}>
                  <TouchableOpacity style={ds.actBtn} onPress={() => handleRegenerate(d)} title="Tạo lại key">
                    <Text style={ds.actIcon}>Tạo lại</Text>
                  </TouchableOpacity>
                  {d.isActive && (
                    <TouchableOpacity style={ds.actBtn} onPress={() => handleRevoke(d)} title="Thu hồi">
                      <Text style={ds.actIcon}>Xóa</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {showAdd && <AddDeviceInline onClose={() => setShowAdd(false)} onCreate={handleCreate} />}
      {shownKey && <ShowKeyInline {...shownKey} onClose={() => setShownKey(null)} />}
    </View>
  );
}

// ─── Panel Profile ───────────────────────────────────────────────────────────
function ProfilePanel({ me, onLogout }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [form, setForm] = useState({
    username: me?.username || '',
    email: me?.email || '',
  });

  const startEdit = () => {
    setForm({ username: me?.username || '', email: me?.email || '' });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!form.username.trim() || !form.email.trim()) {
      window.alert('Username và email không được để trống');
      return;
    }
    setSaving(true);
    try {
      await client.patch('/api/users/me', {
        username: form.username.trim(),
        email: form.email.trim(),
      });
      window.alert('Đã cập nhật thông tin');
      setEditing(false);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        window.alert(
          'Chức năng chưa sẵn sàng.\n\n' +
          'Backend chưa có endpoint PATCH /api/users/me. Cần bổ sung trước khi dùng.'
        );
      } else {
        window.alert('Lỗi: ' + (err.response?.data?.message || err.message));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Đăng xuất khỏi thiết bị này?')) onLogout();
  };

  const handleLogoutAll = async () => {
    if (!window.confirm(
      'Đăng xuất tất cả thiết bị?\nMọi phiên đăng nhập ở mọi nơi sẽ bị hủy.'
    )) return;
    setLoggingOutAll(true);
    try {
      await authApi.logoutAll();
      await onLogout();
    } catch (err) {
      window.alert('Lỗi: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoggingOutAll(false);
    }
  };

  const joined = me?.createdAt
    ? new Date(me.createdAt).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : '—';

  return (
    <ScrollView style={p.root} contentContainerStyle={p.content}>
      <View style={p.card}>
        <View style={p.topCard}>
          <Avatar name={me?.username} size="lg" />
          <Text style={p.username}>{me?.username}</Text>
          <View style={p.typeBadge}>
            <Text style={p.typeBadgeText}>
              {me?.type === 'device' ? '⚡ Thiết bị' : '👤 Người dùng'}
            </Text>
          </View>
        </View>

        {!editing ? (
          <>
            <View style={p.section}>
              <Text style={p.sectionLabel}>THÔNG TIN TÀI KHOẢN</Text>
              <InfoRow label="Username" value={me?.username} />
              <InfoRow label="Email" value={me?.email} />
              <InfoRow label="Ngày tạo" value={joined} />
              <InfoRow
                label="Trạng thái"
                value={me?.isOnline ? '● Đang hoạt động' : 'Ngoại tuyến'}
                valueColor={me?.isOnline ? C.ok : C.dim}
              />
            </View>

            <TouchableOpacity style={p.primaryBtn} onPress={startEdit}>
              <Text style={p.primaryBtnText}>✎ Chỉnh sửa thông tin</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={p.section}>
            <Text style={p.sectionLabel}>CHỈNH SỬA</Text>

            <Text style={p.fieldLabel}>Username</Text>
            <TextInput
              style={p.input}
              value={form.username}
              onChangeText={(v) => setForm((f) => ({ ...f, username: v }))}
              placeholder="Username"
              placeholderTextColor={C.dim}
              autoCapitalize="none"
            />

            <Text style={p.fieldLabel}>Email</Text>
            <TextInput
              style={p.input}
              value={form.email}
              onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              placeholder="Email"
              placeholderTextColor={C.dim}
              autoCapitalize="none"
            />

            <View style={p.btnRow}>
              <TouchableOpacity style={p.ghostBtn} onPress={() => setEditing(false)} disabled={saving}>
                <Text style={p.ghostBtnText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[p.primaryBtn, { flex: 1 }, saving && { opacity: 0.6 }]}
                onPress={saveEdit}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={C.white} /> : <Text style={p.primaryBtnText}>Lưu thay đổi</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!editing && (
          <View style={p.section}>
            <Text style={p.sectionLabel}>PHIÊN ĐĂNG NHẬP</Text>

            <TouchableOpacity style={p.rowBtn} onPress={handleLogout}>
              <Text style={p.rowBtnIcon}>⎋</Text>
              <View style={{ flex: 1 }}>
                <Text style={p.rowBtnText}>Đăng xuất</Text>
                <Text style={p.rowBtnSub}>Chỉ đăng xuất khỏi thiết bị này</Text>
              </View>
              <Text style={p.rowBtnChev}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[p.rowBtn, p.rowBtnDanger]}
              onPress={handleLogoutAll}
              disabled={loggingOutAll}
            >
              <Text style={p.rowBtnIcon}>🚪</Text>
              <View style={{ flex: 1 }}>
                <Text style={[p.rowBtnText, { color: C.danger }]}>Đăng xuất tất cả thiết bị</Text>
                <Text style={p.rowBtnSub}>Hủy mọi phiên đăng nhập hiện tại</Text>
              </View>
              {loggingOutAll
                ? <ActivityIndicator color={C.danger} size="small" />
                : <Text style={[p.rowBtnChev, { color: C.danger }]}>›</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={p.appVersion}>MessageHub v1.0 · web</Text>
    </ScrollView>
  );
}

function InfoRow({ label, value, valueColor }) {
  return (
    <View style={p.infoRow}>
      <Text style={p.infoLabel}>{label}</Text>
      <Text style={[p.infoValue, valueColor && { color: valueColor }]} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

// ─── Inline: Tạo nhóm ────────────────────────────────────────────────────────
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

// ─── Inline: Thêm thiết bị ───────────────────────────────────────────────────
function AddDeviceInline({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('new'); // 'new' = tạo hội thoại mới | 'join' = ghép vào hub có sẵn
  const [hubs, setHubs] = useState([]);
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [selectedHubId, setSelectedHubId] = useState(null);

  useEffect(() => {
    deviceApi.listHubs()
      .then(({ data }) => setHubs(data))
      .catch(() => setHubs([]))
      .finally(() => setLoadingHubs(false));
  }, []);

  const submit = async () => {
    if (name.trim().length < 2) { window.alert('Tên phải từ 2 ký tự'); return; }
    if (mode === 'join' && !selectedHubId) { window.alert('Vui lòng chọn 1 cuộc trò chuyện để ghép vào'); return; }
    setLoading(true);
    await onCreate(name.trim(), mode === 'join' ? selectedHubId : undefined);
    setLoading(false);
    setName('');
  };

  return (
    <View style={cg.wrap}>
      <View style={cg.header}>
        <Text style={cg.title}>Thêm thiết bị mới</Text>
        <TouchableOpacity onPress={onClose}><Text style={cg.close}>✕</Text></TouchableOpacity>
      </View>

      <View style={adm.modeRow}>
        <TouchableOpacity
          style={[adm.modeBtn, mode === 'new' && adm.modeBtnActive]}
          onPress={() => setMode('new')}
        >
          <Text style={[adm.modeBtnText, mode === 'new' && adm.modeBtnTextActive]}>Tạo hội thoại mới</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[adm.modeBtn, mode === 'join' && adm.modeBtnActive]}
          onPress={() => setMode('join')}
          disabled={hubs.length === 0}
        >
          <Text style={[adm.modeBtnText, mode === 'join' && adm.modeBtnTextActive]}>Ghép vào hub có sẵn</Text>
        </TouchableOpacity>
      </View>

      {mode === 'join' && (
        loadingHubs ? (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 10 }} />
        ) : hubs.length === 0 ? (
          <Text style={adm.emptyHubText}>Bạn chưa có hội thoại thiết bị nào để ghép vào.</Text>
        ) : (
          <ScrollView style={adm.hubList}>
            {hubs.map((h) => (
              <TouchableOpacity
                key={h._id}
                style={[adm.hubItem, selectedHubId === h._id && adm.hubItemActive]}
                onPress={() => setSelectedHubId(h._id)}
              >
                <Text style={{ fontSize: 16 }}>{selectedHubId === h._id ? '●' : '○'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={adm.hubName} numberOfLines={1}>{h.name}</Text>
                  <Text style={adm.hubMeta}>{h.deviceCount} thiết bị trong hội thoại này</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )
      )}

      <TextInput style={cg.nameInput} placeholder="VD: ESP32 phòng khách"
        placeholderTextColor={C.dim} value={name} onChangeText={setName} autoFocus />
      <Text style={cg.hint}>
        {mode === 'join'
          ? 'Thiết bị mới sẽ gửi tin nhắn chung vào hội thoại đã chọn ở trên.'
          : 'Sau khi tạo, bạn sẽ nhận API key — chỉ hiện MỘT lần, hãy sao lưu ngay.'}
      </Text>
      <TouchableOpacity style={[cg.createBtn, !name.trim() && cg.disabled]}
        onPress={submit} disabled={!name.trim() || loading}>
        {loading ? <ActivityIndicator color={C.white} /> : <Text style={cg.createText}>Tạo</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Inline: Hiện API key ───────────────────────────────────────────────────
function ShowKeyInline({ title, apiKey, onClose }) {
  const copy = () => {
    navigator.clipboard?.writeText(apiKey).then(
      () => window.alert('Đã sao chép API key vào clipboard'),
      () => {}
    );
  };
  return (
    <View style={cg.wrap}>
      <View style={cg.header}>
        <Text style={cg.title}>{title}</Text>
        <TouchableOpacity onPress={onClose}><Text style={cg.close}>✕</Text></TouchableOpacity>
      </View>
      <View style={cg.warnBox}>
        <Text style={cg.warnText}>⚠ Lưu key ngay — sẽ không hiện lại</Text>
      </View>
      <View style={cg.keyBox}>
        <Text selectable style={cg.keyText}>{apiKey}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
        <TouchableOpacity style={[cg.createBtn, { flex: 1, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border }]} onPress={copy}>
          <Text style={[cg.createText, { color: C.text }]}> Sao chép</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cg.createBtn, { flex: 1 }]} onPress={onClose}>
          <Text style={cg.createText}>Đóng</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 😊 EMOJI PICKER - grid đơn giản
// ═════════════════════════════════════════════════════════════════════════════

const EMOJI_LIST = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
  '😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
  '😋','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','🤨',
  '😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪',
  '😴','😷','🤒','🥵','🥶','🥴','😵','🤯','🥳','😎',
  '🤓','🧐','😕','😟','😢','😭','😱','😨','😰','😥',
  '😓','🤗','🤥','🤠','👻','💀','👽','🤖','😺','😸',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕',
  '💖','💗','💘','💝','💟','💯','💢','💥','💫','⭐',
  '👍','👎','👌','✌️','🤞','🤝','👏','🙏','💪','🤙',
  '👋','🤚','✋','🖐️','👊','🤛','🤜','✊','🖕','👇',
  '🎉','🎊','🎁','🎂','🍰','🎈','🎃','🎄','🌸','🌹',
  '🔥','⚡','💡','☀️','🌙','⭐','🌈','☁️','☔','❄️',
  '☕','🍺','🍔','🍕','🍜','🍣','🍎','🍌','🍇','🍓',
  '⚽','🏀','🎮','🎵','📷','💻','📱','🚀','✈️','🚗',
  '✅','❌','⚠️','🚫','🔒','🔓','🔔','🔕','📌','📍',
];

function EmojiPicker({ visible, onSelect, onClose }) {
  if (!visible) return null;
  return (
    <>
      {/* Backdrop để click ngoài đóng */}
      <TouchableOpacity
        style={emp.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={emp.panel}>
        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
          <View style={emp.grid}>
            {EMOJI_LIST.map((e, i) => (
              <TouchableOpacity
                key={i}
                style={emp.cell}
                onPress={() => onSelect(e)}
                activeOpacity={0.5}
              >
                <Text style={emp.emoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

// ─── Khung chat phải ─────────────────────────────────────────────────────────
function ChatPanel({ conv, me, onLeftConversation }) {
  const [inputValue, setInputValue] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [members, setMembers] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const {
    messages, hasMore, loadingOlder, flatListRef,
    loadMessages, loadOlder, sendMessage, recallMessage, deleteMessage,
  } = useMessages(conv._id);
  const { typingText, emitTyping, stopTyping } = useTyping(conv._id, conv.name);

  // Ref theo dõi ID tin nhắn cuối cùng để phát hiện tin MỚI (khác với loadOlder)
  const lastMsgIdRef = useRef(null);

  useEffect(() => {
    loadMessages(true);
    setInputValue('');
    setShowEmoji(false);
    setReplyingTo(null);
    setMentionQuery(null);
    lastMsgIdRef.current = null; // reset khi đổi conv
  }, [conv._id]);

  // Danh sách thành viên hội thoại - dùng cho @mention và panel bên phải
  useEffect(() => {
    conversationApi.getGroupMembers(conv._id)
      .then(({ data }) => setMembers(data.members || []))
      .catch(() => setMembers([]));
  }, [conv._id]);

  // ─ AUTO-SCROLL: khi có tin nhắn MỚI (send hoặc receive), tự cuộn xuống cuối ─
  // Không scroll khi loadOlder vì tin mới nhất không đổi, chỉ có tin cũ được prepend
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last._id === lastMsgIdRef.current) return; // không có tin mới

    lastMsgIdRef.current = last._id;

    // Thử scroll nhiều lần vì react-native-web timing không ổn định
    const attempt = (delay) => setTimeout(() => {
      try {
        flatListRef?.current?.scrollToEnd({ animated: true });
      } catch (_) {}
    }, delay);
    attempt(50);
    attempt(250);
  }, [messages]);

  // @<tên hiển thị> của member -> dùng để hiển thị + để so khớp mentions khi gửi
  const memberDisplayName = (u) => u?.displayName?.trim() || u?.username || '';

  const computeMentions = (text) =>
    members
      .filter((u) => String(u._id) !== String(me._id) && text.includes('@' + memberDisplayName(u)))
      .map((u) => u._id);

  const mentionSuggestions = mentionQuery === null
    ? []
    : members
        .filter((u) => String(u._id) !== String(me._id))
        .filter((u) => memberDisplayName(u).toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 6);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendMessage({ content: inputValue, replyTo: replyingTo?._id, mentions: computeMentions(inputValue) });
    setInputValue('');
    setReplyingTo(null);
    setMentionQuery(null);
    stopTyping();
    setShowEmoji(false);
  };

  const handleChangeText = (t) => {
    setInputValue(t);
    emitTyping();
    // Phát hiện "@partial" ở cuối chuỗi đang gõ để hiện gợi ý @mention
    const match = t.match(/@([^\s@]{0,24})$/);
    setMentionQuery(match ? match[1] : null);
  };

  const pickMention = (user) => {
    setInputValue((prev) => prev.replace(/@([^\s@]{0,24})$/, `@${memberDisplayName(user)} `));
    setMentionQuery(null);
  };

  const handleKeyDown = (e) => {
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

  const insertEmoji = (emoji) => {
    setInputValue((prev) => prev + emoji);
    // Không đóng picker để user chọn tiếp nhiều emoji
  };

  // ── Gửi file/ảnh đính kèm ──
  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { data } = await messageApi.upload(file);
      sendMessage({
        content: '',
        replyTo: replyingTo?._id,
        attachments: [{ url: data.url, fileType: data.fileType, fileName: data.fileName, fileSize: data.fileSize }],
      });
      setReplyingTo(null);
    } catch (err) {
      window.alert('Lỗi gửi file: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row', minWidth: 0 }}>
    <View style={cp.container}>
      <View style={cp.header}>
        <Avatar name={conv.name} isDevice={conv.type === 'device'} size="md" />
        <View style={cp.headerInfo}>
          <Text style={cp.headerName}>{conv.name}</Text>
          <Text style={cp.headerType}>
            {conv.type === 'device' ? '⚡ Thiết bị' : conv.type === 'group' ? '👥 Nhóm' : '● Đang hoạt động'}
          </Text>
        </View>
        <TouchableOpacity
          style={[cp.infoBtn, showInfo && cp.infoBtnActive]}
          onPress={() => setShowInfo((v) => !v)}
          title="Thông tin hội thoại"
        >
          <Icon name="information-circle-outline" size={20} color={showInfo ? C.accentText : C.dim} />
        </TouchableOpacity>
      </View>

      {hasMore && (
        <TouchableOpacity style={cp.loadOlder} onPress={loadOlder} disabled={loadingOlder}>
          {loadingOlder
            ? <ActivityIndicator size="small" color={C.accent} />
            : <Text style={cp.loadOlderText}>↑ Tin nhắn cũ hơn</Text>
          }
        </TouchableOpacity>
      )}

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
              onReply={setReplyingTo}
            />
          );
        }}
      />

      <TypingIndicator text={typingText} />

      {/* Đang trả lời 1 tin nhắn */}
      {replyingTo && (
        <View style={cp.replyBar}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={cp.replyBarName} numberOfLines={1}>
              Trả lời {replyingTo.senderId?.displayName?.trim() || replyingTo.senderId?.username || 'Ai đó'}
            </Text>
            <Text style={cp.replyBarText} numberOfLines={1}>
              {replyingTo.isRecalled
                ? 'Tin nhắn đã thu hồi'
                : replyingTo.content || (replyingTo.attachments?.length ? '📎 Tệp đính kèm' : '')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <Text style={{ fontSize: 16, color: C.dim }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Gợi ý @mention */}
      {mentionQuery !== null && mentionSuggestions.length > 0 && (
        <View style={cp.mentionBox}>
          {mentionSuggestions.map((u) => (
            <TouchableOpacity key={u._id} style={cp.mentionItem} onPress={() => pickMention(u)}>
              <Avatar name={memberDisplayName(u)} isDevice={u.type === 'device'} size="sm" />
              <Text style={cp.mentionItemText}>{memberDisplayName(u)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Emoji picker (floating panel) */}
      <EmojiPicker
        visible={showEmoji}
        onSelect={insertEmoji}
        onClose={() => setShowEmoji(false)}
      />

      <View style={cp.inputArea}>
        <TouchableOpacity
          style={[cp.emojiBtn, showEmoji && cp.emojiBtnActive]}
          onPress={() => setShowEmoji(!showEmoji)}
          title="Chọn biểu tượng cảm xúc"
        >
          <Text style={cp.emojiIcon}>😊</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={cp.emojiBtn}
          onPress={handlePickFile}
          disabled={uploading}
          title="Gửi file/ảnh đính kèm"
        >
          {uploading ? <ActivityIndicator size="small" color={C.accent} /> : <Text style={cp.emojiIcon}>📎</Text>}
        </TouchableOpacity>
        {/* input file ẩn - chỉ chạy trên web */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <View style={cp.inputWrap}>
          <TextInput
            style={cp.input}
            placeholder="Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng, @ để nhắc ai đó)"
            placeholderTextColor={C.dim}
            value={inputValue}
            onChangeText={handleChangeText}
            onKeyPress={handleKeyDown}
            onFocus={() => setShowEmoji(false)}
            multiline
            scrollEnabled
          />
        </View>
        <TouchableOpacity
          style={[cp.sendBtn, !inputValue.trim() && cp.sendBtnOff]}
          onPress={handleSend}
          disabled={!inputValue.trim()}
        >
          <Text style={{ fontSize: 20, color: inputValue.trim() ? C.white : C.dim }}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>

    {showInfo && (
      <RightPanel
        conv={conv}
        me={me}
        onClose={() => setShowInfo(false)}
        onLeft={() => { setShowInfo(false); onLeftConversation?.(); }}
      />
    )}
    </View>
  );
}

// ─── Panel thông tin hội thoại bên phải: thành viên / rời nhóm / file-ảnh-link ─
function RightPanel({ conv, me, onClose, onLeft }) {
  const [tab, setTab] = useState('members'); // 'members' | 'media'
  const [mediaTab, setMediaTab] = useState('images'); // 'images' | 'files' | 'links'
  const [members, setMembers] = useState([]);
  const [adminId, setAdminId] = useState(null);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [media, setMedia] = useState({ images: [], files: [], links: [] });
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const isGroup = conv.type === 'group';
  const isDeviceConv = conv.type === 'device';

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const { data } = await conversationApi.getGroupMembers(conv._id);
      setMembers(data.members || []);
      setAdminId(data.adminId);
    } catch (err) {
      console.error('RightPanel loadMembers:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, [conv._id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  useEffect(() => {
    if (tab !== 'media') return;
    setLoadingMedia(true);
    conversationApi.getMedia(conv._id)
      .then(({ data }) => setMedia(data))
      .catch(() => setMedia({ images: [], files: [], links: [] }))
      .finally(() => setLoadingMedia(false));
  }, [tab, conv._id]);

  const isAdmin = String(adminId) === String(me._id);

  const handleLeave = async () => {
    if (!window.confirm('Rời khỏi nhóm này? Bạn sẽ không thấy tin nhắn mới nữa.')) return;
    try {
      await conversationApi.leaveGroup(conv._id);
      onLeft?.();
    } catch (err) {
      window.alert('Lỗi: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleKick = async (userId) => {
    if (!window.confirm('Xoá thành viên này khỏi nhóm?')) return;
    try {
      await conversationApi.kickMember(conv._id, userId);
      loadMembers();
    } catch (err) {
      window.alert('Lỗi: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <View style={rpnl.container}>
      <View style={rpnl.header}>
        <Text style={rpnl.headerTitle}>Thông tin hội thoại</Text>
        <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 18, color: C.dim }}>✕</Text></TouchableOpacity>
      </View>

      <View style={rpnl.tabs}>
        <TouchableOpacity style={[rpnl.tabBtn, tab === 'members' && rpnl.tabBtnActive]} onPress={() => setTab('members')}>
          <Text style={[rpnl.tabText, tab === 'members' && rpnl.tabTextActive]}>Thành viên</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[rpnl.tabBtn, tab === 'media' && rpnl.tabBtnActive]} onPress={() => setTab('media')}>
          <Text style={[rpnl.tabText, tab === 'media' && rpnl.tabTextActive]}>File / Ảnh / Link</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {tab === 'members' ? (
          loadingMembers ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
          ) : (
            <>
              {(isGroup || isDeviceConv) && isAdmin && (
                <TouchableOpacity style={rpnl.addMemberBtn} onPress={() => setShowAddMember(true)}>
                  <Text style={rpnl.addMemberText}>+ Thêm thành viên / thiết bị</Text>
                </TouchableOpacity>
              )}
              {members.map((m) => (
                <View key={m._id} style={rpnl.memberRow}>
                  <Avatar name={m.displayName?.trim() || m.username} isDevice={m.type === 'device'} size="sm" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={rpnl.memberName} numberOfLines={1}>
                      {m.displayName?.trim() || m.username}{String(m._id) === String(me._id) ? ' (Bạn)' : ''}
                    </Text>
                    {String(m._id) === String(adminId) && <Text style={rpnl.adminTag}>Quản trị viên</Text>}
                  </View>
                  {isGroup && isAdmin && String(m._id) !== String(me._id) && (
                    <TouchableOpacity onPress={() => handleKick(m._id)}>
                      <Text style={{ color: C.danger, fontSize: FONT.xs, fontWeight: '600' }}>Xoá</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {isGroup && (
                <TouchableOpacity style={rpnl.leaveBtn} onPress={handleLeave}>
                  <Icon name="exit-outline" size={16} color={C.danger} />
                  <Text style={rpnl.leaveText}>Rời khỏi nhóm</Text>
                </TouchableOpacity>
              )}
            </>
          )
        ) : (
          <MediaTabs media={media} loading={loadingMedia} mediaTab={mediaTab} setMediaTab={setMediaTab} />
        )}
      </ScrollView>

      {showAddMember && (
        <AddMemberInline
          conv={conv}
          existingMembers={members}
          onClose={() => setShowAddMember(false)}
          onAdded={() => { setShowAddMember(false); loadMembers(); }}
        />
      )}
    </View>
  );
}

// ─── Tab con: Ảnh / File / Link đã chia sẻ trong hội thoại ───────────────────
function MediaTabs({ media, loading, mediaTab, setMediaTab }) {
  if (loading) return <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />;

  return (
    <View>
      <View style={rpnl.mediaSubTabs}>
        {[
          ['images', `Ảnh (${media.images.length})`],
          ['files', `File (${media.files.length})`],
          ['links', `Link (${media.links.length})`],
        ].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[rpnl.mediaSubBtn, mediaTab === key && rpnl.mediaSubBtnActive]}
            onPress={() => setMediaTab(key)}
          >
            <Text style={[rpnl.mediaSubText, mediaTab === key && rpnl.mediaSubTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mediaTab === 'images' && (
        media.images.length === 0 ? (
          <EmptyMedia text="Chưa có ảnh nào được chia sẻ" />
        ) : (
          <View style={rpnl.imageGrid}>
            {media.images.map((img, i) => (
              <TouchableOpacity key={i} onPress={() => Linking.openURL(resolveFileUrl(img.url))}>
                <Image source={{ uri: resolveFileUrl(img.url) }} style={rpnl.imageThumb} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </View>
        )
      )}

      {mediaTab === 'files' && (
        media.files.length === 0 ? (
          <EmptyMedia text="Chưa có tệp nào được chia sẻ" />
        ) : (
          media.files.map((f, i) => (
            <TouchableOpacity key={i} style={rpnl.mediaFileRow} onPress={() => Linking.openURL(resolveFileUrl(f.url))}>
              <View style={rpnl.mediaFileIcon}>
                <Icon name="document-text-outline" size={16} color={C.accentText} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={rpnl.mediaFileName} numberOfLines={1}>{f.fileName || 'Tệp đính kèm'}</Text>
                <Text style={rpnl.mediaFileMeta}>{f.sender?.displayName?.trim() || f.sender?.username || ''}</Text>
              </View>
            </TouchableOpacity>
          ))
        )
      )}

      {mediaTab === 'links' && (
        media.links.length === 0 ? (
          <EmptyMedia text="Chưa có link nào được chia sẻ" />
        ) : (
          media.links.map((l, i) => (
            <TouchableOpacity key={i} style={rpnl.mediaLinkRow} onPress={() => Linking.openURL(l.url)}>
              <Text style={rpnl.mediaLinkUrl} numberOfLines={1}>{l.url}</Text>
              <Text style={rpnl.mediaLinkMeta}>{l.sender?.displayName?.trim() || l.sender?.username || ''}</Text>
            </TouchableOpacity>
          ))
        )
      )}
    </View>
  );
}

function EmptyMedia({ text }) {
  return (
    <View style={rpnl.emptyMedia}>
      <Icon name="folder-outline" size={28} color={C.dim} />
      <Text style={rpnl.emptyMediaText}>{text}</Text>
    </View>
  );
}

// ─── Inline modal: thêm thành viên (người) và/hoặc thiết bị của chính mình ────
function AddMemberInline({ conv, existingMembers, onClose, onAdded }) {
  const [query, setQuery] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [myDevices, setMyDevices] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const isDeviceConv = conv.type === 'device';
  const existingIds = existingMembers.map((m) => String(m._id));

  // Tìm người dùng theo tên (debounce nhẹ)
  useEffect(() => {
    if (!query.trim()) { setUserResults([]); return; }
    const t = setTimeout(() => {
      userApi.search(query.trim())
        .then(({ data }) => setUserResults(
          (data || []).filter((u) => u.type !== 'device' && !existingIds.includes(String(u._id)))
        ))
        .catch(() => setUserResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Với hội thoại thiết bị: liệt kê các thiết bị KHÁC của chính mình để có thể kéo vào chung 1 hội thoại
  useEffect(() => {
    if (!isDeviceConv) return;
    deviceApi.listMine()
      .then(({ data }) => {
        const own = (data || []).filter((d) => {
          const linkedId = String(d.linkedUserAccountId || '');
          return !existingIds.includes(linkedId);
        });
        setMyDevices(own);
      })
      .catch(() => setMyDevices([]));
  }, [isDeviceConv]);

  const toggleUser = (u) => {
    setSelectedUsers((prev) =>
      prev.some((x) => x._id === u._id) ? prev.filter((x) => x._id !== u._id) : [...prev, u]
    );
  };
  const toggleDevice = (d) => {
    setSelectedDevices((prev) =>
      prev.some((x) => x._id === d._id) ? prev.filter((x) => x._id !== d._id) : [...prev, d]
    );
  };

  const submit = async () => {
    if (selectedUsers.length === 0 && selectedDevices.length === 0) return;
    setSubmitting(true);
    try {
      if (isDeviceConv) {
        // Cần 1 deviceId thuộc hội thoại này, do chính mình sở hữu, để gọi POST /api/devices/:id/members
        const { data: allMine } = await deviceApi.listMine();
        const anchor = allMine.find(
          (d) => String(d.conversationId?._id || d.conversationId) === String(conv._id)
        );
        if (!anchor) {
          window.alert('Bạn không phải chủ sở hữu của bất kỳ thiết bị nào trong hội thoại này nên không thể thêm thành viên.');
          setSubmitting(false);
          return;
        }
        for (const u of selectedUsers) await deviceApi.addMember(anchor._id, u._id);
        for (const d of selectedDevices) await deviceApi.addDeviceMember(anchor._id, d._id);
      } else {
        for (const u of selectedUsers) await conversationApi.addMember(conv._id, u._id);
      }
      onAdded();
    } catch (err) {
      window.alert('Lỗi: ' + (err.response?.data?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = selectedUsers.length > 0 || selectedDevices.length > 0;

  return (
    <View style={am.overlay}>
      <View style={am.card}>
        <View style={am.header}>
          <Text style={am.title}>Thêm vào hội thoại</Text>
          <TouchableOpacity onPress={onClose}><Text style={am.close}>✕</Text></TouchableOpacity>
        </View>

        <Text style={am.sectionLabel}>TÌM NGƯỜI DÙNG</Text>
        <TextInput
          style={am.searchInput}
          placeholder="Nhập tên hoặc email..."
          placeholderTextColor={C.dim}
          value={query}
          onChangeText={setQuery}
        />
        <ScrollView style={am.list}>
          {[...selectedUsers.filter((u) => !userResults.some((r) => r._id === u._id)), ...userResults].map((u) => {
            const checked = selectedUsers.some((x) => x._id === u._id);
            return (
              <TouchableOpacity key={u._id} style={am.optionRow} onPress={() => toggleUser(u)}>
                <View style={[am.checkbox, checked && am.checkboxOn]}>
                  {checked && <Text style={{ color: C.white, fontSize: 11, fontWeight: '700' }}>✓</Text>}
                </View>
                <Avatar name={u.displayName?.trim() || u.username} size="sm" />
                <Text style={am.optionName}>{u.displayName?.trim() || u.username}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {isDeviceConv && myDevices.length > 0 && (
          <>
            <Text style={am.sectionLabel}>THIẾT BỊ CỦA BẠN (kéo vào chung hội thoại này)</Text>
            <ScrollView style={am.list}>
              {myDevices.map((d) => {
                const checked = selectedDevices.some((x) => x._id === d._id);
                return (
                  <TouchableOpacity key={d._id} style={am.optionRow} onPress={() => toggleDevice(d)}>
                    <View style={[am.checkbox, checked && am.checkboxOn]}>
                      {checked && <Text style={{ color: C.white, fontSize: 11, fontWeight: '700' }}>✓</Text>}
                    </View>
                    <Avatar name={d.name} isDevice size="sm" />
                    <Text style={am.optionName}>{d.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <TouchableOpacity
          style={[am.submitBtn, (!canSubmit || submitting) && am.disabled]}
          onPress={submit}
          disabled={!canSubmit || submitting}
        >
          {submitting
            ? <ActivityIndicator color={C.white} />
            : <Text style={am.submitBtnText}>
                Thêm {selectedUsers.length + selectedDevices.length > 0 ? `(${selectedUsers.length + selectedDevices.length})` : ''}
              </Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Empty state chung ───────────────────────────────────────────────────────
function EmptyState({ icon = '💬', title = 'Chọn một mục', sub = '' }) {
  return (
    <View style={es.container}>
      <Text style={es.icon}>{icon}</Text>
      <Text style={es.title}>{title}</Text>
      {!!sub && <Text style={es.sub}>{sub}</Text>}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  chatPanel: { flex: 1, borderLeftWidth: 1, borderLeftColor: C.border },
  profileWrap: { flex: 1, borderLeftWidth: 1, borderLeftColor: C.border },
});

const r = StyleSheet.create({
  rail: {
    width: 80, backgroundColor: C.panel,
    borderRightWidth: 1, borderRightColor: C.border,
    paddingVertical: 14, alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoBox: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  logoIcon: { fontSize: 24 },

  items: { flex: 1, alignItems: 'center', gap: 6, marginTop: 8, width: '100%' },
  item: {
    width: 72, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: RADIUS.md, position: 'relative', gap: 4,
    cursor: 'pointer',
  },
  itemActive: { backgroundColor: C.accentDim },
  icon: { fontSize: 28, opacity: 0.55 },
  iconActive: { opacity: 1 },
  label: { fontSize: 12, color: C.dim, fontWeight: '600' },
  labelActive: { color: C.accentText, fontWeight: '700' },
  dot: {
    position: 'absolute', left: 0, top: 10, bottom: 10, width: 4,
    backgroundColor: C.accent, borderTopRightRadius: 2, borderBottomRightRadius: 2,
  },

  // Badge unread trên rail icon
  badge: {
    position: 'absolute',
    top: -6, right: -12,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: C.danger,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2, borderColor: C.panel,
  },
  badgeText: { color: C.white, fontSize: 10, fontWeight: '800' },

  bottom: { alignItems: 'center', paddingVertical: 10 },
  status: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger },
  statusOn: { backgroundColor: C.ok },
});

const sb = StyleSheet.create({
  sidebar: { width: 400, backgroundColor: C.panel, borderRightWidth: 1, borderRightColor: C.border },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: C.borderLight,
    backgroundColor: C.panel,
  },
  headerTitle: { fontSize: FONT.xxl, fontWeight: '800', color: C.text },

  searchBox: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.borderLight,
  },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.panel2,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14, height: 42,
  },
  searchIcon: { fontSize: 16, marginRight: 10, opacity: 0.6 },
  searchInput: { flex: 1, fontSize: FONT.base, color: C.text, outlineWidth: 0 },
  newGroupBtn: {
    backgroundColor: C.accentDim, borderRadius: RADIUS.sm,
    paddingHorizontal: 14, justifyContent: 'center',
    borderWidth: 1, borderColor: C.accent,
  },
  newGroupText: { fontSize: FONT.sm, color: C.accentText, fontWeight: '700' },

  searchResults: {
    borderBottomWidth: 1, borderBottomColor: C.borderLight,
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: C.panel2,
  },
  searchItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  searchName: { fontSize: FONT.base, fontWeight: '600', color: C.text },
  searchEmail: { fontSize: FONT.sm, color: C.dim, marginTop: 2 },
  chatBtn: { fontSize: FONT.sm, color: C.accent, fontWeight: '700' },

  convList: { flex: 1 },
  convItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 18, paddingVertical: 14,
    cursor: 'pointer',
  },
  convItemActive: { backgroundColor: C.accentDim },
  convBody: { flex: 1, overflow: 'hidden' },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  convBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  convTitle: { fontSize: FONT.lg, fontWeight: '600', color: C.text, flex: 1 },
  convTitleActive: { color: C.text, fontWeight: '700' },
  convTime: { fontSize: FONT.sm, color: C.dim, marginLeft: 10 },
  convTimeUnread: { color: C.accent, fontWeight: '700' },
  convLast: { flex: 1, fontSize: FONT.base, color: C.dim },
  convLastUnread: { color: C.text, fontWeight: '600' },

  // Unread badge on conv item
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: C.accent,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: { color: C.white, fontSize: 11, fontWeight: '800' },

  emptyBox: { alignItems: 'center', paddingTop: 50, gap: 12, padding: 24 },
  emptyIcon: { fontSize: 48, opacity: 0.5 },
  emptyText: { fontSize: FONT.base, color: C.dim, textAlign: 'center' },
});

const ds = StyleSheet.create({
  addBtn: {
    backgroundColor: C.accent, borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { color: C.white, fontSize: FONT.sm, fontWeight: '700' },

  emptyAddBtn: {
    marginTop: 14, backgroundColor: C.accent, borderRadius: RADIUS.full,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  emptyAddBtnText: { color: C.white, fontWeight: '700', fontSize: FONT.base },

  devItem: { padding: 14 },
  devItemActive: { backgroundColor: C.accentDim },
  devItemRevoked: { opacity: 0.55 },
  devMain: { flexDirection: 'row', alignItems: 'center', gap: 14, cursor: 'pointer' },
  devIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.deviceBg, borderWidth: 1, borderColor: C.deviceBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  devNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  devName: { flex: 1, fontSize: FONT.lg, fontWeight: '600', color: C.text },
  devNameActive: { color: C.text, fontWeight: '700' },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full, borderWidth: 1 },
  pillOk: { backgroundColor: '#EFFDF3', borderColor: C.ok },
  pillOff: { backgroundColor: '#FEF2F2', borderColor: C.danger },
  pillText: { fontSize: 10, fontWeight: '800' },
  pillTextOk: { color: '#15803D' },
  pillTextOff: { color: '#B91C1C' },
  devMeta: { fontSize: FONT.sm, color: C.dim, marginTop: 4 },

  devActions: { flexDirection: 'row', gap: 6, marginTop: 10, justifyContent: 'flex-end' },
  actBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.panel2, cursor: 'pointer',
  },
  actIcon: { fontSize: 14 },
});

const cg = StyleSheet.create({
  wrap: {
    margin: 10, backgroundColor: C.panel2, borderRadius: RADIUS.md,
    padding: 14, borderWidth: 1, borderColor: C.border, ...SHADOW.sm,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: FONT.base, fontWeight: '700', color: C.text },
  close: { fontSize: FONT.base, color: C.dim, padding: 4, cursor: 'pointer' },
  nameInput: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: FONT.base, color: C.text, marginBottom: 10, outlineWidth: 0,
  },
  hint: { fontSize: FONT.sm, color: C.dim, marginBottom: 10, lineHeight: 18 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, cursor: 'pointer' },
  uname: { flex: 1, fontSize: FONT.base, color: C.text },
  check: { fontSize: FONT.base, color: C.accent, fontWeight: '700' },
  selectedInfo: { fontSize: FONT.sm, color: C.accentText, marginVertical: 8 },
  createBtn: {
    backgroundColor: C.accent, borderRadius: RADIUS.sm,
    paddingVertical: 11, alignItems: 'center', marginTop: 6, cursor: 'pointer',
  },
  disabled: { opacity: 0.5 },
  createText: { color: C.white, fontWeight: '700', fontSize: FONT.base },
  warnBox: {
    backgroundColor: '#FFFBEB', borderRadius: RADIUS.sm, padding: 10,
    marginBottom: 10, borderWidth: 1, borderColor: C.deviceBorder,
  },
  warnText: { fontSize: FONT.sm, color: '#92400E', fontWeight: '500' },
  keyBox: {
    backgroundColor: C.panel, borderRadius: RADIUS.sm, padding: 12,
    borderWidth: 1, borderColor: C.border,
  },
  keyText: { fontSize: FONT.sm, color: C.text, fontFamily: 'monospace' },
});

const cp = StyleSheet.create({
  container: { flex: 1, flexDirection: 'column', backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, height: 72,
    backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerInfo: { flex: 1, minWidth: 0 },
  headerName: { fontSize: FONT.xl, fontWeight: '700', color: C.text },
  headerType: { fontSize: FONT.sm, color: C.dim, marginTop: 3 },

  loadOlder: { alignItems: 'center', padding: 10, backgroundColor: C.panel },
  loadOlderText: { fontSize: FONT.base, color: C.accent },

  msgList: { paddingHorizontal: 28, paddingVertical: 18 },

  inputArea: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.panel, borderTopWidth: 1, borderTopColor: C.border,
  },
  emojiBtn: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center',
    cursor: 'pointer',
  },
  emojiBtnActive: { backgroundColor: C.accentDim },
  emojiIcon: { fontSize: 24 },
  inputWrap: {
    flex: 1, backgroundColor: C.panel2,
    borderRadius: RADIUS.full, paddingHorizontal: 18, paddingVertical: 12, maxHeight: 130,
  },
  input: { fontSize: FONT.md, color: C.text, minHeight: 24, maxHeight: 110, outlineWidth: 0 },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center', ...SHADOW.sm,
  },
  sendBtnOff: { backgroundColor: C.panel2 },

  infoBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
  },
  infoBtnActive: { backgroundColor: C.accentDim },

  replyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: C.panel2, borderRadius: RADIUS.md,
    borderLeftWidth: 3, borderLeftColor: C.accent,
  },
  replyBarName: { fontSize: FONT.xs, fontWeight: '700', color: C.accentText },
  replyBarText: { fontSize: FONT.xs, color: C.dim, marginTop: 1 },

  mentionBox: {
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: C.panel, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border, ...SHADOW.md,
    maxHeight: 220, overflow: 'hidden',
  },
  mentionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, cursor: 'pointer',
  },
  mentionItemText: { fontSize: FONT.sm, color: C.text, fontWeight: '600' },
});

// Emoji picker styles
const emp = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999,
  },
  panel: {
    position: 'absolute',
    bottom: 82, left: 16,
    width: 380,
    backgroundColor: C.panel,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border,
    padding: 10,
    zIndex: 1000,
    ...SHADOW.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '10%', // 10 emoji mỗi hàng
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.sm,
    cursor: 'pointer',
  },
  emoji: { fontSize: 22 },
});

const es = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 48 },
  icon: { fontSize: 72, opacity: 0.6 },
  title: { fontSize: FONT.xxl, fontWeight: '700', color: C.text },
  sub: { fontSize: FONT.md, color: C.dim, textAlign: 'center', maxWidth: 400 },
});

const p = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 40, alignItems: 'center' },
  card: {
    width: '100%', maxWidth: 560,
    backgroundColor: C.panel, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: C.border, ...SHADOW.md,
    overflow: 'hidden',
  },
  topCard: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20,
    backgroundColor: C.panel, gap: 8,
    borderBottomWidth: 1, borderBottomColor: C.borderLight,
  },
  username: { fontSize: FONT.xl, fontWeight: '700', color: C.text, marginTop: 10 },
  typeBadge: {
    backgroundColor: C.accentDim,
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.accent,
  },
  typeBadgeText: { fontSize: FONT.xs, fontWeight: '600', color: C.accentText },
  section: { padding: 20, gap: 8 },
  sectionLabel: { fontSize: FONT.xs, fontWeight: '700', color: C.dim, letterSpacing: 1, marginBottom: 8 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.panel2, padding: 12,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border,
    marginBottom: 6,
  },
  infoLabel: { fontSize: FONT.sm, color: C.dim, fontWeight: '500' },
  infoValue: { fontSize: FONT.sm, color: C.text, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  fieldLabel: { fontSize: FONT.xs, color: C.dim, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: C.panel2, borderRadius: RADIUS.md,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: FONT.base, color: C.text,
    borderWidth: 1, borderColor: C.border, outlineWidth: 0,
  },
  primaryBtn: {
    backgroundColor: C.accent, borderRadius: RADIUS.md,
    paddingVertical: 12, alignItems: 'center', marginHorizontal: 20, marginBottom: 20,
    cursor: 'pointer', ...SHADOW.sm,
  },
  primaryBtnText: { color: C.white, fontSize: FONT.base, fontWeight: '700' },
  ghostBtn: {
    borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 20,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.panel, cursor: 'pointer',
  },
  ghostBtnText: { color: C.text, fontSize: FONT.base, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  rowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.panel2, padding: 14,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border,
    marginBottom: 8, cursor: 'pointer',
  },
  rowBtnDanger: { borderColor: '#FECACA', backgroundColor: '#FFFBFB' },
  rowBtnIcon: { fontSize: 20 },
  rowBtnText: { fontSize: FONT.base, fontWeight: '600', color: C.text },
  rowBtnSub: { fontSize: FONT.xs, color: C.dim, marginTop: 2 },
  rowBtnChev: { fontSize: FONT.lg, color: C.dim },
  appVersion: { marginTop: 16, fontSize: FONT.xs, color: C.dim, opacity: 0.6 },
});

// ─── Styles: toggle "Tạo mới / Ghép vào hub" trong AddDeviceInline ───────────
const adm = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.panel2,
    alignItems: 'center', cursor: 'pointer',
  },
  modeBtnActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  modeBtnText: { fontSize: FONT.xs, fontWeight: '600', color: C.dim },
  modeBtnTextActive: { color: C.accentText },
  emptyHubText: { fontSize: FONT.sm, color: C.dim, marginBottom: 10 },
  hubList: { maxHeight: 160, marginBottom: 10 },
  hubItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.panel, marginBottom: 6, cursor: 'pointer',
  },
  hubItemActive: { borderColor: C.accent, backgroundColor: C.accentDim },
  hubName: { fontSize: FONT.sm, fontWeight: '600', color: C.text },
  hubMeta: { fontSize: FONT.xs, color: C.dim, marginTop: 1 },
});

// ─── Styles: Panel thông tin hội thoại bên phải (members / leave / media) ────
const rpnl = StyleSheet.create({
  container: { width: 320, borderLeftWidth: 1, borderLeftColor: C.border, backgroundColor: C.panel, flexDirection: 'column' },
  header: {
    height: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: FONT.lg, fontWeight: '700', color: C.text },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', cursor: 'pointer' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText: { fontSize: FONT.sm, color: C.dim, fontWeight: '600' },
  tabTextActive: { color: C.accentText },

  addMemberBtn: {
    margin: 12, padding: 10, borderRadius: RADIUS.md,
    backgroundColor: C.accentDim, alignItems: 'center', cursor: 'pointer',
  },
  addMemberText: { color: C.accentText, fontWeight: '700', fontSize: FONT.sm },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  memberName: { fontSize: FONT.sm, color: C.text, fontWeight: '600' },
  adminTag: { fontSize: FONT.xs, color: C.accentText, marginTop: 1 },

  leaveBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    margin: 14, padding: 12, borderRadius: RADIUS.md,
    backgroundColor: '#FFFBFB', borderWidth: 1, borderColor: '#FECACA',
    cursor: 'pointer',
  },
  leaveText: { color: C.danger, fontWeight: '700', fontSize: FONT.sm },

  mediaSubTabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 10 },
  mediaSubBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full,
    backgroundColor: C.panel2, cursor: 'pointer',
  },
  mediaSubBtnActive: { backgroundColor: C.accent },
  mediaSubText: { fontSize: FONT.xs, fontWeight: '600', color: C.dim },
  mediaSubTextActive: { color: C.white },

  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12 },
  imageThumb: { width: 88, height: 88, borderRadius: RADIUS.sm, backgroundColor: C.panel2 },

  mediaFileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight,
  },
  mediaFileIcon: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: C.accentDim,
    justifyContent: 'center', alignItems: 'center',
  },
  mediaFileName: { fontSize: FONT.sm, color: C.text, fontWeight: '600' },
  mediaFileMeta: { fontSize: FONT.xs, color: C.dim, marginTop: 1 },

  mediaLinkRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  mediaLinkUrl: { fontSize: FONT.sm, color: C.accentText, fontWeight: '600' },
  mediaLinkMeta: { fontSize: FONT.xs, color: C.dim, marginTop: 2 },

  emptyMedia: { padding: 30, alignItems: 'center' },
  emptyMediaText: { fontSize: FONT.sm, color: C.dim, marginTop: 8 },
});

// ─── Styles: Inline "Thêm thành viên/thiết bị" trong RightPanel ─────────────
const am = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', zIndex: 50,
  },
  card: {
    width: 340, maxHeight: 480, backgroundColor: C.panel, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: C.border, ...SHADOW.md, padding: 16, overflow: 'hidden',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: FONT.lg, fontWeight: '700', color: C.text },
  close: { fontSize: 18, color: C.dim, cursor: 'pointer' },
  sectionLabel: { fontSize: FONT.xs, fontWeight: '700', color: C.dim, marginTop: 10, marginBottom: 6, letterSpacing: 0.5 },
  searchInput: {
    backgroundColor: C.panel2, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: FONT.sm, color: C.text, borderWidth: 1, borderColor: C.border, outlineWidth: 0,
  },
  list: { maxHeight: 140 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7, paddingHorizontal: 4, cursor: 'pointer',
  },
  optionName: { fontSize: FONT.sm, color: C.text, fontWeight: '600' },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center', backgroundColor: C.panel,
  },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  submitBtn: {
    marginTop: 14, backgroundColor: C.accent, borderRadius: RADIUS.md,
    paddingVertical: 11, alignItems: 'center', cursor: 'pointer',
  },
  submitBtnText: { color: C.white, fontWeight: '700', fontSize: FONT.sm },
  disabled: { opacity: 0.5 },
});