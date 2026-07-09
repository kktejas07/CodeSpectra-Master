import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Text } from 'react-native'

import ProblemsScreen from './src/screens/ProblemsScreen'
import ScannerScreen from './src/screens/ScannerScreen'
import CertificationsScreen from './src/screens/CertificationsScreen'

const Tab = createBottomTabNavigator()

function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    Problems: '[P]',
    Scanner: '[S]',
    Certifications: '[C]',
  }
  return <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{icons[name] || '[?]'}</Text>
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
            tabBarActiveTintColor: '#38bdf8',
            tabBarInactiveTintColor: '#71717a',
            tabBarStyle: {
              backgroundColor: '#18181b',
              borderTopColor: '#27272a',
            },
            headerStyle: { backgroundColor: '#09090b' },
            headerTintColor: '#fafafa',
          })}
        >
          <Tab.Screen name="Problems" component={ProblemsScreen} />
          <Tab.Screen name="Scanner" component={ScannerScreen} />
          <Tab.Screen name="Certifications" component={CertificationsScreen} />
        </Tab.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
