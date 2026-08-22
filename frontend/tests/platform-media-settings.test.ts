import { describe, expect, it } from 'vitest'
import { coercePlatformBool, mergeGeneralPlatformSettings } from '@/lib/platform-general-settings'

describe('platform media player bools', () => {
  it('coercePlatformBool treats falsey strings as false', () => {
    expect(coercePlatformBool('false', true)).toBe(false)
    expect(coercePlatformBool('0', true)).toBe(false)
    expect(coercePlatformBool('off', true)).toBe(false)
    expect(coercePlatformBool(false, true)).toBe(false)
  })

  it('merge keeps explicit autoplay false', () => {
    const m = mergeGeneralPlatformSettings({ video_player_autoplay: false, video_player_captions_default: false })
    expect(m.video_player_autoplay).toBe(false)
    expect(m.video_player_captions_default).toBe(false)
  })
})
