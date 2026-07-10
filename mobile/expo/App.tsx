import React, { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme, useNavigation } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native'
import {
  Home, Code2, Scan, MoreHorizontal, Bot, Trophy, BarChart3,
  Star, BookOpen, Award, Flag, Settings, LogOut, ChevronRight,
  ArrowLeft, User, Zap,
} from 'lucide-react-native'

import LoginScreen from './src/screens/LoginScreen'
import HomeScreen from './src/screens/HomeScreen'
import ProblemsScreen from './src/screens/ProblemsScreen'
import ScannerScreen from './src/screens/ScannerScreen'
import AgentScreen from './src/screens/AgentScreen'
import ArenaScreen from './src/screens/ArenaScreen'
import LeaderboardScreen from './src/screens/LeaderboardScreen'
import AchievementsScreen from './src/screens/AchievementsScreen'
import LearningScreen from './src/screens/LearningScreen'
import CertificationsScreen from './src/screens/CertificationsScreen'
import HackathonsScreen from './src/screens/HackathonsScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import { colors, spacing } from './src/theme'
import type { User as AppUser } from './src/api/client'

const Tab = createBottomTabNavigator()
const MoreStackNav = createNativeStackNavigator()
const ProfileStackNav = createNativeStackNavigator()

const DarkNavTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.foreground,
    border: colors.cardBorder,
    notification: colors.primary,
  },
}

// Screen with standard header - for sub-screens in More tab
function ScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const navigation = useNavigation()
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        {onBack ? (
          <TouchableOpacity onPress={onBack || (() => navigation.goBack())} style={styles.backBtn}>
            <ArrowLeft size={20} color={colors.muted} />
          </TouchableOpacity>
        ) : (
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>{'</>'}</Text>
          </View>
        )}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
    </View>
  )
}

// More tab - stack navigator with header
function MoreStack() {
  return (
    <MoreStackNav.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <MoreStackNav.Screen name="MoreHome" component={MoreHome} />
      <MoreStackNav.Screen
        name="Arena"
        options={{ headerShown: true, header: () => <ScreenHeader title="Arena" />, headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.foreground }}
        component={ArenaScreen}
      />
      <MoreStackNav.Screen
        name="Leaderboard"
        options={{ headerShown: true, header: () => <ScreenHeader title="Leaderboard" />, headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.foreground }}
        component={LeaderboardScreen}
      />
      <MoreStackNav.Screen
        name="Achievements"
        options={{ headerShown: true, header: () => <ScreenHeader title="Achievements" />, headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.foreground }}
        component={AchievementsScreen}
      />
      <MoreStackNav.Screen
        name="Learning"
        options={{ headerShown: true, header: () => <ScreenHeader title="Learning Tracks" />, headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.foreground }}
        component={LearningScreen}
      />
      <MoreStackNav.Screen
        name="Certifications"
        options={{ headerShown: true, header: () => <ScreenHeader title="Certifications" />, headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.foreground }}
        component={CertificationsScreen}
      />
      <MoreStackNav.Screen
        name="Hackathons"
        options={{ headerShown: true, header: () => <ScreenHeader title="Hackathons" />, headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.foreground }}
        component={HackathonsScreen}
      />
      <MoreStackNav.Screen
        name="Profile"
        options={{ headerShown: true, header: () => <ScreenHeader title="Profile" />, headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.foreground }}
        component={ProfileScreen}
      />
    </MoreStackNav.Navigator>
  )
}

