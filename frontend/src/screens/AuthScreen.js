import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Icon } from '../utils/icons';
import { useAuth } from '../context/AuthContext';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const submit = async () => {
    setError('');
    if (!form.email.trim() || !form.password) { setError('Vui lòng nhập đầy đủ thông tin'); return; }
    setLoading(true);
    try {
      if (tab === 'login') {
        await login({ email: form.email.trim(), password: form.password });
      } else {
        if (!form.username.trim()) { setError('Vui lòng nhập username'); setLoading(false); return; }
        await register({ username: form.username.trim(), email: form.email.trim(), password: form.password });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra, thử lại nhé');
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
                onPress={() => { setTab(t); setError(''); }}>
                <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                  {t === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'register' && (
            <View style={sf.wrapper}>
              <Icon name="person-outline" size={16} color={C.dim} style={sf.icon} />
              <TextInput style={sf.input} placeholder="Username" placeholderTextColor={C.dim}
                value={form.username} onChangeText={set('username')} autoCapitalize="none" />
            </View>
          )}

          <View style={sf.wrapper}>
            <Icon name="mail-outline" size={16} color={C.dim} style={sf.icon} />
            <TextInput style={sf.input} placeholder="Email" placeholderTextColor={C.dim}
              value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={sf.wrapper}>
            <Icon name="lock-closed-outline" size={16} color={C.dim} style={sf.icon} />
            <TextInput style={sf.input} placeholder="Mật khẩu" placeholderTextColor={C.dim}
              value={form.password} onChangeText={set('password')} secureTextEntry={!showPassword} />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={sf.right}>
              <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color={C.dim} />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={s.errorRow}>
              <Icon name="alert-circle-outline" size={14} color={C.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={s.btn} onPress={submit} disabled={loading}>
            {loading
              ? <ActivityIndicator color={C.white} />
              : <Text style={s.btnText}>{tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const sf = StyleSheet.create({
  wrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.md, marginBottom: 12, paddingHorizontal: 12,
  },
  icon: { marginRight: 8 },
  input: { flex: 1, fontSize: FONT.base, color: C.text, paddingVertical: 12 },
  right: { padding: 4 },
});

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logoArea: { alignItems: 'center', marginBottom: 28 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, ...SHADOW.md,
  },
  logoIcon: { fontSize: 36 },
  appName: { fontSize: FONT.xxl, fontWeight: '700', color: C.text, marginBottom: 4 },
  appSub: { fontSize: FONT.sm, color: C.dim, textAlign: 'center' },
  card: {
    width: '100%', maxWidth: 380,
    backgroundColor: C.panel, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: C.border, padding: 24, ...SHADOW.md,
  },
  tabs: { flexDirection: 'row', backgroundColor: C.panel2, borderRadius: RADIUS.md, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: RADIUS.sm, alignItems: 'center' },
  tabActive: { backgroundColor: C.panel, ...SHADOW.sm },
  tabText: { fontSize: FONT.sm, color: C.dim, fontWeight: '500' },
  tabTextActive: { color: C.accentText, fontWeight: '700' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  errorText: { fontSize: FONT.sm, color: C.danger, flex: 1 },
  btn: {
    flexDirection: 'row', backgroundColor: C.accent, borderRadius: RADIUS.md,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  btnText: { color: C.white, fontWeight: '700', fontSize: FONT.base },
});
