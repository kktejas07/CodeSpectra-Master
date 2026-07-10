import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing, commonStyles, shadows } from '../theme'
import { api, unwrapData, UserStats, DailyChallenge, Problem, Challenge } from '../api/client'
import type { User } from '../api/client'

interface Props {
  user: User
  onNavigate: (screen: string) => void
}

export default function HomeScreen({ user, onNavigate }: Props) {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [daily, setDaily] = useState<DailyChallenge | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const insets = useSafeAreaInsets()

  const fetchData = async () => {
    try {
      const [statsRes, dailyRes] = await Promise.allSettled([
        api.get<UserStats>('/api/user/stats'),
        api.get<DailyChallenge>('/api/daily-challenge'),
      ])
      if (statsRes.status === 'fulfilled') setStats(statsRes.value)
      if (dailyRes.status === 'fulfilled') setDaily(dailyRes.value)
    } catch { /* silent */ }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [])

  const diffColor = (d: string) =>
    d === 'easy' ? '#22C55E' : d === 'medium' ? '#EAB308' : '#EF4444'

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user.name?.split(' ')[0] || 'Coder'}</Text>
          <Text style={styles.subtitle}>Ready to code today?</Text>
        </View>
        {stats?.streak ? (
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>{stats.streak}d</Text>
          </View>
        ) : null}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.challenges ?? '—'}</Text>
          <Text style={styles.statLabel}>Challenges</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.submissions ?? '—'}</Text>
          <Text style={styles.statLabel}>Submissions</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.scans ?? '—'}</Text>
          <Text style={styles.statLabel}>Scans</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.dailyChallenges ?? '—'}</Text>
          <Text style={styles.statLabel}>Daily</Text>
        </View>
      </View>

      {/* Daily Challenge */}
      {daily && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Daily Challenge</Text>
            {daily.streak > 0 && (
              <View style={styles.streakChip}>
                <Text style={styles.streakChipText}>🔥 {daily.streak} day streak</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.dailyCard} activeOpacity={0.7}>
            <View style={styles.dailyLeft}>
              <View style={styles.dailyIcon}>
                <Text style={styles.dailyIconText}>[D]</Text>
              </View>
              <View style={styles.dailyInfo}>
                <Text style={styles.dailyTitle}>{daily.problem.title}</Text>
                <View style={styles.dailyMeta}>
                  <Text style={[styles.dailyDiff, { color: diffColor(daily.problem.difficulty) }]}>
                    {daily.problem.difficulty}
                  </Text>
                  <Text style={styles.dailyTopics}>{daily.problem.topics?.join(', ')}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.dailyStatus, daily.solved_today && styles.dailyStatusSolved]}>
              <Text style={[styles.dailyStatusText, daily.solved_today && { color: colors.success }]}>
                {daily.solved_today ? '✓ Solved' : 'Solve →'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickAction} activeOpacity={0.7} onPress={() => onNavigate('Problems')}>
            <View style={[styles.qaIcon, { backgroundColor: '#22C55E18' }]}>
              <Text style={styles.qaIconText}>{'[P]'}</Text>
            </View>
            <Text style={styles.qaText}>Problems</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} activeOpacity={0.7} onPress={() => onNavigate('Scanner')}>
            <View style={[styles.qaIcon, { backgroundColor: '#38bdf818' }]}>
              <Text style={styles.qaIconText}>{'[S]'}</Text>
            </View>
            <Text style={styles.qaText}>Scanner</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} activeOpacity={0.7} onPress={() => onNavigate('Arena')}>
            <View style={[styles.qaIcon, { backgroundColor: '#EAB30818' }]}>
              <Text style={styles.qaIconText}>{'[A]'}</Text>
            </View>
            <Text style={styles.qaText}>Arena</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} activeOpacity={0.7} onPress={() => onNavigate('Learning')}>
            <View style={[styles.qaIcon, { backgroundColor: '#a855f718' }]}>
              <Text style={styles.qaIconText}>{'[L]'}</Text>
            </View>
            <Text style={styles.qaText}>Learn</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Challenges */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.sectionHeader} activeOpacity={0.7}>
          <Text style={styles.sectionTitle}>Your Challenges</Text>
          <Text style={styles.seeAll}>See all →</Text>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing['2xl'] }} />
        ) : (
          <View style={styles.challengeRow}>
            <View style={styles.challengeCard}>
              <Text style={styles.challengeStat}>{stats?.challenges ?? 0}</Text>
              <Text style={styles.challengeLabel}>Completed</Text>
            </View>
            <View style={styles.challengeCard}>
              <Text style={styles.challengeStat}>{stats?.submissions ?? 0}</Text>
              <Text style={styles.challengeLabel}>Submitted</Text>
            </View>
            <View style={styles.challengeCard}>
              <Text style={styles.challengeStat}>{stats?.dailyChallenges ?? 0}</Text>
              <Text style={styles.challengeLabel}>Daily Done</Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing['2xl'],
    paddingTop: spacing.lg,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.muted, fontFamily: 'monospace', marginTop: 2 },
  streakBadge: {
    backgroundColor: '#f9731618',
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  streakText: { fontSize: 13, fontWeight: '700', color: '#f97316', fontFamily: 'monospace' },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: spacing['2xl'],
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  statLabel: { fontSize: 10, color: colors.muted, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  section: { paddingHorizontal: spacing['2xl'], marginBottom: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.8 },
  seeAll: { fontSize: 12, color: colors.primary, fontFamily: 'monospace', fontWeight: '600' },
  streakChip: { backgroundColor: '#f9731618', borderRadius: 12, paddingHorizontal: spacing.sm + 2, paddingVertical: 2 },
  streakChipText: { fontSize: 11, fontWeight: '600', color: '#f97316', fontFamily: 'monospace' },
  dailyCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing['2xl'],
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.sm,
  },
  dailyLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dailyIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  dailyIconText: { fontSize: 14, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  dailyInfo: { flex: 1 },
  dailyTitle: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', marginBottom: 2 },
  dailyMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dailyDiff: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace', textTransform: 'capitalize' },
  dailyTopics: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  dailyStatus: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  dailyStatusSolved: { backgroundColor: colors.success + '18' },
  dailyStatusText: { fontSize: 12, fontWeight: '600', color: colors.muted, fontFamily: 'monospace' },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.sm,
  },
  qaIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qaIconText: { fontSize: 12, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace' },
  qaText: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  challengeRow: { flexDirection: 'row', gap: spacing.sm },
  challengeCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  challengeStat: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace' },
  challengeLabel: { fontSize: 10, color: colors.muted, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
})