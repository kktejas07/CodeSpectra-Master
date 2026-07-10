import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native'
import { api } from '../api/client'
import { colors, spacing, typography } from '../theme'

interface Track {
  id: string; title: string; description: string; difficulty: string; lessons: number; progress: number
}

export default function LearningScreen() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ items: Track[] }>('/api/tracks')
      .then(d => setTracks(d.items || [])).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={tracks}
        keyExtractor={t => t.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={typography.h1}>Learning Tracks</Text>
            <Text style={[typography.bodySmall, { marginTop: spacing.xs }]}>Structured paths to master coding</Text>
          </View>
        }
        ListEmptyComponent={<Text style={[typography.body, { textAlign: 'center', marginTop: spacing['4xl'] }]}>No tracks available</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7}>
            <Text style={typography.body}>{item.title}</Text>
            <Text style={[typography.bodySmall, { marginTop: spacing.xs }]}>{item.description}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
              <Text style={typography.caption}>{item.lessons} lessons · {item.difficulty}</Text>
              <Text style={[typography.caption, { color: colors.primary }]}>{item.progress}%</Text>
            </View>
            {item.progress > 0 && (
              <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${item.progress}%` }]} /></View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 10, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder },
  progressBar: { height: 4, backgroundColor: colors.cardBorder, borderRadius: 2, marginTop: spacing.sm },
  progressFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
})
