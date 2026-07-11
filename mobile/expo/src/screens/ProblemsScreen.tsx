import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet,
  ScrollView, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Code2, Filter, ChevronRight } from 'lucide-react-native'
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
  const { width } = useWindowDimensions()

  useEffect(() => {
    api.get<unknown>('/api/problems')
      .then(res => setProblems(unwrapData<Problem>(res)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? problems : problems.filter(p => p.difficulty === filter)
  const numColumns = width > 700 ? 2 : 1

  const filters: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'easy', label: 'Easy' },
    { key: 'medium', label: 'Medium' },
    { key: 'hard', label: 'Hard' },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        numColumns={numColumns}
        key={numColumns}
        columnWrapperStyle={numColumns > 1 ? { paddingHorizontal: spacing['2xl'], gap: spacing.md } : undefined}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View style={{ paddingTop: spacing.lg }}>
            <View style={[styles.headerRow, { paddingHorizontal: spacing['2xl'] }]}>
              <View>
                <Text style={styles.headerTitle}>Problems</Text>
                <Text style={styles.headerCount}>{problems.length} total · {filtered.length} shown</Text>
              </View>
              <View style={styles.filterIcon}>
                <Filter size={18} color={colors.muted} strokeWidth={2} />
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.filterRow, { paddingHorizontal: spacing['2xl'] }]}
            >
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
              <Code2 size={40} color={colors.muted} strokeWidth={1.5} />
              <Text style={commonStyles.emptyText}>No problems found</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const dc = diffColors[item.difficulty] || colors.muted
          return (
            <TouchableOpacity
              style={[
                styles.card,
                numColumns > 1 && styles.cardGrid,
                index === 0 && numColumns === 1 && styles.cardFirst,
              ]}
              activeOpacity={0.7}
            >
              <View style={styles.cardTop}>
                <View style={[styles.indexBadge, { backgroundColor: dc + '18' }]}>
                  <Text style={[styles.indexText, { color: dc }]}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                </View>
                <View style={[styles.diffBadge, { backgroundColor: dc + '18' }]}>
                  <Text style={[styles.diffText, { color: dc }]}>{item.difficulty}</Text>
                </View>
              </View>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              {item.topics?.length > 0 && (
                <View style={styles.topics}>
                  {item.topics.slice(0, 3).map((t, i) => (
                    <View key={i} style={styles.topicTag}>
                      <Text style={styles.topicText}>{t}</Text>
                    </View>
                  ))}
                  {(item.topics.length) > 3 && (
                    <Text style={styles.topicMore}>+{item.topics.length - 3}</Text>
                  )}
                </View>
              )}
              <View style={styles.cardFooter}>
                <Text style={styles.tapHint}>Tap to solve</Text>
                <ChevronRight size={16} color={colors.muted} />
              </View>
            </TouchableOpacity>
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.lg },
  headerTitle: { fontSize: 24, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace', letterSpacing: -0.5 },
  headerCount: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', marginTop: 2 },
  filterIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  filterRow: { gap: spacing.sm, paddingBottom: spacing.lg },
  filterChip: { paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  filterChipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary + '50' },
  filterText: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', fontWeight: '500' },
  filterTextActive: { color: colors.primary, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm },
  cardGrid: { flex: 1, marginHorizontal: spacing['2xl'], marginBottom: spacing.md },
  cardFirst: { marginTop: spacing.xs },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  indexBadge: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  indexText: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  diffBadge: { borderRadius: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  diffText: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace', textTransform: 'capitalize' },
  title: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', marginBottom: spacing.sm, lineHeight: 20 },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  topicTag: { backgroundColor: colors.accent, borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  topicText: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'monospace' },
  topicMore: { fontSize: 10, color: colors.muted, fontFamily: 'monospace' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tapHint: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})