import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import type { ThemeTokens } from '../api/client'
import { getToken, apiBase } from '../api/client'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  route: any
}

/**
 * Lesson player. The video endpoint is auth-gated, so the stream is opened
 * with the session's Bearer token as a request header (the same credential
 * every other call uses). Range requests work, so seeking is supported.
 */
export function LessonScreen({ theme, route }: Props): React.JSX.Element {
  const courseId: string = route?.params?.courseId ?? ''
  const lessonId: string = route?.params?.lessonId ?? ''
  const title: string = route?.params?.title ?? 'Lesson'
  const duration: number | undefined = route?.params?.duration
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const token = await getToken()
      if (cancelled) return
      if (!token || !courseId || !lessonId) {
        setError('Not signed in, or lesson details are missing.')
        return
      }
      setSource({
        uri: `${apiBase()}/api/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/video`,
        headers: { Authorization: `Bearer ${token}` },
      })
    })()
    return () => { cancelled = true }
  }, [courseId, lessonId])

  const player = useVideoPlayer(source, (p) => {
    p.loop = false
    p.timeUpdateEventInterval = 1
  })

  const s = styles(theme)

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.playerWrap}>
        {source ? (
          <VideoView
            style={s.video}
            player={player}
            // SDK 57 replaced `allowsFullscreen` with fullscreenOptions.
            fullscreenOptions={{ enable: true }}
            allowsPictureInPicture
            nativeControls
            contentFit="contain"
          />
        ) : (
          <View style={s.playerPlaceholder}>
            {error ? (
              <Text style={s.error}>{error}</Text>
            ) : (
              <ActivityIndicator color={theme.primary} />
            )}
          </View>
        )}
      </View>

      <Text style={s.title}>{title}</Text>
      <View style={s.metaRow}>
        {duration ? <Text style={s.meta}>{duration} min</Text> : null}
        <Text style={s.meta}>Auto-captions where available</Text>
      </View>

      {error && source ? <Text style={s.warn}>{error}</Text> : null}

      <Text style={s.note}>
        Video streams from CodeSpectra with your session — it is not cached to disk or shared.
      </Text>
    </ScrollView>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    content: { paddingBottom: 40 },
    playerWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
    video: { width: '100%', height: '100%' },
    playerPlaceholder: {
      flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    title: { color: t.text, fontSize: 19, fontWeight: '700', paddingHorizontal: 16, marginTop: 18, lineHeight: 25 },
    metaRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 8, flexWrap: 'wrap' },
    meta: { color: t.muted, fontSize: 13 },
    error: { color: '#F87171', fontSize: 14, textAlign: 'center' },
    warn: { color: '#EAB308', fontSize: 13, paddingHorizontal: 16, marginTop: 12, lineHeight: 18 },
    note: { color: t.muted, fontSize: 11, lineHeight: 16, paddingHorizontal: 16, marginTop: 20 },
  })
