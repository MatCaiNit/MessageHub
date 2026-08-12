import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { conversationApi, userApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../utils/icons';
import Avatar from '../components/Avatar';
import SearchBar from '../components/SearchBar';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

export default function GroupInfoScreen({ route, navigation }) {
  const { conversationId } = route.params;
  const { me } = useAuth();

  const [conv, setConv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const isAdmin = conv && String(conv.adminId?._id || conv.adminId) === me._id;

  useEffect(() => {
    loadDetail();
  }, []);

  const loadDetail = async () => {
    try {
      const { data } = await conversationApi.getDetail(conversationId);
      setConv(data);
      setNewName(data.name);
    } catch (err) {
      Alert.alert('Lỗi', err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveGroupName = async () => {
    if (!newName.trim()) return;
    try {
      await conversationApi.updateGroupInfo(conversationId, newName.trim());
      setConv((prev) => ({ ...prev, name: newName.trim() }));
      navigation.setOptions({ title: newName.trim() });
      setEditingName(false);
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message || err.message);
    }
  };

  const searchUsers = async (q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await userApi.search(q.trim());
      // Loc ra nhung nguoi chua o trong nhom
      const memberIds = conv.participants.map((p) => p._id);
      setSearchResults(data.filter((u) => !memberIds.includes(u._id)));
    } catch (_) {}
    setSearching(false);
  };

  const addMember = async (user) => {
    try {
      const { data } = await conversationApi.addMember(conversationId, user._id);
      setConv(data);
      setSearchQuery('');
      setSearchResults([]);
      setShowSearch(false);
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message || err.message);
    }
  };

  const removeMember = (user) => {
    const isSelf = user._id === me._id;
    Alert.alert(
      isSelf ? 'Rời nhóm?' : `Xóa ${user.username}?`,
      isSelf ? 'Bạn sẽ không còn trong nhóm này nữa.' : `Xóa ${user.username} khỏi nhóm?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: isSelf ? 'Rời nhóm' : 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isSelf) {
                await conversationApi.leaveGroup(conversationId);
                navigation.popToTop();
              } else {
                await conversationApi.kickMember(conversationId, user._id);
                loadDetail();
              }
            } catch (err) {
              Alert.alert('Lỗi', err.response?.data?.message || err.message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.accent} /></View>;
  }

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">

      {/* Avatar nhóm + tên */}
      <View style={s.topSection}>
        <View style={s.groupAvatar}>
          <Text style={s.groupAvatarText}>{conv?.name?.[0]?.toUpperCase() || 'G'}</Text>
        </View>

        {editingName ? (
          <View style={s.nameEditRow}>
            <TextInput
              style={s.nameInput}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              maxLength={50}
            />
            <TouchableOpacity style={s.saveBtn} onPress={saveGroupName}>
              <Text style={s.saveBtnText}>Lưu</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingName(false)}>
              <Text style={s.cancelBtnText}>Huỷ</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.nameRow} onPress={() => isAdmin && setEditingName(true)}>
            <Text style={s.groupName}>{conv?.name}</Text>
            {isAdmin && <Icon name="person-outline" size={14} color={C.dim} style={{ marginLeft: 6 }} />}
          </TouchableOpacity>
        )}

        <Text style={s.memberCount}>{conv?.participants?.length} thành viên</Text>
      </View>

      {/* Thêm thành viên (chỉ admin) */}
      {isAdmin && (
        <View style={s.section}>
          <TouchableOpacity style={s.addBtn} onPress={() => setShowSearch((v) => !v)}>
            <Icon name="person-add-outline" size={16} color={C.accent} />
            <Text style={s.addBtnText}>Thêm thành viên</Text>
          </TouchableOpacity>

          {showSearch && (
            <View style={{ marginTop: 10 }}>
              <SearchBar
                value={searchQuery}
                onChangeText={searchUsers}
                placeholder="Tìm username..."
                loading={searching}
                autoFocus
              />
              {searchResults.map((u) => (
                <TouchableOpacity key={u._id} style={s.userRow} onPress={() => addMember(u)}>
                  <Avatar name={u.username} size="sm" />
                  <Text style={s.userName}>{u.username}</Text>
                  <Text style={s.addText}>+ Thêm</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Danh sách thành viên */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>THÀNH VIÊN</Text>
        {conv?.participants?.map((user) => {
          const isMe = user._id === me._id;
          const isGroupAdmin = String(conv.adminId?._id || conv.adminId) === user._id;
          const canRemove = isAdmin || isMe;

          return (
            <View key={user._id} style={s.memberRow}>
              <Avatar name={user.username} size="sm" />
              <View style={{ flex: 1 }}>
                <View style={s.memberNameRow}>
                  <Text style={s.memberName}>{user.username}</Text>
                  {isGroupAdmin && (
                    <View style={s.adminBadge}>
                      <Text style={s.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                  {isMe && <Text style={s.meBadge}>(Bạn)</Text>}
                </View>
              </View>
              {canRemove && (
                <TouchableOpacity onPress={() => removeMember(user)} style={s.removeBtn}>
                  <Text style={s.removeText}>{isMe ? 'Rời' : '✕'}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topSection: { alignItems: 'center', paddingVertical: 28, backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border },
  groupAvatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, ...SHADOW.md,
  },
  groupAvatarText: { fontSize: 32, fontWeight: '700', color: C.white },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  groupName: { fontSize: FONT.xl, fontWeight: '700', color: C.text },
  memberCount: { fontSize: FONT.sm, color: C.dim, marginTop: 4 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  nameInput: {
    flex: 1, fontSize: FONT.md, color: C.text,
    borderBottomWidth: 2, borderBottomColor: C.accent, paddingVertical: 4,
  },
  saveBtn: { backgroundColor: C.accent, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 6 },
  saveBtnText: { color: C.white, fontWeight: '600', fontSize: FONT.sm },
  cancelBtn: { paddingHorizontal: 8 },
  cancelBtnText: { color: C.dim, fontSize: FONT.sm },

  section: { padding: 16 },
  sectionLabel: { fontSize: FONT.xs, fontWeight: '600', color: C.dim, letterSpacing: 0.8, marginBottom: 10 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.accentDim, borderRadius: RADIUS.md,
    padding: 12, borderWidth: 1, borderColor: C.accent,
  },
  addBtnText: { fontSize: FONT.base, color: C.accentText, fontWeight: '500' },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.panel, padding: 10, borderRadius: RADIUS.md,
    marginTop: 8, borderWidth: 1, borderColor: C.border,
  },
  userName: { flex: 1, fontSize: FONT.base, fontWeight: '500', color: C.text },
  addText: { fontSize: FONT.sm, color: C.accent, fontWeight: '600' },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.panel, padding: 12, borderRadius: RADIUS.md,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontSize: FONT.base, fontWeight: '500', color: C.text },
  adminBadge: {
    backgroundColor: C.accentDim, borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: C.accent,
  },
  adminBadgeText: { fontSize: FONT.xs, color: C.accentText, fontWeight: '600' },
  meBadge: { fontSize: FONT.xs, color: C.dim },
  removeBtn: { padding: 6 },
  removeText: { fontSize: FONT.sm, color: C.danger, fontWeight: '600' },
});