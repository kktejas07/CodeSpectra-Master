import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native'
import { colors, spacing, typography, commonStyles, shadows } from '../theme'
import { api, Challenge } from '../api/client'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ArenaScreen() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const insets = useSafeAreaInsets()

  const fetchData = async () => {
    try {
      const d = await api.get<{ items: Challenge[] }>('/api/arena')
      setChallenges(d.items || [])
    } catch { /* silent */ }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [])

  const diffColor = (d: string) =>
    d === 'easy' ? '#22C55E' : d === 'medium' ? '#EAB308' : '#EF4444'

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={challenges}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData() }}
            tintColor={colors.primary}
            progressBackgroundColor={colors.card}
          />
        }
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Text style={commonStyles.sectionTitle}>Coding Arena</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyText}>No challenges available</Text>
              <Text style={[commonStyles.emptyText, { marginTop: spacing.xs, fontSize: 12 }]}>
                Check back soon for new coding challenges
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View style={[styles.card, index === 0 && styles.cardFirst]}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleRow}>
                <View style={styles.cardIndex}>
                  <Text style={styles.cardIndexText}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              </View>
              <View style={[commonStyles.badge, { backgroundColor: diffColor(item.difficulty) + '18' }]}>
                <Text style={[commonStyles.badgeText, { color: diffColor(item.difficulty) }]}>
                  {item.difficulty}
                </Text>
              </View>
            </View>

            <View style={styles.cardMeta}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>CATEGORY</Text>
                <Text style={styles.metaValue}>{item.category}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>POINTS</Text>
                <Text style={[styles.metaValue, { color: colors.primary }]}>{item.points}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>SOLVED</Text>
                <Text style={styles.metaValue}>{item.solved}/{item.attempts}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
              <Text style={styles.actionBtnText}>Start Challenge</Text>
              <Text style={styles.actionBtnArrow}>→</Text>
            </TouchableOpacity>
          </View>
        )}
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
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing['2xl'],
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardFirst: { marginTop: spacing.sm },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardIndex: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIndexText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  cardMeta: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    gap: spacing['2xl'],
  },
  metaItem: { gap: 2 },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
    borderRadius: 8,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    gap: spacing.sm,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  actionBtnArrow: {
    fontSize: 13,
    color: colors.primary,
    fontFamily: 'monospace',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background + 'EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
})