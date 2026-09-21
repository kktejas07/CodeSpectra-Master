import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { ThemeTokens } from '../api/client'
import { AdminScreen } from './AdminScreen'
import { AdminUsersScreen } from './AdminUsersScreen'
import { AdminKycScreen } from './AdminKycScreen'

const Stack = createNativeStackNavigator()

interface Props {
  theme: ThemeTokens
}

/** Nested stack inside the manifest-driven Admin tab (superadmin only). */
export function AdminStack({ theme }: Props): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="AdminHome" options={{ title: 'Admin' }}>
        {(p: any) => <AdminScreen theme={theme} onNavigate={p.navigation.navigate} />}
      </Stack.Screen>
      <Stack.Screen name="AdminUsers" options={{ title: 'Users & roles' }}>
        {() => <AdminUsersScreen theme={theme} />}
      </Stack.Screen>
      <Stack.Screen name="AdminKyc" options={{ title: 'KYC queue' }}>
        {() => <AdminKycScreen theme={theme} />}
      </Stack.Screen>
    </Stack.Navigator>
  )
}
