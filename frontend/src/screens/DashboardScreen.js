// frontend/src/screens/DashboardScreen.js
//
// Man hinh Dashboard: hien thi cac chi so cam bien (nhiet do, do am, am thanh,
// khoang cach) cua tung thiet bi ESP32 duoi dang "the" (card) de doc + 1 bieu
// do cot don gian cho lich su gan nhat. Khong dung thu vien bieu do nao (repo
// hien khong co react-native-svg/victory/...), bieu do duoc ve bang cac <View>
// thuong voi chieu cao tinh theo % gia tri - nhe va khong can cai them goi moi.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { deviceApi } from '../api';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

// Dinh nghia cac loai cam bien co the co trong deviceData.readings.
// Chi nhung key nao thuc su xuat hien trong du lieu tra ve moi duoc ve card.
const SENSOR_META = {
  temperature: { label: 'Nhiệt độ', icon: '🌡️', unit: '°C', color: '#F97316', decimals: 1 },
  humidity:    { label: 'Độ ẩm',    icon: '💧', unit: '%',  color: '#3B82F6', decimals: 0 },
  soundLevel:  { label: 'Âm thanh', icon: '🔊', unit: '',   color: '#A855F7', decimals: 0 },
  distanceCm:  { label: 'Khoảng cách (vật thể)', icon: '📏', unit: 'cm', color: '#22C55E', decimals: 0 },
  gasLevel:    { label: 'Khí gas / khói', icon: '🧯', unit: '', color: '#EF4444', decimals: 0 },
};

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'chưa có dữ liệu';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (diffSec < 5) return 'vừa xong';
  if (diffSec < 60) return `${diffSec} giây trước`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  return new Date(dateStr).toLocaleString('vi-VN');
}

