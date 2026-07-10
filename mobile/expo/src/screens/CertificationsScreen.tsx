import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../api/client'
import { colors, spacing, commonStyles, shadows } from '../theme'

interface Cert {
  id: string
  name: string
  issuer: string
  issued_at: string
  verify_url: string
}

export default function CertificationsScreen() {
  const [certs, setCerts] = useState<Cert[]>([])
  const [loading, setLoading] = useState(true)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    api.get<{ items: Cert[] }>('/api/certifications')
      .then(d => setCerts(d.items || []))
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
              <Text style={commonStyles.emptyText}>No certifications yet</Text>
              <Text style={[commonStyles.emptyText, { marginTop: spacing.xs, fontSize: 12 }]}>
                Complete courses to earn certificates
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View style={[styles.card, index === 0 && styles.cardFirst]}>
            <View style={styles.cardTop}>
              <View style={styles.certIcon}>
                <Text style={styles.certIconText}>[C]</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.certName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.certIssuer}>{item.issuer}</Text>
              </View>
            </View>

            <View style={styles.certMeta}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>ISSUED</Text>
                <Text style={styles.metaValue}>
                  {item.issued_at ? new Date(item.issued_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }) : '—'}
                </Text>
              </View>
            </View>

            {item.verify_url && (
              <TouchableOpacity style={styles.verifyBtn} activeOpacity={0.7}>
                <Text style={styles.verifyBtnText}>Verify Certificate</Text>
                <Text style={styles.verifyArrow}>↗</Text>
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
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing['2xl'],
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardFirst: { marginTop: spacing.sm },
  cardTop: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  certIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  certIconText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  cardInfo: { flex: 1 },
  certName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    fontFamily: 'monospace',
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  certIssuer: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  certMeta: {
    flexDirection: 'row',
    gap: spacing['2xl'],
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginBottom: spacing.md,
  },
  metaItem: { gap: 2 },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
  metaValue: {
    fontSize: 13,
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.sm,
  },
  verifyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  verifyArrow: {
    fontSize: 13,
    color: colors.primary,
    fontFamily: 'monospace',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background + 'EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
})