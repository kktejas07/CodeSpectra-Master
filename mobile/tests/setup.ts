/**
 * React 19 requires this flag for act() to be recognised in tests.
 * (RNTL 14 renders asynchronously — always `await render(...)`.)
 */
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Test setup for the mobile app.
 *
 * The screens talk to the network and to native modules that do not exist
 * in a test renderer. We stub the API client (not the screens) so the tests
 * exercise real component code — render branches, empty states, formatting —
 * without hitting the server or needing a device.
 */

// Native modules with no test implementation.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBase: 'https://codespectra.ai' } } },
}))

jest.mock('expo-video', () => {
  const React = require('react')
  return {
    useVideoPlayer: () => ({ loop: false, timeUpdateEventInterval: 0, play: jest.fn() }),
    VideoView: (props: Record<string, unknown>) => React.createElement('VideoView', props),
  }
})

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getDevicePushTokenAsync: jest.fn(async () => ({ data: 'a'.repeat(40) })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { DEFAULT: 3 },
}))

// lucide ships untranspiled ESM; the tests never assert on icon internals,
// so a lightweight stub keeps the suite independent of bundler config.
jest.mock('lucide-react-native', () => {
  const React = require('react')
  const Icon = (props: Record<string, unknown>) => React.createElement('Icon', props)
  return new Proxy({}, { get: () => Icon })
})

jest.mock('expo-device', () => ({ isDevice: true, deviceName: 'Test', osName: 'iOS' }))
jest.mock('expo-screen-capture', () => ({ addScreenshotListener: jest.fn(() => ({ remove: jest.fn() })) }))
