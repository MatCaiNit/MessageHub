import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from '../utils/icons';
import Avatar from './Avatar';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

export default function MessageBubble({ message, isMine, isSameSender, onLongPress }) {
  const isDevice = message.senderId?.type === 'device';
  const isRecalled = message.isRecalled;
  const senderName = message.senderId?.username || '';
  const time = new Date(message.createdAt).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onLongPress={() => onLongPress?.(message)}
      style={[s.row, isMine && s.rowMine, isSameSender && s.rowGrouped]}
    >
      {!isMine && (
        isSameSender
          ? <View style={s.avatarPlaceholder} />
          : <View style={s.avatarWrap}>
              <Avatar name={senderName} isDevice={isDevice} size="sm" />
            </View>
      )}

      <View style={s.content}>
        {!isMine && !isSameSender && (
          <Text style={s.senderName}>{senderName}</Text>
        )}

        <View style={[
          s.bubble,
          isMine ? s.bubbleMine : s.bubbleIn,
          isDevice && s.bubbleDevice,
          isRecalled && s.bubbleRecalled,
        ]}>
          {isDevice && !isRecalled && (
            <View style={s.deviceTag}>
              <Icon name="hardware-chip-outline" size={10} color={C.deviceColor} />
              <Text style={s.deviceTagText}>Thiết bị</Text>
            </View>
          )}
          <Text style={[
            s.bubbleText,
            isMine && s.bubbleTextMine,
            isRecalled && s.bubbleTextRecalled,
          ]}>
            {isRecalled ? 'Tin nhắn đã được thu hồi' : message.content}
          </Text>
        </View>

        <Text style={[s.time, isMine && s.timeMine]}>{time}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 },
  rowMine: { flexDirection: 'row-reverse' },
  rowGrouped: { marginTop: 2 },
  avatarWrap: { marginRight: 6, marginBottom: 2 },
  avatarPlaceholder: { width: 30, marginRight: 6 },
  content: { maxWidth: '75%' },
  senderName: { fontSize: FONT.xs, color: C.dim, marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: RADIUS.lg, paddingHorizontal: 12, paddingVertical: 8, ...SHADOW.sm },
  bubbleIn: { backgroundColor: C.bubbleIn, borderBottomLeftRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border },
  bubbleMine: { backgroundColor: C.bubbleOut, borderBottomRightRadius: RADIUS.sm },
  bubbleDevice: { backgroundColor: C.deviceBg, borderWidth: 1, borderColor: C.deviceBorder, borderBottomLeftRadius: RADIUS.sm },
  bubbleRecalled: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  deviceTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
  deviceTagText: { fontSize: FONT.xs - 1, color: C.deviceColor, fontWeight: '600' },
  bubbleText: { fontSize: FONT.base, color: C.text, lineHeight: 20 },
  bubbleTextMine: { color: C.white },
  bubbleTextRecalled: { fontStyle: 'italic', color: C.dim },
  time: { fontSize: FONT.xs, color: C.dim, marginTop: 3, marginLeft: 4 },
  timeMine: { textAlign: 'right', marginRight: 4 },
});
