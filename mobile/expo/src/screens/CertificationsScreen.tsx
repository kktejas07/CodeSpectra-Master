import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, unwrapData, Certification } from '../api/client'
import { colors, spacing, commonStyles, shadows } from '../theme'

export default function CertificationsScreen() {
  const [certs, setCerts] = useState<Certification[]>([])
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    api.get<unknown>('/api/certifications')
      .then(res => setCerts(unwrapData<Certification>(res)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={certs}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Text style={commonStyles.sectionTitle}>Certifications</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyText}>No certifications available</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View style={[styles.card, index === 0 && styles.cardFirst]}>
            <View style={styles.cardTop}>
              <View style={styles.certIcon}>
                <Text style={styles.certIconText}>{item.icon || '[C]'}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.certName} numberOfLines={2}>{item.title}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.certIssuer}>{item.source || item.category}</Text>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelText}>{item.level}</Text>
                  </View>
                </View>
              </View>
            </View>
            <Text style={styles.certDesc}>{item.description}</Text>
            {item.duration && (
              <View style={styles.certMeta}>
                <Text style={styles.metaLabel}>DURATION</Text>
                <Text style={styles.metaValue}>{item.duration} min</Text>
              </View>
            )}
            {item.source_url && (
              <TouchableOpacity style={styles.verifyBtn} activeOpacity={0.7}>
                <Text style={styles.verifyBtnText}>View Certificate ↗</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing['2xl'], marginBottom: spacing.md, ...shadows.sm },
  cardFirst: { marginTop: spacing.sm },
  cardTop: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  certIcon: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  certIconText: { fontSize: 18, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  cardInfo: { flex: 1 },
  certName: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', lineHeight: 18, marginBottom: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  certIssuer: { fontSize: 12, color: colors.muted, fontFamily: 'monospace' },
  levelBadge: { backgroundColor: colors.primary + '18', borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  levelText: { fontSize: 10, fontWeight: '600', color: colors.primary, fontFamily: 'monospace' },
  certDesc: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'monospace', lineHeight: 18, marginBottom: spacing.md },
  certMeta: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.cardBorder, marginBottom: spacing.md },
  metaLabel: { fontSize: 10, fontWeight: '600', color: colors.muted, fontFamily: 'monospace', letterSpacing: 0.8 },
  metaValue: { fontSize: 13, color: colors.foreground, fontFamily: 'monospace' },
  verifyBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.cardBorder },
  verifyBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary, fontFamily: 'monospace' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'EE', alignItems: 'center', justifyContent: 'center' },
})