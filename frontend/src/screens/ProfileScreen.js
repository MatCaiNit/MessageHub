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

// Man hinh xem/chinh sua thong tin ca nhan.
//
// LUU Y: BE hien chua co endpoint PATCH /api/users/me.
// Khi bam Luu, FE se goi endpoint nay - neu BE chua ho tro,
// nut se bao loi ro rang de biet can bo sung. Sau khi BE them:
//   router.patch('/me', protect, updateMe);  // trong userRoutes.js
// thi FE se hoat dong ma khong can sua gi.

export default function ProfileScreen() {
  const { me, logout } = useAuth();
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

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!form.username.trim() || !form.email.trim()) {
      Alert.alert('Lỗi', 'Username và email không được để trống');
      return;
    }
    setSaving(true);
    try {
      // Goi thu endpoint - BE chua co thi se 404
      await client.patch('/api/users/me', {
        username: form.username.trim(),
        email: form.email.trim(),
      });
      Alert.alert('Thành công', 'Đã cập nhật thông tin');
      setEditing(false);
      // Note: se can reload `me` trong AuthContext de UI cap nhat
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        Alert.alert(
          'Chức năng chưa sẵn sàng',
          'Backend chưa có endpoint PATCH /api/users/me để lưu thay đổi. Cần bổ sung trước khi dùng tính năng này.'
        );
      } else {
        Alert.alert('Lỗi', err.response?.data?.message || err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert(
      'Đăng xuất?',
      'Bạn sẽ cần đăng nhập lại lần sau.',
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: logout },
      ]
    );
  };

  const confirmLogoutAll = () => {
    Alert.alert(
      'Đăng xuất tất cả thiết bị?',
      'Tất cả các phiên đăng nhập trên mọi thiết bị sẽ bị hủy. Bạn sẽ phải đăng nhập lại ở khắp nơi.',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Đăng xuất tất cả',
          style: 'destructive',
          onPress: async () => {
            setLoggingOutAll(true);
            try {
              await authApi.logoutAll();
              await logout(); // dang xuat luon phien hien tai
            } catch (err) {
              Alert.alert('Lỗi', err.response?.data?.message || err.message);
            } finally {
              setLoggingOutAll(false);
            }
          },
        },
      ]
    );
  };

  const joined = me?.createdAt
    ? new Date(me.createdAt).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : '—';

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {/* Header voi tieu de */}
      <View style={s.headerBar}>
        <Text style={s.headerTitle}>Cá nhân</Text>
      </View>

      {/* Card avatar + ten */}
      <View style={s.topCard}>
        <Avatar name={me?.username} size="lg" />
        <Text style={s.username}>{me?.username}</Text>
        <View style={s.typeBadge}>
          <Text style={s.typeBadgeText}>
            {me?.type === 'device' ? '⚡ Thiết bị' : '👤 Người dùng'}
          </Text>
        </View>
      </View>

      {/* Thong tin (view mode) */}
      {!editing && (
        <>
          <View style={s.section}>
            <Text style={s.sectionLabel}>THÔNG TIN TÀI KHOẢN</Text>
            <InfoRow label="Username" value={me?.username} />
            <InfoRow label="Email" value={me?.email} />
            <InfoRow label="Ngày tạo" value={joined} />
            <InfoRow
              label="Trạng thái"
              value={me?.isOnline ? '● Đang hoạt động' : 'Ngoại tuyến'}
              valueColor={me?.isOnline ? C.ok : C.dim}
            />
          </View>

          <View style={s.section}>
            <TouchableOpacity style={s.primaryBtn} onPress={startEdit}>
              <Text style={s.primaryBtnText}>✎ Chỉnh sửa thông tin</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Edit mode */}
      {editing && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>CHỈNH SỬA</Text>

          <Text style={s.fieldLabel}>Username</Text>
          <TextInput
            style={s.input}
            value={form.username}
            onChangeText={(v) => setForm((f) => ({ ...f, username: v }))}
            placeholder="Username"
            placeholderTextColor={C.dim}
            autoCapitalize="none"
            maxLength={20}
          />

          <Text style={s.fieldLabel}>Email</Text>
          <TextInput
            style={s.input}
            value={form.email}
            onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            placeholder="Email"
            placeholderTextColor={C.dim}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <View style={s.btnRow}>
            <TouchableOpacity style={s.ghostBtn} onPress={cancelEdit} disabled={saving}>
              <Text style={s.ghostBtnText}>Huỷ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, { flex: 1 }, saving && { opacity: 0.6 }]}
              onPress={saveEdit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.primaryBtnText}>Lưu thay đổi</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Actions - luon hien */}
      {!editing && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>PHIÊN ĐĂNG NHẬP</Text>

          <TouchableOpacity style={s.rowBtn} onPress={confirmLogout}>
            <Text style={s.rowBtnIcon}>⎋</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.rowBtnText}>Đăng xuất</Text>
              <Text style={s.rowBtnSub}>Chỉ đăng xuất khỏi thiết bị này</Text>
            </View>
            <Text style={s.rowBtnChev}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.rowBtn, s.rowBtnDanger]}
            onPress={confirmLogoutAll}
            disabled={loggingOutAll}
          >
            <Text style={s.rowBtnIcon}>🚪</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowBtnText, { color: C.danger }]}>Đăng xuất tất cả thiết bị</Text>
              <Text style={s.rowBtnSub}>Hủy mọi phiên đăng nhập hiện tại</Text>
            </View>
            {loggingOutAll
              ? <ActivityIndicator color={C.danger} size="small" />
              : <Text style={[s.rowBtnChev, { color: C.danger }]}>›</Text>}
          </TouchableOpacity>
        </View>
      )}

      <Text style={s.appVersion}>MessageHub v1.0 · {Platform.OS}</Text>
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 30 },

  headerBar: {
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: FONT.xl, fontWeight: '800', color: C.text },

  topCard: {
    alignItems: 'center', paddingVertical: 26, paddingHorizontal: 16,
    backgroundColor: C.panel, gap: 8,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  username: { fontSize: FONT.xl, fontWeight: '700', color: C.text, marginTop: 8 },
  typeBadge: {
    backgroundColor: C.accentDim,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.accent,
  },
  typeBadgeText: { fontSize: FONT.xs, fontWeight: '600', color: C.accentText },

  section: { padding: 16, gap: 8 },
  sectionLabel: {
    fontSize: FONT.xs, fontWeight: '700', color: C.dim,
    letterSpacing: 1, marginBottom: 6,
  },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.panel, padding: 12,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border,
    marginBottom: 6,
  },
  infoLabel: { fontSize: FONT.sm, color: C.dim, fontWeight: '500' },
  infoValue: { fontSize: FONT.sm, color: C.text, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },

  fieldLabel: { fontSize: FONT.xs, color: C.dim, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: C.panel, borderRadius: RADIUS.md,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: FONT.base, color: C.text,
    borderWidth: 1, borderColor: C.border,
  },

  primaryBtn: {
    backgroundColor: C.accent, borderRadius: RADIUS.md,
    paddingVertical: 12, alignItems: 'center', ...SHADOW.sm,
  },
  primaryBtnText: { color: C.white, fontSize: FONT.base, fontWeight: '700' },

  ghostBtn: {
    borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.panel,
  },
  ghostBtnText: { color: C.text, fontSize: FONT.base, fontWeight: '600' },

  btnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },

  rowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.panel, padding: 14,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border,
    marginBottom: 8,
  },
  rowBtnDanger: { borderColor: '#FECACA', backgroundColor: '#FFFBFB' },
  rowBtnIcon: { fontSize: 20 },
  rowBtnText: { fontSize: FONT.base, fontWeight: '600', color: C.text },
  rowBtnSub: { fontSize: FONT.xs, color: C.dim, marginTop: 2 },
  rowBtnChev: { fontSize: FONT.lg, color: C.dim },

  appVersion: {
    textAlign: 'center', fontSize: FONT.xs, color: C.dim,
    marginTop: 10, opacity: 0.6,
  },
});