import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert, Modal, ScrollView, Platform,
} from 'react-native';
import { deviceApi } from '../api';
import { Icon } from '../utils/icons';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

// Man hinh quan ly thiet bi ESP32:
// - List thiet bi cua user
// - Them thiet bi moi -> nhan API key (chi hien 1 lan)
// - Thu hoi thiet bi
// - Tao lai API key
// - Mo chat cua thiet bi

export default function DevicesScreen({ navigation }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  // shownKey = { title, apiKey } - hien mot lan sau khi tao/regen
  const [shownKey, setShownKey] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await deviceApi.listMine();
      setDevices(data);
    } catch (err) {
      console.error('DevicesScreen load:', err);
      Alert.alert('Lỗi', err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  const handleCreate = async (name) => {
    try {
      const { data } = await deviceApi.register(name);
      setShownKey({ title: `Thiết bị "${data.device.name}" đã tạo`, apiKey: data.apiKey });
      setShowAdd(false);
      load();
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message || err.message);
    }
  };

  const handleRevoke = (device) => {
    const doRevoke = async () => {
      try {
        await deviceApi.revoke(device._id);
        load();
      } catch (err) {
        Alert.alert('Lỗi', err.response?.data?.message || err.message);
      }
    };
    Alert.alert(
      'Thu hồi thiết bị?',
      `${device.name} sẽ không gửi được tin nhắn nữa cho tới khi bạn cấp lại quyền.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Thu hồi', style: 'destructive', onPress: doRevoke },
      ]
    );
  };

  const handleRegenerate = (device) => {
    const doRegen = async () => {
      try {
        const { data } = await deviceApi.regenerateKey(device._id);
        setShownKey({ title: `API key mới cho "${device.name}"`, apiKey: data.apiKey });
        load();
      } catch (err) {
        Alert.alert('Lỗi', err.response?.data?.message || err.message);
      }
    };
    Alert.alert(
      'Tạo lại API key?',
      `Key cũ sẽ ngừng hoạt động. Bạn phải cập nhật key mới lên ESP32.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Tạo lại', onPress: doRegen },
      ]
    );
  };

  const openChat = (device) => {
    // conversationId co the la ObjectId hoac object da populate
    const convId = device.conversationId?._id || device.conversationId;
    navigation.navigate('Chat', {
      conversationId: convId,
      title: device.name,
      convType: 'device',
    });
  };

  const renderItem = ({ item }) => (
    <DeviceCard
      device={item}
      onChat={() => openChat(item)}
      onRevoke={() => handleRevoke(item)}
      onRegenerate={() => handleRegenerate(item)}
    />
  );

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Thiết bị</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={s.addBtnPlus}>+</Text>
          <Text style={s.addBtnText}>Thêm</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} /></View>
      ) : devices.length === 0 ? (
        <ScrollView contentContainerStyle={s.emptyWrap}>
          <Text style={s.emptyIcon}>⚡</Text>
          <Text style={s.emptyTitle}>Chưa có thiết bị nào</Text>
          <Text style={s.emptySub}>
            Đăng ký một ESP32 để bắt đầu nhận dữ liệu.{"\n"}
            Sau khi tạo, bạn sẽ được cấp API key để nạp vào firmware.
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setShowAdd(true)}>
            <Text style={s.emptyBtnText}>+ Thêm thiết bị đầu tiên</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      {/* Modal them thiet bi */}
      <AddDeviceModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onCreate={handleCreate}
      />

      {/* Modal hien API key (sau khi tao/regen) */}
      <ShowKeyModal
        visible={!!shownKey}
        title={shownKey?.title}
        apiKey={shownKey?.apiKey}
        onClose={() => setShownKey(null)}
      />
    </View>
  );
}

