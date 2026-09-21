/**
 * Stage-1 shell: auth gate → bootstrap manifest → bottom tabs rendered
 * purely from server data. No tab list, role check, or color is compiled
 * in (beyond the offline fallback theme and the icon registry).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, AppState } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import {
  Home, Code2, BookOpen, ClipboardList, Trophy, Gavel, Shield, User,
  type LucideIcon,
} from 'lucide-react-native'
import {
  getToken, clearToken, fetchBootstrap, cachedBootstrap,
  type BootstrapDoc, type ThemeTokens,
} from './src/api/client'
import { FALLBACK_THEME, MIN_TOUCH } from './src/theme'
import { LoginScreen } from './src/screens/LoginScreen'
import { TabPlaceholder } from './src/screens/TabPlaceholder'

const Tab = createBottomTabNavigator()

/** Closed icon registry: string key → component. Lookup, not policy. */
const ICONS: Record<string, LucideIcon> = {
  home: Home,
  'code-2': Code2,
  'book-open': BookOpen,
  'clipboard-list': ClipboardList,
  trophy: Trophy,
  gavel: Gavel,
  shield: Shield,
  user: User,
}

const RANK: Record<string, number> = { user: 0, judge: 1, tenant_admin: 2, superadmin: 3 }

type Status = 'loading' | 'login' | 'ready'

export default function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>('loading')
  const [doc, setDoc] = useState<BootstrapDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  const boot = useCallback(async (): Promise<void> => {
    setError(null)
    const token = await getToken()
    if (!token) {
      setStatus('login')
      return
    }
    try {
      const fresh = await fetchBootstrap()
      setDoc(fresh)
      setStatus('ready')
    } catch (e) {
      // Offline: last cached shell still renders (mutations will fail loudly).
      const cached = await cachedBootstrap()
      if (cached) {
        setDoc(cached)
        setStatus('ready')
      } else {
        setError(e instanceof Error ? e.message : 'Could not reach the server.')
        setStatus('login')
      }
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  // Re-bootstrap when returning to foreground (role/permission changes apply).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void getToken().then((t) => {
        if (t) fetchBootstrap().then(setDoc).catch(() => {})
      })
    })
    return () => sub.remove()
  }, [])

  const signOut = useCallback(async (): Promise<void> => {
    await clearToken()
    setDoc(null)
    setStatus('login')
  }, [])

  if (status === 'loading') {
    return (
      <SafeAreaProvider>
        <View style={[styles.center, { backgroundColor: FALLBACK_THEME.background }]}>
          <ActivityIndicator size="large" color={FALLBACK_THEME.primary} />
        </View>
      </SafeAreaProvider>
    )
  }

  if (status === 'login' || !doc) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: FALLBACK_THEME.background }}>
          <StatusBar style="light" />
          {error ? <Text style={styles.bootError}>{error}</Text> : null}
          <LoginScreen theme={doc?.theme ?? FALLBACK_THEME} onLoggedIn={() => void boot()} />
        </View>
      </SafeAreaProvider>
    )
  }

  const theme: ThemeTokens = doc.theme ?? FALLBACK_THEME

  if (doc.flags.maintenanceMode) {
    return (
      <SafeAreaProvider>
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <Text style={[styles.blockTitle, { color: theme.text }]}>Maintenance</Text>
          <Text style={[styles.blockBody, { color: theme.muted }]}>CodeSpectra is briefly down for maintenance.</Text>
        </View>
      </SafeAreaProvider>
    )
  }

  // Client-side mirror of the server gate (defense in depth only).
  const myRank = RANK[doc.user.role] ?? 0
  const tabs = doc.tabs.filter((t) => (RANK[t.minRole] ?? 0) <= myRank)

  const navTheme = {
    ...DefaultTheme,
    dark: theme.mode === 'dark',
    colors: {
      ...DefaultTheme.colors,
      primary: theme.primary,
      background: theme.background,
      card: theme.card,
      text: theme.text,
      border: theme.border,
    },
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border, minHeight: 60 },
            tabBarActiveTintColor: theme.primary,
            tabBarInactiveTintColor: theme.muted,
          }}
        >
          {tabs.map((t) => {
            const Icon = ICONS[t.icon] ?? User
            return (
              <Tab.Screen
                key={t.id}
                name={t.label}
                options={{
                  // ponytail: lucide-react-native types expose SvgProps (no
                  // `color`) — `stroke` is what its color prop sets internally.
                  tabBarIcon: ({ color, size }) => <Icon stroke={color} size={size} />,
                  tabBarBadge: t.badge && t.badge > 0 ? t.badge : undefined,
                }}
              >
                {() => (
                  <View style={{ flex: 1, backgroundColor: theme.background }}>
                    {doc.flags.faceEnrollmentRequired && t.id !== 'profile' ? (
                      <View style={[styles.center, { flex: 1 }]}>
                        <Text style={[styles.blockTitle, { color: theme.text }]}>Face enrollment required</Text>
                        <Text style={[styles.blockBody, { color: theme.muted }]}>
                          Complete biometric enrollment on the web to unlock proctored assessments.
                        </Text>
                      </View>
                    ) : (
                      <TabPlaceholder theme={theme} tab={t} userName={doc.user.name ?? doc.user.email} />
                    )}
                    {t.id === 'profile' ? (
                      <TouchableOpacity
                        style={[styles.signOut, { borderColor: theme.border }]}
                        onPress={() => void signOut()}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.signOutText, { color: '#F87171' }]}>
                          Sign out
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </Tab.Screen>
            )
          })}
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bootError: { color: '#F87171', fontSize: 13, textAlign: 'center', paddingTop: 48, paddingHorizontal: 24 },
  blockTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  blockBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  signOut: {
    borderTopWidth: 1, minHeight: MIN_TOUCH,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  signOutText: { fontSize: 15, fontWeight: '600' },
})
