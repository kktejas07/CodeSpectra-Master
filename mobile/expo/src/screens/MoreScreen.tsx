import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, FlatList, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing, commonStyles, shadows } from '../theme'
import { api, unwrapData, Challenge, LeaderboardEntry, Achievement, Certification, Track } from '../api/client'

interface Props {
  onNavigate: (screen: string, params?: Record<string, unknown>) => void
}

interface MoreItem {
  id: string
  title: string
  subtitle: string
  icon: string
  color: string
  screen: string
  badge?: string | number
}

export default function MoreScreen({ onNavigate }: Props) {
  const insets = useSafeAreaInsets()

  const items: MoreItem[] = [
    { id: 'arena', title: 'Arena', subtitle: 'Coding challenges', icon: '[A]', color: '#22C55E', screen: 'Arena' },
    { id: 'leaderboard', title: 'Leaderboard', subtitle: 'Top performers', icon: '[#]', color: '#38bdf8', screen: 'Leaderboard' },
    { id: 'achievements', title: 'Achievements', subtitle: 'Badges & rewards', icon: '[*]', color: '#EAB308', screen: 'Achievements' },
    { id: 'learning', title: 'Learning Tracks', subtitle: 'Structured learning', icon: '[L]', color: '#a855f7', screen: 'Learning' },
    { id: 'certifications', title: 'Certifications', subtitle: 'Earn certificates', icon: '[C]', color: '#22C55E', screen: 'Certifications' },
    { id: 'hackathons', title: 'Hackathons', subtitle: 'Timed coding events', icon: '[H]', color: '#f97316', screen: 'Hackathons' },
    { id: 'agent', title: 'AI Agent', subtitle: 'Code assistance', icon: '[AI]', color: '#38bdf8', screen: 'Agent' },
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
        <Text style={styles.headerSub}>All features and settings</Text>
      </View>

      <View style={styles.grid}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => onNavigate(item.screen)}
          >
            <View style={[styles.iconBox, { backgroundColor: item.color + '18' }]}>
              <Text style={[styles.iconText, { color: item.color }]}>{item.icon}</Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  header: { padding: spacing['2xl'], paddingBottom: spacing.lg },
  headerTitle: { fontSize: 24, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: colors.muted, fontFamily: 'monospace', marginTop: spacing.xs },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing['2xl'],
    gap: spacing.md,
  },
  card: {
    width: '47%',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing['2xl'],
    ...shadows.sm,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconText: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: colors.muted, fontFamily: 'monospace' },
})