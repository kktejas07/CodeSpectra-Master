import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import { listJudgeSubmissions, statusTone, type JudgeEvent, type JudgeSubmission } from '../api/judge'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  route: any
  navigation: any
}

export function JudgeSubmissionsScreen({ theme, route, navigation }: Props): React.JSX.Element {
  const event: JudgeEvent | undefined = route?.params?.event
  const eventId: string = event?.id ?? ''
  const [subs, setSubs] = useState<JudgeSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (!eventId) { setError('Event missing.'); setLoading(false); return }
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      setSubs(await listJudgeSubmissions(eventId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load submissions.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  const s = styles(theme)

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={s.muted}>Loading submissions…</Text>
      </View>
    )
  }
  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.error}>{error}</Text>
        <TouchableOpacity style={s.retry} onPress={() => void load()} activeOpacity={0.7}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <FlatList
      style={s.root}
      data={subs}
      keyExtractor={(x) => x.id}
      contentContainerStyle={subs.length === 0 ? s.emptyWrap : s.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />
      }
      ListEmptyComponent={
        <View style={s.center}>
          <Text style={s.muted}>No submissions for this event yet.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const tone = statusTone(item.status)
        const judgeCount = Array.isArray(item.rubric_scores) ? item.rubric_scores.length : 0
        return (
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('JudgeScore', { event, submission: item })}
            accessibilityRole="button"
            accessibilityLabel={`${item.team_name || 'Team'}, ${tone.label}`}
          >
            <View style={s.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle} numberOfLines={1}>{item.team_name || 'Unnamed team'}</Text>
                <Text style={s.cardMeta} numberOfLines={1}>
                  {judgeCount > 0 ? `${judgeCount} judge sheet${judgeCount === 1 ? '' : 's'}` : 'Not scored yet'}
                  {typeof item.score === 'number' ? ` · score ${item.score}` : ''}
                </Text>
              </View>
              <View style={s.pill}>
                <View style={[s.dot, { backgroundColor: tone.color }]} />
                <Text style={[s.pillText, { color: tone.color }]}>{tone.label}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )
      }}
    />
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    list: { padding: 16, paddingBottom: 32 },
    emptyWrap: { flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
    muted: { color: t.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    error: { color: '#F87171', fontSize: 14, textAlign: 'center' },
    retry: {
      borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      paddingHorizontal: 20, minHeight: MIN_TOUCH, justifyContent: 'center',
    },
    retryText: { color: t.primary, fontSize: 15, fontWeight: '600' },
    card: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, padding: 14, marginBottom: 10, minHeight: MIN_TOUCH,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardTitle: { color: t.text, fontSize: 15, fontWeight: '600' },
    cardMeta: { color: t.muted, fontSize: 12, marginTop: 4 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    pillText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  })
