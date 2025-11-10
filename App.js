// App.js
import 'react-native-gesture-handler';
import React from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// ✅ Safe area (handles Pixels + notches)
import {
  SafeAreaProvider,
  useSafeAreaInsets,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

import Feather from 'react-native-vector-icons/Feather';

import Landing from './screens/landing';
import Home from './screens/home';
import Workout from './screens/workout';
import Tracking from './screens/tracking';

import { BLEProvider } from './contexts/BLEContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: '#fff',
          borderTopWidth: 0,
          elevation: 0,
          // height/padding respect device bottom inset (gesture bar / nav bar)
          height: 56 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 6),
        },
        tabBarIcon: ({ focused }) => {
          let iconName;
          if (route.name === 'Home') iconName = 'home';
          else if (route.name === 'Workout') iconName = 'activity';
          else if (route.name === 'Tracking') iconName = 'trending-up';

          const icon = <Feather name={iconName} size={20} color={focused ? '#000' : '#999'} />;
          const label = (
            <Text style={{ color: focused ? '#000' : '#999', fontSize: 11, marginTop: 4 }}>
              {route.name}
            </Text>
          );

          return focused ? (
            <View
              style={[
                styles.bubble,
                // keep the bubble visually centered above the tab bar edge
                { marginBottom: insets.bottom ? -insets.bottom : (Platform.OS === 'ios' ? -20 : -10) },
              ]}
            >
              {icon}
              {label}
            </View>
          ) : (
            <View style={styles.iconWrap}>
              {icon}
              {label}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Workout" component={Workout} />
      <Tab.Screen name="Tracking" component={Tracking} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* initialWindowMetrics ensures correct insets on first render (fixes Pixel punch-hole cutouts) */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        {/* Draw under the status bar; SafeAreaView in screens will apply top padding */}
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <BLEProvider>
          <NavigationContainer>
            <Stack.Navigator initialRouteName="Landing" screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Landing" component={Landing} />
              <Stack.Screen name="MainTabs" component={MainTabs} />
            </Stack.Navigator>
          </NavigationContainer>
        </BLEProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC300',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    marginTop: -16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
