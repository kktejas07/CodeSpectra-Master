import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, Linking,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import {
  getWorkerStatus, getLlmHealth, testLlmProviders, unstickWorker,
  type WorkerStatus, type LlmHealth,
} from '../api/admin'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  onNavigate: (screen: string) => void
}

const cardTone = (ok: boolean | null): string =>
  ok === true ? '#22C55E' : ok === false ? '#EF4444' : '#94A3B8'

export function AdminScreen({ theme, onNavigate }: Props): React.JSX.Element {
  const [worker, setWorker] = useState<WorkerStatus | null>(null)
  const [llm, setLlm] = useState<LlmHealth>({ checkedAt: null, results: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [unsticking, setUnsticking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    setError(null)
    try {
      const [w, h] = await Promise.all([getWorkerStatus(), getLlmHealth()])
      setWorker(w)
      setLlm(h)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin status.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setError(null)
    try {
      setLlm(await testLlmProviders())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Health probe failed.')
    } finally {
      setTesting(false)
    }
  }

  const doUnstick = async (): Promise<void> => {
    setUnsticking(true)
    try {
      await unstickWorker()
      await load(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unstick failed.')
    } finally {
      setUnsticking(false)
    }
  }

  const s = styles(theme)
  const working = llm.results.filter((r) => r.status === 'ok').length
  const total = llm.results.length
  const llmTone = total === 0 ? null : working === 0 ? false : working < total ? null : true

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
    >
      {error ? <Text style={s.error}>{error}</Text> : null}

      {/* Course worker */}
      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>Course worker</Text>
          <View style={s.pill}>
            <View style={[s.dot, { backgroundColor: cardTone(worker?.online ?? null) }]} />
            <Text style={[s.pillText, { color: cardTone(worker?.online ?? null) }]}>
              {worker?.online === true ? 'online' : worker?.online === false ? 'offline' : 'unknown'}
            </Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 12 }} />
        ) : (
          <>
            {worker?.runningJob?.courseTitle ? (
              <Text style={s.meta}>
                Running: {worker.runningJob.courseTitle} ({worker.runningJob.progress ?? 0}%)
              </Text>
            ) : (
              <Text style={s.meta}>No job running.</Text>
            )}
            {worker?.hint ? <Text style={s.hint}>{worker.hint}</Text> : null}
            {worker?.stuck ? (
              <TouchableOpacity
                style={[s.ghostBtn, unsticking ? s.disabled : null]}
                onPress={() => void doUnstick()}
                disabled={unsticking}
                activeOpacity={0.7}
              >
                {unsticking ? <ActivityIndicator color={theme.primary} /> : <Text style={s.ghostText}>Unstick hung job</Text>}
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>

      {/* LLM chain health */}
      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>LLM chain</Text>
          <View style={s.pill}>
            <View style={[s.dot, { backgroundColor: cardTone(llmTone) }]} />
            <Text style={[s.pillText, { color: cardTone(llmTone) }]}>
              {total === 0 ? 'not tested' : `${working}/${total} working`}
            </Text>
          </View>
        </View>
        {llm.checkedAt ? <Text style={s.meta}>Last checked {timeAgo(llm.checkedAt)}</Text> : null}
        {llm.results.slice(0, 5).map((r) => (
          <View key={`${r.provider}/${r.model}`} style={s.row}>
            <View style={[s.dot, { backgroundColor: healthColor(r.status) }]} />
            <Text style={s.rowLabel} numberOfLines={1}>{r.provider}</Text>
            <Text style={[s.rowValue, { color: healthColor(r.status) }]}>{r.status.replace('_', ' ')}</Text>
          </View>
        ))}
        {total > 5 ? <Text style={s.hint}>+{total - 5} more in settings</Text> : null}
        <TouchableOpacity
          style={[s.primaryBtn, testing ? s.disabled : null]}
          onPress={() => void runTest()}
          disabled={testing}
          activeOpacity={0.8}
        >
          {testing ? <ActivityIndicator color="#080D17" /> : <Text style={s.primaryText}>Test all providers</Text>}
        </TouchableOpacity>
      </View>

      {/* Ops queue shortcuts */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Queues</Text>
        <TouchableOpacity style={s.navRow} onPress={() => onNavigate('AdminUsers')} activeOpacity={0.7}>
          <Text style={s.navText}>Users &amp; roles</Text>
          <Text style={s.chev}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navRow} onPress={() => onNavigate('AdminKyc')} activeOpacity={0.7}>
          <Text style={s.navText}>KYC review queue</Text>
          <Text style={s.chev}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.navRow}
          onPress={() => void Linking.openURL('https://codespectra.ai/dashboard/admin')}
          activeOpacity={0.7}
        >
          <Text style={s.navText}>Open full admin on web</Text>
          <Text style={s.chev}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.note}>
        Mobile shows status and quick actions only. Bulk CRUD, generators, and settings stay on the web dashboard.
      </Text>
    </ScrollView>
  )
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

import { healthColor } from '../api/admin'

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    content: { padding: 16, paddingBottom: 40 },
    card: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, padding: 16, marginBottom: 12,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { color: t.text, fontSize: 16, fontWeight: '700' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    pillText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    meta: { color: t.muted, fontSize: 13, marginTop: 8 },
    hint: { color: t.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    rowLabel: { color: t.text, fontSize: 13, flex: 1, textTransform: 'capitalize' },
    rowValue: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    primaryBtn: {
      backgroundColor: t.primary, borderRadius: 10, minHeight: MIN_TOUCH,
      alignItems: 'center', justifyContent: 'center', marginTop: 14,
    },
    primaryText: { color: '#080D17', fontSize: 15, fontWeight: '700' },
    ghostBtn: {
      borderWidth: 1, borderColor: t.primary, borderRadius: 10, minHeight: MIN_TOUCH,
      alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    ghostText: { color: t.primary, fontSize: 14, fontWeight: '600' },
    disabled: { opacity: 0.6 },
    navRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      minHeight: MIN_TOUCH, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    navText: { color: t.text, fontSize: 15, fontWeight: '500', marginTop: 8 },
    chev: { color: t.muted, fontSize: 22, marginTop: 8 },
    error: { color: '#F87171', fontSize: 13, marginBottom: 10 },
    note: { color: t.muted, fontSize: 11, lineHeight: 16, paddingHorizontal: 4 },
  })
