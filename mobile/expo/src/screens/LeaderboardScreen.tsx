import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native'
import { api } from '../api/client'
import { colors, spacing, typography } from '../theme'

interface LeaderboardEntry {
  rank: number; name: string; xp: number; level: number; solved: number
}

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ items: LeaderboardEntry[] }>('/api/leaderboard')
      .then(d => setEntries(d.items || [])).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={entries}
        keyExtractor={e => String(e.rank)}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={typography.h1}>Leaderboard</Text>
            <Text style={[typography.bodySmall, { marginTop: spacing.xs }]}>Top performers this week</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={[typography.body, { textAlign: 'center', marginTop: spacing['4xl'] }]}>No data yet</Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, item.rank <= 3 && { borderColor: item.rank === 1 ? '#eab308' : item.rank === 2 ? '#94a3b8' : '#854d0e' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={[styles.rankBadge, item.rank <= 3 && { backgroundColor: item.rank === 1 ? '#eab30820' : item.rank === 2 ? '#94a3b820' : '#854d0e20' }]}>
                <Text style={[typography.h3, { color: item.rank === 1 ? '#eab308' : item.rank === 2 ? '#94a3b8' : item.rank === 3 ? '#854d0e' : colors.foreground }]}>#{item.rank}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{item.name}</Text>
                <Text style={typography.caption}>{item.solved} solved · Lv {item.level}</Text>
              </View>
              <Text style={[typography.h3, { color: colors.primary }]}>{item.xp.toLocaleString()} XP</Text>
            </View>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 10, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder },
  rankBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
