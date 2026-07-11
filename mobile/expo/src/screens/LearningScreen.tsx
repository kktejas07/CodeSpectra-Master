import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet,
  RefreshControl, TouchableOpacity, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BookOpen, ChevronRight, Users, Star } from 'lucide-react-native'
import { colors, spacing, commonStyles, shadows } from '../theme'
import { api, unwrapData, Track } from '../api/client'

const diffDot: Record<string, string> = {
  Beginner: colors.success,
  Intermediate: colors.warning,
  Advanced: colors.destructive,
}

export default function LearningScreen() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const insets = useSafeAreaInsets()

  const fetchData = async () => {
    try {
      const res = await api.get<unknown>('/api/tracks')
      setTracks(unwrapData<Track>(res))
    } catch { /* silent */ }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [])

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={tracks}
        keyExtractor={t => t.id}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <BookOpen size={20} color={colors.primary} strokeWidth={2} />
            <Text style={commonStyles.sectionTitle}>Learning Paths</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <BookOpen size={40} color={colors.muted} strokeWidth={1.5} />
              <Text style={commonStyles.emptyText}>No tracks available</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const dot = item.difficulty ? diffDot[item.difficulty] || colors.muted : colors.muted

          return (
            <TouchableOpacity style={styles.card} activeOpacity={0.7}>
              <View style={[styles.trackIcon, { backgroundColor: colors.primary + '18' }]}>
                <BookOpen size={22} color={colors.primary} strokeWidth={2} />
              </View>

              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle} numberOfLines={1}>{item.name}</Text>
                {item.description && (
                  <Text style={styles.trackDesc} numberOfLines={2}>{item.description}</Text>
                )}
                <View style={styles.trackMeta}>
                  {item.difficulty && (
                    <View style={styles.metaChip}>
                      <View style={[styles.dot, { backgroundColor: dot }]} />
                      <Text style={styles.metaText}>{item.difficulty}</Text>
                    </View>
                  )}
                  {item.totalCourses !== undefined && (
                    <View style={styles.metaChip}>
                      <BookOpen size={12} color={colors.muted} strokeWidth={2} />
                      <Text style={styles.metaText}>{item.totalCourses} courses</Text>
                    </View>
                  )}
                  {item.enrolledCount !== undefined && (
                    <View style={styles.metaChip}>
                      <Users size={12} color={colors.muted} strokeWidth={2} />
                      <Text style={styles.metaText}>{item.enrolledCount.toLocaleString()}</Text>
                    </View>
                  )}
                </View>
              </View>

              <ChevronRight size={18} color={colors.muted} strokeWidth={2} />
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
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.xs,
  },
  trackIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  trackInfo: { flex: 1 },
  trackTitle: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', marginBottom: 3 },
  trackDesc: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', lineHeight: 16, marginBottom: spacing.sm },
  trackMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3 },
  metaText: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})