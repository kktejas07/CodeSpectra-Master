import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import type { ThemeTokens } from '../api/client'
import { FALLBACK_THEME } from '../theme'

interface Props {
  /** Brand tagline from platform settings (falls back to the web default). */
  tagline?: string
}

// The native driver requires a real native view tree, which the Jest
// renderer does not have. On-device it stays true.
const NATIVE_DRIVER = !process.env.JEST_WORKER_ID

/**
 * In-app splash shown while the app checks its token and fetches the
 * bootstrap manifest. The native splash (app.json plugin) holds the same
 * background colour and stays up until this component mounts, so there is
 * no white flash between them.
 *
 * Motion: logo mark fades + scales in, wordmark and tagline stagger after,
 * then a soft looping pulse. 150-300ms micro-timings, ease-out entering.
 */
export function SplashScreen({ tagline }: Props): React.JSX.Element {
  const theme: ThemeTokens = FALLBACK_THEME
  const markOpacity = useRef(new Animated.Value(0)).current
  const markScale = useRef(new Animated.Value(0.86)).current
  const textOpacity = useRef(new Animated.Value(0)).current
  const textShift = useRef(new Animated.Value(10)).current
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const entrance = Animated.sequence([
      Animated.parallel([
        Animated.timing(markOpacity, {
          toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.spring(markScale, {
          toValue: 1, friction: 6, tension: 90, useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(textShift, {
          toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    ])
    entrance.start()

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      ]),
    )
    loop.start()
    return () => {
      entrance.stop()
      loop.stop()
    }
  }, [markOpacity, markScale, textOpacity, textShift, pulse])

  const s = styles(theme)
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] })

  return (
    <View style={s.root} accessibilityRole="progressbar" accessibilityLabel="Loading CodeSpectra">
      <Animated.View
        style={[s.mark, { opacity: markOpacity, transform: [{ scale: markScale }] }]}
      >
        <Text style={s.markText}>{'</>'}</Text>
      </Animated.View>

      <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textShift }] }}>
        <Text style={s.title}>CodeSpectra</Text>
        <Text style={s.tagline}>{tagline || 'Ship quality software with confidence'}</Text>
      </Animated.View>

      <View style={s.dotsRow}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[
              s.dot,
              { opacity: i === 0 ? pulseOpacity : 0.25 },
            ]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: {
      flex: 1, backgroundColor: t.background,
      alignItems: 'center', justifyContent: 'center',
    },
    mark: {
      width: 88, height: 88, borderRadius: 22, backgroundColor: t.primary,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: t.primary, shadowOpacity: 0.45, shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 }, elevation: 12,
    },
    markText: { color: '#080D17', fontSize: 30, fontWeight: '800', letterSpacing: -1 },
    title: {
      color: t.text, fontSize: 26, fontWeight: '700',
      marginTop: 20, textAlign: 'center', letterSpacing: -0.3,
    },
    tagline: {
      color: t.muted, fontSize: 13, marginTop: 6,
      textAlign: 'center', paddingHorizontal: 32,
    },
    dotsRow: {
      position: 'absolute', bottom: 72,
      flexDirection: 'row', gap: 6,
    },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.primary },
  })
