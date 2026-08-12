import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { conversationApi, userApi } from '../api';
import { Icon } from '../utils/icons';
import Avatar from '../components/Avatar';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

export default function CreateGroupScreen({ navigation }) {
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]); // [{_id, username}]
  const [creating, setCreating] = useState(false);

  const searchUsers = async (q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await userApi.search(q.trim());
      setSearchResults(data);
    } catch (_) {}
    setSearching(false);
  };

  const toggleMember = (user) => {
    setSelectedMembers((prev) => {
      const exists = prev.find((m) => m._id === user._id);
      return exists ? prev.filter((m) => m._id !== user._id) : [...prev, user];
    });
  };

  const isSelected = (user) => selectedMembers.some((m) => m._id === user._id);

  const createGroup = async () => {
    if (!groupName.trim()) { Alert.alert('Lỗi', 'Vui lòng nhập tên nhóm'); return; }
    if (selectedMembers.length === 0) { Alert.alert('Lỗi', 'Chọn ít nhất 1 thành viên'); return; }
    setCreating(true);
    try {
      const { data } = await conversationApi.createGroup(
        groupName.trim(),
        selectedMembers.map((m) => m._id)
      );
      navigation.replace('Chat', { conversationId: data._id, title: data.name, convType: 'group' });
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message || err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={s.container}>
      <ScrollView keyboardShouldPersistTaps="handled">

        {/* Tên nhóm */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>TÊN NHÓM</Text>
          <View style={s.nameInput}>
            <TextInput
              style={s.nameText}
              placeholder="Nhập tên nhóm..."
              placeholderTextColor={C.dim}
              value={groupName}
              onChangeText={setGroupName}
              maxLength={50}
            />
          </View>
        </View>

        {/* Thành viên đã chọn */}
        {selectedMembers.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>ĐÃ CHỌN ({selectedMembers.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.selectedRow}>
              {selectedMembers.map((m) => (
                <TouchableOpacity key={m._id} style={s.selectedChip} onPress={() => toggleMember(m)}>
                  <Avatar name={m.username} size="sm" />
                  <Text style={s.chipName}>{m.username}</Text>
                  <Text style={s.chipRemove}>✕</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Tìm kiếm thành viên */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>THÊM THÀNH VIÊN</Text>
          <View style={s.searchWrap}>
            <Icon name="search-outline" size={16} color={C.dim} style={{ marginRight: 8 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Tìm username..."
              placeholderTextColor={C.dim}
              value={searchQuery}
              onChangeText={searchUsers}
              autoCapitalize="none"
            />
            {searching && <ActivityIndicator size="small" color={C.accent} />}
          </View>

          {searchResults.map((user) => {
            const selected = isSelected(user);
            return (
              <TouchableOpacity key={user._id} style={s.userRow} onPress={() => toggleMember(user)}>
                <Avatar name={user.username} size="sm" />
                <View style={{ flex: 1 }}>
                  <Text style={s.userName}>{user.username}</Text>
                  <Text style={s.userEmail}>{user.email}</Text>
                </View>
                <View style={[s.checkbox, selected && s.checkboxOn]}>
                  {selected && <Text style={s.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>

      {/* Nút tạo nhóm */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.createBtn, (creating || !groupName.trim() || selectedMembers.length === 0) && s.createBtnDisabled]}
          onPress={createGroup}
          disabled={creating || !groupName.trim() || selectedMembers.length === 0}
        >
          {creating
            ? <ActivityIndicator color={C.white} />
            : <Text style={s.createBtnText}>Tạo nhóm ({selectedMembers.length + 1} người)</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: {
    fontSize: FONT.xs, fontWeight: '600', color: C.dim,
    letterSpacing: 0.8, marginBottom: 10,
  },
  nameInput: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.md, paddingHorizontal: 14, ...SHADOW.sm,
  },
  nameText: { fontSize: FONT.md, color: C.text, paddingVertical: 12 },

  selectedRow: { marginBottom: 4 },
  selectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.accentDim, borderRadius: RADIUS.full,
    paddingVertical: 6, paddingHorizontal: 10, marginRight: 8,
    borderWidth: 1, borderColor: C.accent,
  },
  chipName: { fontSize: FONT.sm, color: C.accentText, fontWeight: '500' },
  chipRemove: { fontSize: FONT.xs, color: C.dim },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: FONT.base, color: C.text },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.panel, padding: 12,
    borderRadius: RADIUS.md, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  userName: { fontSize: FONT.base, fontWeight: '600', color: C.text },
  userEmail: { fontSize: FONT.xs, color: C.dim },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark: { color: C.white, fontSize: FONT.sm, fontWeight: '700' },

  footer: {
    padding: 16, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.panel,
  },
  createBtn: {
    backgroundColor: C.accent, borderRadius: RADIUS.md,
    paddingVertical: 14, alignItems: 'center',
  },
  createBtnDisabled: { backgroundColor: C.panel2 },
  createBtnText: { color: C.white, fontWeight: '700', fontSize: FONT.base },
});
