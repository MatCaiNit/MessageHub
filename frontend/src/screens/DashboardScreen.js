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

const SENSOR_META = {
  temperature: { label: 'Nhiệt độ', icon: '🌡️', unit: '°C', color: '#F97316', decimals: 1 },
  humidity:    { label: 'Độ ẩm',    icon: '💧', unit: '%',  color: '#3B82F6', decimals: 0 },
  soundLevel:  { label: 'Âm thanh', icon: '🔊', unit: '',   color: '#A855F7', decimals: 0 },
  distanceCm:  { label: 'Khoảng cách (vật thể)', icon: '📏', unit: 'cm', color: '#22C55E', decimals: 0 },
  gasLevel:    { label: 'Khí gas / khói', icon: '🧯', unit: '', color: '#EF4444', decimals: 0 },
  // ---- Cảm biến mở rộng ----
  pressureHpa:    { label: 'Áp suất khí quyển', icon: '🌀', unit: 'hPa', color: '#0EA5E9', decimals: 1 },
  bmeTemperature: { label: 'Nhiệt độ (BME280)', icon: '🌡️', unit: '°C',  color: '#FB923C', decimals: 1 },
  bmeHumidity:    { label: 'Độ ẩm KK (BME280)', icon: '💧', unit: '%',   color: '#60A5FA', decimals: 0 },
  lightLux:       { label: 'Ánh sáng',          icon: '☀️', unit: 'lux', color: '#EAB308', decimals: 0 },
  busVoltage:     { label: 'Điện áp',           icon: '🔌', unit: 'V',   color: '#14B8A6', decimals: 2 },
  currentMa:      { label: 'Dòng điện',         icon: '⚡', unit: 'mA',  color: '#F43F5E', decimals: 0 },
  powerMw:        { label: 'Công suất',         icon: '🔋', unit: 'mW',  color: '#8B5CF6', decimals: 0 },
  rainPercent:    { label: 'Mưa',               icon: '🌧️', unit: '%',   color: '#38BDF8', decimals: 0 },
  soilPercent:    { label: 'Độ ẩm đất',         icon: '🌱', unit: '%',   color: '#16A34A', decimals: 0 },
  waterPercent:   { label: 'Mực nước',          icon: '🚰', unit: '%',   color: '#2563EB', decimals: 0 },
  co2Ppm:         { label: 'CO₂',               icon: '🫧', unit: 'ppm', color: '#64748B', decimals: 0 },
};

// Cac khoang thoi gian. poll = chu ky tu lam moi (ms).
const RANGES = [
  { id: 'live', label: 'Trực tiếp', poll: 15000 },
  { id: '1h',   label: '1 giờ',     poll: 60000 },
  { id: '6h',   label: '6 giờ',     poll: 60000 },
  { id: '24h',  label: '24 giờ',    poll: 120000 },
  { id: '7d',   label: '7 ngày',    poll: 300000 },
];

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

const pad2 = (n) => String(n).padStart(2, '0');

