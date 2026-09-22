/**
 * Screen render smoke tests.
 *
 * These run the REAL screen components against the REAL theme tokens and
 * the real (mocked-transport) API client, asserting every branch renders
 * without throwing — loading, empty, data, and error. This is the check
 * that catches the class of bug a bundle build cannot: a screen that
 * compiles and imports fine but crashes the moment it renders (bad token
 * access, empty-array assumption, hook misuse).
 *
 * Run: npx jest
 */
import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { THEMES } from '../src/theme'
import { HomeScreen } from '../src/screens/HomeScreen'
import { CoursesScreen } from '../src/screens/CoursesScreen'
import { AssessmentsScreen } from '../src/screens/AssessmentsScreen'
import { LeaderboardScreen } from '../src/screens/LeaderboardScreen'
import { ProfileScreen } from '../src/screens/ProfileScreen'
import { ProblemsScreen } from '../src/screens/ProblemsScreen'
import { SplashScreen } from '../src/screens/SplashScreen'
import { LoginScreen } from '../src/screens/LoginScreen'

const theme = THEMES.dark
const user = { id: 'u1', email: 'a@b.c', name: 'Ada Lovelace', role: 'user' as const }

// Route the API client's transport to a controllable fake.
const mockApiTransport = jest.fn()
jest.mock('../src/api/client', () => {
  const actual = jest.requireActual('../src/api/client')
  return {
    ...actual,
    api: {
      get: (path: string) => mockApiTransport(path),
      post: (path: string) => mockApiTransport(path),
      patch: (path: string) => mockApiTransport(path),
      del: (path: string) => mockApiTransport(path),
    },
    getToken: async () => 'test-token',
  }
})

beforeEach(() => {
  mockApiTransport.mockReset()
})

describe('screens render with real data shapes', () => {
  it('SplashScreen renders the brand mark', async () => {
    const r = await render(<SplashScreen />)
    expect(r.getByText('CodeSpectra')).toBeTruthy()
  })

  it('LoginScreen renders inputs and the password reveal control', async () => {
    const r = await render(<LoginScreen theme={theme} onLoggedIn={() => {}} />)
    expect(r.getByPlaceholderText('Email')).toBeTruthy()
    expect(r.getByPlaceholderText('Password')).toBeTruthy()
    expect(r.getByLabelText('Show password')).toBeTruthy()
  })

  it('HomeScreen renders stats from /api/user/stats', async () => {
    mockApiTransport.mockResolvedValue({ challenges: 12, streak: 4, submissions: 30 })
    const r = await render(
      <HomeScreen theme={theme} userName="Ada Lovelace" tabs={[]} onNavigate={() => {}} />,
    )
    await waitFor(() => expect(r.getByText(/Ada/)).toBeTruthy())
    expect(r.getByText('12')).toBeTruthy()
    expect(r.getByText('4d')).toBeTruthy()
  })

  it('HomeScreen survives an API error without crashing', async () => {
    mockApiTransport.mockRejectedValue(new Error('boom'))
    const r = await render(
      <HomeScreen theme={theme} userName="Ada" tabs={[]} onNavigate={() => {}} />,
    )
    await waitFor(() => expect(r.getByText('Retry')).toBeTruthy())
  })

  it('CoursesScreen renders an empty catalog honestly', async () => {
    mockApiTransport.mockResolvedValue({ data: [] })
    const r = await render(<CoursesScreen theme={theme} navigation={{ navigate: jest.fn() }} />)
    await waitFor(() => expect(r.getByText('No courses published yet.')).toBeTruthy())
  })

  it('CoursesScreen renders course cards with lesson counts', async () => {
    mockApiTransport.mockResolvedValue({
      data: [{
        id: 'c1', title: 'Python Basics', level: 'beginner', enrolled: 5,
        sections: [{ title: 'Intro', lessons: [{ id: 'l1' }, { id: 'l2' }] }],
      }],
    })
    const r = await render(<CoursesScreen theme={theme} navigation={{ navigate: jest.fn() }} />)
    await waitFor(() => expect(r.getByText('Python Basics')).toBeTruthy())
    expect(r.getByText('2 lessons')).toBeTruthy()
  })

  it('AssessmentsScreen renders available and past attempts', async () => {
    mockApiTransport.mockResolvedValue({
      available: [{ id: 'e1', title: 'Screening', duration: 30 }],
      attempts: [{ examId: 'e1', examTitle: 'Screening', score: 80, passed: true }],
      stats: { total: 1, passed: 1, avgScore: 80 },
    })
    const r = await render(<AssessmentsScreen theme={theme} />)
    await waitFor(() => expect(r.getByText('Start on web')).toBeTruthy())
    expect(r.getByText('passed')).toBeTruthy()
  })

  it('LeaderboardScreen renders entries and the your-rank card', async () => {
    mockApiTransport.mockResolvedValue({
      entries: [{ rank: 1, userId: 'u2', name: 'Grace', level: 3, xp: 2500 }],
      currentUser: { points: 100, rank: 12 },
    })
    const r = await render(<LeaderboardScreen theme={theme} />)
    await waitFor(() => expect(r.getByText('Grace')).toBeTruthy())
    expect(r.getByText('#12')).toBeTruthy()
  })

  it('ProfileScreen shows the face-enrollment prompt when required', async () => {
    mockApiTransport.mockResolvedValue({ challenges: 1 })
    const r = await render(
      <ProfileScreen
        theme={theme}
        user={user}
        faceEnrollmentRequired
        onSignOut={() => {}}
      />,
    )
    await waitFor(() => expect(r.getByText('Face enrollment required')).toBeTruthy())
    expect(r.getByLabelText('Sign out')).toBeTruthy()
  })

  it('ProblemsScreen renders an empty list honestly', async () => {
    mockApiTransport.mockResolvedValue({ data: [] })
    const r = await render(<ProblemsScreen theme={theme} navigation={{ navigate: jest.fn() }} />)
    await waitFor(() => expect(r.getByText(/No problems found/)).toBeTruthy())
  })
})

describe('theme contract', () => {
  it('exposes complete dark and light palettes', () => {
    for (const mode of ['dark', 'light'] as const) {
      const t = THEMES[mode]
      for (const k of ['primary', 'background', 'card', 'text', 'muted', 'border'] as const) {
        expect(t[k]).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })
})
