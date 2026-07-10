import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native'
import { api } from '../api/client'
import { colors, spacing, typography } from '../theme'

interface Achievement {
  id: string; name: string; description: string; icon: string; unlocked_at?: string
}

export default function AchievementsScreen() {
  const [items, setItems] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ items: Achievement[] }>('/api/achievements')
      .then(d => setItems(d.items || [])).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={items}
        keyExtractor={a => a.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={typography.h1}>Achievements</Text>
            <Text style={[typography.bodySmall, { marginTop: spacing.xs }]}>Badges earned through your journey</Text>
          </View>
        }
        ListEmptyComponent={<Text style={[typography.body, { textAlign: 'center', marginTop: spacing['4xl'] }]}>No achievements yet</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.unlocked_at && { opacity: 0.4 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={styles.iconBox}>
                <Text style={{ fontSize: 24 }}>{item.icon || '🏆'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{item.name}</Text>
                <Text style={typography.caption}>{item.description}</Text>
                {item.unlocked_at && <Text style={[typography.caption, { color: colors.success, marginTop: 2 }]}>Unlocked {new Date(item.unlocked_at).toLocaleDateString()}</Text>}
              </View>
            </View>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 10, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder },
  iconBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
})
