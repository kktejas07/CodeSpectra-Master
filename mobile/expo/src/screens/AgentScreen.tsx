import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, shadows } from '../theme'
import { AgentMessage, getApiUrl } from '../api/client'

const INITIAL_MESSAGE: AgentMessage = {
  id: '0',
  role: 'assistant',
  content: 'Hello! I\'m your CodeSpectra AI assistant. Ask me anything about coding, algorithms, or your codebase.',
}

export default function AgentScreen() {
  const [messages, setMessages] = useState<AgentMessage[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const flatRef = useRef<FlatList>(null)

  useEffect(() => {
    flatRef.current?.scrollToEnd({ animated: false })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: AgentMessage = { id: Date.now().toString(), role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    const currentInput = input
    setInput('')
    setLoading(true)
    try {
      const base = await getApiUrl()
      const res = await fetch(`${base}/api/ai/agent`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput }),
      })
      const data = await res.json()
      const reply = data.response || data.message || 'No response received.'
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Request failed. Please check your connection and try again.',
      }])
    } finally {
      setLoading(false)
    }
  }

  const renderBubble = ({ item }: { item: AgentMessage }) => {
    const isUser = item.role === 'user'

    return (
      <View style={[styles.bubbleWrap, isUser && styles.bubbleWrapUser]}>
        {!isUser && (
          <View style={styles.aiIcon}>
            <Text style={styles.aiIconText}>{'[AI]'}</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {item.content}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Text style={styles.headerIconText}>{'[AI]'}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Agent</Text>
            <Text style={styles.headerSub}>Powered by CodeSpectra</Text>
          </View>
          <View style={styles.statusDot} />
        </View>

        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.md }}
          onContentSizeChange={() => flatRef.current?.scrollToEnd()}
          renderItem={renderBubble}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Thinking...</Text>
          </View>
        )}

        <View style={styles.inputArea}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about code, algorithms, or anything..."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={2000}
              textContentType="none"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={send}
              disabled={!input.trim() || loading}
              activeOpacity={0.7}
            >
              <Text style={styles.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.disclaimer}>AI responses may be inaccurate. Verify critical information.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: spacing.md,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  headerSub: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginLeft: 'auto',
  },
  bubbleWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  bubbleWrapUser: {
    flexDirection: 'row-reverse',
  },
  aiIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  aiIconText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  bubble: {
    maxWidth: '80%',
    padding: spacing.md,
    borderRadius: 12,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    color: colors.foreground,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: colors.primaryForeground,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  inputArea: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    padding: spacing.md,
    paddingBottom: spacing.md,
  },
  inputWrapper: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.foreground,
    fontSize: 14,
    fontFamily: 'monospace',
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    alignSelf: 'flex-end',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryForeground,
    fontFamily: 'monospace',
  },
  disclaimer: {
    fontSize: 10,
    color: colors.muted,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
})