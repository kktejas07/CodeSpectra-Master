import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet,
  RefreshControl, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Award, Check, Lock, Star } from 'lucide-react-native'
import { colors, spacing, commonStyles, shadows } from '../theme'
import { api, unwrapData, Achievement } from '../api/client'

export default function AchievementsScreen() {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const insets = useSafeAreaInsets()

  const fetchData = async () => {
    try {
      const res = await api.get<unknown>('/api/achievements')
      setAchievements(unwrapData<Achievement>(res))
    } catch { /* silent */ }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [])

  const unlockedColor = (a: Achievement) =>
    a.unlocked ? colors.primary : colors.muted

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={achievements}
        keyExtractor={a => String(a.id)}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Award size={20} color={colors.primary} strokeWidth={2} />
            <Text style={commonStyles.sectionTitle}>Achievements</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Award size={40} color={colors.muted} strokeWidth={1.5} />
              <Text style={commonStyles.emptyText}>No achievements yet</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const isUnlocked = item.unlocked
          const accent = unlockedColor(item)

          return (
            <View style={[styles.card, !isUnlocked && styles.cardLocked]}>
              <View style={[styles.iconWrap, { backgroundColor: accent + '18' }]}>
                {item.type === 'star' ? (
                  <Star size={24} color={accent} strokeWidth={2} />
                ) : item.unlocked ? (
                  <Check size={24} color={accent} strokeWidth={2.5} />
                ) : (
                  <Lock size={20} color={accent} strokeWidth={2} />
                )}
              </View>

              <View style={styles.info}>
                <Text style={[styles.title, !isUnlocked && styles.titleLocked]}>{item.name}</Text>
                <Text style={styles.description}>{item.description || 'Keep coding to unlock!'}</Text>
                {item.progress !== undefined && item.maxProgress !== undefined && (
                  <View style={styles.progressWrap}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${(item.progress / item.maxProgress) * 100}%`, backgroundColor: accent }]} />
                    </View>
                    <Text style={styles.progressText}>{item.progress}/{item.maxProgress}</Text>
                  </View>
                )}
              </View>

              {isUnlocked && item.unlockedAt && (
                <View style={styles.unlockedBadge}>
                  <Text style={styles.unlockedText}>✓</Text>
                </View>
              )}
            </View>
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
  cardLocked: { opacity: 0.6 },
  iconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  info: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', marginBottom: 3 },
  titleLocked: { color: colors.muted },
  description: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', lineHeight: 16 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  progressBar: { flex: 1, height: 4, backgroundColor: colors.input, borderRadius: 2 },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  unlockedBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  unlockedText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})