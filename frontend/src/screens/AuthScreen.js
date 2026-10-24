import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Icon } from '../utils/icons';
import { useAuth } from '../context/AuthContext';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const col = {
  bg: C.bg || '#F5F5F8',
  card: C.card || C.surface || '#FFFFFF',
  text: C.text || '#15152B',
  dim: C.dim || '#8A8AA3',
  border: C.border || '#E5E7EB',
  accent: C.accent || '#4F8BFF',
  danger: C.danger || '#EF4444',
  ok: C.ok || '#16A34A',
  white: C.white || '#FFFFFF',
};

function usernameRules(v) {
  return [
    { ok: v.length >= 3 && v.length <= 20, text: 'Từ 3 đến 20 ký tự' },
    { ok: v.length > 0 && /^[a-zA-Z0-9_]*$/.test(v), text: 'Chỉ gồm chữ cái, số và dấu gạch dưới (_), không dấu, không khoảng trắng' },
  ];
}

function passwordRules(v) {
  return [
    { ok: v.length >= 6, text: 'Ít nhất 6 ký tự' },
    { ok: /[A-Z]/.test(v), text: 'Có ít nhất 1 chữ in hoa (A–Z)' },
  ];
}

// Danh sach yeu cau: o tron -> dau tich xanh khi dat
function Checklist({ items, show }) {
  if (!show) return null;
  return (
    <View style={s.rules}>
      {items.map((r, i) => (
        <Text key={i} style={[s.rule, { color: r.ok ? col.ok : col.dim }]}>
          {r.ok ? '✓' : '○'}  {r.text}
        </Text>
      ))}
    </View>
  );
}

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({});
  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));

  const isRegister = tab === 'register';
  const uRules = usernameRules(form.username);
  const pRules = passwordRules(form.password);
  const emailOk = EMAIL_RE.test(form.email.trim());
  const registerValid =
    USERNAME_RE.test(form.username.trim()) && emailOk && pRules.every((r) => r.ok);

  const submit = async () => {
    setError('');
    if (!form.email.trim() || !form.password) { setError('Vui lòng nhập đầy đủ thông tin'); return; }

    if (isRegister) {
      if (!form.username.trim()) { setError('Vui lòng nhập username'); return; }
      if (!USERNAME_RE.test(form.username.trim())) {
        setError('Username chưa đúng yêu cầu (xem danh sách bên dưới ô username)');
        setTouched((t) => ({ ...t, username: true }));
        return;
      }
      if (!emailOk) { setError('Email không hợp lệ'); setTouched((t) => ({ ...t, email: true })); return; }
      if (!pRules.every((r) => r.ok)) {
        setError('Mật khẩu chưa đúng yêu cầu (xem danh sách bên dưới ô mật khẩu)');
        setTouched((t) => ({ ...t, password: true }));
        return;
      }
    }

    setLoading(true);
    try {
      if (!isRegister) {
        await login({ email: form.email.trim(), password: form.password });
      } else {
        await register({ username: form.username.trim(), email: form.email.trim(), password: form.password });
      }
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.errors?.[0]?.msg ||
        data?.errors?.[0]?.message ||
        data?.message ||
        (err.response ? 'Có lỗi xảy ra, thử lại nhé' : 'Không kết nối được máy chủ')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.logoArea}>
          <View style={s.logoCircle}>
            <Text style={s.logoIcon}>🗪</Text>
          </View>
          <Text style={s.appName}>MessageHub</Text>
          <Text style={s.appSub}>Nhắn tin người - người & người - máy</Text>
        </View>

        <View style={s.card}>
          <View style={s.tabs}>
            {['login', 'register'].map((t) => (
              <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]}
                onPress={() => { setTab(t); setError(''); setTouched({}); }}>
                <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                  {t === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isRegister && (
            <>
              <View style={[sf.wrapper, touched.username && !USERNAME_RE.test(form.username.trim()) && sf.wrapperBad]}>
                <Icon name="person-outline" size={16} color={col.dim} style={sf.icon} />
                <TextInput style={sf.input} placeholder="Username" placeholderTextColor={col.dim}
                  value={form.username} onChangeText={set('username')} onBlur={touch('username')}
                  autoCapitalize="none" maxLength={20} />
              </View>
              <Checklist items={uRules} show={touched.username || form.username.length > 0} />
            </>
          )}

          <View style={[sf.wrapper, isRegister && touched.email && !emailOk && sf.wrapperBad]}>
            <Icon name="mail-outline" size={16} color={col.dim} style={sf.icon} />
            <TextInput style={sf.input} placeholder="Email" placeholderTextColor={col.dim}
              value={form.email} onChangeText={set('email')} onBlur={touch('email')}
              keyboardType="email-address" autoCapitalize="none" />
          </View>
          {isRegister && touched.email && !emailOk ? (
            <View style={s.rules}>
              <Text style={[s.rule, { color: col.danger }]}>○  Email chưa đúng định dạng (vd: ten@gmail.com)</Text>
            </View>
          ) : null}

          <View style={[sf.wrapper, isRegister && touched.password && !pRules.every((r) => r.ok) && sf.wrapperBad]}>
            <Icon name="lock-closed-outline" size={16} color={col.dim} style={sf.icon} />
            <TextInput style={sf.input} placeholder="Mật khẩu" placeholderTextColor={col.dim}
              value={form.password} onChangeText={set('password')} onBlur={touch('password')}
              secureTextEntry={!showPassword} />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={sf.right}>
              <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color={col.dim} />
            </TouchableOpacity>
          </View>
          <Checklist items={pRules} show={isRegister && (touched.password || form.password.length > 0)} />

          {error ? (
            <View style={s.errorRow}>
              <Icon name="alert-circle-outline" size={14} color={col.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.btn, isRegister && !registerValid && s.btnDim]}
            onPress={submit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={col.white} />
              : <Text style={s.btnText}>{isRegister ? 'Đăng ký' : 'Đăng nhập'}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: col.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, alignItems: 'center' },

  logoArea: { alignItems: 'center', marginBottom: 28 },
  logoCircle: {
    width: 76, height: 76, borderRadius: 24, backgroundColor: col.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  logoIcon: { fontSize: 34, color: col.white },
  appName: { marginTop: 14, fontSize: 30, fontWeight: '800', color: col.text },
  appSub: { marginTop: 6, fontSize: 14, color: col.dim },

  card: {
    width: '100%', maxWidth: 420, backgroundColor: col.card, borderRadius: 24, padding: 22,
    ...(SHADOW?.card || { elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12 }),
  },
  tabs: {
    flexDirection: 'row', backgroundColor: col.bg, borderRadius: 14, padding: 4, marginBottom: 18,
  },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  tabActive: { backgroundColor: col.card },
  tabText: { color: col.dim, fontWeight: '700', fontSize: 15 },
  tabTextActive: { color: col.accent },

  rules: { marginTop: -4, marginBottom: 12, paddingHorizontal: 6 },
  rule: { fontSize: 12, lineHeight: 18 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  errorText: { color: col.danger, fontSize: 13, flex: 1 },

  btn: {
    backgroundColor: col.accent, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 4,
  },
  btnDim: { opacity: 0.55 },
  btnText: { color: col.white, fontWeight: '700', fontSize: 16 },
});

// Style o nhap lieu
const sf = StyleSheet.create({
  wrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: col.bg,
    borderWidth: 1, borderColor: col.border, borderRadius: 14,
    paddingHorizontal: 14, marginBottom: 12, height: 52,
  },
  wrapperBad: { borderColor: col.danger },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: col.text, paddingVertical: 0 },
  right: { paddingLeft: 8 },
});