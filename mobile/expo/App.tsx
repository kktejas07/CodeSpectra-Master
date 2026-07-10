import React, { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'

import LoginScreen from './src/screens/LoginScreen'
import ArenaScreen from './src/screens/ArenaScreen'
import AgentScreen from './src/screens/AgentScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import ProblemsScreen from './src/screens/ProblemsScreen'
import ScannerScreen from './src/screens/ScannerScreen'
import CertificationsScreen from './src/screens/CertificationsScreen'
import { colors } from './src/theme'
import type { User } from './src/api/client'

const Tab = createBottomTabNavigator()

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Arena: '[A]',
    Agent: '[AI]',
    Problems: '[P]',
    Scanner: '[S]',
    Certs: '[C]',
    Profile: '[U]',
  }
  return (
    <Text style={{ color: focused ? colors.primary : colors.muted, fontSize: 11, fontWeight: '700' }}>
      {icons[name] || '[?]'}
    </Text>
  )
}

function MainTabs({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.cardBorder },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
      })}
    >
      <Tab.Screen name="Arena" component={ArenaScreen} options={{ headerTitle: 'Coding Arena' }} />
      <Tab.Screen name="Problems" component={ProblemsScreen} options={{ headerTitle: 'Problems' }} />
      <Tab.Screen name="Scanner" component={ScannerScreen} options={{ headerTitle: 'Code Scanner' }} />
      <Tab.Screen name="Certs" component={CertificationsScreen} options={{ headerTitle: 'Certifications' }} />
      <Tab.Screen name="Agent" component={AgentScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" options={{ headerTitle: 'Profile' }}>
        {() => <ProfileScreen user={user} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)

  if (!user) {
    return (
      <SafeAreaProvider>
        <LoginScreen onLogin={setUser} />
        <StatusBar style="light" />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <MainTabs user={user} onLogout={() => setUser(null)} />
        <StatusBar style="light" />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
