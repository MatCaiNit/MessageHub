import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConversationListScreen from './ConversationListScreen';
import DevicesScreen from './DevicesScreen';
import ProfileScreen from './ProfileScreen';
import { C, FONT, SHADOW } from '../utils/theme';

// Cac tab chinh cua app. Icon dung emoji cho gon (dong bo voi utils/icons.js).
const TABS = [
  { id: 'chat',    label: 'Tin nhắn',  icon: '💬', screen: ConversationListScreen },
  { id: 'devices', label: 'Thiết bị',  icon: '⚡', screen: DevicesScreen },
  { id: 'profile', label: 'Cá nhân',   icon: '👤', screen: ProfileScreen },
];

export default function MainTabsScreen(props) {
  const [tab, setTab] = useState('chat');
  const insets = useSafeAreaInsets();
  const Active = TABS.find((t) => t.id === tab).screen;

  return (
    <View style={s.root}>
      {/* Man hinh dang active - truyen thang props tu Stack (co navigation) */}
      <View style={s.body}>
        <Active {...props} />
      </View>

      {/* Tab bar duoi */}
      <View style={[s.tabBar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <TouchableOpacity
              key={t.id}
              style={s.tabItem}
              onPress={() => setTab(t.id)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabIcon, active && s.tabIconActive]}>{t.icon}</Text>
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
              {active && <View style={s.tabDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
    ...(Platform.OS === 'ios' ? {} : SHADOW.sm),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  tabIcon: { fontSize: 22, opacity: 0.55 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: FONT.xs, color: C.dim, fontWeight: '500' },
  tabLabelActive: { color: C.accent, fontWeight: '700' },
  tabDot: {
    position: 'absolute',
    top: 0,
    width: 24, height: 3, borderRadius: 2,
    backgroundColor: C.accent,
  },
});