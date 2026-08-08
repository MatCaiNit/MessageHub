import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, FONT } from '../utils/theme';

export default function TypingIndicator({ text }) {
  if (!text) return null;

  return (
    <View style={s.row}>
      <View style={s.dots}>
        {[0, 1, 2].map((i) => <View key={i} style={s.dot} />)}
      </View>
      <Text style={s.text}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.dim },
  text: { fontSize: FONT.sm, color: C.dim, fontStyle: 'italic' },
});
