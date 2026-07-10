import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, ScrollView, Alert,
} from 'react-native'
import { colors, spacing, typography, commonStyles } from '../theme'
import { api } from '../api/client'

export default function ScannerScreen() {
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const scan = async () => {
    if (!code.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const data = await api.post<{ issues?: { severity: string; message: string }[] }>('/api/scanner/code', { code, language })
      const issues = data.issues || []
      setResult(issues.length ? issues.map(i => `[${i.severity}] ${i.message}`).join('\n') : 'No issues found')
    } catch (e: any) {
      Alert.alert('Scan failed', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
      <TextInput
        style={styles.input}
        placeholder="Paste code to scan..."
        placeholderTextColor={colors.muted}
        multiline value={code} onChangeText={setCode}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <TextInput
          style={[styles.input, { flex: 1, minHeight: 40 }]}
          value={language} onChangeText={setLanguage}
          placeholder="language" placeholderTextColor={colors.muted}
        />
        <TouchableOpacity style={[commonStyles.button, { paddingHorizontal: spacing['2xl'] }]} onPress={scan} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={commonStyles.buttonText}>Scan</Text>}
        </TouchableOpacity>
      </View>
      {result && (
        <View style={[commonStyles.card, { marginTop: spacing.md }]}>
          <Text style={[typography.bodySmall, { fontFamily: 'monospace' }]}>{result}</Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.card, color: colors.foreground, borderRadius: 8,
    borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.md,
    fontFamily: 'monospace', fontSize: 13, minHeight: 160,
  },
})
