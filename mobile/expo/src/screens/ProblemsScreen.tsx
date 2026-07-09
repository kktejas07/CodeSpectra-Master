import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { api, Problem } from '../api/client'

export default function ProblemsScreen() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<Problem[]>('/api/problems')
      .then(setProblems)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <ActivityIndicator style={styles.centered} size="large" />

  return (
    <View style={styles.container}>
      <FlatList
        data={problems}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.difficulty}>{item.difficulty}</Text>
            <Text style={styles.topics}>{item.topics?.join(', ')}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No problems available</Text>
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
  title: { color: '#fafafa', fontSize: 16, fontWeight: '600' },
  difficulty: { color: '#38bdf8', fontSize: 12, marginTop: 4 },
  topics: { color: '#a1a1aa', fontSize: 12, marginTop: 2 },
  empty: { color: '#71717a', textAlign: 'center', marginTop: 40 },
})
