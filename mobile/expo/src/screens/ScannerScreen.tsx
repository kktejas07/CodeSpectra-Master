import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native'
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
      const data = await api.post<{ issues?: { severity: string; message: string }[] }>('/api/scanner/code', {
        code,
        language,
      })
      const issues = data.issues || []
      setResult(
        issues.length
          ? issues.map((i) => `[${i.severity}] ${i.message}`).join('\n')
          : 'No issues found',
      )
    } catch (e: any) {
      Alert.alert('Scan failed', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Paste code to scan..."
        placeholderTextColor="#71717a"
        multiline
        value={code}
        onChangeText={setCode}
      />
      <View style={styles.row}>
        <TextInput
          style={styles.langInput}
          value={language}
          onChangeText={setLanguage}
          placeholder="language"
          placeholderTextColor="#71717a"
        />
        <TouchableOpacity style={styles.button} onPress={scan} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#09090b" />
          ) : (
            <Text style={styles.buttonText}>Scan</Text>
          )}
        </TouchableOpacity>
      </View>
      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>{result}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b', padding: 16 },
  input: {
    backgroundColor: '#18181b',
    color: '#fafafa',
    borderRadius: 10,
    padding: 12,
    minHeight: 180,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  langInput: {
    flex: 1,
    backgroundColor: '#18181b',
    color: '#fafafa',
    borderRadius: 8,
    padding: 10,
  },
  button: {
    backgroundColor: '#38bdf8',
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  buttonText: { color: '#09090b', fontWeight: '600' },
  resultBox: {
    backgroundColor: '#18181b',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  resultText: { color: '#a1a1aa', fontFamily: 'monospace', fontSize: 12 },
})
