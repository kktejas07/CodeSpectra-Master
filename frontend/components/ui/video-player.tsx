'use client'

import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'

import { useEffect, useState } from 'react'
import { MediaPlayer, MediaProvider } from '@vidstack/react'
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default'
import { RemotionProviderLoader } from '@vidstack/react/player/remotion'

interface VideoPlayerProps {
  src: any
  title?: string
  poster?: string
  autoplay?: boolean
  muted?: boolean
  primaryColor?: string
  logoUrl?: string
  logoLinkUrl?: string
  className?: string
}

type PlayerSettings = {
  video_player_primary_color?: string
  video_player_autoplay?: boolean
  video_player_muted?: boolean
  video_player_logo_url?: string
  video_player_logo_link_url?: string
}

export function VideoPlayer({
  src,
  title = 'Video',
  poster,
  autoplay,
  muted,
  primaryColor,
  logoUrl,
  logoLinkUrl,
  className = '',
}: VideoPlayerProps) {
  console.log('RemotionProviderLoader is:', RemotionProviderLoader)
  const [settings, setSettings] = useState<PlayerSettings>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/platform/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.settings) {
          setSettings(data.settings)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const finalAutoplay = autoplay ?? settings.video_player_autoplay ?? false
  const finalMuted = muted ?? settings.video_player_muted ?? false
  const finalColor = primaryColor ?? settings.video_player_primary_color ?? '#34d399'
  const finalLogoUrl = logoUrl ?? settings.video_player_logo_url ?? ''
  const finalLogoLinkUrl = logoLinkUrl ?? settings.video_player_logo_link_url ?? ''

  const logo = finalLogoUrl ? (
    <a
      href={finalLogoLinkUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => { if (!finalLogoLinkUrl) e.preventDefault() }}
      className="ml-3 mr-1 flex items-center"
    >
      <img
        src={finalLogoUrl}
        alt=""
        className="h-7 w-auto max-w-[120px] object-contain"
        loading="lazy"
      />
    </a>
  ) : null

  return (
    <div className={`overflow-hidden rounded-md border ${className}`}>
      <MediaPlayer
        src={src}
        title={title}
        autoplay={finalAutoplay}
        muted={finalMuted}
        style={{ '--video-brand': finalColor } as any}
      >
        <MediaProvider loaders={[RemotionProviderLoader]} />
        <DefaultVideoLayout
          thumbnails={poster}
          icons={defaultLayoutIcons}
          color={finalColor}
          slots={{ topControlsGroupStart: logo }}
        />
      </MediaPlayer>
    </div>
  )
}