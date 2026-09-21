import React, { useMemo, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Linking,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import {
  criteriaFor, scoreSubmission, statusTone,
  type JudgeEvent, type JudgeSubmission,
} from '../api/judge'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  route: any
  onScored?: () => void
}

const MAX_PER_CRITERION = 10

/** Weighted 0-100 total from 0-10 per-criterion scores. */
export function computeTotal(
  criteria: Array<{ key: string; weight: number }>,
  scores: Record<string, number>,
): number {
  const weightSum = criteria.reduce((a, c) => a + (Number.isFinite(c.weight) ? c.weight : 1), 0)
  if (weightSum <= 0) return 0
  const weighted = criteria.reduce(
    (a, c) => a + (scores[c.key] ?? 0) * (Number.isFinite(c.weight) ? c.weight : 1),
    0,
  )
  return Math.round(Math.min(100, Math.max(0, (weighted / (weightSum * MAX_PER_CRITERION)) * 100)))
}

export function JudgeScoreScreen({ theme, route, onScored }: Props): React.JSX.Element {
  const event: JudgeEvent | undefined = route?.params?.event
  const submission: JudgeSubmission | undefined = route?.params?.submission

  const criteria = useMemo(() => criteriaFor(event ?? null), [event])
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const c of criteriaFor(event ?? null)) init[c.key] = 5
    return init
  })
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const total = computeTotal(criteria, scores)
  const blind = event?.judging_config?.blindMode === true

  const bump = (key: string, delta: number): void => {
    setScores((prev) => {
      const next = Math.min(MAX_PER_CRITERION, Math.max(0, (prev[key] ?? 0) + delta))
      return { ...prev, [key]: next }
    })
  }

  const submit = async (advance: boolean): Promise<void> => {
    if (!event?.id || !submission?.id) { setError('Missing event or submission.'); return }
    setBusy(true)
    setError(null)
    try {
      await scoreSubmission(
        event.id,
        submission.id,
        {
          criteria: criteria.map((c) => ({ name: c.label || c.key, score: scores[c.key] ?? 0 })),
          total_score: total,
          feedback: feedback.trim(),
        },
        advance ? 'review_completed' : undefined,
      )
      setDone(true)
      onScored?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save score.')
    } finally {
      setBusy(false)
    }
  }

  const s = styles(theme)
  const tone = statusTone(submission?.status)

  if (done) {
    return (
      <View style={s.center}>
        <Text style={s.doneTitle}>Score saved</Text>
        <Text style={s.muted}>
          {blind ? 'Your sheet is recorded for this team.' : `${submission?.team_name || 'Team'} scored ${total}/100.`}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>
        {blind ? 'Blind review' : submission?.team_name || 'Unnamed team'}
      </Text>
      <View style={s.metaRow}>
        <View style={[s.dot, { backgroundColor: tone.color }]} />
        <Text style={[s.meta, { color: tone.color }]}>{tone.label}</Text>
      </View>

      {(submission?.repo_url || submission?.live_url || submission?.video_url) ? (
        <View style={s.links}>
          {[
            ['Repo', submission?.repo_url],
            ['Live', submission?.live_url],
            ['Video', submission?.video_url],
          ].map(([label, url]) =>
            typeof url === 'string' && url ? (
              <TouchableOpacity
                key={label as string}
                onPress={() => void Linking.openURL(url)}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={`Open ${label}`}
              >
                <Text style={s.link}>{label} →</Text>
              </TouchableOpacity>
            ) : null,
          )}
        </View>
      ) : null}

      {submission?.comment ? (
        <>
          <Text style={s.section}>Team note</Text>
          <Text style={s.body}>{submission.comment}</Text>
        </>
      ) : null}

      <Text style={s.section}>Rubric</Text>
      {criteria.map((c) => (
        <View key={c.key} style={s.critRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.critLabel}>{c.label || c.key}</Text>
            <Text style={s.critWeight}>weight {c.weight ?? 1}</Text>
          </View>
          <View style={s.stepper}>
            <TouchableOpacity
              style={[s.stepBtn, (scores[c.key] ?? 0) <= 0 ? s.stepDisabled : null]}
              onPress={() => bump(c.key, -1)}
              disabled={(scores[c.key] ?? 0) <= 0}
              accessibilityRole="button"
              accessibilityLabel={`Decrease ${c.label || c.key}`}
            >
              <Text style={s.stepText}>−</Text>
            </TouchableOpacity>
            <Text style={s.stepValue}>{scores[c.key] ?? 0}</Text>
            <TouchableOpacity
              style={[s.stepBtn, (scores[c.key] ?? 0) >= MAX_PER_CRITERION ? s.stepDisabled : null]}
              onPress={() => bump(c.key, 1)}
              disabled={(scores[c.key] ?? 0) >= MAX_PER_CRITERION}
              accessibilityRole="button"
              accessibilityLabel={`Increase ${c.label || c.key}`}
            >
              <Text style={s.stepText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <Text style={s.scaleHint}>0 = missing · 5 = adequate · 10 = exceptional</Text>

      <Text style={s.section}>Feedback</Text>
      <TextInput
        style={s.feedback}
        multiline
        value={feedback}
        onChangeText={setFeedback}
        placeholder="What stood out, what should improve…"
        placeholderTextColor={theme.muted}
      />

      <View style={s.totalCard}>
        <Text style={s.totalLabel}>Weighted total</Text>
        <Text style={s.totalValue}>{total}<Text style={s.totalMax}>/100</Text></Text>
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <View style={s.actions}>
        <TouchableOpacity
          style={[s.primary, busy ? s.btnDisabled : null]}
          onPress={() => void submit(true)}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy ? <ActivityIndicator color="#080D17" /> : <Text style={s.primaryText}>Save &amp; mark reviewed</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ghost, busy ? s.btnDisabled : null]}
          onPress={() => void submit(false)}
          disabled={busy}
          activeOpacity={0.7}
        >
          <Text style={s.ghostText}>Save draft</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.note}>
        Multi-judge events keep one sheet per judge; the platform averages them (drop-high-low when enabled).
      </Text>
    </ScrollView>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    content: { padding: 16, paddingBottom: 48 },
    center: { flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    doneTitle: { color: '#22C55E', fontSize: 20, fontWeight: '700' },
    title: { color: t.text, fontSize: 20, fontWeight: '700' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    meta: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
    link: { color: t.primary, fontSize: 14, fontWeight: '600' },
    section: { color: t.text, fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
    body: { color: t.text, fontSize: 15, lineHeight: 22 },
    critRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, padding: 12, marginBottom: 8,
    },
    critLabel: { color: t.text, fontSize: 14, fontWeight: '600' },
    critWeight: { color: t.muted, fontSize: 11, marginTop: 2 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    stepBtn: {
      width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: 10,
      borderWidth: 1, borderColor: t.primary, alignItems: 'center', justifyContent: 'center',
    },
    stepDisabled: { opacity: 0.35 },
    stepText: { color: t.primary, fontSize: 20, fontWeight: '700', lineHeight: 24 },
    stepValue: { color: t.text, fontSize: 16, fontWeight: '700', width: 28, textAlign: 'center' },
    scaleHint: { color: t.muted, fontSize: 11, marginBottom: 4 },
    feedback: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, color: t.text, padding: 12, minHeight: 96,
      fontSize: 14, textAlignVertical: 'top',
    },
    totalCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: t.card, borderColor: t.primary, borderWidth: 1,
      borderRadius: 12, padding: 16, marginTop: 16,
    },
    totalLabel: { color: t.muted, fontSize: 14, fontWeight: '600' },
    totalValue: { color: t.primary, fontSize: 28, fontWeight: '800' },
    totalMax: { color: t.muted, fontSize: 15, fontWeight: '600' },
    error: { color: '#F87171', fontSize: 13, marginTop: 10 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    primary: {
      flex: 1, backgroundColor: t.primary, borderRadius: 10,
      minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center',
    },
    primaryText: { color: '#080D17', fontSize: 15, fontWeight: '700' },
    ghost: {
      flex: 1, borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center',
    },
    ghostText: { color: t.primary, fontSize: 15, fontWeight: '600' },
    btnDisabled: { opacity: 0.6 },
    muted: { color: t.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    note: { color: t.muted, fontSize: 11, lineHeight: 16, marginTop: 12 },
  })
