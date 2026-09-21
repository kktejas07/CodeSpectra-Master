import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, Linking,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import { listKyc, kycNeedsReview, type KycRecord, type KycSummary } from '../api/admin'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
}

const STATUS_TONE: Record<string, string> = {
  approved: '#22C55E',
  rejected: '#EF4444',
  pending: '#EAB308',
  manual_review: '#38BDF8',
}

function toneFor(status?: string): string {
  return STATUS_TONE[String(status || '').toLowerCase()] ?? '#94A3B8'
}

export function AdminKycScreen({ theme }: Props): React.JSX.Element {
  const [records, setRecords] = useState<KycRecord[]>([])
  const [summary, setSummary] = useState<KycSummary>({})
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await listKyc()
      setRecords(res.records)
      setSummary(res.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load KYC records.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const s = styles(theme)
  const pending = kycNeedsReview(records)
  const shown = showAll ? records : pending

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={s.muted}>Loading KYC queue…</Text>
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
    <View style={s.root}>
      <View style={s.stats}>
        {([
          ['pending', summary.pending ?? 0, '#EAB308'],
          ['review', summary.manual_review ?? 0, '#38BDF8'],
          ['approved', summary.approved ?? 0, '#22C55E'],
          ['rejected', summary.rejected ?? 0, '#EF4444'],
        ] as const).map(([label, value, color]) => (
          <View key={label} style={s.stat}>
            <Text style={[s.statValue, { color }]}>{value}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={s.toggleRow}>
        <TouchableOpacity
          style={[s.toggle, !showAll ? { borderColor: theme.primary } : null]}
          onPress={() => setShowAll(false)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: !showAll }}
        >
          <Text style={[s.toggleText, !showAll ? { color: theme.primary } : null]}>
            Needs review ({pending.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggle, showAll ? { borderColor: theme.primary } : null]}
          onPress={() => setShowAll(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: showAll }}
        >
          <Text style={[s.toggleText, showAll ? { color: theme.primary } : null]}>All ({records.length})</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(r) => r.id}
        contentContainerStyle={shown.length === 0 ? s.emptyWrap : s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
        ListEmptyComponent={
          <View style={s.center}>
            <Text style={s.muted}>
              {records.length === 0 ? 'No KYC sessions yet.' : 'Nothing awaiting review.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const tone = toneFor(item.status)
          return (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.7}
              onPress={() => void Linking.openURL(`https://codespectra.ai/dashboard/admin/kyc?record=${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${item.user_name || 'User'}, KYC ${item.status}. Opens full review on web.`}
            >
              <View style={s.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.user_name || 'Unknown user'}</Text>
                  <Text style={s.cardMeta} numberOfLines={1}>
                    {item.user_email}
                    {item.document_type ? ` · ${item.document_type}` : ''}
                  </Text>
                </View>
                <View style={s.pill}>
                  <View style={[s.dot, { backgroundColor: tone }]} />
                  <Text style={[s.pillText, { color: tone }]}>{String(item.status || '').replace('_', ' ')}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )
        }}
      />

      <Text style={s.note}>
        Document images and approve/reject live on web — mobile lists the queue and deep-links to the review.
      </Text>
    </View>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    stats: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
    stat: {
      flex: 1, backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    },
    statValue: { fontSize: 18, fontWeight: '800' },
    statLabel: { color: t.muted, fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
    toggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    toggle: {
      borderWidth: 1, borderColor: t.border, borderRadius: 20,
      paddingHorizontal: 14, minHeight: 36, justifyContent: 'center',
    },
    toggleText: { color: t.muted, fontSize: 12, fontWeight: '600' },
    list: { padding: 16, paddingTop: 4, paddingBottom: 24 },
    emptyWrap: { flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
    muted: { color: t.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    error: { color: '#F87171', fontSize: 14, textAlign: 'center' },
    retry: {
      borderWidth: 1, borderColor: t.primary, borderRadius: 10,
      paddingHorizontal: 20, minHeight: MIN_TOUCH, justifyContent: 'center',
    },
    retryText: { color: t.primary, fontSize: 15, fontWeight: '600' },
    card: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, marginBottom: 10,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, minHeight: MIN_TOUCH },
    cardTitle: { color: t.text, fontSize: 15, fontWeight: '600' },
    cardMeta: { color: t.muted, fontSize: 12, marginTop: 3 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    pillText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    note: { color: t.muted, fontSize: 11, lineHeight: 16, paddingHorizontal: 16, paddingBottom: 16 },
  })
