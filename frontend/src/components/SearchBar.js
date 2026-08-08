import React from 'react';
import { View, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../utils/icons';
import { C, FONT, RADIUS } from '../utils/theme';

export default function SearchBar({ value, onChangeText, placeholder, loading, autoFocus }) {
  return (
    <View style={s.wrap}>
      <Icon name="search-outline" size={16} color={C.dim} style={s.icon} />
      <TextInput
        style={s.input}
        placeholder={placeholder || 'Tìm kiếm...'}
        placeholderTextColor={C.dim}
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {loading && <ActivityIndicator size="small" color={C.accent} />}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 8,
  },
  icon: { marginRight: 6 },
  input: { flex: 1, fontSize: FONT.base, color: C.text },
});
