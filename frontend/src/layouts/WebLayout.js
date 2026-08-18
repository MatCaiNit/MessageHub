import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useConversations } from '../hooks/useConversations';
import { useMessages } from '../hooks/useMessages';
import { useTyping } from '../hooks/useTyping';
import { conversationApi, userApi, deviceApi, authApi } from '../api';
import client from '../api/client';
import Avatar from '../components/Avatar';
import MessageBubble from '../components/MessageBubble';
import TypingIndicator from '../components/TypingIndicator';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

// ─── Layout gốc ──────────────────────────────────────────────────────────────
export default function WebLayout() {
  const { me, logout } = useAuth();
  const { connected } = useSocket();

  const [tab, setTab] = useState('chat');
  const [activeConv, setActiveConv] = useState(null); // { _id, name, type }

  const switchTab = (newTab) => {
    if (newTab !== tab) setActiveConv(null);
    setTab(newTab);
  };

  return (
    <View style={s.root}>
      <Rail active={tab} onChange={switchTab} connected={connected} onLogout={logout} me={me} />

      {tab === 'chat' && (
        <>
          <Sidebar
            me={me}
            activeConvId={activeConv?._id}
            onSelectConv={setActiveConv}
          />
          <View style={s.chatPanel}>
            {activeConv
              ? <ChatPanel conv={activeConv} me={me} />
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
            onSelectDevice={(device) => setActiveConv({
              _id: device.conversationId?._id || device.conversationId,
              name: device.name,
              type: 'device',
            })}
          />
          <View style={s.chatPanel}>
            {activeConv
              ? <ChatPanel conv={activeConv} me={me} />
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

// ─── Rail dọc trái ───────────────────────────────────────────────────────────
function Rail({ active, onChange, connected, onLogout, me }) {
  const items = [
    { id: 'chat',    icon: '🗪', label: 'Tin nhắn' },
    { id: 'devices', icon: '🛎', label: 'Thiết bị' },
    { id: 'profile', icon: '👤', label: 'Cá nhân'  },
  ];

  return (
    <View style={r.rail}>
      <View style={r.logoBox}>
        <Text style={r.logoIcon}>🗪</Text>
      </View>

      <View style={r.items}>
        {items.map((it) => {
          const isActive = it.id === active;
          return (
            <TouchableOpacity
              key={it.id}
              style={[r.item, isActive && r.itemActive]}
              onPress={() => onChange(it.id)}
              title={it.label}
            >
              <Text style={[r.icon, isActive && r.iconActive]}>{it.icon}</Text>
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

// ─── Sidebar Messages (giữ nguyên logic cũ) ─────────────────────────────────
function Sidebar({ me, activeConvId, onSelectConv }) {
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
          <Text style={sb.searchIcon}>🔎︎</Text>
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

// ─── Sidebar Devices ─────────────────────────────────────────────────────────
function DevicesSidebar({ activeConvId, onSelectDevice }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [shownKey, setShownKey] = useState(null); // { title, apiKey }

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

  const handleCreate = async (name) => {
    try {
      const { data } = await deviceApi.register(name);
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
          <Text style={sb.emptyIcon}>╮ (. ❛ ᴗ ❛.) ╭</Text>
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
                    <Text style={{ fontSize: 18 }}>⚡</Text>
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
                    <Text style={ds.actIcon}>🔄</Text>
                  </TouchableOpacity>
                  {d.isActive && (
                    <TouchableOpacity style={ds.actBtn} onPress={() => handleRevoke(d)} title="Thu hồi">
                      <Text style={ds.actIcon}>🚫</Text>
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

// ─── Panel Profile (web) ─────────────────────────────────────────────────────
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
              <Text style={p.rowBtnIcon}>➜]</Text>
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

  const submit = async () => {
    if (name.trim().length < 2) { window.alert('Tên phải từ 2 ký tự'); return; }
    setLoading(true);
    await onCreate(name.trim());
    setLoading(false);
    setName('');
  };

  return (
    <View style={cg.wrap}>
      <View style={cg.header}>
        <Text style={cg.title}>Thêm thiết bị mới</Text>
        <TouchableOpacity onPress={onClose}><Text style={cg.close}>✕</Text></TouchableOpacity>
      </View>
      <TextInput style={cg.nameInput} placeholder="VD: ESP32 phòng khách"
        placeholderTextColor={C.dim} value={name} onChangeText={setName} autoFocus />
      <Text style={cg.hint}>Sau khi tạo, bạn sẽ nhận API key — chỉ hiện MỘT lần, hãy sao lưu ngay.</Text>
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
          <Text style={[cg.createText, { color: C.text }]}>📋 Sao chép</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cg.createBtn, { flex: 1 }]} onPress={onClose}>
          <Text style={cg.createText}>Đóng</Text>
        </TouchableOpacity>
      </View>
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
      <View style={cp.header}>
        <Avatar name={conv.name} isDevice={conv.type === 'device'} size="sm" />
        <View style={cp.headerInfo}>
          <Text style={cp.headerName}>{conv.name}</Text>
          <Text style={cp.headerType}>
            {conv.type === 'device' ? '⚡ Thiết bị' : conv.type === 'group' ? '👥 Nhóm' : '● Đang hoạt động'}
          </Text>
        </View>
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
            />
          );
        }}
      />

      <TypingIndicator text={typingText} />

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

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  chatPanel: { flex: 1, borderLeftWidth: 1, borderLeftColor: C.border },
  profileWrap: { flex: 1, borderLeftWidth: 1, borderLeftColor: C.border },
});

const r = StyleSheet.create({
  rail: {
    width: 72, backgroundColor: C.panel,
    borderRightWidth: 1, borderRightColor: C.border,
    paddingVertical: 12, alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoBox: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  logoIcon: { fontSize: 20 },

  items: { flex: 1, alignItems: 'center', gap: 4, marginTop: 6 },
  item: {
    width: 60, paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
    borderRadius: RADIUS.md, position: 'relative', gap: 2,
    cursor: 'pointer',
  },
  itemActive: { backgroundColor: C.accentDim },
  icon: { fontSize: 22, opacity: 0.55 },
  iconActive: { opacity: 1 },
  label: { fontSize: 10, color: C.dim, fontWeight: '600' },
  labelActive: { color: C.accentText },
  dot: {
    position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
    backgroundColor: C.accent, borderTopRightRadius: 2, borderBottomRightRadius: 2,
  },

  bottom: { alignItems: 'center', paddingVertical: 8 },
  status: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
  statusOn: { backgroundColor: C.ok },
});

const sb = StyleSheet.create({
  sidebar: { width: 300, backgroundColor: C.panel, borderRightWidth: 1, borderRightColor: C.border },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel,
  },
  headerTitle: { fontSize: FONT.lg, fontWeight: '800', color: C.text },

  searchBox: { flexDirection: 'row', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.panel2, borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.border,
  },
  searchIcon: { fontSize: 12, marginRight: 6 },
  searchInput: { flex: 1, fontSize: FONT.sm, color: C.text, outlineWidth: 0 },
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
  emptyBox: { alignItems: 'center', paddingTop: 40, gap: 8, padding: 20 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: FONT.sm, color: C.dim, textAlign: 'center' },
});

const ds = StyleSheet.create({
  addBtn: {
    backgroundColor: C.accent, borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  addBtnText: { color: C.white, fontSize: FONT.xs, fontWeight: '700' },

  emptyAddBtn: {
    marginTop: 12, backgroundColor: C.accent, borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  emptyAddBtnText: { color: C.white, fontWeight: '700', fontSize: FONT.sm },

  devItem: {
    padding: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight,
  },
  devItemActive: { backgroundColor: C.accentDim },
  devItemRevoked: { opacity: 0.55 },
  devMain: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    cursor: 'pointer',
  },
  devIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.deviceBg, borderWidth: 1, borderColor: C.deviceBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  devNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  devName: { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: C.text },
  devNameActive: { color: C.accentText },
  pill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: RADIUS.full, borderWidth: 1 },
  pillOk: { backgroundColor: '#EFFDF3', borderColor: C.ok },
  pillOff: { backgroundColor: '#FEF2F2', borderColor: C.danger },
  pillText: { fontSize: 9, fontWeight: '800' },
  pillTextOk: { color: '#15803D' },
  pillTextOff: { color: '#B91C1C' },
  devMeta: { fontSize: FONT.xs, color: C.dim, marginTop: 2 },

  devActions: { flexDirection: 'row', gap: 4, marginTop: 8, justifyContent: 'flex-end' },
  actBtn: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.panel2, cursor: 'pointer',
  },
  actIcon: { fontSize: 12 },
});

const cg = StyleSheet.create({
  wrap: {
    margin: 8, backgroundColor: C.panel2, borderRadius: RADIUS.md,
    padding: 12, borderWidth: 1, borderColor: C.border, ...SHADOW.sm,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: FONT.sm, fontWeight: '700', color: C.text },
  close: { fontSize: FONT.sm, color: C.dim, padding: 4, cursor: 'pointer' },
  nameInput: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: FONT.sm, color: C.text, marginBottom: 8, outlineWidth: 0,
  },
  hint: { fontSize: FONT.xs, color: C.dim, marginBottom: 8, lineHeight: 16 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, cursor: 'pointer' },
  uname: { flex: 1, fontSize: FONT.sm, color: C.text },
  check: { fontSize: FONT.sm, color: C.accent, fontWeight: '700' },
  selectedInfo: { fontSize: FONT.xs, color: C.accentText, marginVertical: 6 },
  createBtn: {
    backgroundColor: C.accent, borderRadius: RADIUS.sm,
    paddingVertical: 9, alignItems: 'center', marginTop: 4, cursor: 'pointer',
  },
  disabled: { opacity: 0.5 },
  createText: { color: C.white, fontWeight: '700', fontSize: FONT.sm },
  warnBox: {
    backgroundColor: '#FFFBEB', borderRadius: RADIUS.sm, padding: 8,
    marginBottom: 8, borderWidth: 1, borderColor: C.deviceBorder,
  },
  warnText: { fontSize: FONT.xs, color: '#92400E', fontWeight: '500' },
  keyBox: {
    backgroundColor: C.panel, borderRadius: RADIUS.sm, padding: 10,
    borderWidth: 1, borderColor: C.border,
  },
  keyText: {
    fontSize: FONT.xs, color: C.text, fontFamily: 'monospace',
  },
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
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 30 },
  icon: { fontSize: 56 },
  title: { fontSize: FONT.xl, fontWeight: '700', color: C.text },
  sub: { fontSize: FONT.base, color: C.dim, textAlign: 'center', maxWidth: 320 },
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
  sectionLabel: {
    fontSize: FONT.xs, fontWeight: '700', color: C.dim,
    letterSpacing: 1, marginBottom: 8,
  },

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

  appVersion: {
    marginTop: 16, fontSize: FONT.xs, color: C.dim, opacity: 0.6,
  },
});