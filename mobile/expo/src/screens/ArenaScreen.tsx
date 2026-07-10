import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native'
import { colors, spacing, typography, commonStyles } from '../theme'
import { api, Challenge } from '../api/client'

export default function ArenaScreen() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetch = async () => {
    try {
      const d = await api.get<{ items: Challenge[] }>('/api/arena')
      setChallenges(d.items || [])
    } catch { /* ignore */ }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetch() }, [])

  const diffColor = (d: string) =>
    d === 'easy' ? '#22c55e' : d === 'medium' ? '#eab308' : '#ef4444'

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={challenges}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch() }} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={typography.h1}>Coding Arena</Text>
            <Text style={[typography.bodySmall, { marginTop: spacing.xs }]}>Solve challenges, earn XP, climb the leaderboard</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingVertical: spacing['4xl'], alignItems: 'center' }}>
            <Text style={typography.body}>No challenges yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7}>
            <View style={styles.cardTop}>
              <Text style={styles.title}>{item.title}</Text>
              <View style={[styles.badge, { backgroundColor: diffColor(item.difficulty) + '20' }]}>
                <Text style={[styles.badgeText, { color: diffColor(item.difficulty) }]}>{item.difficulty}</Text>
              </View>
            </View>
            <View style={styles.cardBottom}>
              <Text style={styles.meta}>{item.category} · {item.points} pts</Text>
              <Text style={styles.meta}>{item.solved}/{item.attempts} solved</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { ...typography.body, fontWeight: '600', color: colors.foreground, flex: 1, marginRight: spacing.sm },
  badge: { borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  meta: { ...typography.caption },
})
