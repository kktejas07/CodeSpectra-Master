import { StyleSheet } from 'react-native'

export const colors = {
  background: '#09090b',
  card: '#18181b',
  cardBorder: '#27272a',
  foreground: '#fafafa',
  muted: '#71717a',
  mutedForeground: '#a1a1aa',
  primary: '#38bdf8',
  primaryForeground: '#09090b',
  destructive: '#ef4444',
  success: '#22c55e',
  warning: '#eab308',
  border: '#27272a',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
}

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.foreground, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.foreground, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const, color: colors.foreground },
  body: { fontSize: 15, color: colors.mutedForeground, lineHeight: 22 },
  bodySmall: { fontSize: 13, color: colors.mutedForeground, lineHeight: 18 },
  caption: { fontSize: 11, color: colors.muted, letterSpacing: 0.5 },
  mono: { fontFamily: 'monospace', fontSize: 13, color: colors.foreground },
}

export const commonStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.foreground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonText: {
    color: colors.primaryForeground,
    fontWeight: '600' as const,
    fontSize: 14,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const },
  divider: { height: 1, backgroundColor: colors.cardBorder },
})
