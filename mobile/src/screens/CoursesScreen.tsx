import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import { listCourses, lessonCount, type CourseSummary } from '../api/learner'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  navigation: any
}

const LEVEL_TONE: Record<string, string> = {
  beginner: '#22C55E',
  intermediate: '#EAB308',
  advanced: '#EF4444',
  expert: '#A855F7',
}

export function CoursesScreen({ theme, navigation }: Props): React.JSX.Element {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      setCourses(await listCourses())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load courses.')
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
        <Text style={s.muted}>Loading courses…</Text>
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
      data={courses}
      keyExtractor={(c) => c.id}
      contentContainerStyle={courses.length === 0 ? s.emptyWrap : s.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
      ListEmptyComponent={
        <View style={s.center}>
          <Text style={s.muted}>No courses published yet.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const level = (item.level || '').toLowerCase()
        const tone = LEVEL_TONE[level] ?? '#94A3B8'
        const lessons = lessonCount(item)
        return (
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('CourseDetail', { id: item.id, title: item.title })}
            accessibilityRole="button"
            accessibilityLabel={`${item.title} course`}
          >
            <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
            {item.description ? (
              <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
            ) : null}
            <View style={s.metaRow}>
              {item.level ? (
                <View style={s.pill}>
                  <View style={[s.dot, { backgroundColor: tone }]} />
                  <Text style={[s.pillText, { color: tone }]}>{item.level}</Text>
                </View>
              ) : null}
              {lessons > 0 ? <Text style={s.meta}>{lessons} lessons</Text> : null}
              {item.enrolled ? <Text style={s.meta}>{item.enrolled} enrolled</Text> : null}
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
    muted: { color: t.muted, fontSize: 14, textAlign: 'center' },
    error: { color: '#F87171', fontSize: 14, textAlign: 'center' },
    retry: {
      borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      paddingHorizontal: 20, minHeight: MIN_TOUCH, justifyContent: 'center',
    },
    retryText: { color: t.primary, fontSize: 15, fontWeight: '600' },
    card: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, padding: 14, marginBottom: 10,
    },
    cardTitle: { color: t.text, fontSize: 16, fontWeight: '700', lineHeight: 21 },
    cardDesc: { color: t.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    pillText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    meta: { color: t.muted, fontSize: 12 },
  })
