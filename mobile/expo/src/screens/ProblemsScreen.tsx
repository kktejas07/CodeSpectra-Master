import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, unwrapData, Problem } from '../api/client'
import { colors, spacing, commonStyles, shadows } from '../theme'

const diffColors: Record<string, string> = {
  easy: '#22C55E',
  medium: '#EAB308',
  hard: '#EF4444',
}

export default function ProblemsScreen() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all')
  const insets = useSafeAreaInsets()

  useEffect(() => {
    api.get<unknown>('/api/problems')
      .then(res => setProblems(unwrapData<Problem>(res)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? problems : problems.filter(p => p.difficulty === filter)

  const filters: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'easy', label: 'Easy' },
    { key: 'medium', label: 'Medium' },
    { key: 'hard', label: 'Hard' },
  ]

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Problems</Text>
              <Text style={styles.headerCount}>{problems.length} total</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {filters.map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                  onPress={() => setFilter(f.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyText}>No problems yet</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity style={[styles.card, index === 0 && styles.cardFirst]} activeOpacity={0.7}>
            <View style={styles.cardMain}>
              <View style={styles.cardLeft}>
                <View style={[styles.indexDot, { backgroundColor: (diffColors[item.difficulty] || colors.muted) + '18' }]}>
                  <Text style={[styles.indexText, { color: diffColors[item.difficulty] || colors.muted }]}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  <View style={styles.topics}>
                    {item.topics?.slice(0, 3).map((t, i) => (
                      <View key={i} style={styles.topicTag}>
                        <Text style={styles.topicText}>{t}</Text>
                      </View>
                    ))}
                    {(item.topics?.length || 0) > 3 && (
                      <Text style={styles.topicMore}>+{(item.topics?.length || 0) - 3}</Text>
                    )}
                  </View>
                </View>
              </View>
              <View style={[styles.diffBadge, { backgroundColor: (diffColors[item.difficulty] || colors.muted) + '18' }]}>
                <Text style={[styles.diffText, { color: diffColors[item.difficulty] || colors.muted }]}>
                  {item.difficulty}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
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

import { ScrollView } from 'react-native'

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing['2xl'], paddingTop: spacing.lg, marginBottom: spacing.md },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace', letterSpacing: -0.5 },
  headerCount: { fontSize: 12, color: colors.muted, fontFamily: 'monospace' },
  filterRow: { paddingHorizontal: spacing['2xl'], gap: spacing.sm, paddingBottom: spacing.lg },
  filterChip: { paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  filterChipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary + '50' },
  filterText: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', fontWeight: '500' },
  filterTextActive: { color: colors.primary, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, marginHorizontal: spacing['2xl'], marginBottom: spacing.sm, overflow: 'hidden', ...shadows.sm },
  cardFirst: { marginTop: spacing.xs },
  cardMain: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  indexDot: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  indexText: { fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  cardInfo: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', marginBottom: spacing.xs },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  topicTag: { backgroundColor: colors.accent, borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  topicText: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'monospace' },
  topicMore: { fontSize: 10, color: colors.muted, fontFamily: 'monospace' },
  diffBadge: { borderRadius: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, alignSelf: 'center' },
  diffText: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace', textTransform: 'capitalize' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})