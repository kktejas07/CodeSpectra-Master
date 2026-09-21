/**
 * App shell: native splash → animated splash → auth gate → bootstrap
 * manifest → bottom tabs rendered purely from server data.
 *
 * No tab list, role check, or colour is compiled in beyond the offline
 * fallback theme and the closed icon registry.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, AppState, Animated, Easing,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as NativeSplash from 'expo-splash-screen'
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
import { SplashScreen } from './src/screens/SplashScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { TabPlaceholder } from './src/screens/TabPlaceholder'
import { ProblemsStack } from './src/screens/ProblemsStack'
import { JudgeStack } from './src/screens/JudgeStack'

// Hold the native splash until React has painted the in-app splash, so
// there is never a white flash between them.
NativeSplash.preventAutoHideAsync().catch(() => {})

/** Keep the splash up at least this long — avoids an unpleasant flicker. */
const MIN_SPLASH_MS = 900
const SPLASH_FADE_MS = 240

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
  const [showSplash, setShowSplash] = useState(true)
  const splashOpacity = useRef(new Animated.Value(1)).current
  const nativeHidden = useRef(false)

  const boot = useCallback(async (): Promise<void> => {
    setError(null)
    const began = Date.now()
    let next: Status = 'login'
    let nextDoc: BootstrapDoc | null = null

    const token = await getToken()
    if (token) {
      try {
        nextDoc = await fetchBootstrap()
        next = 'ready'
      } catch (e) {
        // Offline: last cached shell still renders (mutations fail loudly).
        const cached = await cachedBootstrap()
        if (cached) {
          nextDoc = cached
          next = 'ready'
        } else {
          setError(e instanceof Error ? e.message : 'Could not reach the server.')
        }
      }
    }

    // Hold the splash for its minimum time even on a warm cache.
    const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - began))
    setTimeout(() => {
      setDoc(nextDoc)
      setStatus(next)
    }, wait)
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  /** Hide the native splash once our own splash has mounted. */
  const onRootLayout = useCallback((): void => {
    if (nativeHidden.current) return
    nativeHidden.current = true
    NativeSplash.hideAsync().catch(() => {})
  }, [])

  /** Crossfade the splash away as soon as boot resolves. */
  useEffect(() => {
    if (status === 'loading') return
    Animated.timing(splashOpacity, {
      toValue: 0, duration: SPLASH_FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShowSplash(false)
    })
  }, [status, splashOpacity])

  // Re-bootstrap on foreground so role/permission changes apply.
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

  const theme: ThemeTokens = doc?.theme ?? FALLBACK_THEME

  const shell = (children: React.ReactNode): React.JSX.Element => (
    <SafeAreaProvider>
      <View style={styles.root} onLayout={onRootLayout}>
        {children}
        {showSplash ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: splashOpacity }]}
            pointerEvents={status === 'loading' ? 'auto' : 'none'}
          >
            <SplashScreen />
          </Animated.View>
        ) : null}
      </View>
    </SafeAreaProvider>
  )

  if (status === 'login' || !doc) {
    return shell(
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style="light" />
        {error ? <Text style={styles.bootError}>{error}</Text> : null}
        <LoginScreen theme={theme} onLoggedIn={() => void boot()} />
      </View>,
    )
  }

  if (doc.flags.maintenanceMode) {
    return shell(
      <View style={[styles.center, { flex: 1, backgroundColor: theme.background }]}>
        <Text style={[styles.blockTitle, { color: theme.text }]}>Maintenance</Text>
        <Text style={[styles.blockBody, { color: theme.muted }]}>CodeSpectra is briefly down for maintenance.</Text>
      </View>,
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

  return shell(
    <NavigationContainer theme={navTheme}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
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
                  ) : t.id === 'problems' ? (
                    <ProblemsStack theme={theme} />
                  ) : t.id === 'judge' ? (
                    <JudgeStack theme={theme} role={doc.user.role} />
                  ) : (
                    <TabPlaceholder theme={theme} tab={t} userName={doc.user.name ?? doc.user.email} />
                  )}
                  {t.id === 'profile' ? (
                    <TouchableOpacity
                      style={[styles.signOut, { borderColor: theme.border }]}
                      onPress={() => void signOut()}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.signOutText, { color: '#F87171' }]}>Sign out</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </Tab.Screen>
          )
        })}
      </Tab.Navigator>
    </NavigationContainer>,
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: FALLBACK_THEME.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  bootError: { color: '#F87171', fontSize: 13, textAlign: 'center', paddingTop: 48, paddingHorizontal: 24 },
  blockTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  blockBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  signOut: {
    borderTopWidth: 1, minHeight: MIN_TOUCH,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  signOutText: { fontSize: 15, fontWeight: '600' },
})
