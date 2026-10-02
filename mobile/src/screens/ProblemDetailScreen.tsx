import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Platform,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import {
  getProblem, runCode, starterFor,
  LANGUAGES, type Language, type ProblemDetail, type RunResult,
} from '../api/problems'
import { useProctoring } from '../lib/use-proctoring'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  route: any
}

interface SampleVerdict {
  input: string
  expected: string
  actual: string
  pass: boolean
  error?: string
}

export function ProblemDetailScreen({ theme, route }: Props): React.JSX.Element {
  const slug: string = route?.params?.slug ?? ''
  const [detail, setDetail] = useState<ProblemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState<Language>('python')
  const [code, setCode] = useState('')
  const [stdin, setStdin] = useState('')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<RunResult | null>(null)
  const [verdicts, setVerdicts] = useState<SampleVerdict[] | null>(null)
  const [violations, setViolations] = useState(0)

  // Native proctoring: app-backgrounding, screenshots, idle, device integrity.
  // Same event stream the web monitors write to, so server-side analysis
  // (answer pattern, plagiarism, leak detection) works unchanged.
  useProctoring({
    sessionKind: 'problem',
    sessionId: slug,
    enabled: Boolean(slug),
    onViolation: (_kind, count) => setViolations(count),
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await getProblem(slug)
      setDetail(d)
      setCode(starterFor(d, language))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load problem.')
    } finally {
      setLoading(false)
    }
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load()
  }, [load])

  const pickLanguage = (l: Language): void => {
    setLanguage(l)
    if (detail) {
      const starter = starterFor(detail, l)
      if (starter) setCode(starter)
    }
    setOutput(null)
    setVerdicts(null)
  }

  const doRun = async (customStdin: string): Promise<RunResult> =>
    runCode(language, code, customStdin)

  const runSamples = async (): Promise<void> => {
    if (!code.trim()) return
    setRunning(true)
    setOutput(null)
    try {
      const samples = (detail?.test_cases ?? []).slice(0, 5)
      if (samples.length === 0) {
        setOutput(await doRun(stdin))
        return
      }
      const out: SampleVerdict[] = []
      for (const s of samples) {
        try {
          const r = await doRun(s.input)
          const actual = (r.stdout ?? '').trim()
          out.push({ input: s.input, expected: (s.output ?? '').trim(), actual, pass: actual === (s.output ?? '').trim() })
        } catch (e) {
          out.push({ input: s.input, expected: (s.output ?? '').trim(), actual: '', pass: false, error: e instanceof Error ? e.message : 'Run failed' })
        }
      }
      setVerdicts(out)
    } finally {
      setRunning(false)
    }
  }

  const runCustom = async (): Promise<void> => {
    if (!code.trim()) return
    setRunning(true)
    setOutput(null)
    setVerdicts(null)
    try {
      setOutput(await doRun(stdin))
    } catch (e) {
      setOutput({ stderr: e instanceof Error ? e.message : 'Run failed' })
    } finally {
      setRunning(false)
    }
  }

  const s = styles(theme)

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={s.muted}>Loading problem…</Text>
      </View>
    )
  }
  if (error || !detail) {
    return (
      <View style={s.center}>
        <Text style={s.error}>{error ?? 'Problem not found.'}</Text>
        <TouchableOpacity style={s.retry} onPress={() => void load()} activeOpacity={0.7}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const passed = verdicts?.filter((v) => v.pass).length ?? 0

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {violations > 0 ? (
        <View style={s.violation}>
          <Text style={s.violationText}>
            ⚠ {violations} focus {violations === 1 ? 'loss' : 'losses'} recorded. Leaving the app during a
            proctored session is reported.
          </Text>
        </View>
      ) : null}

      <Text style={s.title}>{detail.title}</Text>
      <Text style={s.meta}>
        {detail.difficulty} · {(detail.topics ?? []).join(' · ')}
        {typeof detail.hidden_test_count === 'number' ? ` · +${detail.hidden_test_count} hidden tests` : ''}
      </Text>

      {detail.statement_md ? <Text style={s.body}>{detail.statement_md}</Text> : null}
      {detail.input_format ? <Text style={s.section}>Input</Text> : null}
      {detail.input_format ? <Text style={s.body}>{detail.input_format}</Text> : null}
      {detail.output_format ? <Text style={s.section}>Output</Text> : null}
      {detail.output_format ? <Text style={s.body}>{detail.output_format}</Text> : null}
      {detail.constraints ? <Text style={s.section}>Constraints</Text> : null}
      {detail.constraints ? <Text style={s.mono}>{detail.constraints}</Text> : null}

      {(detail.test_cases ?? []).length > 0 ? <Text style={s.section}>Samples</Text> : null}
      {(detail.test_cases ?? []).map((tc, i) => (
        <View key={i} style={s.sampleCard}>
          <Text style={s.sampleLabel}>Sample {i + 1}</Text>
          <Text style={s.sampleKind}>Input</Text>
          <Text style={s.mono} selectable>{tc.input}</Text>
          <Text style={s.sampleKind}>Output</Text>
          <Text style={s.mono} selectable>{tc.output}</Text>
        </View>
      ))}

      <Text style={s.section}>Solve</Text>
      <View style={s.chips}>
        {LANGUAGES.map((l) => (
          <TouchableOpacity
            key={l}
            style={[s.chip, language === l ? { borderColor: theme.primary, backgroundColor: `${theme.primary}18` } : null]}
            onPress={() => pickLanguage(l)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: language === l }}
            accessibilityLabel={`Language ${l}`}
          >
            <Text style={[s.chipText, language === l ? { color: theme.primary } : null]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={s.editor}
        multiline
        value={code}
        onChangeText={setCode}
        placeholder={`Write your ${language} solution…`}
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
      <TextInput
        style={s.stdin}
        multiline
        value={stdin}
        onChangeText={setStdin}
        placeholder="Custom input (stdin)…"
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={s.runRow}>
        <TouchableOpacity
          style={[s.runBtn, running ? s.btnDisabled : null]}
          onPress={() => void runSamples()}
          disabled={running}
          activeOpacity={0.8}
        >
          {running ? <ActivityIndicator color="#080D17" /> : <Text style={s.runText}>Run samples</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ghostBtn, running ? s.btnDisabled : null]}
          onPress={() => void runCustom()}
          disabled={running}
          activeOpacity={0.7}
        >
          <Text style={s.ghostText}>Run custom</Text>
        </TouchableOpacity>
      </View>

      {verdicts ? (
        <View style={s.outCard}>
          <Text style={[s.outTitle, { color: passed === verdicts.length ? '#22C55E' : '#EAB308' }]}>
            {passed}/{verdicts.length} samples passed
          </Text>
          {verdicts.map((v, i) => (
            <View key={i} style={s.verdict}>
              <Text style={[s.verdictHead, { color: v.pass ? '#22C55E' : '#EF4444' }]}>
                {v.pass ? '✓' : '✗'} Sample {i + 1}{v.error ? ` — ${v.error}` : ''}
              </Text>
              {!v.pass && !v.error ? (
                <Text style={s.mono} selectable>expected: {v.expected || '(empty)'}{'\n'}got: {v.actual || '(empty)'}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {output ? (
        <View style={s.outCard}>
          <Text style={s.outTitle}>Output</Text>
          {output.stdout ? <Text style={s.mono} selectable>{output.stdout}</Text> : null}
          {output.stderr ? <Text style={[s.mono, { color: '#F87171' }]} selectable>{output.stderr}</Text> : null}
          {!output.stdout && !output.stderr ? <Text style={s.muted}>(no output)</Text> : null}
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    content: { padding: 16, paddingBottom: 48 },
    center: { flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    title: { color: t.text, fontSize: 22, fontWeight: '700', lineHeight: 28 },
    meta: { color: t.muted, fontSize: 13, marginTop: 6, textTransform: 'capitalize' },
    section: { color: t.text, fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
    violation: {
      backgroundColor: 'rgba(234,179,8,0.10)', borderColor: 'rgba(234,179,8,0.30)',
      borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12,
    },
    violationText: { color: '#EAB308', fontSize: 12, lineHeight: 17 },
    body: { color: t.text, fontSize: 15, lineHeight: 22, marginTop: 12 },
    mono: {
      color: t.text, fontSize: 13, lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 8, padding: 10, marginTop: 6,
    },
    muted: { color: t.muted, fontSize: 14, textAlign: 'center' },
    error: { color: '#F87171', fontSize: 14, textAlign: 'center' },
    retry: {
      borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      paddingHorizontal: 20, minHeight: MIN_TOUCH, justifyContent: 'center', marginTop: 8,
    },
    retryText: { color: t.primary, fontSize: 15, fontWeight: '600' },
    sampleCard: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, padding: 12, marginTop: 8,
    },
    sampleLabel: { color: t.text, fontSize: 14, fontWeight: '700' },
    sampleKind: { color: t.muted, fontSize: 12, marginTop: 8, fontWeight: '600' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip: {
      borderWidth: 1, borderColor: t.border, borderRadius: 20,
      paddingHorizontal: 14, minHeight: 36, justifyContent: 'center',
    },
    chipText: { color: t.muted, fontSize: 13, fontWeight: '600' },
    editor: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, color: t.text, padding: 12, minHeight: 220,
      fontSize: 13, lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      textAlignVertical: 'top',
    },
    stdin: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, color: t.text, padding: 12, minHeight: 88,
      fontSize: 13, marginTop: 8, textAlignVertical: 'top',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    runRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    runBtn: {
      flex: 1, backgroundColor: t.primary, borderRadius: 10,
      minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center',
    },
    runText: { color: '#080D17', fontSize: 16, fontWeight: '700' },
    ghostBtn: {
      flex: 1, borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center',
    },
    ghostText: { color: t.primary, fontSize: 15, fontWeight: '600' },
    btnDisabled: { opacity: 0.6 },
    outCard: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, padding: 12, marginTop: 12,
    },
    outTitle: { color: t.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
    verdict: { marginTop: 8 },
    verdictHead: { fontSize: 14, fontWeight: '700' },
  })
