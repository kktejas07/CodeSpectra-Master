import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, typography, commonStyles } from '../theme'
import { AgentMessage, getApiUrl } from '../api/client'

export default function AgentScreen() {
  const [messages, setMessages] = useState<AgentMessage[]>([
    { id: '0', role: 'assistant', content: 'Hi! How can I help with your code today?' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const flatRef = useRef<FlatList>(null)

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: AgentMessage = { id: Date.now().toString(), role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const base = await getApiUrl()
      const res = await fetch(`${base}/api/ai/agent`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: data.response || data.message || 'No response' }])
    } catch {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Request failed. Check your connection.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={typography.h2}>AI Agent</Text>
          <Text style={typography.caption}>Ask anything about your code</Text>
        </View>
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: spacing.lg }}
          onContentSizeChange={() => flatRef.current?.scrollToEnd()}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={item.role === 'user' ? styles.userText : styles.assistantText}>{item.content}</Text>
            </View>
          )}
        />
        {loading && <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.sm }} />}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything..."
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={loading || !input.trim()}>
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  bubble: { maxWidth: '80%', padding: spacing.md, borderRadius: 12, marginBottom: spacing.sm },
  userBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: colors.card, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.cardBorder },
  userText: { color: colors.primaryForeground, fontSize: 14 },
  assistantText: { color: colors.foreground, fontSize: 14 },
  inputRow: { flexDirection: 'row', padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder, backgroundColor: colors.background },
  input: { flex: 1, backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, color: colors.foreground, fontSize: 14, maxHeight: 80, borderWidth: 1, borderColor: colors.cardBorder },
  sendBtn: { marginLeft: spacing.sm, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  sendText: { color: colors.primaryForeground, fontWeight: '600', fontSize: 14 },
})
