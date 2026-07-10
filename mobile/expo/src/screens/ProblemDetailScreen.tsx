import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, ScrollView } from 'react-native'
import { RouteProp, useRoute } from '@react-navigation/native'
import { colors, spacing, typography, commonStyles } from '../theme'
import { api } from '../api/client'
import type { RootStackParamList } from '../../App'

type Route = RouteProp<RootStackParamList, 'ProblemDetail'>

interface TestCase {
  input: string; output: string; explanation?: string; is_sample?: boolean
}

export default function ProblemDetailScreen() {
  const route = useRoute<Route>()
  const { slug } = route.params
  const [problem, setProblem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<any>(`/api/problems/${slug}`)
      .then(setProblem)
      .catch(() => setError('Failed to load problem'))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />
  if (error || !problem) return <View style={commonStyles.container}><Text style={[typography.body, { padding: spacing.lg }]}>{error || 'Not found'}</Text></View>

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h2}>{problem.title}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
        <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.badgeText, { color: colors.primary }]}>{problem.difficulty}</Text>
        </View>
        {(problem.topics || []).map((t: string) => (
          <View key={t} style={[styles.badge, { backgroundColor: colors.cardBorder }]}>
            <Text style={styles.badgeText}>{t}</Text>
          </View>
        ))}
      </View>
      {problem.statement_md && <Text style={[typography.body, { marginTop: spacing.md }]}>{problem.statement_md}</Text>}
      {problem.constraints && <Text style={[typography.bodySmall, { marginTop: spacing.sm, color: colors.muted }]}>Constraints: {problem.constraints}</Text>}
      {(problem.test_cases || []).filter((t: TestCase) => t.is_sample !== false).map((tc: TestCase, i: number) => (
        <View key={i} style={[commonStyles.card, { marginTop: spacing.md }]}>
          <Text style={typography.caption}>Sample {i + 1}</Text>
          <Text style={[typography.mono, { marginTop: spacing.xs }]}>Input: {tc.input}</Text>
          <Text style={[typography.mono, { marginTop: spacing.xs }]}>Output: {tc.output}</Text>
          {tc.explanation && <Text style={[typography.bodySmall, { marginTop: spacing.xs, color: colors.muted }]}>{tc.explanation}</Text>}
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  badge: { borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '600', color: colors.muted },
})