import React from 'react'
import { Composition } from 'remotion'
import {
  CourseVideoComposition,
  type CourseVideoProps,
  type ScriptItem,
} from '@/app/remotion/CourseVideo'

const defaultProps: CourseVideoProps = { script: [] as ScriptItem[], audioUrl: null }

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CourseVideo"
      component={CourseVideoComposition as React.ComponentType<Record<string, unknown>>}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={30}
      defaultProps={defaultProps}
      calculateMetadata={async ({ props }) => {
        const script = (Array.isArray(props.script) ? props.script : []) as { durationInFrames?: number }[]
        const frames = script.reduce((n, s) => n + Math.max(30, s.durationInFrames || 0), 0)
        return { durationInFrames: Math.max(30, frames) }
      }}
    />
  )
}
