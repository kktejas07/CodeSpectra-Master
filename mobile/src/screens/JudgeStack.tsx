import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { ThemeTokens } from '../api/client'
import type { JudgeRole } from '../api/judge'
import { JudgeScreen } from './JudgeScreen'
import { JudgeSubmissionsScreen } from './JudgeSubmissionsScreen'
import { JudgeScoreScreen } from './JudgeScoreScreen'

const Stack = createNativeStackNavigator()

interface Props {
  theme: ThemeTokens
  role: JudgeRole
}

/** Nested stack inside the manifest-driven Judge tab. */
export function JudgeStack({ theme, role }: Props): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="JudgeEvents" options={{ title: 'Judge' }}>
        {(p: any) => <JudgeScreen theme={theme} role={role} navigation={p.navigation} />}
      </Stack.Screen>
      <Stack.Screen
        name="JudgeSubmissions"
        options={({ route }: any) => ({ title: route?.params?.event?.name ?? 'Submissions' })}
      >
        {(p: any) => <JudgeSubmissionsScreen theme={theme} route={p.route} navigation={p.navigation} />}
      </Stack.Screen>
      <Stack.Screen name="JudgeScore" options={{ title: 'Score submission' }}>
        {(p: any) => <JudgeScoreScreen theme={theme} route={p.route} />}
      </Stack.Screen>
    </Stack.Navigator>
  )
}
