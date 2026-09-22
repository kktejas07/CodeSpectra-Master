import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Linking,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import { getCourse, type CourseDetail } from '../api/learner'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  route: any
}

export function CourseDetailScreen({ theme, route }: Props): React.JSX.Element {
  const id: string = route?.params?.id ?? ''
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCourse(await getCourse(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this course.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const s = styles(theme)

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={s.muted}>Loading course…</Text>
      </View>
    )
  }
  if (error || !course) {
    return (
      <View style={s.center}>
        <Text style={s.error}>{error ?? 'Course not found.'}</Text>
        <TouchableOpacity style={s.retry} onPress={() => void load()} activeOpacity={0.7}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const sections = course.sections ?? course.modules ?? []

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.title}>{course.title}</Text>
      <View style={s.metaRow}>
        {course.level ? <Text style={s.meta}>{course.level}</Text> : null}
        {course.subject ? <Text style={s.meta}>{course.subject}</Text> : null}
        <Text style={s.meta}>{sections.length} modules</Text>
      </View>

      {course.description ? <Text style={s.body}>{course.description}</Text> : null}

      <TouchableOpacity
        style={s.primaryBtn}
        activeOpacity={0.8}
        onPress={() => void Linking.openURL(`https://codespectra.ai/dashboard/courses/${course.id}`)}
        accessibilityRole="button"
        accessibilityLabel="Start this course on the web"
      >
        <Text style={s.primaryText}>Start on web</Text>
      </TouchableOpacity>

      <Text style={s.section}>Curriculum</Text>
      {sections.length === 0 ? (
        <Text style={s.muted}>No modules published for this course yet.</Text>
      ) : (
        sections.map((sec, i) => {
          const key = sec.id || sec.title || String(i)
          const open = openSection === key
          const lessons = sec.lessons ?? []
          return (
            <View key={key} style={s.module}>
              <TouchableOpacity
                style={s.moduleHead}
                activeOpacity={0.7}
                onPress={() => setOpenSection(open ? null : key)}
                accessibilityRole="button"
                accessibilityLabel={`${sec.title ?? `Module ${i + 1}`}, ${lessons.length} lessons`}
              >
                <Text style={s.moduleTitle} numberOfLines={2}>{sec.title ?? `Module ${i + 1}`}</Text>
                <Text style={s.chev}>{open ? '⌄' : '›'}</Text>
              </TouchableOpacity>
              {open ? (
                <View style={s.lessons}>
                  {lessons.length === 0 ? (
                    <Text style={s.muted}>No lessons in this module.</Text>
                  ) : (
                    lessons.map((l: unknown, li: number) => {
                      const lesson = l as { id?: string; title?: string; duration?: number }
                      return (
                        <View key={lesson.id || li} style={s.lesson}>
                          <Text style={s.lessonIndex}>{li + 1}</Text>
                          <Text style={s.lessonTitle} numberOfLines={1}>
                            {lesson.title ?? 'Untitled lesson'}
                          </Text>
                          {lesson.duration ? <Text style={s.meta}>{lesson.duration}m</Text> : null}
                        </View>
                      )
                    })
                  )}
                </View>
              ) : null}
            </View>
          )
        })
      )}

      <Text style={s.note}>
        Lesson videos play on the web for now — in-app playback ships with the next update.
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
    title: { color: t.text, fontSize: 22, fontWeight: '800', lineHeight: 28 },
    metaRow: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
    meta: { color: t.muted, fontSize: 13, textTransform: 'capitalize' },
    body: { color: t.text, fontSize: 15, lineHeight: 22, marginTop: 14 },
    section: { color: t.text, fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 10 },
    primaryBtn: {
      backgroundColor: t.primary, borderRadius: 10, minHeight: MIN_TOUCH,
      alignItems: 'center', justifyContent: 'center', marginTop: 18,
    },
    primaryText: { color: '#080D17', fontSize: 15, fontWeight: '700' },
    module: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    },
    moduleHead: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: 14, minHeight: MIN_TOUCH,
    },
    moduleTitle: { color: t.text, fontSize: 15, fontWeight: '600', flex: 1 },
    chev: { color: t.muted, fontSize: 20 },
    lessons: { borderTopWidth: 1, borderTopColor: t.border, paddingVertical: 6 },
    lesson: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
    lessonIndex: { color: t.muted, fontSize: 12, width: 18 },
    lessonTitle: { color: t.text, fontSize: 14, flex: 1 },
    note: { color: t.muted, fontSize: 11, lineHeight: 16, marginTop: 18 },
  })
