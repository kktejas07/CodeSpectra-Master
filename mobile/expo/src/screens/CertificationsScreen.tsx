import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet, Linking,
} from 'react-native'
import { api } from '../api/client'
import { colors, spacing, typography } from '../theme'

interface Cert {
  id: string; name: string; issuer: string; issued_at: string; verify_url: string
}

export default function CertificationsScreen() {
  const [certs, setCerts] = useState<Cert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ items: Cert[] }>('/api/certifications')
      .then(d => setCerts(d.items || [])).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} size="large" color={colors.primary} />

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={certs}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={<Text style={[typography.body, { textAlign: 'center', marginTop: spacing['4xl'] }]}>No certifications yet</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={typography.body}>{item.name}</Text>
            <Text style={typography.bodySmall}>{item.issuer}</Text>
            <Text style={typography.caption}>{item.issued_at?.slice(0, 10)}</Text>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 10, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.cardBorder },
})
