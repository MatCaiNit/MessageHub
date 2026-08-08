import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Icon } from '../utils/icons';
import { useMessages } from '../hooks/useMessages';
import { useTyping } from '../hooks/useTyping';
import MessageBubble from '../components/MessageBubble';
import TypingIndicator from '../components/TypingIndicator';
import { C, FONT, RADIUS, SHADOW } from '../utils/theme';

export default function ChatScreen({ route, navigation }) {
  const { conversationId, title, convType } = route.params;
  const [inputValue, setInputValue] = useState('');
  const {
    messages, hasMore, loadingOlder, flatListRef,
    loadMessages, loadOlder, sendMessage, recallMessage, deleteMessage, me,
  } = useMessages(conversationId);
  const { typingText, emitTyping, stopTyping } = useTyping(conversationId, title);

  useEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => convType === 'device'
        ? <Text style={{ marginRight: 14, fontSize: 18 }}>⚡</Text>
        : null,
    });
    loadMessages(true);
  }, [conversationId]);

  const handleSend = () => {
    sendMessage(inputValue);
    setInputValue('');
    stopTyping();
  };

  const handleChangeText = (text) => {
    setInputValue(text);
    emitTyping();
  };

  const onLongPress = (msg) => {
    const isMine = String(msg.senderId?._id || msg.senderId) === me._id;
    if (!isMine || msg.isRecalled) return;
    Alert.alert('Tuỳ chọn', '', [
      { text: '↩ Thu hồi', onPress: () => recallMessage(msg._id) },
      { text: '🗑 Xoá (phía mình)', onPress: () => deleteMessage(msg._id) },
      { text: 'Huỷ', style: 'cancel' },
    ]);
  };

  const renderItem = ({ item, index }) => {
    const prevMsg = messages[index - 1];
    const isMine = String(item.senderId?._id || item.senderId) === me._id;
    const isSameSender = prevMsg &&
      (prevMsg.senderId?._id || prevMsg.senderId) === (item.senderId?._id || item.senderId);
    return (
      <MessageBubble
        message={item} isMine={isMine}
        isSameSender={isSameSender} onLongPress={onLongPress}
      />
    );
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {hasMore && (
        <TouchableOpacity style={s.loadOlderBtn} onPress={loadOlder} disabled={loadingOlder}>
          {loadingOlder
            ? <ActivityIndicator color={C.accent} size="small" />
            : <Text style={s.loadOlderText}>↑ Tin nhắn cũ hơn</Text>
          }
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
      />

      <TypingIndicator text={typingText} />

      <View style={s.inputArea}>
        <View style={s.inputWrap}>
          <TextInput
            style={s.input}
            placeholder="Nhập tin nhắn..."
            placeholderTextColor={C.dim}
            value={inputValue}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
            multiline
            scrollEnabled
          />
        </View>
        <TouchableOpacity
          style={[s.sendBtn, !inputValue.trim() && s.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputValue.trim()}
        >
          <Icon name="send" size={16} color={inputValue.trim() ? C.white : C.dim} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  list: { paddingHorizontal: 12, paddingVertical: 10 },
  loadOlderBtn: {
    alignItems: 'center', padding: 10,
    borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel,
  },
  loadOlderText: { fontSize: FONT.sm, color: C.accent, fontWeight: '500' },
  inputArea: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10, backgroundColor: C.panel, borderTopWidth: 1, borderTopColor: C.border,
  },
  inputWrap: {
    flex: 1, backgroundColor: C.panel2,
    borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 8, maxHeight: 120,
  },
  input: { fontSize: FONT.base, color: C.text, minHeight: 22, maxHeight: 100 },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center', ...SHADOW.sm,
  },
  sendBtnDisabled: { backgroundColor: C.panel2 },
});
