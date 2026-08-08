import React from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Icon } from '../utils/icons';
import { useConversations } from '../hooks/useConversations';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ConversationItem from '../components/ConversationItem';
import Avatar from '../components/Avatar';
import SearchBar from '../components/SearchBar';
import { C, FONT, RADIUS } from '../utils/theme';

export default function ConversationListScreen({ navigation }) {
  const { me, logout } = useAuth();
  const { connected } = useSocket();
  const {
    conversations, hasMore, loadingMore, refreshing,
    searchQuery, searchResults, searching, searchMode,
    onRefresh, loadMore, searchUsers, startConversation, toggleSearchMode,
  } = useConversations();

  const openConv = (conv) => {
    const other = conv.participants?.find((p) => p._id !== me._id);
    const title = conv.type === 'device'
      ? (conv.name || 'Thiết bị')
      : (other?.username || conv.name || 'Chat');
    navigation.navigate('Chat', { conversationId: conv._id, title, convType: conv.type });
  };

  const handleStartChat = async (user) => {
    const conv = await startConversation(user);
    if (conv) navigation.navigate('Chat', { conversationId: conv._id, title: user.username });
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={[s.statusDot, connected && s.statusOn]} />
          <Text style={s.headerMe}>{me?.username}</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn} onPress={toggleSearchMode}>
            <Icon name={searchMode ? 'close' : 'search'} size={18} color={C.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() =>
            Alert.alert('Đăng xuất?', '', [
              { text: 'Huỷ', style: 'cancel' },
              { text: 'Đăng xuất', style: 'destructive', onPress: logout },
            ])
          }>
            <Icon name="log-out-outline" size={18} color={C.dim} />
          </TouchableOpacity>
        </View>
      </View>

      {searchMode && (
        <View style={s.searchBox}>
          <SearchBar
            value={searchQuery}
            onChangeText={searchUsers}
            placeholder="Tìm username để chat..."
            loading={searching}
            autoFocus
          />
          {searchResults.map((u) => (
            <TouchableOpacity key={u._id} style={s.searchResult} onPress={() => handleStartChat(u)}>
              <Avatar name={u.username} size="sm" />
              <View style={{ flex: 1 }}>
                <Text style={s.searchName}>{u.username}</Text>
                <Text style={s.searchEmail}>{u.email}</Text>
              </View>
              <Icon name="chatbubble-outline" size={16} color={C.accent} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={conversations}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <ConversationItem conversation={item} myId={me?._id} onPress={() => openConv(item)} />
        )}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListHeaderComponent={<Text style={s.sectionLabel}>Cuộc trò chuyện</Text>}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={C.accent} style={{ padding: 14 }} /> : null
        }
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>💬</Text>
            <Text style={s.emptyText}>Chưa có cuộc trò chuyện nào</Text>
            <Text style={s.emptyHint}>Bấm 🔍 để tìm người bắt đầu chat</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.danger },
  statusOn: { backgroundColor: C.ok },
  headerMe: { fontSize: FONT.md, fontWeight: '700', color: C.text },
  headerRight: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 8, borderRadius: RADIUS.full },
  searchBox: {
    backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border, padding: 12, gap: 8,
  },
  searchResult: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.borderLight,
  },
  searchName: { fontSize: FONT.base, fontWeight: '600', color: C.text },
  searchEmail: { fontSize: FONT.xs, color: C.dim },
  sectionLabel: {
    fontSize: FONT.xs, fontWeight: '600', color: C.dim,
    paddingHorizontal: 16, paddingVertical: 10,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  separator: { height: 1, backgroundColor: C.borderLight, marginLeft: 76 },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: FONT.md, fontWeight: '600', color: C.dim },
  emptyHint: { fontSize: FONT.sm, color: C.dim },
});
