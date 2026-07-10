import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing, commonStyles, shadows } from '../theme'
import { User } from '../api/client'

interface Props {
  user: User
  onLogout: () => void
}

const roleColors: Record<string, { bg: string; text: string }> = {
  superadmin: { bg: '#38bdf818', text: '#38bdf8' },
  tenant_admin: { bg: '#a855f718', text: '#a855f7' },
  user: { bg: '#22c55e18', text: '#22c55e' },
}

const menuItems = [
  { label: 'Account Settings', sublabel: 'Manage your profile and account' },
  { label: 'Notifications', sublabel: 'Configure alerts and preferences' },
  { label: 'Privacy & Security', sublabel: 'Password and session management' },
  { label: 'Appearance', sublabel: 'Theme and display options' },
]

export default function ProfileScreen({ user, onLogout }: Props) {
  const insets = useSafeAreaInsets()
  const roleStyle = roleColors[user.role] || roleColors.user
  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase()

  return (
    <ScrollView
      style={commonStyles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.userName}>{user.name || 'User'}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
          <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg }]}>
            <Text style={[styles.roleText, { color: roleStyle.text }]}>
              {user.role.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {(user.xp !== undefined || user.level !== undefined) && (
        <View style={styles.statsCard}>
          {user.xp !== undefined && (
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user.xp.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total XP</Text>
            </View>
          )}
          <View style={styles.statDivider} />
          {user.level !== undefined && (
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{user.level}</Text>
              <Text style={styles.statLabel}>Level</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.menuSection}>
        <Text style={styles.menuSectionTitle}>Settings</Text>
        {menuItems.map((item, i) => (
          <TouchableOpacity key={i} style={[styles.menuItem, i === 0 && styles.menuItemFirst]} activeOpacity={0.7}>
            <View>
              <Text style={styles.menuItemLabel}>{item.label}</Text>
              <Text style={styles.menuItemSub}>{item.sublabel}</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.menuSection}>
        <TouchableOpacity
          style={[styles.menuItem, styles.logoutItem]}
          activeOpacity={0.7}
          onPress={onLogout}
        >
          <View>
            <Text style={[styles.menuItemLabel, { color: colors.destructive }]}>Sign Out</Text>
            <Text style={styles.menuItemSub}>Log out of your account</Text>
          </View>
          <Text style={[styles.menuArrow, { color: colors.destructive }]}>→</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>CodeSpectra v1.0.0</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2xl'],
    padding: spacing['2xl'],
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.primaryForeground,
    fontFamily: 'monospace',
  },
  headerInfo: { flex: 1, gap: spacing.xs },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  userEmail: {
    fontSize: 13,
    color: colors.mutedForeground,
    fontFamily: 'monospace',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    marginTop: spacing.xs,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  statsCard: {
    flexDirection: 'row',
    margin: spacing['2xl'],
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing['2xl'],
    ...shadows.sm,
  },
  statItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.cardBorder,
    marginHorizontal: spacing['2xl'],
  },
  menuSection: {
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing['2xl'],
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  menuSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    padding: spacing.md + 2,
    paddingBottom: spacing.sm,
    backgroundColor: colors.accent,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  menuItemFirst: { borderTopWidth: 0 },
  logoutItem: { borderBottomWidth: 0 },
  menuItemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  menuItemSub: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  menuArrow: {
    fontSize: 18,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  version: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.muted,
    fontFamily: 'monospace',
    marginBottom: spacing['2xl'],
  },
})