// More home - grid of secondary features
function MoreHome() {
  const navigation = useNavigation<any>()
  const { width } = useWindowDimensions()
  const numColumns = width > 600 ? 3 : 2

  const items = [
    { id: 'arena', title: 'Arena', subtitle: 'Coding challenges', icon: Trophy, color: '#22C55E', screen: 'Arena' },
    { id: 'leaderboard', title: 'Leaderboard', subtitle: 'Top performers', icon: BarChart3, color: '#38bdf8', screen: 'Leaderboard' },
    { id: 'achievements', title: 'Achievements', subtitle: 'Badges & rewards', icon: Star, color: '#EAB308', screen: 'Achievements' },
    { id: 'learning', title: 'Learning Tracks', subtitle: 'Structured learning', icon: BookOpen, color: '#a855f7', screen: 'Learning' },
    { id: 'certifications', title: 'Certifications', subtitle: 'Earn certificates', icon: Award, color: '#22C55E', screen: 'Certifications' },
    { id: 'hackathons', title: 'Hackathons', subtitle: 'Timed coding events', icon: Flag, color: '#f97316', screen: 'Hackathons' },
    { id: 'profile', title: 'Profile', subtitle: 'Account settings', icon: User, color: '#71717a', screen: 'Profile' },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>{'</>'}</Text>
          </View>
          <Text style={styles.headerTitle}>CodeSpectra</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ paddingHorizontal: spacing['2xl'], paddingTop: spacing.lg, paddingBottom: spacing.lg }}>
          <Text style={styles.moreTitle}>More</Text>
          <Text style={styles.moreSubtitle}>All features and settings</Text>
        </View>
        <View style={[styles.moreGrid, { paddingHorizontal: spacing['2xl'] }]}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.moreCard, { width: (width - spacing['2xl'] * 2 - spacing.md * (numColumns - 1)) / numColumns }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(item.screen)}
            >
              <View style={[styles.moreIconBox, { backgroundColor: item.color + '18' }]}>
                <item.icon size={22} color={item.color} strokeWidth={2} />
              </View>
              <Text style={styles.moreCardTitle}>{item.title}</Text>
              <Text style={styles.moreCardSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

// Main header for primary tabs
function AppHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>{'</>'}</Text>
        </View>
        <Text style={styles.headerTitle}>CodeSpectra</Text>
      </View>
    </View>
  )
}

function MainTabs() {
  const [user, setUser] = useState<AppUser | null>(null)

  if (!user) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <AppHeader />
          <LoginScreen onLogin={setUser} />
        </View>
        <StatusBar style="light" />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={DarkNavTheme}>
        <AppHeader />
        <Tab.Navigator
          screenOptions={({ route }) => {
            const icons: Record<string, React.ReactNode> = {
              Home: <Home size={22} color={colors.primary} strokeWidth={2} />,
              Problems: <Code2 size={22} color={colors.primary} strokeWidth={2} />,
              Scanner: <Scan size={22} color={colors.primary} strokeWidth={2} />,
              More: <MoreHorizontal size={22} color={colors.primary} strokeWidth={2} />,
              Agent: <Bot size={22} color={colors.primary} strokeWidth={2} />,
            }
            return {
              headerShown: false,
              tabBarIcon: ({ focused }) => {
                const iconColor = focused ? colors.primary : colors.muted
                const activeIcons: Record<string, React.ReactNode> = {
                  Home: <Home size={22} color={iconColor} strokeWidth={2} />,
                  Problems: <Code2 size={22} color={iconColor} strokeWidth={2} />,
                  Scanner: <Scan size={22} color={iconColor} strokeWidth={2} />,
                  More: <MoreHorizontal size={22} color={iconColor} strokeWidth={2} />,
                  Agent: <Bot size={22} color={iconColor} strokeWidth={2} />,
                }
                return activeIcons[route.name] || null
              },
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.muted,
              tabBarStyle: {
                backgroundColor: colors.card,
                borderTopColor: colors.cardBorder,
                borderTopWidth: 1,
                paddingTop: spacing.xs,
                paddingBottom: spacing.sm,
                height: 60,
              },
              tabBarLabelStyle: {
                fontSize: 10,
                fontFamily: 'monospace',
                fontWeight: '600',
                marginTop: 2,
              },
            }
          }}
        >
          <Tab.Screen name="Home" options={{ tabBarLabel: 'Home' }}>
            {() => <HomeScreen user={user} />}
          </Tab.Screen>
          <Tab.Screen name="Problems" component={ProblemsScreen} />
          <Tab.Screen name="Scanner" component={ScannerScreen} />
          <Tab.Screen
            name="More"
            component={MoreStack}
            options={{ tabBarLabel: 'More' }}
          />
          <Tab.Screen name="Agent" component={AgentScreen} options={{ tabBarLabel: 'AI Agent' }} />
        </Tab.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </SafeAreaProvider>
  )
}

export default function App() {
  return <MainTabs />
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoMark: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 12, fontWeight: '700', color: colors.primaryForeground, fontFamily: 'monospace' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace', letterSpacing: -0.3 },
  backBtn: { padding: spacing.xs, marginLeft: -spacing.xs },
  moreTitle: { fontSize: 24, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace', letterSpacing: -0.5 },
  moreSubtitle: { fontSize: 13, color: colors.muted, fontFamily: 'monospace', marginTop: 2 },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  moreCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    alignItems: 'center',
  },
  moreIconBox: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  moreCardTitle: { fontSize: 13, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', textAlign: 'center', marginBottom: 2 },
  moreCardSubtitle: { fontSize: 11, color: colors.muted, fontFamily: 'monospace', textAlign: 'center' },
})