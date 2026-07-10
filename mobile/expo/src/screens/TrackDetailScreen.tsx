import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, ScrollView } from 'react-native'
import { RouteProp, useRoute } from '@react-navigation/native'
import { colors, spacing, typography, commonStyles } from '../theme'
import { api } from '../api/client'
import type { RootStackParamList } from '../../App'

type Route = RouteProp<RootStackParamList, 'TrackDetail'>

export default function TrackDetailScreen() {
  const route = useRoute<Route>()
  const { trackId } = route.params
  const [track, setTrack] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<any>(`/api/tracks/${trackId}`)
      .then(setTrack)
      .catch(() => setError('Failed to load track'))
      .finally(() => setLoading(false))
  }, [trackId])

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />
  if (error || !track) return <View style={commonStyles.container}><Text style={[typography.body, { padding: spacing.lg }]}>{error || 'Not found'}</Text></View>

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h2}>{track.title}</Text>
      <Text style={[typography.bodySmall, { marginTop: spacing.sm }]}>{track.description}</Text>
      <View style={[commonStyles.card, { marginTop: spacing.md }]}>
        <View style={styles.row}><Text style={typography.caption}>Difficulty</Text><Text style={typography.body}>{track.difficulty}</Text></View>
        <View style={[styles.row, { marginTop: spacing.sm }]}><Text style={typography.caption}>Lessons</Text><Text style={typography.body}>{track.lessons}</Text></View>
        {track.progress > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={typography.caption}>Progress</Text><Text style={[typography.caption, { color: colors.primary }]}>{track.progress}%</Text></View>
            <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${track.progress}%` }]} /></View>
          </View>
        )}
      </View>
      {track.lessons_list?.map((lesson: any, i: number) => (
        <View key={i} style={[commonStyles.card, { marginTop: spacing.sm }]}>
          <Text style={typography.body}>{lesson.title || `Lesson ${i + 1}`}</Text>
          {lesson.status && <Text style={[typography.caption, { marginTop: spacing.xs, color: lesson.status === 'completed' ? colors.success : colors.muted }]}>{lesson.status}</Text>}
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  progressBar: { height: 4, backgroundColor: colors.cardBorder, borderRadius: 2, marginTop: spacing.xs },
  progressFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
})