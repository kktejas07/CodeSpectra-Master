import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import type { ThemeTokens, MobileTab } from '../api/client'
import { getStats, type UserStats } from '../api/learner'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  userName: string
  tabs: MobileTab[]
  onNavigate: (tabLabel: string) => void
}

interface StatDef {
  key: keyof UserStats
  label: string
  color: string
}

const STATS: StatDef[] = [
  { key: 'challenges', label: 'Solved', color: '#22C55E' },
  { key: 'submissions', label: 'Submissions', color: '#38BDF8' },
  { key: 'streak', label: 'Day streak', color: '#EAB308' },
  { key: 'scans', label: 'Scans', color: '#A855F7' },
]

export function HomeScreen({ theme, userName, tabs, onNavigate }: Props): React.JSX.Element {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      setStats(await getStats())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your stats.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const s = styles(theme)
  const firstName = (userName || '').split(' ')[0] || 'there'

  // Quick links: every role-visible tab except Home itself.
  const quickLinks = tabs.filter((t) => t.id !== 'home')

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
    >
      <Text style={s.greeting}>Hey {firstName}</Text>
      <Text style={s.sub}>Welcome back to CodeSpectra</Text>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={s.errorCard}>
          <Text style={s.error}>{error}</Text>
          <TouchableOpacity style={s.retry} onPress={() => void load()} activeOpacity={0.7}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.grid}>
            {STATS.map((d) => (
              <View key={d.key} style={s.statCard}>
                <Text style={[s.statValue, { color: d.color }]}>
                  {d.key === 'streak' ? `${stats?.[d.key] ?? 0}d` : (stats?.[d.key] ?? 0)}
                </Text>
                <Text style={s.statLabel}>{d.label}</Text>
              </View>
            ))}
          </View>

          {stats?.memberSince ? (
            <Text style={s.since}>
              Member since {new Date(stats.memberSince).toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </Text>
          ) : null}
        </>
      )}

      <Text style={s.section}>Jump to</Text>
      <View style={s.grid}>
        {quickLinks.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={s.linkCard}
            activeOpacity={0.7}
            onPress={() => onNavigate(t.label)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${t.label}`}
          >
            <Text style={s.linkText}>{t.label}</Text>
            {t.badge && t.badge > 0 ? (
              <View style={s.badge}><Text style={s.badgeText}>{t.badge}</Text></View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    content: { padding: 16, paddingBottom: 40 },
    greeting: { color: t.text, fontSize: 26, fontWeight: '800' },
    sub: { color: t.muted, fontSize: 14, marginTop: 4 },
    section: { color: t.text, fontSize: 16, fontWeight: '700', marginTop: 26, marginBottom: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
    statCard: {
      flexGrow: 1, flexBasis: '45%', backgroundColor: t.card,
      borderColor: t.border, borderWidth: 1, borderRadius: 12,
      padding: 16, minHeight: 82, justifyContent: 'center',
    },
    statValue: { fontSize: 24, fontWeight: '800' },
    statLabel: { color: t.muted, fontSize: 12, marginTop: 4 },
    since: { color: t.muted, fontSize: 12, marginTop: 14 },
    linkCard: {
      flexGrow: 1, flexBasis: '45%', backgroundColor: t.card,
      borderColor: t.border, borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, minHeight: MIN_TOUCH, justifyContent: 'center',
      flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    linkText: { color: t.text, fontSize: 15, fontWeight: '600', flex: 1 },
    badge: { backgroundColor: t.primary, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
    badgeText: { color: '#080D17', fontSize: 11, fontWeight: '800' },
    errorCard: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, padding: 20, marginTop: 24, alignItems: 'center', gap: 10,
    },
    error: { color: '#F87171', fontSize: 14, textAlign: 'center' },
    retry: {
      borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      paddingHorizontal: 20, minHeight: MIN_TOUCH, justifyContent: 'center',
    },
    retryText: { color: t.primary, fontSize: 15, fontWeight: '600' },
  })
