// frontend/src/screens/ProfileScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api';
import client from '../api/client';
import Avatar from '../components/Avatar';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

// Man hinh xem/chinh sua thong tin ca nhan (dung chung cho mobile va web).
//  - Sua ten hien thi, username, email  -> PATCH /api/users/me
//  - Doi mat khau                       -> PATCH /api/users/me/password
//  - Dang xuat / dang xuat tat ca thiet bi

const col = {
  bg: C.bg || '#F4F5F7',
  card: C.card || C.surface || '#FFFFFF',
  text: C.text || '#111827',
  border: C.border || '#E5E7EB',
  dim: C.dim || '#6B7280',
  accent: C.accent || '#4F8BFF',
  danger: C.danger || '#EF4444',
  ok: C.ok || '#16A34A',
};

const isWeb = Platform.OS === 'web';

// Alert.alert khong chay tren web -> dung window.confirm
const confirmAction = (title, message, confirmText, onOk, destructive = true) => {
  if (isWeb) {
    if (window.confirm(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Huỷ', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onOk },
  ]);
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfileScreen() {
  const { me, logout, updateProfile, applyTokens } = useAuth();

  // mode: 'view' | 'edit' | 'password'
  const [mode, setMode] = useState('view');
  const [saving, setSaving] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'ok' | 'err', text }

  const [form, setForm] = useState({ displayName: '', username: '', email: '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);

  const shownName = me?.displayName || me?.username;

  const startEdit = () => {
    setForm({
      displayName: me?.displayName || '',
      username: me?.username || '',
      email: me?.email || '',
    });
    setStatus(null);
    setMode('edit');
  };

  const startPassword = () => {
    setPw({ current: '', next: '', confirm: '' });
    setShowPw(false);
    setStatus(null);
    setMode('password');
  };

  const cancel = () => {
    setStatus(null);
    setMode('view');
  };

  const saveEdit = async () => {
    const displayName = form.displayName.trim();
    const username = form.username.trim();
    const email = form.email.trim();

    if (!username || !email) {
      setStatus({ type: 'err', text: 'Username và email không được để trống' });
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setStatus({ type: 'err', text: 'Username từ 3–20 ký tự, chỉ gồm chữ cái, số và dấu gạch dưới (_)' });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setStatus({ type: 'err', text: 'Email không hợp lệ' });
      return;
    }

    // Chi gui nhung truong that su thay doi
    const body = {};
    if (displayName !== (me?.displayName || '')) body.displayName = displayName;
    if (username !== me?.username) body.username = username;
    if (email.toLowerCase() !== (me?.email || '').toLowerCase()) body.email = email;

    if (Object.keys(body).length === 0) {
      setStatus({ type: 'ok', text: 'Không có thay đổi nào' });
      setMode('view');
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const { data } = await client.patch('/api/users/me', body);
      await updateProfile(data);
      setMode('view');
      setStatus({ type: 'ok', text: 'Đã cập nhật thông tin' });
    } catch (err) {
      setStatus({
        type: 'err',
        text: err.response?.data?.message || err.message || 'Không lưu được',
      });
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!pw.current || !pw.next) {
      setStatus({ type: 'err', text: 'Nhập đầy đủ mật khẩu hiện tại và mật khẩu mới' });
      return;
    }
    if (pw.next.length < 6) {
      setStatus({ type: 'err', text: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      return;
    }
    if (!/[A-Z]/.test(pw.next)) {
      setStatus({ type: 'err', text: 'Mật khẩu mới phải có ít nhất 1 chữ in hoa' });
      return;
    }
    if (pw.next !== pw.confirm) {
      setStatus({ type: 'err', text: 'Mật khẩu nhập lại không khớp' });
      return;
    }
    if (pw.next === pw.current) {
      setStatus({ type: 'err', text: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const { data } = await client.patch('/api/users/me/password', {
        currentPassword: pw.current,
        newPassword: pw.next,
      });
      await applyTokens(data); // BE huy token cu, cap token moi cho phien nay
      setPw({ current: '', next: '', confirm: '' });
      setMode('view');
      setStatus({ type: 'ok', text: 'Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.' });
    } catch (err) {
      setStatus({
        type: 'err',
        text: err.response?.data?.message || err.message || 'Không đổi được mật khẩu',
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () =>
    confirmAction('Đăng xuất?', 'Bạn sẽ cần đăng nhập lại lần sau.', 'Đăng xuất', logout);

  const confirmLogoutAll = () =>
    confirmAction(
      'Đăng xuất tất cả thiết bị?',
      'Tất cả các phiên đăng nhập trên mọi thiết bị sẽ bị hủy. Bạn sẽ phải đăng nhập lại ở khắp nơi.',
      'Đăng xuất tất cả',
      async () => {
        setLoggingOutAll(true);
        try {
          await authApi.logoutAll();
          await logout(); // dang xuat luon phien hien tai
        } catch (err) {
          setStatus({ type: 'err', text: err.response?.data?.message || err.message });
        } finally {
          setLoggingOutAll(false);
        }
      }
    );

  const joined = me?.createdAt
    ? new Date(me.createdAt).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : '—';

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.inner}>
        <View style={s.headerBar}>
          <Text style={s.headerTitle}>Cá nhân</Text>
        </View>

        {/* Avatar + ten */}
        <View style={s.topCard}>
          <Avatar name={shownName} size="lg" />
          <Text style={s.name}>{shownName}</Text>
          {me?.displayName ? <Text style={s.handle}>@{me?.username}</Text> : null}
          <View style={s.typeBadge}>
            <Text style={s.typeBadgeText}>
              {me?.type === 'device' ? '⚡ Thiết bị' : '👤 Người dùng'}
            </Text>
          </View>
        </View>

        {/* Thong bao ket qua */}
        {status ? (
          <View style={[s.banner, status.type === 'ok' ? s.bannerOk : s.bannerErr]}>
            <Text style={[s.bannerText, { color: status.type === 'ok' ? col.ok : col.danger }]}>
              {status.type === 'ok' ? '✓ ' : '⚠ '}{status.text}
            </Text>
          </View>
        ) : null}

        {/* ===== XEM ===== */}
        {mode === 'view' && (
          <>
            <View style={s.section}>
              <Text style={s.sectionLabel}>THÔNG TIN TÀI KHOẢN</Text>
              <InfoRow label="Tên hiển thị" value={me?.displayName || '—'} />
              <InfoRow label="Username" value={me?.username} />
              <InfoRow label="Email" value={me?.email} />
              <InfoRow label="Ngày tạo" value={joined} />
              <InfoRow
                label="Trạng thái"
                value={me?.isOnline ? '● Đang hoạt động' : 'Ngoại tuyến'}
                valueColor={me?.isOnline ? col.ok : col.dim}
              />
            </View>

            <View style={s.section}>
              <TouchableOpacity style={s.primaryBtn} onPress={startEdit}>
                <Text style={s.primaryBtnText}>✎ Chỉnh sửa thông tin</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.outlineBtn, { marginTop: 10 }]} onPress={startPassword}>
                <Text style={s.outlineBtnText}>🔑 Đổi mật khẩu</Text>
              </TouchableOpacity>
            </View>

            <View style={s.section}>
              <Text style={s.sectionLabel}>PHIÊN ĐĂNG NHẬP</Text>
              <TouchableOpacity style={s.outlineBtn} onPress={confirmLogout}>
                <Text style={s.outlineBtnText}>Đăng xuất</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dangerBtn, { marginTop: 10 }, loggingOutAll && { opacity: 0.6 }]}
                onPress={confirmLogoutAll}
                disabled={loggingOutAll}
              >
                {loggingOutAll
                  ? <ActivityIndicator color={col.danger} />
                  : <Text style={s.dangerBtnText}>Đăng xuất tất cả thiết bị</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ===== SUA THONG TIN ===== */}
        {mode === 'edit' && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>CHỈNH SỬA THÔNG TIN</Text>

            <Field
              label="Tên hiển thị"
              hint="Tên mọi người nhìn thấy trong tin nhắn (có thể để trống)"
              value={form.displayName}
              onChangeText={(v) => setForm((f) => ({ ...f, displayName: v }))}
              placeholder="VD: Mạnh Quỳnh"
              maxLength={50}
            />
            <Field
              label="Username"
              value={form.username}
              onChangeText={(v) => setForm((f) => ({ ...f, username: v }))}
              hint="3–20 ký tự: chữ cái, số, dấu gạch dưới (_)"
              placeholder="Username"
              autoCapitalize="none"
              maxLength={20}
            />
            <Field
              label="Email"
              value={form.email}
              onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <View style={s.btnRow}>
              <TouchableOpacity style={s.ghostBtn} onPress={cancel} disabled={saving}>
                <Text style={s.ghostBtnText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 1 }, saving && { opacity: 0.6 }]}
                onPress={saveEdit}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Lưu thay đổi</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ===== DOI MAT KHAU ===== */}
        {mode === 'password' && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>ĐỔI MẬT KHẨU</Text>

            <Field
              label="Mật khẩu hiện tại"
              value={pw.current}
              onChangeText={(v) => setPw((p) => ({ ...p, current: v }))}
              secureTextEntry={!showPw}
              autoCapitalize="none"
            />
            <Field
              label="Mật khẩu mới"
              hint="Tối thiểu 6 ký tự và có ít nhất 1 chữ in hoa"
              value={pw.next}
              onChangeText={(v) => setPw((p) => ({ ...p, next: v }))}
              secureTextEntry={!showPw}
              autoCapitalize="none"
            />
            <Field
              label="Nhập lại mật khẩu mới"
              value={pw.confirm}
              onChangeText={(v) => setPw((p) => ({ ...p, confirm: v }))}
              secureTextEntry={!showPw}
              autoCapitalize="none"
            />

            <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={{ marginBottom: 12 }}>
              <Text style={{ color: col.accent, fontSize: 13 }}>
                {showPw ? '🙈 Ẩn mật khẩu' : '👁 Hiện mật khẩu'}
              </Text>
            </TouchableOpacity>

            <Text style={s.note}>
              Sau khi đổi, các thiết bị khác đang đăng nhập sẽ bị đăng xuất.
            </Text>

            <View style={s.btnRow}>
              <TouchableOpacity style={s.ghostBtn} onPress={cancel} disabled={saving}>
                <Text style={s.ghostBtnText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 1 }, saving && { opacity: 0.6 }]}
                onPress={savePassword}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Đổi mật khẩu</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, valueColor }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor && { color: valueColor }]} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

function Field({ label, hint, ...inputProps }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={col.dim} {...inputProps} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: col.bg },
  content: { paddingBottom: 40, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 560 },

  headerBar: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: col.text },

  topCard: {
    alignItems: 'center', backgroundColor: col.card, marginHorizontal: 16,
    marginTop: 8, paddingVertical: 22, borderRadius: RADIUS?.lg || 16,
    ...(SHADOW?.card || {}),
  },
  name: { marginTop: 10, fontSize: 18, fontWeight: '700', color: col.text },
  handle: { marginTop: 2, fontSize: 13, color: col.dim },
  typeBadge: {
    marginTop: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: col.bg,
  },
  typeBadgeText: { fontSize: 12, color: col.dim, fontWeight: '600' },

  banner: { marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12 },
  bannerOk: { backgroundColor: '#ECFDF5' },
  bannerErr: { backgroundColor: '#FEF2F2' },
  bannerText: { fontSize: 13, fontWeight: '600' },

  section: {
    backgroundColor: col.card, marginHorizontal: 16, marginTop: 12,
    padding: 16, borderRadius: RADIUS?.lg || 16, ...(SHADOW?.card || {}),
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: col.dim, letterSpacing: 0.8, marginBottom: 12,
  },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: col.border,
  },
  infoLabel: { fontSize: 14, color: col.dim },
  infoValue: { fontSize: 14, color: col.text, fontWeight: '600', maxWidth: '65%' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: col.text, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: col.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 15, color: col.text, backgroundColor: col.bg,
  },
  hint: { marginTop: 4, fontSize: 12, color: col.dim },
  note: { fontSize: 12, color: col.dim, marginBottom: 14, lineHeight: 17 },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  primaryBtn: {
    backgroundColor: col.accent, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  outlineBtn: {
    borderWidth: 1, borderColor: col.border, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', backgroundColor: col.card,
  },
  outlineBtnText: { color: col.text, fontWeight: '600', fontSize: 15 },
  ghostBtn: {
    paddingHorizontal: 18, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center', backgroundColor: col.bg,
  },
  ghostBtnText: { color: col.dim, fontWeight: '600', fontSize: 15 },
  dangerBtn: {
    borderWidth: 1, borderColor: col.danger, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', backgroundColor: col.card,
  },
  dangerBtnText: { color: col.danger, fontWeight: '700', fontSize: 15 },
});