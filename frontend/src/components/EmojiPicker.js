import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { C } from '../utils/theme';


const EMOJI_LIST = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰','😗',
  '🙂','🤗','🤔','😐','😑','😶','🙄','😏','😣','😥','😮','😯','😪','😫','😴','😌',
  '😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','🙁','😖','😞','😟','😤',
  '😢','😭','😦','😧','😨','😩','😬','😰','😱','😳','😵','😡','😠','😷','🤒','🤕',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💖','💗','💯','💥','💫','⭐',
  '👍','👎','👌','✌️','🤞','🤝','👏','🙏','💪','🤙','👋','✋','👊','✊','👇','👆',
  '🎉','🎊','🎁','🎂','🎈','🌸','🌹','🔥','⚡','💡','☀️','🌙','🌈','☁️','☔','❄️',
  '☕','🍺','🍔','🍕','🍜','🍣','🍎','🍌','🍇','🍓','⚽','🏀','🎮','🎵','📷','💻',
  '📱','🚀','✈️','🚗','✅','❌','⚠️','🚫','🔒','🔓','🔔','🔕','📌','📍','🌡️','💧',
];

export default function EmojiPicker({ visible, onSelect }) {
  if (!visible) return null;
  return (
    <View style={s.panel}>
      <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        <View style={s.grid}>
          {EMOJI_LIST.map((e, i) => (
            <TouchableOpacity key={i} style={s.cell} onPress={() => onSelect(e)} activeOpacity={0.5}>
              <Text style={s.emoji}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    height: 230, backgroundColor: C.panel,
    borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 6, paddingTop: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '12.5%', alignItems: 'center', justifyContent: 'center', paddingVertical: 7 },
  emoji: { fontSize: 24 },
});