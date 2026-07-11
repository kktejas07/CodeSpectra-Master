import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Scan, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react-native'
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
  const { width } = useWindowDimensions()

  const scan = async () => {
    if (!code.trim()) {
      Alert.alert('Required', 'Please paste some code to scan.')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const data = await api.post<{ issues?: { severity: string; message: string }[] }>(
        '/api/scanner/code', { code, language }
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
  const severityIcon = (s: string) =>
    s === 'error' ? <AlertTriangle size={14} color={colors.destructive} strokeWidth={2.5} /> :
    s === 'warning' ? <AlertTriangle size={14} color={colors.warning} strokeWidth={2.5} /> :
    <CheckCircle2 size={14} color={colors.muted} strokeWidth={2.5} />

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Scan size={20} color={colors.primary} strokeWidth={2.5} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Code Scanner</Text>
            <Text style={styles.headerSub}>Analyze code quality and issues</Text>
          </View>
        </View>

        {/* Language Selector */}
        <View style={styles.langSection}>
          <Text style={styles.langLabel}>Language</Text>
          <TouchableOpacity style={styles.langPicker} activeOpacity={0.7}
            onPress={() => setShowLangPicker(!showLangPicker)}>
            <Text style={styles.langValue}>{language}</Text>
            <ChevronDown size={16} color={colors.muted} style={{ transform: showLangPicker ? [{ rotate: '180deg' }] : [] }} />
          </TouchableOpacity>
          {showLangPicker && (
            <View style={styles.langDropdown}>
              {LANGUAGES.map(lang => (
                <TouchableOpacity key={lang} style={[styles.langOption, language === lang && styles.langOptionActive]}
                  onPress={() => { setLanguage(lang); setShowLangPicker(false) }}>
                  <Text style={[styles.langOptionText, language === lang && styles.langOptionTextActive]}>
                    {lang}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Code Input */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>PASTE YOUR CODE</Text>
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

        {/* Scan Button */}
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
              <Scan size={18} color={colors.primaryForeground} strokeWidth={2.5} />
              <Text style={styles.scanButtonText}>Scan Code</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Results */}
        {result !== null && (
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Results</Text>
              <View style={[styles.resultCount, { backgroundColor: result.length === 0 ? colors.success + '18' : colors.warning + '18' }]}>
                <Text style={[styles.resultCountText, { color: result.length === 0 ? colors.success : colors.warning }]}>
                  {result.length === 0 ? 'Clean ✓' : `${result.length} issues`}
                </Text>
              </View>
            </View>

            {result.length === 0 ? (
              <View style={styles.noIssues}>
                <CheckCircle2 size={40} color={colors.success} strokeWidth={1.5} />
                <Text style={styles.noIssuesText}>No issues found</Text>
                <Text style={styles.noIssuesSubtext}>Your code looks great!</Text>
              </View>
            ) : (
              result.map((issue, i) => (
                <View key={i} style={[styles.issueItem, i > 0 && styles.issueBorder]}>
                  <View style={styles.issueLeft}>
                    {severityIcon(issue.severity)}
                  </View>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  headerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'monospace' },
  headerSub: { fontSize: 12, color: colors.muted, fontFamily: 'monospace', marginTop: 2 },
  langSection: { marginBottom: spacing.lg },
  langLabel: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'monospace', letterSpacing: 0.8, marginBottom: spacing.sm },
  langPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  langValue: { fontSize: 14, color: colors.foreground, fontFamily: 'monospace' },
  langDropdown: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, marginTop: spacing.sm, overflow: 'hidden' },
  langOption: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  langOptionActive: { backgroundColor: colors.primary + '12' },
  langOptionText: { fontSize: 14, color: colors.muted, fontFamily: 'monospace' },
  langOptionTextActive: { color: colors.primary, fontWeight: '600' },
  inputCard: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing['2xl'], marginBottom: spacing.lg, ...shadows.sm },
  inputLabel: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'monospace', letterSpacing: 0.8, marginBottom: spacing.md },
  codeInput: { backgroundColor: colors.background, color: colors.foreground, borderRadius: 8, borderWidth: 1, borderColor: colors.input, padding: spacing.md, fontFamily: 'monospace', fontSize: 13, minHeight: 200 },
  scanButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: spacing.md + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg, ...shadows.sm },
  scanButtonDisabled: { opacity: 0.7 },
  scanButtonText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground, fontFamily: 'monospace' },
  resultsCard: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing['2xl'], ...shadows.sm },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  resultsTitle: { fontSize: 16, fontWeight: '600', color: colors.foreground, fontFamily: 'monospace' },
  resultCount: { borderRadius: 12, paddingHorizontal: spacing.sm + 2, paddingVertical: 2 },
  resultCountText: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  noIssues: { alignItems: 'center', paddingVertical: spacing['2xl'], gap: spacing.sm },
  noIssuesText: { fontSize: 16, fontWeight: '600', color: colors.success, fontFamily: 'monospace' },
  noIssuesSubtext: { fontSize: 13, color: colors.muted, fontFamily: 'monospace' },
  issueItem: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  issueBorder: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  issueLeft: { paddingTop: 2 },
  issueContent: { flex: 1 },
  issueHeader: { marginBottom: 2 },
  issueSeverity: { fontSize: 10, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },
  issueMessage: { fontSize: 13, color: colors.foreground, fontFamily: 'monospace', lineHeight: 18 },
})