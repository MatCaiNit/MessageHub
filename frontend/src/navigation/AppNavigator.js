import React from 'react';
import { Platform, ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../context/AuthContext';

// Screens cho mobile
import AuthScreen from '../screens/AuthScreen';
import ConversationListScreen from '../screens/ConversationListScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';

// Layout 2 cột cho web
import WebLayout from '../layouts/WebLayout';

import { C } from '../utils/theme';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  // Tren web: dung layout 2 cot (sidebar + chat), khong dung Stack Navigator
  if (Platform.OS === 'web') {
    if (!me) return <AuthScreen />;
    return (
      <View style={{ flex: 1, height: '100vh' }}>
        <WebLayout />
      </View>
    );
  }

  // Tren mobile: dung Stack Navigator binh thuong
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: C.panel, elevation: 1, shadowOpacity: 0.1 },
            headerTintColor: C.text,
            headerTitleStyle: { fontSize: 16, fontWeight: '700', color: C.text },
            cardStyle: { backgroundColor: C.bg },
          }}
        >
          {me ? (
            <>
              <Stack.Screen name="ConversationList" component={ConversationListScreen} options={{ title: 'MessageHub' }} />
              <Stack.Screen name="Chat" component={ChatScreen} />
              <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ title: 'Tạo nhóm mới' }} />
              <Stack.Screen name="GroupInfo" component={GroupInfoScreen} options={({ route }) => ({ title: route.params?.title || 'Thông tin nhóm' })} />
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
