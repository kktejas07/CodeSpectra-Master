import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../api/client'
import { colors, spacing, commonStyles, shadows } from '../theme'

interface Hackathon {
  id: string
  name: string
  slug: string
  status: string
  starts_at: string
  ends_at: string
  num_teams: number
}

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  live: { color: '#22C55E', bg: '#22C55E18', label: 'Live' },
  open: { color: '#38bdf8', bg: '#38bdf818', label: 'Open' },
  upcoming: { color: '#EAB308', bg: '#EAB30818', label: 'Upcoming' },
  closed: { color: colors.muted, bg: colors.accent, label: 'Closed' },
}

export default function HackathonsScreen() {
  const [events, setEvents] = useState<Hackathon[]>([])
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    api.get<{ items: Hackathon[] }>('/api/hackathons')
      .then(d => setEvents(d.items || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const getStatus = (s: string) => statusConfig[s] || statusConfig.closed

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={events}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Text style={commonStyles.sectionTitle}>Hackathons</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyText}>No hackathons yet</Text>
              <Text style={[commonStyles.emptyText, { marginTop: spacing.xs, fontSize: 12 }]}>
                Check back for upcoming coding events
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const status = getStatus(item.status)

          return (
            <View style={[styles.card, index === 0 && styles.cardFirst]}>
              <View style={styles.cardTop}>
                <View style={styles.hackIcon}>
                  <Text style={styles.hackIconText}>{'[H]'}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.hackName} numberOfLines={2}>{item.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.cardMeta}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>TEAMS</Text>
                  <Text style={styles.metaValue}>{item.num_teams}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>STARTS</Text>
                  <Text style={styles.metaValue}>
                    {item.starts_at ? new Date(item.starts_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    }) : 'TBD'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>ENDS</Text>
                  <Text style={styles.metaValue}>
                    {item.ends_at ? new Date(item.ends_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    }) : 'TBD'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={styles.registerBtn} activeOpacity={0.7}>
                <Text style={styles.registerBtnText}>
                  {item.status === 'live' || item.status === 'open' ? 'Register Now' : 'View Details'}
                </Text>
                <Text style={styles.registerArrow}>→</Text>
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
  cardTop: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  hackIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hackIconText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  cardInfo: { flex: 1, gap: spacing.sm },
  hackName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  cardMeta: {
    flexDirection: 'row',
    gap: spacing['2xl'],
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginBottom: spacing.lg,
  },
  metaItem: { gap: 2 },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  registerBtn: {
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
  registerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  registerArrow: {
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