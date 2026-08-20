'use client'

import React, { useState } from 'react'
import { Player } from '@remotion/player'
import { CourseVideoComposition, ScriptItem } from '@/app/remotion/CourseVideo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { ArrowLeft, Loader2, PlaySquare } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { csrfFetch } from '@/lib/csrf-fetch'

export default function PoCVideoPage() {
  const [topic, setTopic] = useState('What is Node.js?')
  const [isGenerating, setIsGenerating] = useState(false)
  const [script, setScript] = useState<ScriptItem[] | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    if (!topic.trim()) return
    setIsGenerating(true)
    setError('')
    setScript(null)
    setAudioUrl(null)

    try {
      const res = await csrfFetch('/api/admin/courses/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
        credentials: 'include'
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate video')
      }

      setScript(data.script)
      setAudioUrl(data.audioUrl)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const totalFrames = script ? script.reduce((acc, curr) => acc + curr.durationInFrames, 0) : 0

  return (
    <div className="container mx-auto p-8 max-w-5xl">
      <Link href="/dashboard/admin/courses" className="flex items-center text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Courses
      </Link>
      
      <div className="space-y-2 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">AI Video Generation Pipeline</h1>
        <p className="text-muted-foreground">
          Enter a topic below. The LLM will generate a custom script, convert it to audio using TTS, and render the video instantly in your browser.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 overflow-hidden border-slate-800 shadow-xl flex flex-col">
          <CardHeader className="border-b pb-4 bg-muted/20">
            <CardTitle>Generator & Player</CardTitle>
            <CardDescription>Rendered dynamically via React components</CardDescription>
          </CardHeader>
          
          <CardContent className="p-6 space-y-6 flex-1 flex flex-col">
            <div className="flex gap-4">
              <Input 
                value={topic} 
                onChange={(e) => setTopic(e.target.value)} 
                placeholder="e.g. Next.js App Router" 
                className="flex-1"
                disabled={isGenerating}
              />
              <Button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlaySquare className="w-4 h-4 mr-2" />}
                Generate Video
              </Button>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}

            <div className="w-full aspect-video bg-black rounded-lg overflow-hidden flex flex-col items-center justify-center relative border border-slate-800">
              {isGenerating ? (
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                  <Loader2 className="w-10 h-10 animate-spin" />
                  <p>Calling AI APIs... this takes a few seconds</p>
                </div>
              ) : script ? (
                <Player
                  component={CourseVideoComposition}
                  inputProps={{ script, audioUrl }}
                  durationInFrames={totalFrames}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  fps={30}
                  style={{ width: '100%', height: '100%' }}
                  controls
                  autoPlay
                />
              ) : (
                <div className="text-muted-foreground">Enter a topic and click Generate</div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generated Script (LLM Output)</CardTitle>
              <CardDescription>The structured JSON output.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-md overflow-auto text-xs h-[400px]">
                {script ? JSON.stringify(script, null, 2) : 'No script generated yet.'}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