// Bieu do cot rat gon: nhan mang gia tri, tu chuan hoa theo min/max cua chinh no.
function MiniBarChart({ values, color }) {
  if (!values || values.length === 0) {
    return (
      <View style={s.chartEmpty}>
        <Text style={s.chartEmptyText}>Chưa đủ dữ liệu để vẽ biểu đồ</Text>
      </View>
    );
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  return (
    <View style={s.chartRow}>
      {values.map((v, i) => {
        const pct = Math.max(0.06, (v - min) / range); // toi thieu 6% de van thay duoc cot
        return (
          <View key={i} style={s.chartBarTrack}>
            <View style={[s.chartBar, { height: `${pct * 100}%`, backgroundColor: color }]} />
          </View>
        );
      })}
    </View>
  );
}

function SensorCard({ sensorKey, latestValue, history }) {
  const meta = SENSOR_META[sensorKey] || { label: sensorKey, icon: '📟', unit: '', color: C.accent, decimals: 1 };
  const displayValue =
    typeof latestValue === 'number' ? latestValue.toFixed(meta.decimals) : '--';

  return (
    <View style={[s.card, SHADOW.sm]}>
      <View style={s.cardHeader}>
        <Text style={s.cardIcon}>{meta.icon}</Text>
        <Text style={s.cardLabel}>{meta.label}</Text>
      </View>
      <Text style={[s.cardValue, { color: meta.color }]}>
        {displayValue}
        <Text style={s.cardUnit}> {meta.unit}</Text>
      </Text>
      <MiniBarChart values={history} color={meta.color} />
    </View>
  );
}

export default function DashboardScreen() {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [telemetry, setTelemetry] = useState(null); // { readings: [...], latest, latestAt }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const loadDevices = useCallback(async () => {
    try {
      const res = await deviceApi.listMine();
      setDevices(res.data || []);
      if (!selectedId && res.data && res.data.length > 0) {
        setSelectedId(res.data[0]._id);
      }
    } catch (e) {
      setError('Không tải được danh sách thiết bị');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const loadTelemetry = useCallback(async (deviceId) => {
    if (!deviceId) return;
    try {
      const res = await deviceApi.getTelemetry(deviceId, 30);
      setTelemetry(res.data);
      setError('');
    } catch (e) {
      setError('Không tải được dữ liệu cảm biến của thiết bị này');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    loadTelemetry(selectedId);

    // Tu dong lam moi moi 15s de "dashboard" luon cap nhat, khop voi chu ky
    // gui telemetry 30s cua ESP32 (poll nhanh hon de bat kip ban ghi moi).
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadTelemetry(selectedId), 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId, loadTelemetry]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDevices();
    loadTelemetry(selectedId);
  };

  // Gop danh sach cac loai cam bien THUC SU co du lieu (tu latest hoac tu lich su)
  const availableSensorKeys = React.useMemo(() => {
    const keys = new Set();
    if (telemetry?.latest) Object.keys(telemetry.latest).forEach((k) => keys.add(k));
    (telemetry?.readings || []).forEach((r) => Object.keys(r.readings || {}).forEach((k) => keys.add(k)));
    // Uu tien thu tu quen thuoc, cac key la khac xep sau
    const order = ['temperature', 'humidity', 'soundLevel', 'distanceCm', 'gasLevel'];
    return [...order.filter((k) => keys.has(k)), ...[...keys].filter((k) => !order.includes(k))];
  }, [telemetry]);

  const selectedDevice = devices.find((d) => d._id === selectedId);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>📊 Dashboard cảm biến</Text>
        {telemetry?.latestAt && (
          <Text style={s.subtitle}>Cập nhật {formatTimeAgo(telemetry.latestAt)}</Text>
        )}
      </View>

      {devices.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.deviceChips}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {devices.map((d) => {
            const active = d._id === selectedId;
            return (
              <TouchableOpacity
                key={d._id}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setSelectedId(d._id)}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{d.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : devices.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>⚡</Text>
            <Text style={s.emptyTitle}>Chưa có thiết bị nào</Text>
            <Text style={s.emptyText}>Thêm một thiết bị ESP32 ở tab "Thiết bị" để bắt đầu xem dữ liệu cảm biến ở đây.</Text>
          </View>
        ) : error ? (
          <Text style={s.errorText}>{error}</Text>
        ) : availableSensorKeys.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>📡</Text>
            <Text style={s.emptyTitle}>Chưa có dữ liệu cảm biến</Text>
            <Text style={s.emptyText}>
              {selectedDevice ? `"${selectedDevice.name}"` : 'Thiết bị này'} chưa gửi lần đọc cảm biến
              nào lên server. Kiểm tra firmware đã bật gửi telemetry và ESP32 đang online.
            </Text>
          </View>
        ) : (
          <View style={s.grid}>
            {availableSensorKeys.map((key) => (
              <SensorCard
                key={key}
                sensorKey={key}
                latestValue={telemetry?.latest?.[key]}
                history={(telemetry?.readings || [])
                  .map((r) => r.readings?.[key])
                  .filter((v) => typeof v === 'number')}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: FONT.xl, fontWeight: '700', color: C.text },
  subtitle: { fontSize: FONT.sm, color: C.dim, marginTop: 2 },

  deviceChips: { maxHeight: 44, marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  chipText: { fontSize: FONT.sm, color: C.dim, fontWeight: '600' },
  chipTextActive: { color: C.accentText },

  body: { padding: 16, paddingTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },

  card: {
    width: '48%',
    backgroundColor: C.panel,
    borderRadius: RADIUS.lg,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cardIcon: { fontSize: 18 },
  cardLabel: { fontSize: FONT.sm, color: C.dim, fontWeight: '600' },
  cardValue: { fontSize: FONT.xxl, fontWeight: '800', marginBottom: 10 },
  cardUnit: { fontSize: FONT.base, fontWeight: '600' },

  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 44,
    gap: 2,
  },
  chartBarTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', borderRadius: 3, minHeight: 3 },
  chartEmpty: { height: 44, justifyContent: 'center' },
  chartEmptyText: { fontSize: FONT.xs, color: C.dim, textAlign: 'center' },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptyText: { fontSize: FONT.sm, color: C.dim, textAlign: 'center', lineHeight: 20 },

  errorText: { color: C.danger, textAlign: 'center', marginTop: 24 },
});