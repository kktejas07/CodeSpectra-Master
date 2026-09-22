import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, Linking,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import { listAssessments, type AssessmentsResponse } from '../api/learner'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
}

/**
 * Assessments are taken on the web: proctoring needs the Chrome extension
 * (strict lockdown tier) or a full browser. Mobile lists what's available
 * and deep-links into the attempt — the honest split from spec §11.
 */
export function AssessmentsScreen({ theme }: Props): React.JSX.Element {
  const [data, setData] = useState<AssessmentsResponse>({ attempts: [], available: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      setData(await listAssessments())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load assessments.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const s = styles(theme)
  const { attempts, available, stats } = data

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={s.muted}>Loading assessments…</Text>
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
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
    >
      {typeof stats?.total === 'number' ? (
        <View style={s.statsRow}>
          <View style={s.stat}><Text style={s.statValue}>{stats.total}</Text><Text style={s.statLabel}>Attempts</Text></View>
          <View style={s.stat}><Text style={[s.statValue, { color: '#22C55E' }]}>{stats.passed ?? 0}</Text><Text style={s.statLabel}>Passed</Text></View>
          <View style={s.stat}><Text style={[s.statValue, { color: theme.primary }]}>{stats.avgScore ?? 0}%</Text><Text style={s.statLabel}>Avg score</Text></View>
        </View>
      ) : null}

      <Text style={s.section}>Ready to take</Text>
      {available.length === 0 ? (
        <Text style={s.muted}>No assessments assigned to you right now.</Text>
      ) : (
        available.map((a) => (
          <View key={a.id} style={s.card}>
            <Text style={s.cardTitle} numberOfLines={2}>{a.title}</Text>
            <View style={s.metaRow}>
              {a.level ? <Text style={s.meta}>{a.level}</Text> : null}
              {a.duration ? <Text style={s.meta}>{a.duration} min</Text> : null}
              {a.questions ? <Text style={s.meta}>{a.questions} questions</Text> : null}
            </View>
            <TouchableOpacity
              style={s.primaryBtn}
              activeOpacity={0.8}
              onPress={() => void Linking.openURL(`https://codespectra.ai${a.target_url || `/assessment/${a.id}`}`)}
              accessibilityRole="button"
              accessibilityLabel={`Start ${a.title} on the web`}
            >
              <Text style={s.primaryText}>Start on web</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Text style={s.section}>Past attempts</Text>
      {attempts.length === 0 ? (
        <Text style={s.muted}>Nothing attempted yet.</Text>
      ) : (
        attempts.map((a, i) => {
          const passed = a.passed === true
          const tone = a.passed === undefined ? '#94A3B8' : passed ? '#22C55E' : '#EF4444'
          return (
            <View key={`${a.examId ?? i}`} style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.cardTitle} numberOfLines={2}>
                  {a.examTitle || a.title || 'Assessment'}
                </Text>
                <View style={s.pill}>
                  <View style={[s.dot, { backgroundColor: tone }]} />
                  <Text style={[s.pillText, { color: tone }]}>
                    {a.passed === undefined ? 'pending' : passed ? 'passed' : 'failed'}
                  </Text>
                </View>
              </View>
              <View style={s.metaRow}>
                {typeof a.score === 'number' ? <Text style={s.meta}>Score {a.score}%</Text> : null}
                {a.submittedAt ? (
                  <Text style={s.meta}>{new Date(a.submittedAt).toLocaleDateString()}</Text>
                ) : null}
                {a.certificateId ? <Text style={[s.meta, { color: theme.primary }]}>Certificate</Text> : null}
              </View>
            </View>
          )
        })
      )}

      <Text style={s.note}>
        Proctored assessments run in a desktop browser — the anti-cheat layer (extension, device audit,
        fullscreen enforcement) can't be enforced inside a native app.
      </Text>
    </ScrollView>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    content: { padding: 16, paddingBottom: 40 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
    muted: { color: t.muted, fontSize: 14, lineHeight: 20 },
    error: { color: '#F87171', fontSize: 14, textAlign: 'center' },
    retry: {
      borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      paddingHorizontal: 20, minHeight: MIN_TOUCH, justifyContent: 'center',
    },
    retryText: { color: t.primary, fontSize: 15, fontWeight: '600' },
    section: { color: t.text, fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 10 },
    statsRow: { flexDirection: 'row', gap: 8 },
    stat: {
      flex: 1, backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, paddingVertical: 12, alignItems: 'center',
    },
    statValue: { color: t.text, fontSize: 20, fontWeight: '800' },
    statLabel: { color: t.muted, fontSize: 11, marginTop: 3 },
    card: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, padding: 14, marginBottom: 10,
    },
    rowBetween: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardTitle: { color: t.text, fontSize: 15, fontWeight: '600', flex: 1, lineHeight: 20 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' },
    meta: { color: t.muted, fontSize: 12 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    pillText: { fontSize: 12, fontWeight: '600' },
    primaryBtn: {
      backgroundColor: t.primary, borderRadius: 10, minHeight: MIN_TOUCH,
      alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    primaryText: { color: '#080D17', fontSize: 15, fontWeight: '700' },
    note: { color: t.muted, fontSize: 11, lineHeight: 16, marginTop: 20 },
  })
