import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import { listProblems, type Difficulty, type ProblemSummary } from '../api/problems'
import { MIN_TOUCH } from '../theme'

const DIFFS: Array<'all' | Difficulty> = ['all', 'easy', 'medium', 'hard']

const DIFF_STYLE: Record<Difficulty, { dot: string; text: string }> = {
  easy: { dot: '#22C55E', text: '#22C55E' },
  medium: { dot: '#EAB308', text: '#EAB308' },
  hard: { dot: '#EF4444', text: '#EF4444' },
}

interface Props {
  theme: ThemeTokens
  navigation: any
}

export function ProblemsScreen({ theme, navigation }: Props): React.JSX.Element {
  const [q, setQ] = useState('')
  const [diff, setDiff] = useState<'all' | Difficulty>('all')
  const [items, setItems] = useState<ProblemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (query: string, d: 'all' | Difficulty, refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const list = await listProblems(query, d === 'all' ? undefined : d)
      setItems(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load problems.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load('', 'all')
  }, [load])

  const onQuery = (text: string): void => {
    setQ(text)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void load(text, diff), 500)
  }

  const onDiff = (d: 'all' | Difficulty): void => {
    setDiff(d)
    void load(q, d)
  }

  const s = styles(theme)

  const renderItem = ({ item }: { item: ProblemSummary }): React.JSX.Element => {
    const d = DIFF_STYLE[item.difficulty] ?? DIFF_STYLE.easy
    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ProblemDetail', { slug: item.slug, title: item.title })}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.difficulty}`}
      >
        <View style={s.cardRow}>
          <View style={s.cardMain}>
            <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={s.cardMeta} numberOfLines={1}>
              {(item.topics ?? []).slice(0, 3).join(' · ')}
              {typeof item.acceptance_rate === 'number' ? ` · ${Math.round(item.acceptance_rate)}% accepted` : ''}
            </Text>
          </View>
          <View style={s.diffPill}>
            <View style={[s.dot, { backgroundColor: d.dot }]} />
            <Text style={[s.diffText, { color: d.text }]}>{item.difficulty}</Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={s.root}>
      <TextInput
        style={s.search}
        placeholder="Search problems…"
        placeholderTextColor={theme.muted}
        value={q}
        onChangeText={onQuery}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <View style={s.chips}>
        {DIFFS.map((d) => (
          <TouchableOpacity
            key={d}
            style={[s.chip, diff === d ? { borderColor: theme.primary, backgroundColor: `${theme.primary}18` } : null]}
            onPress={() => onDiff(d)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: diff === d }}
            accessibilityLabel={`Filter ${d}`}
          >
            <Text style={[s.chipText, diff === d ? { color: theme.primary } : null]}>
              {d === 'all' ? 'All' : d.charAt(0).toUpperCase() + d.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={s.muted}>Loading problems…</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.error}>{error}</Text>
          <TouchableOpacity style={s.retry} onPress={() => void load(q, diff)} activeOpacity={0.7}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={s.center}>
          <Text style={s.muted}>No problems found. Try a different search.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.slug || p.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(q, diff, true)} tintColor={theme.primary} />
          }
        />
      )}
    </View>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    search: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, color: t.text, paddingHorizontal: 14,
      minHeight: MIN_TOUCH, margin: 16, marginBottom: 8, fontSize: 15,
    },
    chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    chip: {
      borderWidth: 1, borderColor: t.border, borderRadius: 20,
      paddingHorizontal: 14, minHeight: 36, justifyContent: 'center',
    },
    chipText: { color: t.muted, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
    list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
    card: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, padding: 14, marginBottom: 10, minHeight: MIN_TOUCH,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardMain: { flex: 1 },
    cardTitle: { color: t.text, fontSize: 15, fontWeight: '600', lineHeight: 20 },
    cardMeta: { color: t.muted, fontSize: 12, marginTop: 4 },
    diffPill: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    diffText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    muted: { color: t.muted, fontSize: 14, textAlign: 'center' },
    error: { color: '#F87171', fontSize: 14, textAlign: 'center' },
    retry: {
      borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      paddingHorizontal: 20, minHeight: MIN_TOUCH, justifyContent: 'center', marginTop: 8,
    },
    retryText: { color: t.primary, fontSize: 15, fontWeight: '600' },
  })
