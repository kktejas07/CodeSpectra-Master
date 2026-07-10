import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing, commonStyles, shadows } from '../theme'
import { api } from '../api/client'

const LANGUAGES = ['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'cpp']

export default function ScannerScreen() {
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [result, setResult] = useState<{ severity: string; message: string }[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const insets = useSafeAreaInsets()

  const scan = async () => {
    if (!code.trim()) {
      Alert.alert('Required', 'Please paste some code to scan.')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const data = await api.post<{ issues?: { severity: string; message: string }[] }>(
        '/api/scanner/code',
        { code, language }
      )
      setResult(data.issues || [])
    } catch (e: any) {
      Alert.alert('Scan Failed', e.message)
    } finally {
      setLoading(false)
    }
  }

  const severityColor = (s: string) =>
    s === 'error' ? colors.destructive : s === 'warning' ? colors.warning : colors.muted

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={commonStyles.sectionHeader}>
          <Text style={commonStyles.sectionTitle}>Code Scanner</Text>
        </View>

        <View style={styles.languageRow}>
          <Text style={styles.langLabel}>Language</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang}
                style={[styles.langChip, language === lang && styles.langChipActive]}
                onPress={() => setLanguage(lang)}
                activeOpacity={0.7}
              >
                <Text style={[styles.langChipText, language === lang && styles.langChipTextActive]}>
                  {lang}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>PASTE CODE</Text>
          <TextInput
            style={styles.codeInput}
            placeholder={`// Paste your ${language} code here...`}
            placeholderTextColor={colors.muted}
            value={code}
            onChangeText={setCode}
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.scanButton, loading && styles.scanButtonDisabled]}
          onPress={scan}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <>
              <Text style={styles.scanButtonText}>Scan Code</Text>
              <Text style={styles.scanButtonArrow}>→</Text>
            </>
          )}
        </TouchableOpacity>

        {result !== null && (
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>
                Results
              </Text>
              <View style={[styles.resultCount, { backgroundColor: result.length === 0 ? colors.success + '18' : colors.warning + '18' }]}>
                <Text style={[styles.resultCountText, { color: result.length === 0 ? colors.success : colors.warning }]}>
                  {result.length === 0 ? 'Clean' : `${result.length} issues`}
                </Text>
              </View>
            </View>

            {result.length === 0 ? (
              <View style={styles.noIssues}>
                <Text style={styles.noIssuesText}>✓ No issues found</Text>
                <Text style={styles.noIssuesSubtext}>Your code looks good!</Text>
              </View>
            ) : (
              result.map((issue, i) => (
                <View key={i} style={[styles.issueItem, i > 0 && styles.issueItemBorder]}>
                  <View style={[styles.issueDot, { backgroundColor: severityColor(issue.severity) }]} />
                  <View style={styles.issueContent}>
                    <View style={styles.issueHeader}>
                      <Text style={[styles.issueSeverity, { color: severityColor(issue.severity) }]}>
                        {issue.severity.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.issueMessage}>{issue.message}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  languageRow: { marginBottom: spacing.lg },
  langLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.mutedForeground,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  langChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  langChipActive: {
    backgroundColor: colors.primary + '18',
    borderColor: colors.primary + '50',
  },
  langChipText: {
    fontSize: 12,
    color: colors.mutedForeground,
    fontFamily: 'monospace',
  },
  langChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  inputCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing['2xl'],
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.mutedForeground,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  codeInput: {
    backgroundColor: colors.background,
    color: colors.foreground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.input,
    padding: spacing.md,
    fontFamily: 'monospace',
    fontSize: 13,
    minHeight: 200,
  },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  scanButtonDisabled: { opacity: 0.7 },
  scanButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryForeground,
    fontFamily: 'monospace',
  },
  scanButtonArrow: {
    fontSize: 14,
    color: colors.primaryForeground,
    fontFamily: 'monospace',
  },
  resultsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing['2xl'],
    ...shadows.sm,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  resultsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  resultCount: {
    borderRadius: 12,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
  },
  resultCountText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  noIssues: { alignItems: 'center', paddingVertical: spacing.lg },
  noIssuesText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.success,
    fontFamily: 'monospace',
    marginBottom: spacing.xs,
  },
  noIssuesSubtext: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  issueItem: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  issueItemBorder: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  issueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  issueContent: { flex: 1 },
  issueHeader: { marginBottom: 2 },
  issueSeverity: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  issueMessage: {
    fontSize: 13,
    color: colors.foreground,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
})