// ─── Device Card ────────────────────────────────────────────────────────────
function DeviceCard({ device, onChat, onRevoke, onRegenerate }) {
  const lastSeen = device.lastSeenAt
    ? new Date(device.lastSeenAt).toLocaleString('vi-VN')
    : 'Chưa kết nối lần nào';

  return (
    <View style={[c.card, !device.isActive && c.cardRevoked]}>
      <View style={c.topRow}>
        <View style={c.iconWrap}>
          <Text style={c.icon}>⚡</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={c.nameRow}>
            <Text style={c.name}>{device.name}</Text>
            <View style={[c.badge, device.isActive ? c.badgeActive : c.badgeRevoked]}>
              <Text style={[c.badgeText, device.isActive ? c.badgeTextActive : c.badgeTextRevoked]}>
                {device.isActive ? 'Hoạt động' : 'Đã thu hồi'}
              </Text>
            </View>
          </View>
          <Text style={c.meta}>Lần cuối online: {lastSeen}</Text>
        </View>
      </View>

      <View style={c.actions}>
        <TouchableOpacity style={c.actBtn} onPress={onChat}>
          <Text style={c.actIcon}>💬</Text>
          <Text style={c.actText}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity style={c.actBtn} onPress={onRegenerate}>
          <Text style={c.actIcon}>🔄</Text>
          <Text style={c.actText}>Tạo key mới</Text>
        </TouchableOpacity>

        {device.isActive && (
          <TouchableOpacity style={[c.actBtn, c.actBtnDanger]} onPress={onRevoke}>
            <Text style={c.actIcon}>🚫</Text>
            <Text style={[c.actText, c.actTextDanger]}>Thu hồi</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Add Device Modal ───────────────────────────────────────────────────────
function AddDeviceModal({ visible, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (n.length < 2) {
      Alert.alert('Lỗi', 'Tên thiết bị phải từ 2 ký tự trở lên');
      return;
    }
    setCreating(true);
    await onCreate(n);
    setCreating(false);
    setName('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.backdrop}>
        <View style={m.card}>
          <View style={m.head}>
            <Text style={m.title}>Thêm thiết bị mới</Text>
            <TouchableOpacity onPress={onClose}><Text style={m.close}>✕</Text></TouchableOpacity>
          </View>

          <Text style={m.label}>Tên thiết bị</Text>
          <TextInput
            style={m.input}
            value={name}
            onChangeText={setName}
            placeholder="VD: ESP32 phòng khách"
            placeholderTextColor={C.dim}
            autoFocus
            maxLength={50}
          />
          <Text style={m.hint}>
            Sau khi tạo, bạn sẽ nhận được một API key. Hãy sao chép và nạp vào firmware ESP32 — key chỉ hiện MỘT lần.
          </Text>

          <View style={m.btnRow}>
            <TouchableOpacity style={m.btnGhost} onPress={onClose}>
              <Text style={m.btnGhostText}>Huỷ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.btnPrimary, (!name.trim() || creating) && m.btnDisabled]}
              onPress={submit}
              disabled={!name.trim() || creating}
            >
              {creating ? <ActivityIndicator color={C.white} /> : <Text style={m.btnPrimaryText}>Tạo</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Show Key Modal ─────────────────────────────────────────────────────────
function ShowKeyModal({ visible, title, apiKey, onClose }) {
  const copyKey = () => {
    // Tren web dung Clipboard API; tren native se can @react-native-clipboard/clipboard
    // De giu don gian, chi ho tro web copy
    if (Platform.OS === 'web' && apiKey) {
      navigator.clipboard?.writeText(apiKey).then(
        () => Alert.alert('Đã sao chép', 'API key đã được sao chép vào clipboard.'),
        () => {}
      );
    } else {
      // Tren mobile: hien noi dung de user copy thu cong
      Alert.alert('API Key', apiKey);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.backdrop}>
        <View style={m.card}>
          <View style={m.head}>
            <Text style={m.title}>{title || 'API key'}</Text>
          </View>

          <View style={k.warnBox}>
            <Text style={k.warnText}>⚠ Lưu key này ngay — bạn sẽ không thấy lại sau khi đóng cửa sổ.</Text>
          </View>

          <Text style={m.label}>API Key</Text>
          <View style={k.keyBox}>
            <Text selectable style={k.keyText}>{apiKey}</Text>
          </View>

          <View style={m.btnRow}>
            <TouchableOpacity style={m.btnGhost} onPress={copyKey}>
              <Text style={m.btnGhostText}>📋 Sao chép</Text>
            </TouchableOpacity>
            <TouchableOpacity style={m.btnPrimary} onPress={onClose}>
              <Text style={m.btnPrimaryText}>Đã lưu, đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: FONT.xl, fontWeight: '800', color: C.text },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.accent,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, ...SHADOW.sm,
  },
  addBtnPlus: { color: C.white, fontSize: FONT.md, fontWeight: '700' },
  addBtnText: { color: C.white, fontSize: FONT.sm, fontWeight: '600' },

  list: { padding: 12, gap: 10 },

  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: C.text },
  emptySub: { fontSize: FONT.sm, color: C.dim, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 6,
    backgroundColor: C.accent, borderRadius: RADIUS.full,
    paddingHorizontal: 20, paddingVertical: 10, ...SHADOW.sm,
  },
  emptyBtnText: { color: C.white, fontWeight: '700', fontSize: FONT.base },
});

const c = StyleSheet.create({
  card: {
    backgroundColor: C.panel, borderRadius: RADIUS.md, padding: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 10, ...SHADOW.sm,
  },
  cardRevoked: { opacity: 0.65 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.deviceBg, borderWidth: 1, borderColor: C.deviceBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  icon: { fontSize: 22 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: FONT.md, fontWeight: '700', color: C.text },
  badge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  badgeActive: { backgroundColor: '#EFFDF3', borderColor: C.ok },
  badgeRevoked: { backgroundColor: '#FEF2F2', borderColor: C.danger },
  badgeText: { fontSize: FONT.xs, fontWeight: '700' },
  badgeTextActive: { color: '#15803D' },
  badgeTextRevoked: { color: '#B91C1C' },
  meta: { fontSize: FONT.xs, color: C.dim, marginTop: 4 },

  actions: {
    flexDirection: 'row', gap: 8, marginTop: 12,
    borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10,
  },
  actBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: C.panel2, borderRadius: RADIUS.sm,
    paddingVertical: 8, borderWidth: 1, borderColor: C.border,
  },
  actBtnDanger: { backgroundColor: '#FEF2F2', borderColor: C.danger },
  actIcon: { fontSize: 14 },
  actText: { fontSize: FONT.xs, color: C.text, fontWeight: '600' },
  actTextDanger: { color: C.danger },
});

const m = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  card: {
    width: '100%', maxWidth: 420,
    backgroundColor: C.panel, borderRadius: RADIUS.md, padding: 18, ...SHADOW.md,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: FONT.lg, fontWeight: '700', color: C.text },
  close: { fontSize: FONT.lg, color: C.dim, padding: 4 },
  label: { fontSize: FONT.xs, fontWeight: '600', color: C.dim, marginBottom: 6, letterSpacing: 0.5 },
  input: {
    backgroundColor: C.panel2, borderRadius: RADIUS.sm,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: FONT.base, color: C.text, borderWidth: 1, borderColor: C.border,
  },
  hint: { fontSize: FONT.xs, color: C.dim, marginTop: 8, lineHeight: 18 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 16, justifyContent: 'flex-end' },
  btnGhost: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border,
  },
  btnGhostText: { color: C.text, fontWeight: '600', fontSize: FONT.sm },
  btnPrimary: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: RADIUS.sm, backgroundColor: C.accent,
  },
  btnPrimaryText: { color: C.white, fontWeight: '700', fontSize: FONT.sm },
  btnDisabled: { opacity: 0.5 },
});

const k = StyleSheet.create({
  warnBox: {
    backgroundColor: '#FFFBEB', borderRadius: RADIUS.sm,
    padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: C.deviceBorder,
  },
  warnText: { fontSize: FONT.sm, color: '#92400E', fontWeight: '500' },
  keyBox: {
    backgroundColor: C.panel2, borderRadius: RADIUS.sm,
    padding: 12, borderWidth: 1, borderColor: C.border,
  },
  keyText: {
    fontSize: FONT.sm, color: C.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});