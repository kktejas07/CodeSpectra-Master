import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native'
import { api } from '../api/client'
import { colors, spacing, typography } from '../theme'

interface Hackathon {
  id: string; name: string; slug: string; status: string; starts_at: string; ends_at: string; num_teams: number
}

export default function HackathonsScreen() {
  const [events, setEvents] = useState<Hackathon[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ items: Hackathon[] }>('/api/hackathons')
      .then(d => setEvents(d.items || [])).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const statusColor = (s: string) => s === 'live' ? colors.success : s === 'open' ? colors.primary : s === 'closed' ? colors.muted : colors.warning

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={events}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={typography.h1}>Hackathons</Text>
            <Text style={[typography.bodySmall, { marginTop: spacing.xs }]}>Compete in timed coding events</Text>
          </View>
        }
        ListEmptyComponent={<Text style={[typography.body, { textAlign: 'center', marginTop: spacing['4xl'] }]}>No events yet</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={[typography.body, { flex: 1, marginRight: spacing.sm }]}>{item.name}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }}>
              <Text style={typography.caption}>{item.num_teams} teams</Text>
              <Text style={typography.caption}>{new Date(item.starts_at).toLocaleDateString()}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 10, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder },
  badge: { borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
})
