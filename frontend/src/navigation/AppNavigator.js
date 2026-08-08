import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../screens/AuthScreen';
import ConversationListScreen from '../screens/ConversationListScreen';
import ChatScreen from '../screens/ChatScreen';
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
              <Stack.Screen
                name="ConversationList"
                component={ConversationListScreen}
                options={{ title: 'MessageHub' }}
              />
              <Stack.Screen name="Chat" component={ChatScreen} />
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
