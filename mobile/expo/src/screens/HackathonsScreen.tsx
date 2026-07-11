import React, { useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Trophy, ChevronRight, Users, Calendar, Star } from 'lucide-react-native'
import { colors, spacing, commonStyles, shadows } from '../theme'

const MOCK_HACKATHONS = [
  { id: '1', name: 'CodeSprint 2025', status: 'upcoming', date: '2025-08-15', participants: 1240, prize: '$5,000' },
  { id: '2', name: 'AI Challenge 2025', status: 'active', date: '2025-07-01', participants: 856, prize: '$3,000' },
  { id: '3', name: 'React Global 2025', status: 'completed', date: '2025-05-20', participants: 2100, prize: '$10,000' },
]

const statusColor: Record<string, string> = {
  upcoming: colors.primary,
  active: colors.success,
  completed: colors.muted,
}
const statusBg: Record<string, string> = {
  upcoming: '#22C55E18',
  active: '#22C55E18',
  completed: '#52525B18',
}

export default function HackathonsScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={MOCK_HACKATHONS}
        keyExtractor={h => h.id}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Trophy size={20} color={colors.primary} strokeWidth={2} />
            <Text style={commonStyles.sectionTitle}>Hackathons</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={commonStyles.emptyState}>
            <Trophy size={40} color={colors.muted} strokeWidth={1.5} />
            <Text style={commonStyles.emptyText}>No hackathons available</Text>
          </View>
        }
        renderItem={({ item }) => {
          const sc = statusColor[item.status] || colors.muted
          const sb = statusBg[item.status] || colors.card

          return (
            <TouchableOpacity style={styles.card} activeOpacity={0.7}>
              <View style={styles.cardTop}>
                <View style={[styles.hackIcon, { backgroundColor: sc + '18' }]}>
                  <Trophy size={22} color={sc} strokeWidth={2} />
                </View>
                <View style={styles.hackInfo}>
                  <Text style={styles.hackName} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.hackMeta}>
                    <View style={styles.metaItem}>
                      <Calendar size={11} color={colors.muted} strokeWidth={2} />
                      <Text style={styles.metaText}>{item.date}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Users size={11} color={colors.muted} strokeWidth={2} />
                      <Text style={styles.metaText}>{item.participants.toLocaleString()}</Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: sb }]}>
                  <Text style={[styles.statusText, { color: sc }]}>{item.status.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.cardBottom}>
                <View style={styles.prizeWrap}>
                  <Star size={13} color={sc} strokeWidth={2} />
                  <Text style={[styles.prize, { color: sc }]}>{item.prize}</Text>
                </View>
                <View style={styles.joinBtn}>
                  <Text style={[styles.joinText, { color: sc }]}>
                    {item.status === 'completed' ? 'View Results' : item.status === 'active' ? 'Join Now' : 'Register'}
                  </Text>
                  <ChevronRight size={15} color={sc} strokeWidth={2} />
                </View>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.xs,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  hackIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  hackInfo: { flex: 1 },
  hackName: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', marginBottom: spacing.xs },
  hackMeta: { flexDirection: 'row', gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  prizeWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  prize: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  joinBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  joinText: { fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
})