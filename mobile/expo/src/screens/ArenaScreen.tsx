import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Trophy, Lock, Check, ChevronRight, Clock, TrendingUp } from 'lucide-react-native'
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
  const { width } = useWindowDimensions()

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
              <Trophy size={40} color={colors.muted} strokeWidth={1.5} />
              <Text style={commonStyles.emptyText}>No challenges available</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const dc = diffColor(item.difficulty)
          const isLocked = item.locked

          return (
            <View style={[styles.card, index === 0 && styles.cardFirst, isLocked && styles.cardLocked]}>
              <View style={styles.cardTop}>
                <View style={[styles.rankBadge, { backgroundColor: dc + '18' }]}>
                  <Text style={[styles.rankText, { color: dc }]}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
                </View>
                <View style={[styles.diffBadge, { backgroundColor: dc + '18' }]}>
                  <Text style={[styles.diffText, { color: dc }]}>{item.difficulty}</Text>
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
                    <Clock size={12} color={colors.muted} strokeWidth={2} />
                    <Text style={styles.metaValue}>{item.duration}m</Text>
                  </View>
                )}
                {item.successRate !== undefined && (
                  <View style={styles.metaItem}>
                    <TrendingUp size={12} color={colors.muted} strokeWidth={2} />
                    <Text style={styles.metaValue}>{item.successRate.toFixed(0)}%</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.actionBtn, isLocked && styles.actionBtnDisabled, item.completed && styles.actionBtnCompleted]}
                activeOpacity={0.7}
                disabled={isLocked}
              >
                {item.completed ? (
                  <>
                    <Check size={16} color={colors.success} strokeWidth={2.5} />
                    <Text style={styles.actionBtnTextCompleted}>Completed</Text>
                  </>
                ) : isLocked ? (
                  <>
                    <Lock size={16} color={colors.muted} strokeWidth={2} />
                    <Text style={styles.actionBtnTextDisabled}>Locked</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.actionBtnTextActive}>Start Challenge</Text>
                    <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
                  </>
                )}
              </TouchableOpacity>
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
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing['2xl'], marginBottom: spacing.md, ...shadows.sm },
  cardFirst: { marginTop: spacing.sm },
  cardLocked: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  rankBadge: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  cardInfo: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', lineHeight: 20, marginBottom: 4 },
  desc: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', lineHeight: 16 },
  diffBadge: { borderRadius: 8, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, alignSelf: 'flex-start' },
  diffText: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace' },
  cardMeta: { flexDirection: 'row', gap: spacing['2xl'], marginBottom: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaLabel: { fontSize: 10, fontWeight: '600', color: colors.muted, fontFamily: 'monospace', letterSpacing: 0.8 },
  metaValue: { fontSize: 13, color: colors.foreground, fontFamily: 'monospace' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary + '12', borderRadius: 10, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.primary + '30' },
  actionBtnDisabled: { backgroundColor: colors.accent, borderColor: colors.cardBorder },
  actionBtnCompleted: { backgroundColor: colors.success + '12', borderColor: colors.success + '30' },
  actionBtnTextActive: { fontSize: 14, fontWeight: '600', color: colors.primary, fontFamily: 'monospace' },
  actionBtnTextCompleted: { fontSize: 14, fontWeight: '600', color: colors.success, fontFamily: 'monospace' },
  actionBtnTextDisabled: { fontSize: 14, fontWeight: '600', color: colors.muted, fontFamily: 'monospace' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})