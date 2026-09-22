import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { ThemeTokens } from '../api/client'
import { CoursesScreen } from './CoursesScreen'
import { CourseDetailScreen } from './CourseDetailScreen'

const Stack = createNativeStackNavigator()

interface Props {
  theme: ThemeTokens
}

/** Nested stack inside the manifest-driven Courses tab. */
export function CoursesStack({ theme }: Props): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="CoursesList" options={{ title: 'Courses' }}>
        {(p: any) => <CoursesScreen theme={theme} navigation={p.navigation} />}
      </Stack.Screen>
      <Stack.Screen
        name="CourseDetail"
        options={({ route }: any) => ({ title: route?.params?.title ?? 'Course' })}
      >
        {(p: any) => <CourseDetailScreen theme={theme} route={p.route} />}
      </Stack.Screen>
    </Stack.Navigator>
  )
}
