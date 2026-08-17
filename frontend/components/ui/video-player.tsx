'use client'

import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'

import { MediaPlayer, MediaProvider } from '@vidstack/react'
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default'


interface VideoPlayerProps {
  src: string
  title?: string
  poster?: string
  autoplay?: boolean
  muted?: boolean
  primaryColor?: string
  className?: string
}

export function VideoPlayer({
  src,
  title = 'Video',
  poster,
  autoplay,
  muted,
  primaryColor,
  className = '',
}: VideoPlayerProps) {
  const settings: any = {}

  // Use props if provided, otherwise fallback to global platform settings
  const finalAutoplay = autoplay ?? settings.video_player_autoplay ?? false
  const finalMuted = muted ?? settings.video_player_muted ?? false
  const finalColor = primaryColor ?? settings.video_player_primary_color ?? '#34d399'

  return (
    <div className={`overflow-hidden rounded-md border ${className}`}>
      <MediaPlayer
        src={src}
        title={title}
        autoplay={finalAutoplay}
        muted={finalMuted}
        style={{ '--video-brand': finalColor } as any}
      >
        <MediaProvider />
        <DefaultVideoLayout
          thumbnails={poster}
          icons={defaultLayoutIcons}
          color={finalColor}
        />
      </MediaPlayer>
    </div>
  )
}
