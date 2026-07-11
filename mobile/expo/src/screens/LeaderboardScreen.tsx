import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet,
  RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Trophy, Medal, Crown } from 'lucide-react-native'
import { colors, spacing, commonStyles, shadows } from '../theme'
import { api, unwrapData, LeaderboardEntry } from '../api/client'

const rankIcon = (rank: number) => {
  if (rank === 1) return <Crown size={16} color="#FFD700" strokeWidth={2.5} />
  if (rank === 2) return <Medal size={16} color="#C0C0C0" strokeWidth={2.5} />
  if (rank === 3) return <Medal size={16} color="#CD7F32" strokeWidth={2.5} />
  return null
}

const rankBg = (rank: number) => {
  if (rank === 1) return '#FFD70018'
  if (rank === 2) return '#C0C0C018'
  if (rank === 3) return '#CD7F3218'
  return 'transparent'
}

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const insets = useSafeAreaInsets()

  const fetchData = async () => {
    try {
      const res = await api.get<unknown>('/api/leaderboard')
      setEntries(unwrapData<LeaderboardEntry>(res))
    } catch { /* silent */ }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [])

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.userId}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Trophy size={20} color={colors.primary} strokeWidth={2} />
            <Text style={commonStyles.sectionTitle}>Leaderboard</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Trophy size={40} color={colors.muted} strokeWidth={1.5} />
              <Text style={commonStyles.emptyText}>No entries yet</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const rank = item.rank ?? index + 1
          const bg = rankBg(rank)
          const isTop3 = rank <= 3

          return (
            <View style={[styles.row, isTop3 && { backgroundColor: bg }]}>
              <View style={styles.rankCell}>
                {rankIcon(rank) || (
                  <Text style={styles.rankText}>{rank}</Text>
                )}
              </View>
              <View style={styles.infoCell}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                {item.language && (
                  <Text style={styles.language}>{item.language}</Text>
                )}
              </View>
              <View style={styles.statsCell}>
                <Text style={styles.xp}>{item.xp.toLocaleString()} XP</Text>
                <Text style={styles.sub}>{item.challengesSolved} solved</Text>
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
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.xs,
  },
  rankCell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 14, fontWeight: '700', color: colors.muted, fontFamily: 'monospace' },
  infoCell: { flex: 1, paddingHorizontal: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace' },
  title: { fontSize: 11, color: colors.primary, fontFamily: 'monospace', marginTop: 1 },
  language: { fontSize: 10, color: colors.muted, fontFamily: 'monospace', marginTop: 1 },
  statsCell: { alignItems: 'flex-end' },
  xp: { fontSize: 14, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  sub: { fontSize: 10, color: colors.muted, fontFamily: 'monospace' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})