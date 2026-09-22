import React from 'react';
import { Text } from 'react-native';

// Map ten icon -> emoji/unicode, khong can load font gi ca
// Them icon moi vao day khi can
const ICONS = {
  // Navigation
  'chevron-forward':      '›',
  'close':               '✕',
  'arrow-back':          '←',

  // Auth
  'mail-outline':        '✉',
  'lock-closed-outline': '🔒',
  'person-outline':      '👤',
  'eye-outline':         '👁',
  'eye-off-outline':     '🙈',
  'log-in-outline':      '→',
  'person-add-outline':  '+',

  // Chat
  'chatbubbles':         '💬',
  'chatbubbles-outline': '💬',
  'chatbubble-outline':  '💬',
  'send':                '➤',
  'search':              '🔍',
  'search-outline':      '🔍',

  // Device
  'hardware-chip-outline': '⚡',

  // User actions
  'log-out-outline':     '⎋',
  'alert-circle-outline':'⚠',

  // Load more
  'arrow-up-circle-outline': '↑',

  // Reply / mention / file / group info (icon, reply, @mention, gửi file, panel nhóm)
  'arrow-undo-outline':   '↩',
  'document-text-outline': '📄',
  'download-outline':     '⬇',
  'attach-outline':       '📎',
  'image-outline':        '🖼',
  'happy-outline':        '😊',
  'people-outline':       '👥',
  'exit-outline':         '🚪',
  'link-outline':         '🔗',
  'folder-outline':       '🗂',
  'information-circle-outline': 'ℹ',
  'trash-outline':        '🗑',
  'copy-outline':         '⧉',
  'checkmark-circle':     '✓',
  'ellipsis-horizontal':  '⋯',
};

export function Icon({ name, size = 16, color, style }) {
  const symbol = ICONS[name] || '•';
  return (
    <Text
      style={[
        { fontSize: size, color: color || '#333', lineHeight: size + 4 },
        style,
      ]}
    >
      {symbol}
    </Text>
  );
}