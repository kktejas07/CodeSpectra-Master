import React from 'react'
import {
  View, Text, FlatList, StyleSheet, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Shield, Check, ChevronRight, Clock } from 'lucide-react-native'
import { colors, spacing, commonStyles, shadows } from '../theme'

const MOCK_CERTS = [
  { id: '1', name: 'Problem Solver Bronze', issuer: 'CodeSpectra', date: '2025-03-10', status: 'verified' },
  { id: '2', name: 'Algorithm Fundamentals', issuer: 'CodeSpectra', date: '2025-04-22', status: 'verified' },
  { id: '3', name: 'Data Structures Advanced', issuer: 'CodeSpectra', date: '2025-06-01', status: 'verified' },
  { id: '4', name: 'JavaScript Master', issuer: 'CodeSpectra', date: 'Pending', status: 'in_progress' },
]

export default function CertificationsScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={commonStyles.container}>
      <FlatList
        data={MOCK_CERTS}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={
          <View style={commonStyles.sectionHeader}>
            <Shield size={20} color={colors.primary} strokeWidth={2} />
            <Text style={commonStyles.sectionTitle}>Certifications</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={commonStyles.emptyState}>
            <Shield size={40} color={colors.muted} strokeWidth={1.5} />
            <Text style={commonStyles.emptyText}>No certifications yet</Text>
          </View>
        }
        renderItem={({ item }) => {
          const verified = item.status === 'verified'
          return (
            <View style={styles.card}>
              <View style={[styles.certIcon, { backgroundColor: verified ? colors.primary + '18' : colors.warning + '18' }]}>
                <Shield size={22} color={verified ? colors.primary : colors.warning} strokeWidth={2} />
              </View>
              <View style={styles.certInfo}>
                <Text style={styles.certName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.certIssuer}>{item.issuer}</Text>
                <View style={styles.certMeta}>
                  {item.date !== 'Pending' ? (
                    <View style={styles.metaItem}>
                      <Clock size={11} color={colors.muted} strokeWidth={2} />
                      <Text style={styles.metaText}>{item.date}</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusBadge, { backgroundColor: colors.warning + '18' }]}>
                      <Text style={[styles.statusText, { color: colors.warning }]}>In Progress</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={[styles.verifiedBadge, verified && { backgroundColor: colors.success + '18' }]}>
                {verified ? (
                  <Check size={16} color={colors.success} strokeWidth={2.5} />
                ) : (
                  <Clock size={16} color={colors.warning} strokeWidth={2.5} />
                )}
              </View>
            </View>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.xs,
  },
  certIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  certInfo: { flex: 1 },
  certName: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace', marginBottom: 2 },
  certIssuer: { fontSize: 12, color: colors.primary, fontFamily: 'monospace', marginBottom: 4 },
  certMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace' },
  verifiedBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
})