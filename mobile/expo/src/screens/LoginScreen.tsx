import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing } from '../theme'
import { api, User, setSessionToken } from '../api/client'

interface Props {
  onLogin: (user: User) => void
}

export default function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required', 'Please enter your email and password.')
      return
    }
    setLoading(true)
    try {
      const res = await api.post<{ user: User; token?: string }>('/api/auth/login', { email, password })
      if (res.token) {
        await setSessionToken(res.token)
      }
      onLogin(res.user)
    } catch (e: any) {
      const msg = e.message || 'Login failed'
      Alert.alert('Sign In Failed', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.heroSection}>
            <View style={styles.logoContainer}>
              <View style={styles.logoRing}>
                <Text style={styles.logoText}>{'</>'}</Text>
              </View>
            </View>
            <Text style={styles.appName}>CodeSpectra</Text>
            <Text style={styles.tagline}>Master code through AI</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome back</Text>
            <Text style={styles.cardSubtitle}>Sign in to your account</Text>

            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors.muted}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    autoComplete="password"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.demoHint}>
            <Text style={styles.demoTitle}>Demo accounts:</Text>
            <Text style={styles.demoText}>superadmin@codespectra.com / SuperAdmin123!</Text>
            <Text style={styles.demoText}>admin@codespectra.com / TenantAdmin123!</Text>
            <Text style={styles.demoText}>demo@codespectra.com / DemoPass123!</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing['2xl'] },
  heroSection: { alignItems: 'center', marginBottom: spacing['4xl'] },
  logoContainer: { marginBottom: spacing.lg },
  logoRing: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: colors.primary + '15', borderWidth: 2, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 28, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  appName: { fontSize: 26, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace', letterSpacing: -0.5, marginBottom: spacing.xs },
  tagline: { fontSize: 14, color: colors.muted, fontFamily: 'monospace' },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing['2xl'] },
  cardTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace', marginBottom: spacing.xs },
  cardSubtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'monospace', marginBottom: spacing['2xl'] },
  form: { gap: spacing.lg },
  fieldGroup: { gap: spacing.sm },
  label: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'monospace', letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { backgroundColor: colors.background, color: colors.foreground, borderRadius: 8, borderWidth: 1, borderColor: colors.input, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 14, fontFamily: 'monospace' },
  passwordWrapper: { position: 'relative' },
  passwordInput: { paddingRight: 56 },
  eyeButton: { position: 'absolute', right: spacing.md, top: 0, bottom: 0, justifyContent: 'center' },
  eyeText: { fontSize: 12, color: colors.primary, fontFamily: 'monospace', fontWeight: '600' },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.sm },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 14, fontFamily: 'monospace', letterSpacing: 0.3 },
  demoHint: { marginTop: spacing['2xl'], alignItems: 'center' },
  demoTitle: { fontSize: 11, color: colors.muted, fontFamily: 'monospace', fontWeight: '600', marginBottom: spacing.xs },
  demoText: { fontSize: 10, color: colors.muted, fontFamily: 'monospace' },
})