import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import { getLeaderboard, type LeaderboardResponse } from '../api/learner'
import { FALLBACK_THEME } from '../theme'

interface Props {
  theme: ThemeTokens
}

const MEDALS: Record<number, string> = { 1: '#FACC15', 2: '#CBD5E1', 3: '#D97706' }

export function LeaderboardScreen({ theme }: Props): React.JSX.Element {
  const [data, setData] = useState<LeaderboardResponse>({ entries: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      setData(await getLeaderboard())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the leaderboard.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const s = styles(theme)

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={s.muted}>Loading rankings…</Text>
      </View>
    )
  }
  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.error}>{error}</Text>
        <Text style={s.retry} onPress={() => void load()}>Retry</Text>
      </View>
    )
  }

  const { entries, currentUser } = data

  return (
    <View style={s.root}>
      {currentUser?.rank ? (
        <View style={s.youCard}>
          <Text style={s.youLabel}>Your rank</Text>
          <Text style={s.youValue}>#{currentUser.rank}</Text>
          <Text style={s.youXp}>{currentUser.points ?? 0} XP</Text>
        </View>
      ) : null}

      <FlatList
        data={entries}
        keyExtractor={(e) => e.userId || String(e.rank)}
        contentContainerStyle={entries.length === 0 ? s.emptyWrap : s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
        ListEmptyComponent={
          <View style={s.center}>
            <Text style={s.muted}>No rankings yet — earn XP to appear here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const medal = MEDALS[item.rank]
          const isMe = currentUser?.rank === item.rank && item.rank != null
          return (
            <View style={[s.row, isMe ? { borderColor: theme.primary } : null]}>
              <Text style={[s.rank, medal ? { color: medal, fontWeight: '800' } : null]}>
                {item.rank}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                <Text style={s.sub} numberOfLines={1}>
                  Level {item.level ?? 1}{item.title ? ` · ${item.title}` : ''}
                </Text>
              </View>
              <Text style={s.xp}>{(item.xp ?? 0).toLocaleString()}</Text>
            </View>
          )
        }}
      />
    </View>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
    muted: { color: t.muted, fontSize: 14, textAlign: 'center' },
    error: { color: '#F87171', fontSize: 14, textAlign: 'center' },
    retry: {
      color: t.primary, fontSize: 15, fontWeight: '600',
      borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      paddingHorizontal: 20, paddingVertical: 12, overflow: 'hidden',
    },
    youCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.card, borderColor: t.primary, borderWidth: 1,
      borderRadius: 12, margin: 16, marginBottom: 8, padding: 14,
    },
    youLabel: { color: t.muted, fontSize: 13, flex: 1 },
    youValue: { color: t.primary, fontSize: 22, fontWeight: '800' },
    youXp: { color: t.muted, fontSize: 13 },
    list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
    emptyWrap: { flexGrow: 1 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, padding: 12, marginBottom: 8, minHeight: 56,
    },
    rank: { color: t.muted, fontSize: 15, fontWeight: '700', width: 32, textAlign: 'center' },
    name: { color: t.text, fontSize: 15, fontWeight: '600' },
    sub: { color: t.muted, fontSize: 12, marginTop: 2 },
    xp: { color: t.primary, fontSize: 15, fontWeight: '700' },
  })
