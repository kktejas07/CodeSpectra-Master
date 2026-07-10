import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, unwrapData, Achievement } from '../api/client'
import { colors, spacing, commonStyles, shadows } from '../theme'

const ACHIEVEMENT_ICONS: Record<string, string> = {
  Trophy: '[*]', Zap: '[Z]', Star: '[S]', Target: '[T]',
  Shield: '[#]', Award: '[A]', default: '[+]',
}

export default function AchievementsScreen() {
  const [items, setItems] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    api.get<unknown>('/api/achievements')
      .then(res => setItems(unwrapData<Achievement>(res)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const unlockedCount = items.filter(a => a.earned).length

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={items}
        keyExtractor={a => String(a.id)}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View>
            <View style={commonStyles.sectionHeader}>
              <Text style={commonStyles.sectionTitle}>Achievements</Text>
            </View>
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{unlockedCount}</Text>
                <Text style={styles.summaryLabel}>Unlocked</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{items.length - unlockedCount}</Text>
                <Text style={styles.summaryLabel}>Locked</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyText}>No achievements yet</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const unlocked = item.earned
          return (
            <View style={[styles.card, index === 0 && styles.cardFirst, !unlocked && styles.cardLocked]}>
              <View style={styles.cardMain}>
                <View style={[styles.iconBox, !unlocked && styles.iconBoxLocked]}>
                  <Text style={[styles.iconText, !unlocked && styles.iconTextLocked]}>
                    {ACHIEVEMENT_ICONS[item.icon] || ACHIEVEMENT_ICONS.default}
                  </Text>
                </View>
                <View style={styles.content}>
                  <Text style={[styles.achievementName, !unlocked && styles.textLocked]}>{item.name}</Text>
                  <Text style={styles.achievementDesc}>{item.description}</Text>
                  {item.progress > 0 && (
                    <View style={styles.progressRow}>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${(item.progress / item.total) * 100}%` }]} />
                      </View>
                      <Text style={styles.progressText}>{item.progress}/{item.total}</Text>
                    </View>
                  )}
                </View>
                {unlocked && (
                  <View style={styles.checkMark}>
                    <Text style={styles.checkText}>✓</Text>
                  </View>
                )}
              </View>
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
  summaryCard: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing['2xl'], marginBottom: spacing.lg, ...shadows.sm },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: colors.cardBorder },
  summaryValue: { fontSize: 28, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  summaryLabel: { fontSize: 11, color: colors.muted, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, marginBottom: spacing.sm, ...shadows.sm },
  cardFirst: { marginTop: spacing.sm },
  cardLocked: { opacity: 0.55 },
  cardMain: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  iconBox: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  iconBoxLocked: { backgroundColor: colors.cardBorder },
  iconText: { fontSize: 16, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  iconTextLocked: { color: colors.muted },
  content: { flex: 1 },
  achievementName: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', marginBottom: 2 },
  textLocked: { color: colors.muted },
  achievementDesc: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'monospace', lineHeight: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  progressBar: { flex: 1, height: 3, backgroundColor: colors.cardBorder, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: colors.primary, borderRadius: 2 },
  progressText: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  checkMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.success + '18', alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 12, fontWeight: '700', color: colors.success },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})