import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, Linking,
} from 'react-native'
import type { ThemeTokens, BootstrapUser } from '../api/client'
import { getStats, type UserStats } from '../api/learner'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  user: BootstrapUser
  faceEnrollmentRequired: boolean
  onSignOut: () => void
}

export function ProfileScreen({ theme, user, faceEnrollmentRequired, onSignOut }: Props): React.JSX.Element {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    try {
      setStats(await getStats())
    } catch {
      // Stats are decorative here — never block the profile on them.
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const s = styles(theme)
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase()

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
    >
      <View style={s.header}>
        <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
        <Text style={s.name}>{user.name || 'CodeSpectra learner'}</Text>
        <Text style={s.email}>{user.email}</Text>
        <View style={s.rolePill}>
          <Text style={s.roleText}>{user.role.replace('_', ' ')}</Text>
        </View>
      </View>

      {faceEnrollmentRequired ? (
        <TouchableOpacity
          style={s.warning}
          activeOpacity={0.8}
          onPress={() => void Linking.openURL('https://codespectra.ai/auth/enroll-face?redirect=/dashboard')}
          accessibilityRole="button"
          accessibilityLabel="Complete face enrollment on the web"
        >
          <Text style={s.warningTitle}>Face enrollment required</Text>
          <Text style={s.warningBody}>
            Complete biometric enrollment on the web to unlock proctored assessments. Tap to continue →
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text style={s.section}>Activity</Text>
      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 12 }} />
      ) : (
        <View style={s.grid}>
          {([
            ['Solved', stats?.challenges ?? 0],
            ['Submissions', stats?.submissions ?? 0],
            ['Streak', `${stats?.streak ?? 0}d`],
            ['Scans', stats?.scans ?? 0],
            ['Reviews', stats?.reviews ?? 0],
            ['Fixes', stats?.fixes ?? 0],
          ] as const).map(([label, value]) => (
            <View key={label} style={s.statCard}>
              <Text style={s.statValue}>{value}</Text>
              <Text style={s.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={s.section}>Account</Text>
      <View style={s.list}>
        {([
          ['Edit profile & settings', '/dashboard/settings'],
          ['Notifications', '/dashboard/notifications'],
          ['Achievements', '/dashboard/achievements'],
        ] as const).map(([label, path]) => (
          <TouchableOpacity
            key={path}
            style={s.row}
            activeOpacity={0.7}
            onPress={() => void Linking.openURL(`https://codespectra.ai${path}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${label} on the web`}
          >
            <Text style={s.rowText}>{label}</Text>
            <Text style={s.chev}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={s.signOut}
        onPress={onSignOut}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={s.signOutText}>Sign out</Text>
      </TouchableOpacity>

      {stats?.memberSince ? (
        <Text style={s.since}>
          Member since {new Date(stats.memberSince).toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </Text>
      ) : null}
    </ScrollView>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    content: { padding: 16, paddingBottom: 40 },
    header: { alignItems: 'center', paddingVertical: 20 },
    avatar: {
      width: 76, height: 76, borderRadius: 38, backgroundColor: t.primary,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    avatarText: { color: '#080D17', fontSize: 30, fontWeight: '800' },
    name: { color: t.text, fontSize: 20, fontWeight: '700' },
    email: { color: t.muted, fontSize: 13, marginTop: 4 },
    rolePill: {
      borderWidth: 1, borderColor: t.border, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 4, marginTop: 10,
    },
    roleText: { color: t.muted, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    warning: {
      backgroundColor: 'rgba(234,179,8,0.10)', borderColor: 'rgba(234,179,8,0.30)',
      borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8,
    },
    warningTitle: { color: '#EAB308', fontSize: 14, fontWeight: '700' },
    warningBody: { color: t.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    section: { color: t.text, fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: {
      flexGrow: 1, flexBasis: '30%', backgroundColor: t.card,
      borderColor: t.border, borderWidth: 1, borderRadius: 10,
      paddingVertical: 12, alignItems: 'center',
    },
    statValue: { color: t.text, fontSize: 18, fontWeight: '800' },
    statLabel: { color: t.muted, fontSize: 11, marginTop: 3 },
    list: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, overflow: 'hidden',
    },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 14, minHeight: MIN_TOUCH, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    rowText: { color: t.text, fontSize: 15, fontWeight: '500' },
    chev: { color: t.muted, fontSize: 22 },
    signOut: {
      borderWidth: 1, borderColor: '#F87171', borderRadius: 10,
      minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginTop: 24,
    },
    signOutText: { color: '#F87171', fontSize: 15, fontWeight: '700' },
    since: { color: t.muted, fontSize: 12, textAlign: 'center', marginTop: 16 },
  })
