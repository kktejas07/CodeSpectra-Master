import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, unwrapData, Track } from '../api/client'
import { colors, spacing, commonStyles, shadows } from '../theme'

export default function LearningScreen() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    api.get<unknown>('/api/tracks')
      .then(res => setTracks(unwrapData<Track>(res)))
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
              <Text style={commonStyles.emptyText}>No tracks available</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View style={[styles.card, index === 0 && styles.cardFirst]}>
            <View style={styles.cardHeader}>
              <View style={styles.trackIcon}>
                <Text style={styles.trackIconText}>{'</>'}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.trackTitle} numberOfLines={1}>{item.name}</Text>
                {item.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.trackDesc}>{item.description}</Text>
            <View style={styles.topics}>
              {item.topics?.slice(0, 4).map((t, i) => (
                <View key={i} style={styles.topicTag}>
                  <Text style={styles.topicText}>{t}</Text>
                </View>
              ))}
              {(item.topics?.length || 0) > 4 && (
                <Text style={styles.topicMore}>+{(item.topics?.length || 0) - 4}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.startBtn} activeOpacity={0.7}>
              <Text style={styles.startBtnText}>Start Track →</Text>
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  trackIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  trackIconText: { fontSize: 18, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  cardInfo: { flex: 1, gap: spacing.xs },
  trackTitle: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace' },
  badge: { backgroundColor: colors.primary + '18', borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 1, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10, fontWeight: '600', color: colors.primary, fontFamily: 'monospace' },
  trackDesc: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'monospace', lineHeight: 18, marginBottom: spacing.md },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  topicTag: { backgroundColor: colors.accent, borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  topicText: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'monospace' },
  topicMore: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  startBtn: { backgroundColor: colors.primary + '12', borderRadius: 8, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.primary + '30' },
  startBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary, fontFamily: 'monospace' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})