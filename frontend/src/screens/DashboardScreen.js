// frontend/src/screens/DashboardScreen.js
//
// Man hinh Dashboard: hien thi cac chi so cam bien (nhiet do, do am, am thanh,

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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

function formatClock(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function fmtValue(v, decimals) {
  return typeof v === 'number' ? v.toFixed(decimals) : '--';
}

// ─── Bieu do duong chi tiet: tung moc gia tri cu the, bam vao 1 diem de xem ──
const POINT_GAP = 56;       // khoang cach ngang giua 2 moc
const CHART_H = 150;        // chieu cao vung ve (khong tinh nhan gio ben duoi)
const TOP_PAD = 26;         // chua nhan gia tri phia tren diem cao nhat
const BOTTOM_PAD = 14;      // chua diem thap nhat
const SIDE_PAD = 20;

function LineChartDetail({ points, color, unit, decimals }) {
  const [selected, setSelected] = useState(points.length - 1);

  const { positions, min, max } = useMemo(() => {
    const values = points.map((p) => p.value);
    let mn = Math.min(...values);
    let mx = Math.max(...values);
    if (mn === mx) { mn -= 1; mx += 1; } // tranh chia 0 khi tat ca gia tri bang nhau
    const innerH = CHART_H - TOP_PAD - BOTTOM_PAD;
    const pos = points.map((p, i) => ({
      x: SIDE_PAD + i * POINT_GAP,
      y: TOP_PAD + innerH - ((p.value - mn) / (mx - mn)) * innerH,
      value: p.value,
      time: p.time,
    }));
    return { positions: pos, min: mn, max: mx };
  }, [points]);

  const width = SIDE_PAD * 2 + Math.max(0, points.length - 1) * POINT_GAP;
  const activePoint = positions[selected];

  return (
    <View style={dc.wrap}>
      {activePoint && (
        <View style={dc.callout}>
          <Text style={[dc.calloutValue, { color }]}>
            {fmtValue(activePoint.value, decimals)}{unit ? ` ${unit}` : ''}
          </Text>
          <Text style={dc.calloutTime}>lúc {formatClock(activePoint.time)}</Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
        <View style={{ width: Math.max(width, 240), height: CHART_H }}>
          {/* Duong noi giua cac diem - moi doan la 1 thanh xoay quanh tam */}
          {positions.slice(1).map((p2, idx) => {
            const p1 = positions[idx];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            const cx = (p1.x + p2.x) / 2;
            const cy = (p1.y + p2.y) / 2;
            return (
              <View
                key={idx}
                style={{
                  position: 'absolute',
                  left: cx - length / 2,
                  top: cy - 1,
                  width: length,
                  height: 2,
                  backgroundColor: color,
                  opacity: 0.55,
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}

          {/* Tung moc: cham + nhan gia tri phia tren + nhan gio phia duoi */}
          {positions.map((p, i) => {
            const isSelected = i === selected;
            return (
              <View key={i} style={{ position: 'absolute', left: p.x - 24, top: 0, width: 48, height: CHART_H, alignItems: 'center' }}>
                <Text
                  numberOfLines={1}
                  style={[dc.pointValue, isSelected && { color, fontWeight: '800' }]}
                >
                  {fmtValue(p.value, decimals)}
                </Text>
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
                  onPress={() => setSelected(i)}
                  style={{ position: 'absolute', top: p.y - 10, left: 14, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    style={[
                      dc.dot,
                      { borderColor: color },
                      isSelected && { backgroundColor: color, transform: [{ scale: 1.25 }] },
                    ]}
                  />
                </TouchableOpacity>
                <Text numberOfLines={1} style={dc.pointTime}>{formatClock(p.time)}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={dc.rangeRow}>
        <Text style={dc.rangeText}>Thấp nhất: {fmtValue(min, decimals)}{unit}</Text>
        <Text style={dc.rangeText}>Cao nhất: {fmtValue(max, decimals)}{unit}</Text>
      </View>
    </View>
  );
}

function SensorCard({ sensorKey, latestValue, history, expanded, onToggle }) {
  const meta = SENSOR_META[sensorKey] || { label: sensorKey, icon: '📟', unit: '', color: C.accent, decimals: 1 };
  const numericValues = history.map((h) => h.value).filter((v) => typeof v === 'number');

  const avg = numericValues.length
    ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
    : null;
  const min = numericValues.length ? Math.min(...numericValues) : null;
  const max = numericValues.length ? Math.max(...numericValues) : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onToggle}
      style={[s.card, SHADOW.sm, expanded && s.cardExpanded]}
    >
      <View style={s.cardHeader}>
        <Text style={s.cardIcon}>{meta.icon}</Text>
        <Text style={s.cardLabel}>{meta.label}</Text>
        <Text style={s.chevron}>{expanded ? '▾' : '▸'}</Text>
      </View>

      <Text style={[s.cardValue, { color: meta.color }]}>
        {fmtValue(latestValue, meta.decimals)}
        <Text style={s.cardUnit}> {meta.unit}</Text>
      </Text>

      {avg !== null ? (
        <View style={s.statsRow}>
          <Text style={s.statText}>TB: {fmtValue(avg, meta.decimals)}{meta.unit}</Text>
          <Text style={s.statDot}>·</Text>
          <Text style={s.statText}>Thấp: {fmtValue(min, meta.decimals)}</Text>
          <Text style={s.statDot}>·</Text>
          <Text style={s.statText}>Cao: {fmtValue(max, meta.decimals)}</Text>
        </View>
      ) : (
        <Text style={s.statTextMuted}>Chưa đủ dữ liệu để tính trung bình</Text>
      )}

      {expanded && (
        history.length > 0 ? (
          <LineChartDetail points={history} color={meta.color} unit={meta.unit} decimals={meta.decimals} />
        ) : (
          <Text style={s.statTextMuted}>Chưa có lịch sử để vẽ biểu đồ</Text>
        )
      )}
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [telemetry, setTelemetry] = useState(null); // { readings: [...], latest, latestAt }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const pollRef = useRef(null);

  const toggleExpanded = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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
  const availableSensorKeys = useMemo(() => {
    const keys = new Set();
    if (telemetry?.latest) Object.keys(telemetry.latest).forEach((k) => keys.add(k));
    (telemetry?.readings || []).forEach((r) => Object.keys(r.readings || {}).forEach((k) => keys.add(k)));
    // Uu tien thu tu quen thuoc, cac key la khac xep sau
    const order = ['temperature', 'humidity', 'soundLevel', 'distanceCm', 'gasLevel'];
    return [...order.filter((k) => keys.has(k)), ...[...keys].filter((k) => !order.includes(k))];
  }, [telemetry]);

  const selectedDevice = devices.find((d) => d._id === selectedId);

  const disabledSensorLabels = useMemo(() => {
    return (selectedDevice?.sensors || [])
      .filter((sv) => sv.enabled === false)
      .map((sv) => sv.label || sv.sensorId);
  }, [selectedDevice]);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>📊 Dashboard cảm biến</Text>
        {telemetry?.latestAt && (
          <Text style={s.subtitle}>Cập nhật {formatTimeAgo(telemetry.latestAt)} · Bấm vào thẻ để xem biểu đồ</Text>
        )}
      </View>

      {/* MOI: canh bao cam bien dang bi TAM TAT (dieu khien tu tab Thiet bi) -
          giup giai thich vi sao mot chi so khong co du lieu moi. */}
      {disabledSensorLabels.length > 0 && (
        <View style={s.disabledBanner}>
          <Text style={s.disabledBannerText}>
            🔕 Đang tạm tắt: {disabledSensorLabels.join(', ')} — bật lại ở tab "Thiết bị".
          </Text>
        </View>
      )}

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
            {availableSensorKeys.map((key) => {
              const history = (telemetry?.readings || [])
                .map((r) => ({ value: r.readings?.[key], time: r.createdAt }))
                .filter((h) => typeof h.value === 'number');
              const expanded = expandedKeys.has(key);
              return (
                <View key={key} style={expanded ? s.gridItemFull : s.gridItemHalf}>
                  <SensorCard
                    sensorKey={key}
                    latestValue={telemetry?.latest?.[key]}
                    history={history}
                    expanded={expanded}
                    onToggle={() => toggleExpanded(key)}
                  />
                </View>
              );
            })}
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

  disabledBanner: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 8,
  },
  disabledBannerText: { fontSize: FONT.xs, color: '#92400E', fontWeight: '600' },

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
  gridItemHalf: { width: '48%' },
  gridItemFull: { width: '100%' },

  card: {
    backgroundColor: C.panel,
    borderRadius: RADIUS.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardExpanded: { borderColor: C.accent },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cardIcon: { fontSize: 18 },
  cardLabel: { flex: 1, fontSize: FONT.sm, color: C.dim, fontWeight: '600' },
  chevron: { fontSize: FONT.sm, color: C.dim },
  cardValue: { fontSize: FONT.xxl, fontWeight: '800', marginBottom: 6 },
  cardUnit: { fontSize: FONT.base, fontWeight: '600' },

  statsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  statText: { fontSize: FONT.xs, color: C.dim, fontWeight: '600' },
  statDot: { fontSize: FONT.xs, color: C.dim },
  statTextMuted: { fontSize: FONT.xs, color: C.dim, fontStyle: 'italic' },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptyText: { fontSize: FONT.sm, color: C.dim, textAlign: 'center', lineHeight: 20 },

  errorText: { color: C.danger, textAlign: 'center', marginTop: 24 },
});

// ─── Styles rieng cho bieu do duong chi tiet (LineChartDetail) ──────────────
const dc = StyleSheet.create({
  wrap: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.borderLight },
  callout: {
    flexDirection: 'row', alignItems: 'baseline', gap: 8,
    marginBottom: 6,
  },
  calloutValue: { fontSize: FONT.lg, fontWeight: '800' },
  calloutTime: { fontSize: FONT.xs, color: C.dim },

  pointValue: { fontSize: 10, fontWeight: '700', color: C.text, marginBottom: 2 },
  pointTime: { position: 'absolute', bottom: 0, fontSize: 9, color: C.dim },
  dot: {
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: C.panel, borderWidth: 2,
  },

  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  rangeText: { fontSize: FONT.xs, color: C.dim, fontWeight: '600' },
});