import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, unwrapData, LeaderboardEntry } from '../api/client'
import { colors, spacing, commonStyles, shadows } from '../theme'

const rankColors = ['#EAB308', '#94A3B8', '#CD7F32']

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    api.get<unknown>('/api/leaderboard')
      .then(res => setEntries(unwrapData<LeaderboardEntry>(res)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={entries}
        keyExtractor={e => e.userId || String(e.rank)}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Text style={commonStyles.sectionTitle}>Leaderboard</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyText}>No rankings yet</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const isTop = item.rank <= 3
          const rankColor = rankColors[item.rank - 1] || colors.muted

          return (
            <View style={[styles.card, index === 0 && styles.cardFirst, isTop && { borderColor: rankColor + '40' }]}>
              <View style={styles.cardMain}>
                <View style={[styles.rankBadge, isTop && { backgroundColor: rankColor + '18' }]}>
                  <Text style={[styles.rankText, isTop && { color: rankColor }]}>
                    #{item.rank}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <View style={[styles.userAvatar, { backgroundColor: rankColor + '15' }]}>
                    <Text style={[styles.userInitials, { color: rankColor }]}>
                      {item.name ? item.name.slice(0, 2).toUpperCase() : '??'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.userName}>{item.name || 'Anonymous'}</Text>
                    <Text style={styles.userMeta}>{item.challengesSolved} solved · Lv {item.level}</Text>
                  </View>
                </View>
                <View style={styles.xpBadge}>
                  <Text style={styles.xpValue}>{item.xp.toLocaleString()}</Text>
                  <Text style={styles.xpLabel}>XP</Text>
                </View>
              </View>
            </View>
          )
        }}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, marginBottom: spacing.sm, ...shadows.sm },
  cardFirst: { marginTop: spacing.sm },
  cardMain: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  rankBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: '700', color: colors.muted, fontFamily: 'monospace' },
  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  userAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  userInitials: { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  userName: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace' },
  userMeta: { fontSize: 12, color: colors.muted, fontFamily: 'monospace' },
  xpBadge: { alignItems: 'flex-end' },
  xpValue: { fontSize: 16, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  xpLabel: { fontSize: 10, color: colors.muted, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})