function formatClock(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Nhan duoi truc: khoang ngan -> gio:phut; khoang dai -> ngay/thang + gio.
function formatAxisLabel(dateStr, range) {
  const d = new Date(dateStr);
  if (range === '24h' || range === '7d') {
    return [`${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`, `${pad2(d.getHours())}:${pad2(d.getMinutes())}`];
  }
  return [formatClock(dateStr)];
}

function formatFull(dateStr) {
  const d = new Date(dateStr);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function fmtValue(v, decimals) {
  return typeof v === 'number' ? v.toFixed(decimals) : '--';
}

// ─── Bieu do duong chi tiet ────────────────────────────────────────────────
const MIN_GAP = 46;         // khoang cach ngang toi thieu giua 2 moc
const MAX_GAP = 80;         // toi da (khi it diem)
const CHART_H = 150;        // chieu cao vung ve
const LABEL_H = 28;         // vung nhan thoi gian ben duoi (toi da 2 dong)
const TOP_PAD = 26;
const BOTTOM_PAD = 12;
const SIDE_PAD = 24;

function LineChartDetail({ points, color, unit, decimals, range }) {
  const [selected, setSelected] = useState(Math.max(0, points.length - 1));
  const [viewW, setViewW] = useState(0);
  const scrollRef = useRef(null);
  const offsetRef = useRef(0);
  const nearEndRef = useRef(true);   // nguoi dung dang o cuoi (diem moi nhat)?
  const prevLenRef = useRef(points.length);

  // Khi co them diem moi: neu dang chon diem cuoi thi chon luon diem moi cuoi
  useEffect(() => {
    const prevLen = prevLenRef.current;
    if (selected >= prevLen - 1 || selected > points.length - 1) {
      setSelected(Math.max(0, points.length - 1));
    }
    prevLenRef.current = points.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);

  const gap = useMemo(() => {
    if (points.length <= 1) return MAX_GAP;
    if (!viewW) return MIN_GAP;
    const fit = (viewW - SIDE_PAD * 2) / (points.length - 1);
    return Math.max(MIN_GAP, Math.min(MAX_GAP, fit));
  }, [points.length, viewW]);

  const { positions, min, max } = useMemo(() => {
    const values = points.map((p) => p.value);
    let mn = Math.min(...values);
    let mx = Math.max(...values);
    if (mn === mx) { mn -= 1; mx += 1; }
    const innerH = CHART_H - TOP_PAD - BOTTOM_PAD;
    const pos = points.map((p, i) => ({
      x: SIDE_PAD + i * gap,
      y: TOP_PAD + innerH - ((p.value - mn) / (mx - mn)) * innerH,
      value: p.value,
      time: p.time,
    }));
    return { positions: pos, min: mn, max: mx };
  }, [points, gap]);

  const contentW = Math.max(SIDE_PAD * 2 + Math.max(0, points.length - 1) * gap, viewW || 240);
  const activePoint = positions[selected];

  const scrollToEnd = (animated = false) => {
    if (scrollRef.current) scrollRef.current.scrollToEnd({ animated });
  };
  const scrollByX = (dx) => {
    const x = Math.max(0, Math.min(contentW - viewW, offsetRef.current + dx));
    if (scrollRef.current) scrollRef.current.scrollTo({ x, animated: true });
  };

  const onScroll = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    offsetRef.current = contentOffset.x;
    nearEndRef.current = contentOffset.x + layoutMeasurement.width >= contentSize.width - 40;
  };

  const canScroll = contentW > viewW + 4;

  return (
    <View style={dc.wrap}>
      {activePoint && (
        <View style={dc.callout}>
          <Text style={[dc.calloutValue, { color }]}>
            {fmtValue(activePoint.value, decimals)}{unit ? ` ${unit}` : ''}
          </Text>
          <Text style={dc.calloutTime}>lúc {formatFull(activePoint.time)}</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={canScroll}
        scrollEventThrottle={32}
        onScroll={onScroll}
        onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
        // Luon cuon den diem MOI NHAT khi noi dung thay doi (mo bieu do, doi
        // khoang thoi gian, co diem moi) - tru khi nguoi dung dang xem doan cu.
        onContentSizeChange={() => { if (nearEndRef.current) scrollToEnd(false); }}
        contentContainerStyle={{ paddingVertical: 4 }}
      >
        <View style={{ width: contentW, height: CHART_H + LABEL_H }}>
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

          {positions.map((p, i) => {
            const isSelected = i === selected;
            const lines = formatAxisLabel(p.time, range);
            return (
              <View
                key={i}
                style={{ position: 'absolute', left: p.x - 24, top: 0, width: 48, height: CHART_H + LABEL_H, alignItems: 'center' }}
              >
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
                <View style={{ position: 'absolute', top: CHART_H + 2, alignItems: 'center' }}>
                  {lines.map((ln, li) => (
                    <Text key={li} numberOfLines={1} style={dc.pointTime}>{ln}</Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={dc.navRow}>
        <Text style={dc.rangeText}>
          Thấp: {fmtValue(min, decimals)}{unit}  ·  Cao: {fmtValue(max, decimals)}{unit}  ·  {points.length} điểm
        </Text>
        {canScroll && (
          <View style={dc.navBtns}>
            <TouchableOpacity style={dc.navBtn} onPress={() => { nearEndRef.current = false; scrollByX(-viewW * 0.7); }}>
              <Text style={dc.navBtnText}>◀</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dc.navBtn} onPress={() => scrollByX(viewW * 0.7)}>
              <Text style={dc.navBtnText}>▶</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dc.navBtn, { paddingHorizontal: 10 }]}
              onPress={() => { nearEndRef.current = true; scrollToEnd(true); setSelected(Math.max(0, points.length - 1)); }}
            >
              <Text style={dc.navBtnText}>Mới nhất ⏭</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function SensorCard({ sensorKey, latestValue, history, stat, rangeLabel, range, expanded, onToggle }) {
  const meta = SENSOR_META[sensorKey] || { label: sensorKey, icon: '📟', unit: '', color: C.accent, decimals: 1 };

  // Uu tien thong ke tu server (tinh tren du lieu goc cua ca khoang); neu
  // khong co thi tinh tu cac diem dang co.
  const numericValues = history.map((h) => h.value).filter((v) => typeof v === 'number');
  const avg = stat ? stat.avg : (numericValues.length ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length : null);
  const min = stat ? stat.min : (numericValues.length ? Math.min(...numericValues) : null);
  const max = stat ? stat.max : (numericValues.length ? Math.max(...numericValues) : null);

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
          <Text style={s.statRange}>({rangeLabel})</Text>
        </View>
      ) : (
        <Text style={s.statTextMuted}>Chưa có dữ liệu trong {rangeLabel.toLowerCase()}</Text>
      )}

      {expanded && (
        <View onStartShouldSetResponder={() => true}>
          {history.length > 0 ? (
            <LineChartDetail
              key={range}
              points={history}
              color={meta.color}
              unit={meta.unit}
              decimals={meta.decimals}
              range={range}
            />
          ) : (
            <Text style={[s.statTextMuted, { marginTop: 10 }]}>
              Không có dữ liệu trong khoảng này — thử chọn khoảng thời gian dài hơn.
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [range, setRange] = useState('live');
  const [telemetry, setTelemetry] = useState(null); // { range, readings, stats, latest, latestAt }
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const pollRef = useRef(null);
  const reqIdRef = useRef(0);
  const lastDeviceRef = useRef(null);

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

  const loadTelemetry = useCallback(async (deviceId, rangeId) => {
    if (!deviceId) return;
    const myReq = ++reqIdRef.current;   // bo qua phan hoi cu ve tre khi da doi range/thiet bi
    setFetching(true);
    try {
      const res = await deviceApi.getTelemetry(deviceId, { range: rangeId, limit: 60 });
      if (myReq !== reqIdRef.current) return;
      setTelemetry(res.data);
      setError('');
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setError('Không tải được dữ liệu cảm biến của thiết bị này');
    } finally {
      if (myReq === reqIdRef.current) {
        setLoading(false);
        setFetching(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!selectedId) return;
    // Doi thiet bi -> xoa du lieu cu; doi khoang thoi gian -> giu du lieu cu
    // den khi du lieu moi ve (khong nhay man hinh).
    if (lastDeviceRef.current !== selectedId) {
      lastDeviceRef.current = selectedId;
      setLoading(true);
      setTelemetry(null);
    }
    loadTelemetry(selectedId, range);

    const poll = (RANGES.find((r) => r.id === range) || RANGES[0]).poll;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadTelemetry(selectedId, range), poll);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId, range, loadTelemetry]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDevices();
    loadTelemetry(selectedId, range);
  };

  const availableSensorKeys = useMemo(() => {
    const keys = new Set();
    const latestKeys = telemetry?.latest ? Object.keys(telemetry.latest) : [];
    if (latestKeys.length > 0) {
      latestKeys.forEach((k) => keys.add(k));
    } else {
      (telemetry?.readings || []).forEach((r) => Object.keys(r.readings || {}).forEach((k) => keys.add(k)));
    }
    const order = ['temperature', 'humidity', 'soundLevel', 'distanceCm', 'gasLevel',
      'pressureHpa', 'bmeTemperature', 'bmeHumidity', 'lightLux', 'busVoltage', 'currentMa',
      'powerMw', 'rainPercent', 'soilPercent', 'waterPercent', 'co2Ppm'];
    return [...order.filter((k) => keys.has(k)), ...[...keys].filter((k) => !order.includes(k))];
  }, [telemetry]);

  const selectedDevice = devices.find((d) => d._id === selectedId);
  const rangeLabel = (RANGES.find((r) => r.id === range) || RANGES[0]).label;

  const disabledSensorLabels = useMemo(() => {
    return (selectedDevice?.sensors || [])
      .filter((sv) => sv.enabled === false && sv.present !== false)
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

      {/* Chon khoang thoi gian cho TAT CA the/bieu do */}
      <View style={s.rangeBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
        >
          {RANGES.map((r) => {
            const active = r.id === range;
            return (
              <TouchableOpacity
                key={r.id}
                style={[s.rangeChip, active && s.rangeChipActive]}
                onPress={() => setRange(r.id)}
              >
                <Text style={[s.rangeChipText, active && s.rangeChipTextActive]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
          {fetching && !loading && <ActivityIndicator size="small" color={C.accent} />}
        </ScrollView>
      </View>

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
                    stat={telemetry?.stats?.[key]}
                    rangeLabel={rangeLabel}
                    range={range}
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

  rangeBar: { height: 40, marginBottom: 2 },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
  },
  rangeChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  rangeChipText: { fontSize: FONT.xs, color: C.dim, fontWeight: '700' },
  rangeChipTextActive: { color: '#fff' },

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
  statRange: { fontSize: FONT.xs, color: C.dim, fontStyle: 'italic' },
  statTextMuted: { fontSize: FONT.xs, color: C.dim, fontStyle: 'italic' },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptyText: { fontSize: FONT.sm, color: C.dim, textAlign: 'center', lineHeight: 20 },

  errorText: { color: C.danger, textAlign: 'center', marginTop: 24 },
});

const dc = StyleSheet.create({
  wrap: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.borderLight },
  callout: {
    flexDirection: 'row', alignItems: 'baseline', gap: 8,
    marginBottom: 6,
  },
  calloutValue: { fontSize: FONT.lg, fontWeight: '800' },
  calloutTime: { fontSize: FONT.xs, color: C.dim },

  pointValue: { fontSize: 10, fontWeight: '700', color: C.text, marginBottom: 2 },
  pointTime: { fontSize: 9, color: C.dim },
  dot: {
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: C.panel, borderWidth: 2,
  },

  navRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 6, marginTop: 6,
  },
  rangeText: { fontSize: FONT.xs, color: C.dim, fontWeight: '600' },
  navBtns: { flexDirection: 'row', gap: 6 },
  navBtn: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: RADIUS.full, backgroundColor: C.panel2,
    borderWidth: 1, borderColor: C.border,
  },
  navBtnText: { fontSize: FONT.xs, color: C.dim, fontWeight: '700' },
});