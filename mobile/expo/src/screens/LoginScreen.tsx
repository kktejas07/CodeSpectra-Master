import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, typography, commonStyles } from '../theme'
import { api, User, getApiUrl, setApiUrl } from '../api/client'

interface Props {
  onLogin: (user: User) => void
}

export default function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [showUrlInput, setShowUrlInput] = useState(false)

  useEffect(() => {
    getApiUrl().then(url => {
      setServerUrl(url)
      setLoading(false)
    })
  }, [])
  const [showPassword, setShowPassword] = useState(false)

  const login = async () => {
    if (!email.trim() || !password) return
    setLoading(true)
    try {
      const res = await api.post<{ user: User }>('/api/auth/login', { email, password })
      onLogin(res.user)
    } catch (e: any) {
      Alert.alert('Login failed', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>{'</>'}</Text>
            </View>
            <Text style={styles.appName}>CodeSpectra</Text>
            <Text style={styles.tagline}>Master code through AI</Text>
          </View>

          <View style={styles.form}>
            {/* Server URL */}
            <TouchableOpacity onPress={() => setShowUrlInput(!showUrlInput)} style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.caption, { color: colors.muted, textDecorationLine: 'underline' }]}>
                {showUrlInput ? '← Hide' : 'Configure server...'}
              </Text>
            </TouchableOpacity>
            {showUrlInput && (
              <View style={{ marginBottom: spacing.lg }}>
                <Text style={styles.label}>Server URL</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[commonStyles.input, { flex: 1 }]}
                    value={serverUrl}
                    onChangeText={setServerUrl}
                    placeholder="https://your-server.com"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  <TouchableOpacity onPress={async () => { if (serverUrl.trim()) await setApiUrl(serverUrl.trim()); Alert.alert('Saved', 'Server URL updated') }} style={styles.eye}>
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={commonStyles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[commonStyles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eye}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[commonStyles.button, { marginTop: spacing['2xl'] }]} onPress={login} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={commonStyles.buttonText}>Sign In</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing['2xl'] },
  brand: { alignItems: 'center', marginBottom: spacing['4xl'] },
  logo: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  logoText: { fontSize: 28, fontWeight: '700', color: colors.primaryForeground },
  appName: { ...typography.h1, marginTop: spacing.md },
  tagline: { ...typography.bodySmall, marginTop: spacing.xs },
  form: { width: '100%', maxWidth: 360, alignSelf: 'center' },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.foreground, marginBottom: spacing.sm },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eye: { padding: spacing.sm + 2 },
})
