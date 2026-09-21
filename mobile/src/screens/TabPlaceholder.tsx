import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ThemeTokens, MobileTab } from '../api/client'

interface Props {
  theme: ThemeTokens
  tab: MobileTab
  userName: string
}

/**
 * Stage-1 placeholder: proves the manifest-driven shell (tabs, theme,
 * role gate) works end-to-end. Real screens land in stages 2–4.
 */
export function TabPlaceholder({ theme, tab, userName }: Props): React.JSX.Element {
  const s = styles(theme)
  return (
    <View style={s.root}>
      <Text style={s.title}>{tab.label}</Text>
      <Text style={s.body}>Signed in as {userName}.</Text>
      <Text style={s.muted}>Full {tab.label.toLowerCase()} experience ships in stage {tab.id === 'judge' ? 3 : tab.id === 'admin' ? 4 : 2}.</Text>
      <Text style={s.muted}>Route: {tab.route} · mirrors {tab.webRoute}</Text>
    </View>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background, padding: 24, justifyContent: 'center' },
    title: { color: t.text, fontSize: 24, fontWeight: '700', marginBottom: 8 },
    body: { color: t.text, fontSize: 15, marginBottom: 4 },
    muted: { color: t.muted, fontSize: 13, marginTop: 4 },
  })
