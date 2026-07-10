import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { colors, spacing, typography, commonStyles } from '../theme'
import { User } from '../api/client'

interface Props {
  user: User
  onLogout: () => void
}

export default function ProfileScreen({ user, onLogout }: Props) {
  return (
    <ScrollView style={commonStyles.container} contentContainerStyle={{ padding: spacing.xl }}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ marginLeft: spacing.lg, flex: 1 }}>
          <Text style={typography.h2}>{user.name || 'User'}</Text>
          <Text style={typography.bodySmall}>{user.email}</Text>
          <View style={[styles.roleBadge, { backgroundColor: user.role === 'superadmin' ? '#38bdf820' : user.role === 'tenant_admin' ? '#a855f720' : '#71717a20' }]}>
            <Text style={[styles.roleText, { color: user.role === 'superadmin' ? '#38bdf8' : user.role === 'tenant_admin' ? '#a855f7' : '#71717a' }]}>{user.role}</Text>
          </View>
        </View>
      </View>

      {user.xp !== undefined && (
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={typography.h2}>{user.xp}</Text><Text style={typography.caption}>XP</Text></View>
          <View style={styles.stat}><Text style={typography.h2}>{user.level || 1}</Text><Text style={typography.caption}>Level</Text></View>
        </View>
      )}

      <View style={[commonStyles.divider, { marginVertical: spacing.xl }]} />

      <TouchableOpacity style={styles.menuItem} onPress={() => {}}>
        <Text style={typography.body}>Account Settings</Text>
        <Text style={typography.caption}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuItem} onPress={() => {}}>
        <Text style={typography.body}>Notifications</Text>
        <Text style={typography.caption}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuItem} onPress={() => {}}>
        <Text style={typography.body}>Billing</Text>
        <Text style={typography.caption}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuItem} onPress={onLogout}>
        <Text style={[typography.body, { color: colors.destructive }]}>Sign Out</Text>
        <Text style={[typography.caption, { color: colors.destructive }]}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: colors.primaryForeground },
  roleBadge: { borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start', marginTop: spacing.xs },
  roleText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', marginTop: spacing['2xl'] },
  stat: { alignItems: 'center', flex: 1 },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
})
