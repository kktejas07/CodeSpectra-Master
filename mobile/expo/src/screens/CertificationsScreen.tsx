import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { api, Certification } from '../api/client'

export default function CertificationsScreen() {
  const [certs, setCerts] = useState<Certification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ items: Certification[] }>('/api/certifications')
      .then((d) => setCerts(d.items || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <ActivityIndicator style={styles.centered} size="large" />

  return (
    <View style={styles.container}>
      <FlatList
        data={certs}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.issuer}>{item.issuer}</Text>
            <Text style={styles.date}>{item.issued_at?.slice(0, 10)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No certifications yet</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  centered: { flex: 1, justifyContent: 'center', backgroundColor: '#09090b' },
  card: {
    backgroundColor: '#18181b',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  name: { color: '#fafafa', fontSize: 16, fontWeight: '600' },
  issuer: { color: '#a1a1aa', fontSize: 13, marginTop: 4 },
  date: { color: '#71717a', fontSize: 12, marginTop: 2 },
  empty: { color: '#71717a', textAlign: 'center', marginTop: 40 },
})
