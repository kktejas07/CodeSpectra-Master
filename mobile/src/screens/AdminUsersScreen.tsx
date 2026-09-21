import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import {
  searchUsers, setUserRole, roleTone, ROLES, type AdminUser,
} from '../api/admin'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
}

export function AdminUsersScreen({ theme }: Props): React.JSX.Element {
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (query: string, refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      setUsers(await searchUsers(query))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load users.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load('')
  }, [load])

  const onQuery = (t: string): void => {
    setQ(t)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void load(t), 450)
  }

  const changeRole = async (user: AdminUser, role: string): Promise<void> => {
    setSavingId(user.id)
    setError(null)
    try {
      await setUserRole(user.id, role)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)))
      setOpenId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change role.')
    } finally {
      setSavingId(null)
    }
  }

  const s = styles(theme)

  return (
    <View style={s.root}>
      <TextInput
        style={s.search}
        placeholder="Search by name or email…"
        placeholderTextColor={theme.muted}
        value={q}
        onChangeText={onQuery}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {error ? <Text style={s.error}>{error}</Text> : null}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={s.muted}>Loading users…</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={users.length === 0 ? s.emptyWrap : s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(q, true)} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.muted}>No users match that search.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const open = openId === item.id
            const tone = roleTone(item.role)
            return (
              <View style={s.card}>
                <TouchableOpacity
                  style={s.cardRow}
                  activeOpacity={0.7}
                  onPress={() => setOpenId(open ? null : item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name || item.email}, role ${item.role}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle} numberOfLines={1}>{item.name || item.email || 'Unknown'}</Text>
                    <Text style={s.cardMeta} numberOfLines={1}>
                      {item.email ?? 'no email'}
                      {item.tenant_name ? ` · ${item.tenant_name}` : ''}
                    </Text>
                  </View>
                  <View style={s.pill}>
                    <View style={[s.dot, { backgroundColor: tone }]} />
                    <Text style={[s.pillText, { color: tone }]}>{item.role}</Text>
                  </View>
                </TouchableOpacity>

                {open ? (
                  <View style={s.roleRow}>
                    {savingId === item.id ? (
                      <ActivityIndicator color={theme.primary} />
                    ) : (
                      ROLES.map((r) => (
                        <TouchableOpacity
                          key={r}
                          style={[s.roleChip, item.role === r ? { borderColor: theme.primary, backgroundColor: `${theme.primary}18` } : null]}
                          onPress={() => void changeRole(item, r)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`Set role ${r}`}
                        >
                          <Text style={[s.roleText, item.role === r ? { color: theme.primary } : null]}>{r}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    search: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, color: t.text, paddingHorizontal: 14,
      minHeight: MIN_TOUCH, margin: 16, marginBottom: 8, fontSize: 15,
    },
    list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
    emptyWrap: { flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    muted: { color: t.muted, fontSize: 14, textAlign: 'center' },
    error: { color: '#F87171', fontSize: 13, paddingHorizontal: 16, marginBottom: 6 },
    card: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, minHeight: MIN_TOUCH },
    cardTitle: { color: t.text, fontSize: 15, fontWeight: '600' },
    cardMeta: { color: t.muted, fontSize: 12, marginTop: 3 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    pillText: { fontSize: 12, fontWeight: '600' },
    roleRow: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8,
      paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2,
    },
    roleChip: {
      borderWidth: 1, borderColor: t.border, borderRadius: 20,
      paddingHorizontal: 12, minHeight: 36, justifyContent: 'center',
    },
    roleText: { color: t.muted, fontSize: 12, fontWeight: '600' },
  })
