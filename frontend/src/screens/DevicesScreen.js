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
// - MOI: bat/tat tung dau ra (output) cua thiet bi ngay tren card

// Nhan icon dang text cho tung loai output, giu dong bo voi kieu emoji da
// dung san trong man hinh nay (⚡ 💬 🔄 🚫), khong them thu vien icon moi.
const OUTPUT_ICON = { led: '💡', relay: '🔌', buzzer: '🔔', other: '⚙️' };

export default function DevicesScreen({ navigation }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  // shownKey = { title, apiKey, deviceId } - hien mot lan sau khi tao/regen.
  // deviceId chi co khi tao moi (regenerate-key khong tra ve, vi _id khong doi).
  const [shownKey, setShownKey] = useState(null);

  // Khoa theo `${deviceId}:${outputId}` de hai dau ra cua cung mot thiet bi
  // khong chan nhau khi dang cho xac nhan tu server
  const [pendingKeys, setPendingKeys] = useState([]);

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
      setShownKey({
        title: `Thiết bị "${data.device.name}" đã tạo`,
        apiKey: data.apiKey,
        deviceId: data.device._id,
      });
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

  // ─── MOI: bat/tat 1 output cu the cua 1 thiet bi ───────────────────────────
  const keyOf = (deviceId, outputId) => `${deviceId}:${outputId}`;

  const patchOutput = (deviceId, outputId, state) => {
    setDevices((prev) =>
      prev.map((d) =>
        d._id !== deviceId
          ? d
          : {
              ...d,
              outputs: (d.outputs || []).map((o) =>
                o.outputId === outputId ? { ...o, state } : o
              ),
            }
      )
    );
  };

  const handleToggle = async (device, output) => {
    const key = keyOf(device._id, output.outputId);
    if (pendingKeys.includes(key)) return; // dang cho, bo qua bam lien tuc

    const next = !output.state;
    const previous = output.state;

    // 1. Cap nhat lac quan de nut phan hoi ngay
    patchOutput(device._id, output.outputId, next);
    setPendingKeys((prev) => [...prev, key]);

    try {
      await deviceApi.sendCommand(device._id, output.outputId, next);
    } catch (err) {
      // Gui lenh that bai -> tra UI ve trang thai cu
      patchOutput(device._id, output.outputId, previous);
      setPendingKeys((prev) => prev.filter((k) => k !== key));
      Alert.alert('Lỗi', `Không gửi được lệnh tới ${output.label || output.outputId}`);
      return;
    }

    // 2. ESP32 poll lệnh mỗi vài giây rồi mới notify lại thực tế. Sau 8s đối
    //    chiếu với trạng thái thật trong DB; lệch thì lấy theo DB.
    setTimeout(async () => {
      try {
        const { data } = await deviceApi.getOne(device._id);
        const real = data.outputs?.find((o) => o.outputId === output.outputId);
        if (real) patchOutput(device._id, output.outputId, real.state);
      } catch (_) {
        // im lặng, lần refresh danh sách kế tiếp sẽ đồng bộ lại
      } finally {
        setPendingKeys((prev) => prev.filter((k) => k !== key));
      }
    }, 8000);
  };

  const renderItem = ({ item }) => (
    <DeviceCard
      device={item}
      onChat={() => openChat(item)}
      onRevoke={() => handleRevoke(item)}
      onRegenerate={() => handleRegenerate(item)}
      pendingKeys={pendingKeys}
      keyOf={keyOf}
      onToggleOutput={(output) => handleToggle(item, output)}
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
        deviceId={shownKey?.deviceId}
        onClose={() => setShownKey(null)}
      />
    </View>
  );
}

