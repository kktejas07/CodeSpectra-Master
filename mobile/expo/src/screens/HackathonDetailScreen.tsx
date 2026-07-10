import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { RouteProp, useRoute } from '@react-navigation/native'
import { colors, spacing, typography, commonStyles } from '../theme'
import { api } from '../api/client'
import type { RootStackParamList } from '../../App'

type Route = RouteProp<RootStackParamList, 'HackathonDetail'>

interface Team {
  id: string; slug: string; members: string[]; xp_delta: number; rank?: number
}

export default function HackathonDetailScreen() {
  const route = useRoute<Route>()
  const { id } = route.params
  const [hackathon, setHackathon] = useState<any>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<any>(`/api/hackathons/${id}`),
      api.get<{ items: Team[] }>(`/api/hackathons/${id}/teams`).catch(() => ({ items: [] })),
    ])
      .then(([hk, tm]) => { setHackathon(hk); setTeams(tm.items || []) })
      .catch(() => setError('Failed to load hackathon'))
      .finally(() => setLoading(false))
  }, [id])

  const statusColor = (s: string) => s === 'live' ? colors.success : s === 'open' ? colors.primary : s === 'closed' ? colors.muted : colors.warning
  const now = Date.now()
  const isLive = hackathon && new Date(hackathon.starts_at).getTime() <= now && new Date(hackathon.ends_at).getTime() >= now

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />
  if (error || !hackathon) return <View style={commonStyles.container}><Text style={[typography.body, { padding: spacing.lg }]}>{error || 'Not found'}</Text></View>

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={typography.h2}>{hackathon.name}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor(hackathon.status) + '20' }]}>
          <Text style={[styles.badgeText, { color: statusColor(hackathon.status) }]}>{hackathon.status}</Text>
        </View>
      </View>
      {hackathon.description && <Text style={[typography.bodySmall, { marginTop: spacing.sm }]}>{hackathon.description}</Text>}
      <View style={[commonStyles.card, { marginTop: spacing.md }]}>
        <View style={styles.row}><Text style={typography.caption}>Teams</Text><Text style={typography.body}>{teams.length} / {hackathon.num_teams}</Text></View>
        <View style={[styles.row, { marginTop: spacing.sm }]}><Text style={typography.caption}>Max per team</Text><Text style={typography.body}>{hackathon.max_per_team}</Text></View>
        <View style={[styles.row, { marginTop: spacing.sm }]}><Text style={typography.caption}>Duration</Text><Text style={typography.body}>{hackathon.timeout_minutes} min</Text></View>
        <View style={[styles.row, { marginTop: spacing.sm }]}><Text style={typography.caption}>Starts</Text><Text style={typography.body}>{new Date(hackathon.starts_at).toLocaleString()}</Text></View>
        <View style={[styles.row, { marginTop: spacing.sm }]}><Text style={typography.caption}>Ends</Text><Text style={typography.body}>{new Date(hackathon.ends_at).toLocaleString()}</Text></View>
      </View>
      {hackathon.tasks?.length > 0 && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={typography.h3}>Problems</Text>
          {hackathon.tasks.map((task: any, i: number) => (
            <View key={i} style={[commonStyles.card, { marginTop: spacing.sm }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={typography.body}>{task.problem_title || task.problem_slug}</Text>
                <Text style={[typography.caption, { color: colors.primary }]}>{task.points} pts</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {teams.length > 0 && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={typography.h3}>Teams ({teams.length})</Text>
          {teams.map((team, i) => (
            <View key={team.id} style={[commonStyles.card, { marginTop: spacing.sm }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={typography.body}>#{i + 1} {team.slug}</Text>
                <Text style={[typography.caption, { color: colors.primary }]}>{team.xp_delta} XP</Text>
              </View>
              <Text style={[typography.caption, { marginTop: spacing.xs }]}>{team.members.length} members</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  badge: { borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
})