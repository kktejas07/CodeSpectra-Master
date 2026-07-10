import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native'
import { api, Problem } from '../api/client'
import { colors, spacing, typography } from '../theme'

export default function ProblemsScreen() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Problem[]>('/api/problems')
      .then(setProblems).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={problems}
        keyExtractor={p => p.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={<Text style={[typography.body, { textAlign: 'center', marginTop: spacing['4xl'] }]}>No problems available</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={typography.body}>{item.title}</Text>
              <Text style={[typography.caption, { color: colors.primary }]}>{item.difficulty}</Text>
            </View>
            <Text style={[typography.caption, { marginTop: spacing.xs }]}>{item.topics?.join(', ')}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 10, padding: spacing.lg, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
})
