import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon } from '../utils/icons';
import { C, FONT, SHADOW } from '../utils/theme';

export default function Avatar({ name = '?', isDevice = false, size = 'md' }) {
  const dim = { sm: 30, md: 44, lg: 56 }[size];
  const fontSize = { sm: FONT.sm, md: FONT.md, lg: FONT.xl }[size];
  const iconSize = { sm: 14, md: 20, lg: 26 }[size];
  const letter = name?.[0]?.toUpperCase() || '?';

  return (
    <View style={[s.base, { width: dim, height: dim, borderRadius: dim / 2 },
      isDevice ? s.device : s.human]}>
      {isDevice
        ? <Icon name="hardware-chip-outline" size={iconSize} color={C.deviceColor} />
        : <Text style={[s.letter, { fontSize }]}>{letter}</Text>
      }
    </View>
  );
}

const s = StyleSheet.create({
  base: { justifyContent: 'center', alignItems: 'center', ...SHADOW.sm },
  human: { backgroundColor: C.accentDim },
  device: { backgroundColor: C.deviceBg, borderWidth: 1, borderColor: C.deviceBorder },
  letter: { fontWeight: '700', color: C.accentText },
});
