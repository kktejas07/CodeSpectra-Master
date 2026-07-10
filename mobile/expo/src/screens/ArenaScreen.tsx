import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing, commonStyles, shadows } from '../theme'
import { api, unwrapData, Challenge } from '../api/client'

const diffColors: Record<string, string> = {
  Easy: '#22C55E',
  Medium: '#EAB308',
  Hard: '#EF4444',
}

export default function ArenaScreen() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const insets = useSafeAreaInsets()

  const fetchData = async () => {
    try {
      const res = await api.get<unknown>('/api/challenges')
      setChallenges(unwrapData<Challenge>(res))
    } catch { /* silent */ }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [])

  const diffColor = (d: string) => diffColors[d] || colors.muted

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={challenges}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />
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
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View style={[styles.card, index === 0 && styles.cardFirst, item.locked && styles.cardLocked]}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleRow}>
                <View style={styles.cardIndex}>
                  <Text style={styles.cardIndexText}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
                </View>
              </View>
              <View style={[styles.diffBadge, { backgroundColor: diffColor(item.difficulty) + '18' }]}>
                <Text style={[styles.diffText, { color: diffColor(item.difficulty) }]}>
                  {item.difficulty}
                </Text>
              </View>
            </View>

            <View style={styles.cardMeta}>
              {item.type && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>TYPE</Text>
                  <Text style={styles.metaValue}>{item.type}</Text>
                </View>
              )}
              {item.duration && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>DURATION</Text>
                  <Text style={styles.metaValue}>{item.duration}m</Text>
                </View>
              )}
              {item.successRate !== undefined && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>SUCCESS</Text>
                  <Text style={styles.metaValue}>{item.successRate.toFixed(1)}%</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, item.locked && styles.actionBtnDisabled]}
              activeOpacity={0.7}
              disabled={item.locked}
            >
              <Text style={[styles.actionBtnText, item.locked && styles.actionBtnTextDisabled]}>
                {item.completed ? 'Completed ✓' : item.locked ? 'Locked 🔒' : 'Start Challenge →'}
              </Text>
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
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing['2xl'], marginBottom: spacing.md, ...shadows.sm },
  cardFirst: { marginTop: spacing.sm },
  cardLocked: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg, gap: spacing.md },
  cardTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardIndex: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  cardIndexText: { fontSize: 11, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  title: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', lineHeight: 20, marginBottom: 2 },
  desc: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', lineHeight: 16 },
  diffBadge: { borderRadius: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, alignSelf: 'flex-start' },
  diffText: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace' },
  cardMeta: { flexDirection: 'row', gap: spacing['2xl'], marginBottom: spacing.lg },
  metaItem: { gap: 2 },
  metaLabel: { fontSize: 10, fontWeight: '600', color: colors.muted, fontFamily: 'monospace', letterSpacing: 0.8 },
  metaValue: { fontSize: 13, fontWeight: '500', color: colors.foreground, fontFamily: 'monospace' },
  actionBtn: { backgroundColor: colors.primary + '12', borderRadius: 8, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.primary + '30' },
  actionBtnDisabled: { backgroundColor: colors.accent, borderColor: colors.cardBorder },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary, fontFamily: 'monospace' },
  actionBtnTextDisabled: { color: colors.muted },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})