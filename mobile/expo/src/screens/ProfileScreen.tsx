import React from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, Share,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LogOut, Settings, Mail, Calendar, Trophy, XCircle, ExternalLink } from 'lucide-react-native'
import { colors, spacing, commonStyles, shadows } from '../theme'
import { getApiUrl } from '../api/client'

interface ProfileScreenProps {
  user?: {
    name?: string
    email?: string
    username?: string
    avatar?: string
    joinDate?: string
    solvedCount?: number
    rank?: number
  }
}

export default function ProfileScreen({ user }: ProfileScreenProps) {
  const insets = useSafeAreaInsets()
  const displayName = user?.name || user?.username || 'User'
  const displayEmail = user?.email || 'No email'

  const stats = [
    { label: 'Problems Solved', value: user?.solvedCount ?? 0, color: colors.primary },
    { label: 'Global Rank', value: user?.rank ? `#${user.rank}` : '#—', color: colors.warning },
  ]

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const base = await getApiUrl()
              await fetch(`${base}/api/auth/logout`, { method: 'POST', credentials: 'include' })
            } catch { /* ignore */ }
          },
        },
      ]
    )
  }

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out my CodeSpectra profile! ${displayName} - Rank #${user?.rank ?? '—'}`,
        title: 'CodeSpectra Profile',
      })
    } catch { /* ignore */ }
  }

  return (
    <ScrollView
      style={commonStyles.container}
      contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 100 }}
    >
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>
                {displayName.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.displayName}>{displayName}</Text>
        <Text style={styles.email}>{displayEmail}</Text>
        {user?.joinDate && (
          <View style={styles.joinRow}>
            <Calendar size={12} color={colors.muted} strokeWidth={2} />
            <Text style={styles.joinText}>Joined {user.joinDate}</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        {stats.map((s, i) => (
          <View key={i} style={[styles.statItem, i < stats.length - 1 && styles.statBorder]}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Settings List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.listCard}>
          <TouchableOpacity style={styles.listItem}>
            <Settings size={18} color={colors.foreground} strokeWidth={2} />
            <Text style={styles.listText}>Preferences</Text>
            <ExternalLink size={14} color={colors.muted} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.listDivider} />
          <TouchableOpacity style={styles.listItem}>
            <Mail size={18} color={colors.foreground} strokeWidth={2} />
            <Text style={styles.listText}>Change Email</Text>
            <ExternalLink size={14} color={colors.muted} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SUPPORT</Text>
        <View style={styles.listCard}>
          <TouchableOpacity style={styles.listItem} onPress={handleShare}>
            <Trophy size={18} color={colors.foreground} strokeWidth={2} />
            <Text style={styles.listText}>Share Profile</Text>
            <ExternalLink size={14} color={colors.muted} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.listDivider} />
          <TouchableOpacity style={styles.listItem}>
            <XCircle size={18} color={colors.foreground} strokeWidth={2} />
            <Text style={styles.listText}>Report an Issue</Text>
            <ExternalLink size={14} color={colors.muted} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <LogOut size={18} color={colors.destructive} strokeWidth={2} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Version */}
      <Text style={styles.version}>CodeSpectra v1.0.0</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingVertical: spacing['2xl'] },
  avatarWrap: { marginBottom: spacing.md },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.primary },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.primary + '40' },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  displayName: { fontSize: 22, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace', marginBottom: 4 },
  email: { fontSize: 14, color: colors.muted, fontFamily: 'monospace', marginBottom: spacing.sm },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  joinText: { fontSize: 12, color: colors.muted, fontFamily: 'monospace' },
  statsCard: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, marginBottom: spacing.xl, ...shadows.xs },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  statBorder: { borderRightWidth: 1, borderRightColor: colors.cardBorder },
  statValue: { fontSize: 22, fontWeight: '700', fontFamily: 'monospace', marginBottom: 4 },
  statLabel: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'monospace', letterSpacing: 0.8, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  listCard: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden', ...shadows.xs },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  listText: { flex: 1, fontSize: 15, color: colors.foreground, fontFamily: 'monospace' },
  listDivider: { height: 1, backgroundColor: colors.cardBorder },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.destructive + '12', borderRadius: 12, borderWidth: 1, borderColor: colors.destructive + '30',
    paddingVertical: spacing.md, marginBottom: spacing.lg,
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: colors.destructive, fontFamily: 'monospace' },
  version: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', textAlign: 'center' },
})