// ─── Device Card ────────────────────────────────────────────────────────────
function DeviceCard({ device, onChat, onRevoke, onRegenerate, pendingKeys, keyOf, onToggleOutput }) {
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

      {/* MOI: 1 nut bat/tat cho TUNG dau ra cua thiet bi */}
      {device.outputs?.length ? (
        <View style={c.outputsBox}>
          {device.outputs.map((output) => {
            const pending = pendingKeys.includes(keyOf(device._id, output.outputId));
            return (
              <View style={c.outputRow} key={output.outputId}>
                <Text style={c.outputIcon}>{OUTPUT_ICON[output.kind] || OUTPUT_ICON.other}</Text>
                <Text style={c.outputLabel} numberOfLines={1}>
                  {output.label || output.outputId}
                </Text>
                <TouchableOpacity
                  style={[
                    c.toggleBtn,
                    output.state && c.toggleBtnOn,
                    pending && c.toggleBtnPending,
                  ]}
                  onPress={() => onToggleOutput(output)}
                  disabled={pending || !device.isActive}
                >
                  <Text style={[c.toggleText, output.state && c.toggleTextOn]}>
                    {pending ? 'Đang gửi...' : output.state ? 'Tắt' : 'Bật'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={c.noOutputs}>Thiết bị chưa khai báo dau ra nào</Text>
      )}

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
function ShowKeyModal({ visible, title, apiKey, deviceId, onClose }) {
  const copyText = (label, value) => {
    if (!value) return;
    // Tren web dung Clipboard API; tren native se can @react-native-clipboard/clipboard
    // De giu don gian, chi ho tro web copy
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(value).then(
        () => Alert.alert('Đã sao chép', `${label} đã được sao chép vào clipboard.`),
        () => {}
      );
    } else {
      // Tren mobile: hien noi dung de user copy thu cong
      Alert.alert(label, value);
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
            <Text style={k.warnText}>⚠ Lưu API key này ngay — bạn sẽ không thấy lại sau khi đóng cửa sổ.</Text>
          </View>

          <Text style={m.label}>API Key</Text>
          <View style={k.keyBox}>
            <Text selectable style={k.keyText}>{apiKey}</Text>
          </View>
          <TouchableOpacity style={m.btnGhost} onPress={() => copyText('API Key', apiKey)}>
            <Text style={m.btnGhostText}>📋 Sao chép API Key</Text>
          </TouchableOpacity>

          {/* MOI: Device ID - khong bi mat nhung ESP32 can de poll lenh bat/tat.
              Chi co khi vua tao thiet bi (tao lai key khong tra ve _id moi). */}
          {deviceId ? (
            <>
              <Text style={[m.label, { marginTop: 14 }]}>
                Device ID (nhập vào ESP32 cùng lúc với API Key)
              </Text>
              <View style={k.keyBox}>
                <Text selectable style={k.keyText}>{deviceId}</Text>
              </View>
              <TouchableOpacity style={m.btnGhost} onPress={() => copyText('Device ID', deviceId)}>
                <Text style={m.btnGhostText}>📋 Sao chép Device ID</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <View style={m.btnRow}>
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
// LUU Y: vai gia tri spacing/mau trong `s` (header/list/empty*) va trong `c`
// (card/topRow/iconWrap/icon) minh khong lay lai duoc nguyen van tu repo qua
// project_search (phan do khong lien quan bug nen search khong tra ve het),
// nen minh dat gia tri hop ly theo dung theme token (C/FONT/RADIUS/SHADOW)
// dang dung trong chinh file nay. Neu lech mot chut voi giao dien hien tai,
// chi can chinh lai vai so o day, cau truc/logic thi da dung 100%.
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: FONT.xl, fontWeight: '700', color: C.text },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.accent, borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnPlus: { color: C.white, fontSize: FONT.base, fontWeight: '700' },
  addBtnText: { color: C.white, fontSize: FONT.sm, fontWeight: '700' },

  list: { padding: 16, gap: 12 },

  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptySub: { fontSize: FONT.sm, color: C.dim, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 18, backgroundColor: C.accent, borderRadius: RADIUS.sm,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  emptyBtnText: { color: C.white, fontWeight: '700', fontSize: FONT.sm },
});

const c = StyleSheet.create({
  card: {
    backgroundColor: C.panel, borderRadius: RADIUS.md, padding: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 12, ...SHADOW.sm,
  },
  cardRevoked: { opacity: 0.7 },

  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 38, height: 38, borderRadius: RADIUS.sm,
    backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center',
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

  // MOI: hang cho tung output ben trong card
  outputsBox: {
    marginTop: 12, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10, gap: 8,
  },
  outputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outputIcon: { fontSize: 16, width: 20, textAlign: 'center' },
  outputLabel: { flex: 1, fontSize: FONT.sm, color: C.text },
  toggleBtn: {
    minWidth: 72, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.panel2,
  },
  toggleBtnOn: { backgroundColor: '#EFFDF3', borderColor: C.ok },
  toggleBtnPending: { opacity: 0.6 },
  toggleText: { fontSize: FONT.xs, fontWeight: '700', color: C.text },
  toggleTextOn: { color: '#15803D' },
  noOutputs: { fontSize: FONT.xs, color: C.dim, marginTop: 10, fontStyle: 'italic' },

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