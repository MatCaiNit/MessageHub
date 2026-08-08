import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from '../utils/icons';
import Avatar from './Avatar';
import { C, FONT } from '../utils/theme';

export default function ConversationItem({ conversation, myId, onPress }) {
  const isDevice = conversation.type === 'device';
  const other = conversation.participants?.find((p) => p._id !== myId);
  const title = isDevice
    ? (conversation.name || 'Thiết bị')
    : (other?.username || conversation.name || '...');
  const lastMsg = conversation.lastMessage;
  const lastContent = lastMsg?.isRecalled ? 'Tin nhắn đã được thu hồi' : (lastMsg?.content || 'Chưa có tin nhắn');
  const time = lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <TouchableOpacity style={s.item} onPress={onPress} activeOpacity={0.7}>
      <Avatar name={title} isDevice={isDevice} size="md" />
      <View style={s.body}>
        <View style={s.topRow}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <Text style={s.time}>{time}</Text>
        </View>
        <Text style={s.last} numberOfLines={1}>{lastContent}</Text>
      </View>
      <Icon name="chevron-forward" size={16} color={C.border} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, paddingHorizontal: 16, paddingVertical: 12 },
  body: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  title: { fontSize: FONT.base, fontWeight: '600', color: C.text, flex: 1 },
  time: { fontSize: FONT.xs, color: C.dim, marginLeft: 6 },
  last: { fontSize: FONT.sm, color: C.dim },
});
