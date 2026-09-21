import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { ThemeTokens } from '../api/client'
import { ProblemsScreen } from './ProblemsScreen'
import { ProblemDetailScreen } from './ProblemDetailScreen'

const Stack = createNativeStackNavigator()

interface Props {
  theme: ThemeTokens
}

/** Nested stack inside the manifest-driven Problems tab. */
export function ProblemsStack({ theme }: Props): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="ProblemsList" options={{ title: 'Problems' }}>
        {(p: any) => <ProblemsScreen theme={theme} navigation={p.navigation} />}
      </Stack.Screen>
      <Stack.Screen
        name="ProblemDetail"
        options={({ route }: any) => ({ title: route?.params?.title ?? 'Problem' })}
      >
        {(p: any) => <ProblemDetailScreen theme={theme} route={p.route} />}
      </Stack.Screen>
    </Stack.Navigator>
  )
}
