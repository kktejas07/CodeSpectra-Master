import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, Problem } from '../api/client'
import { colors, spacing, commonStyles, shadows } from '../theme'

const diffColors: Record<string, string> = {
  easy: '#22C55E',
  medium: '#EAB308',
  hard: '#EF4444',
}

export default function ProblemsScreen() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    api.get<Problem[]>('/api/problems')
      .then(setProblems)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={problems}
        keyExtractor={p => p.id}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Text style={commonStyles.sectionTitle}>Problems</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyText}>No problems available</Text>
              <Text style={[commonStyles.emptyText, { marginTop: spacing.xs, fontSize: 12 }]}>
                Problems will appear here once added
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity style={[styles.card, index === 0 && styles.cardFirst]} activeOpacity={0.7}>
            <View style={styles.cardMain}>
              <View style={styles.cardLeft}>
                <View style={styles.indexDot}>
                  <Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.sm,
  },
  cardFirst: { marginTop: spacing.sm },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing['2xl'],
    gap: spacing.md,
  },
  cardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  indexDot: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  cardInfo: { flex: 1, gap: spacing.xs },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  topicTag: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  topicText: {
    fontSize: 10,
    color: colors.mutedForeground,
    fontFamily: 'monospace',
  },
  topicMore: {
    fontSize: 10,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  diffBadge: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  diffText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
    textTransform: 'capitalize',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background + 'EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
})