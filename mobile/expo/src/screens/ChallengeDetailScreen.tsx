import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { RouteProp, useRoute } from '@react-navigation/native'
import { colors, spacing, typography, commonStyles } from '../theme'
import { api } from '../api/client'
import type { RootStackParamList } from '../../App'

type Route = RouteProp<RootStackParamList, 'ChallengeDetail'>

export default function ChallengeDetailScreen() {
  const route = useRoute<Route>()
  const { challengeId } = route.params
  const [challenge, setChallenge] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<any>(`/api/challenges/${challengeId}`)
      .then(setChallenge)
      .catch(() => setError('Failed to load challenge'))
      .finally(() => setLoading(false))
  }, [challengeId])

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />
  if (error || !challenge) return <View style={commonStyles.container}><Text style={[typography.body, { padding: spacing.lg }]}>{error || 'Not found'}</Text></View>

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h2}>{challenge.title}</Text>
      {challenge.description && <Text style={[typography.body, { marginTop: spacing.md }]}>{challenge.description}</Text>}
      {challenge.examples?.map((ex: any, i: number) => (
        <View key={i} style={[commonStyles.card, { marginTop: spacing.md }]}>
          <Text style={typography.caption}>Example {i + 1}</Text>
          {ex.input && <Text style={[typography.mono, { marginTop: spacing.xs }]}>Input: {ex.input}</Text>}
          {ex.output && <Text style={[typography.mono, { marginTop: spacing.xs }]}>Output: {ex.output}</Text>}
          {ex.explanation && <Text style={[typography.bodySmall, { marginTop: spacing.xs, color: colors.muted }]}>{ex.explanation}</Text>}
        </View>
      ))}
      {challenge.initialCode && (
        <View style={[commonStyles.card, { marginTop: spacing.md }]}>
          <Text style={typography.caption}>Starter Code</Text>
          <Text style={[typography.mono, { marginTop: spacing.xs }]}>{challenge.initialCode}</Text>
        </View>
      )}
    </ScrollView>
  )
}