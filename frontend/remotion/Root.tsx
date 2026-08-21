import React from 'react'
import { Composition } from 'remotion'
import { CourseVideoComposition, type CourseVideoProps } from '@/app/remotion/CourseVideo'

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CourseVideo"
      component={CourseVideoComposition}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={30}
      defaultProps={{ script: [], audioUrl: null }}
      calculateMetadata={async ({ props }: { props: CourseVideoProps }) => {
        const frames = (props.script || []).reduce((n, s) => n + Math.max(30, s.durationInFrames || 0), 0)
        return { durationInFrames: Math.max(30, frames) }
      }}
    />
  )
}
