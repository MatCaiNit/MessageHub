import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Linking } from 'react-native';
import { Icon } from '../utils/icons';
import Avatar from './Avatar';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';
import { resolveFileUrl } from '../api';

const displayNameOf = (user) => user?.displayName?.trim() || user?.username || '';

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Render noi dung tin nhan, in dam cac cum @tenNguoiDung xuat hien trong `mentions`
function MentionText({ content, mentions, style, mentionStyle }) {
  if (!content) return null;
  if (!mentions || mentions.length === 0) return <Text style={style}>{content}</Text>;

  const names = mentions.map((m) => displayNameOf(m)).filter(Boolean);
  if (names.length === 0) return <Text style={style}>{content}</Text>;

  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
  const parts = content.split(pattern);

  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.startsWith('@') && names.includes(part.slice(1)) ? (
          <Text key={i} style={mentionStyle}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

// Khung trich dẫn tin nhắn đang được reply tới (hiển thị phía trên nội dung)
function ReplyPreview({ replyTo, isMine }) {
  if (!replyTo) return null;
  const senderName = displayNameOf(replyTo.senderId) || 'Ai đó';
  const isGone = replyTo.isRecalled || replyTo.isDeleted;
  const hasImage = replyTo.attachments?.[0]?.fileType?.startsWith('image/');
  const preview = isGone
    ? 'Tin nhắn đã bị thu hồi/xoá'
    : hasImage
      ? '📷 Hình ảnh'
      : replyTo.attachments?.length
        ? `📎 ${replyTo.attachments[0].fileName || 'Tệp đính kèm'}`
        : (replyTo.content || '');

  return (
    <View style={[rp.wrap, isMine && rp.wrapMine]}>
      <Text style={[rp.name, isMine && rp.nameMine]} numberOfLines={1}>{senderName}</Text>
      <Text style={[rp.text, isMine && rp.textMine]} numberOfLines={2}>{preview}</Text>
    </View>
  );
}

function Attachments({ attachments }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      {attachments.map((att, i) => {
        const isImage = att.fileType?.startsWith('image/');
        const url = resolveFileUrl(att.url);
        if (isImage) {
          return (
            <TouchableOpacity key={i} onPress={() => Linking.openURL(url)} activeOpacity={0.9}>
              <Image source={{ uri: url }} style={at.image} resizeMode="cover" />
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity key={i} style={at.fileRow} onPress={() => Linking.openURL(url)} activeOpacity={0.75}>
            <View style={at.fileIcon}>
              <Icon name="document-text-outline" size={18} color={C.accentText} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={at.fileName} numberOfLines={1}>{att.fileName || 'Tệp đính kèm'}</Text>
              {!!att.fileSize && <Text style={at.fileSize}>{formatFileSize(att.fileSize)}</Text>}
            </View>
            <Icon name="download-outline" size={16} color={C.dim} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function MessageBubble({ message, isMine, isSameSender, onLongPress, onReply }) {
  const isDevice = message.senderId?.type === 'device';
  const isRecalled = message.isRecalled;
  const senderName = displayNameOf(message.senderId);
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const time = new Date(message.createdAt).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <View
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

        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => onLongPress?.(message)}
          style={[
            s.bubble,
            isMine ? s.bubbleMine : s.bubbleIn,
            isDevice && s.bubbleDevice,
            isRecalled && s.bubbleRecalled,
            hasAttachments && !message.content && s.bubbleMedia,
          ]}
        >
          {isDevice && !isRecalled && (
            <View style={s.deviceTag}>
              <Icon name="hardware-chip-outline" size={10} color={C.deviceColor} />
              <Text style={s.deviceTagText}>Thiết bị</Text>
            </View>
          )}

          {!isRecalled && <ReplyPreview replyTo={message.replyTo} isMine={isMine} />}

          {!isRecalled && hasAttachments && <Attachments attachments={message.attachments} />}

          {!isRecalled && !!message.content && (
            <MentionText
              content={message.content}
              mentions={message.mentions}
              style={[s.bubbleText, isMine && s.bubbleTextMine, hasAttachments && { marginTop: 6 }]}
              mentionStyle={[s.mention, isMine && s.mentionMine]}
            />
          )}

          {isRecalled && (
            <Text style={[s.bubbleText, s.bubbleTextRecalled]}>Tin nhắn đã được thu hồi</Text>
          )}

          {/* Nút trả lời - luôn hiện cạnh bong bóng, bấm để trích dẫn tin nhắn này */}
          {!isRecalled && (
            <TouchableOpacity
              style={[s.replyBtn, isMine ? s.replyBtnLeft : s.replyBtnRight]}
              onPress={() => onReply?.(message)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Icon name="arrow-undo-outline" size={14} color={C.dim} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <Text style={[s.time, isMine && s.timeMine]}>{time}</Text>
      </View>
    </View>
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
  bubble: { borderRadius: RADIUS.lg, paddingHorizontal: 12, paddingVertical: 8, ...SHADOW.sm, position: 'relative' },
  bubbleMedia: { paddingHorizontal: 6, paddingVertical: 6 },
  bubbleIn: { backgroundColor: C.bubbleIn, borderBottomLeftRadius: RADIUS.sm, borderWidth: 1, borderColor: C.border },
  bubbleMine: { backgroundColor: C.bubbleOut, borderBottomRightRadius: RADIUS.sm },
  bubbleDevice: { backgroundColor: C.deviceBg, borderWidth: 1, borderColor: C.deviceBorder, borderBottomLeftRadius: RADIUS.sm },
  bubbleRecalled: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  deviceTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
  deviceTagText: { fontSize: FONT.xs - 1, color: C.deviceColor, fontWeight: '600' },
  bubbleText: { fontSize: FONT.base, color: C.text, lineHeight: 20 },
  bubbleTextMine: { color: C.white },
  bubbleTextRecalled: { fontStyle: 'italic', color: C.dim },
  mention: { fontWeight: '700', color: C.accentText },
  mentionMine: { color: C.white, textDecorationLine: 'underline' },
  time: { fontSize: FONT.xs, color: C.dim, marginTop: 3, marginLeft: 4 },
  timeMine: { textAlign: 'right', marginRight: 4 },
  replyBtn: {
    position: 'absolute', top: '50%', marginTop: -12,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
    opacity: 0.65, cursor: 'pointer',
  },
  replyBtnRight: { right: -32 },
  replyBtnLeft: { left: -32 },
});

const rp = StyleSheet.create({
  wrap: {
    borderLeftWidth: 3, borderLeftColor: C.accent,
    backgroundColor: C.panel2, borderRadius: RADIUS.sm,
    paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6,
  },
  wrapMine: { backgroundColor: 'rgba(255,255,255,0.18)', borderLeftColor: C.white },
  name: { fontSize: FONT.xs, fontWeight: '700', color: C.accentText },
  nameMine: { color: C.white },
  text: { fontSize: FONT.xs, color: C.dim, marginTop: 1 },
  textMine: { color: 'rgba(255,255,255,0.85)' },
});

const at = StyleSheet.create({
  image: { width: 220, height: 160, borderRadius: RADIUS.md, backgroundColor: C.panel2 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.panel2, borderRadius: RADIUS.md,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: 200,
  },
  fileIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: C.accentDim,
    justifyContent: 'center', alignItems: 'center',
  },
  fileName: { fontSize: FONT.sm, color: C.text, fontWeight: '600' },
  fileSize: { fontSize: FONT.xs, color: C.dim, marginTop: 1 },
});