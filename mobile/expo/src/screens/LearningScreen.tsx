import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../api/client'
import { colors, spacing, commonStyles, shadows } from '../theme'

interface Track {
  id: string
  title: string
  description: string
  difficulty: string
  lessons: number
  progress: number
}

const diffColors: Record<string, string> = {
  beginner: '#22C55E',
  intermediate: '#EAB308',
  advanced: '#EF4444',
}

export default function LearningScreen() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    api.get<{ items: Track[] }>('/api/tracks')
      .then(d => setTracks(d.items || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={tracks}
        keyExtractor={t => t.id}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Text style={commonStyles.sectionTitle}>Learning Tracks</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyText}>No learning tracks yet</Text>
              <Text style={[commonStyles.emptyText, { marginTop: spacing.xs, fontSize: 12 }]}>
                Tracks will appear as you progress
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View style={[styles.card, index === 0 && styles.cardFirst]}>
            <View style={styles.cardHeader}>
              <View style={styles.trackIcon}>
                <Text style={styles.trackIconText}>{'</>'}</Text>
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.trackInfo}>
                  <Text style={styles.trackMeta}>{item.lessons} lessons</Text>
                  <View style={[styles.diffBadge, { backgroundColor: (diffColors[item.difficulty] || colors.muted) + '18' }]}>
                    <Text style={[styles.diffText, { color: diffColors[item.difficulty] || colors.muted }]}>
                      {item.difficulty}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={styles.trackDesc}>{item.description}</Text>

            {item.progress > 0 && (
              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Progress</Text>
                  <Text style={[styles.progressValue, { color: colors.primary }]}>{item.progress}%</Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${item.progress}%` }]} />
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.continueBtn} activeOpacity={0.7}>
              <Text style={styles.continueBtnText}>
                {item.progress === 0 ? 'Start Track' : 'Continue'}
              </Text>
              <Text style={styles.continueArrow}>→</Text>
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  trackIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackIconText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  cardMeta: { flex: 1, gap: spacing.xs },
  trackTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  trackInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trackMeta: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  diffBadge: { borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  diffText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  trackDesc: {
    fontSize: 13,
    color: colors.mutedForeground,
    fontFamily: 'monospace',
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  progressSection: { marginBottom: spacing.lg },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  progressLabel: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressValue: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.cardBorder,
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  continueBtn: {
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
  continueBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  continueArrow: {
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