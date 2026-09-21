import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import type { ThemeTokens } from '../api/client'
import { login, setToken } from '../api/client'
import { MIN_TOUCH } from '../theme'

interface Props {
  theme: ThemeTokens
  onLoggedIn: () => void
}

export function LoginScreen({ theme, onLoggedIn }: Props): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [needTotp, setNeedTotp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await login(email.trim(), password, needTotp ? totp.trim() : undefined)
      if (res.twoFactorRequired) {
        setNeedTotp(true)
        setBusy(false)
        return
      }
      if (!res.token) throw new Error('No session token returned.')
      await setToken(res.token)
      onLoggedIn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const s = styles(theme)
  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.mark}>
        <Text style={s.markText}>{'</>'}</Text>
      </View>
      <Text style={s.title}>CodeSpectra</Text>
      <Text style={s.subtitle}>Sign in to continue</Text>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <TextInput
        style={s.input}
        placeholder="Email"
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
      />
      <TextInput
        style={s.input}
        placeholder="Password"
        placeholderTextColor={theme.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
      />
      {needTotp ? (
        <TextInput
          style={s.input}
          placeholder="Two-factor code"
          placeholderTextColor={theme.muted}
          keyboardType="number-pad"
          value={totp}
          onChangeText={setTotp}
          editable={!busy}
        />
      ) : null}

      <TouchableOpacity
        style={[s.button, busy ? s.buttonDisabled : null]}
        onPress={submit}
        disabled={busy}
        activeOpacity={0.8}
      >
        {busy ? (
          <ActivityIndicator color="#080D17" />
        ) : (
          <Text style={s.buttonText}>{needTotp ? 'Verify' : 'Sign in'}</Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background, padding: 24, justifyContent: 'center' },
    mark: {
      width: 56, height: 56, borderRadius: 14, backgroundColor: t.primary,
      alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    markText: { color: '#080D17', fontSize: 20, fontWeight: '700' },
    title: { color: t.text, fontSize: 28, fontWeight: '700' },
    subtitle: { color: t.muted, fontSize: 14, marginTop: 4, marginBottom: 24 },
    error: { color: '#F87171', fontSize: 13, marginBottom: 12 },
    input: {
      backgroundColor: t.card, borderColor: t.border, borderWidth: 1,
      borderRadius: 10, color: t.text, paddingHorizontal: 14,
      minHeight: MIN_TOUCH, marginBottom: 12, fontSize: 15,
    },
    button: {
      backgroundColor: t.primary, borderRadius: 10, minHeight: MIN_TOUCH,
      alignItems: 'center', justifyContent: 'center', marginTop: 4,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#080D17', fontSize: 16, fontWeight: '600' },
  })
