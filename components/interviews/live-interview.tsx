'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Mic, MicOff, Video, VideoOff, Copy, Volume2, RotateCcw, X } from 'lucide-react'

interface LiveInterviewProps {
  roleId: string
  interviewType: 'technical' | 'behavioral' | 'system-design'
  onEndInterview?: () => void
}

const MOCK_QUESTIONS = [
  {
    id: 1,
    question: 'Great to meet you. I\'ve had a chance to look through your background before we got on — looks like you\'ve been building some really interesting projects with React and modern frontend tech. I\'m an AI Technical Recruiter and I\'ll be running your mock screening today for the Frontend Engineer role. Here\'s what we\'ll cover today: We\'ll start with a quick check on your experience and background,',
    category: 'Introduction',
    duration: 45,
  },
  {
    id: 2,
    question: 'Tell me about a challenging project you worked on recently and how you solved a complex problem.',
    category: 'Technical',
    duration: 60,
  },
  {
    id: 3,
    question: 'How do you handle performance optimization in React applications?',
    category: 'Technical',
    duration: 90,
  },
]

export function LiveInterview({ roleId, interviewType, onEndInterview }: LiveInterviewProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(30 * 60) // 30 minutes
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [userResponse, setUserResponse] = useState('')
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const question = MOCK_QUESTIONS[currentQuestion]

  return (
    <div className="min-h-screen bg-black text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold">Technical Screen Mock Interview</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">{formatTime(timeRemaining)}</span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={onEndInterview}
            className="gap-2"
          >
            <X className="w-4 h-4" />
            End Interview
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interview Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Interviewer Video */}
          <div className="aspect-video bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg overflow-hidden relative">
            <video
              className="w-full h-full object-cover"
              autoPlay
              playsInline
            />
            {/* AI Avatar Placeholder */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-4xl mb-4">
                🤖
              </div>
              <p className="text-white/60 text-center px-4">AI Interviewer</p>
            </div>

            {/* Video Level Indicator */}
            <div className="absolute bottom-4 right-4 bg-black/70 px-3 py-2 rounded flex items-center gap-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`w-1 h-3 rounded-full transition-all ${
                      i <= 3 ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Question Display */}
          <Card className="p-6 bg-slate-900 border-slate-700">
            <div className="flex items-start justify-between mb-4">
              <div>
                <Badge variant="outline" className="bg-blue-500/20 border-blue-500/50 text-blue-300 mb-2">
                  {question.category}
                </Badge>
                <h3 className="text-lg font-semibold text-white">Question {currentQuestion + 1} of {MOCK_QUESTIONS.length}</h3>
              </div>
              <Badge variant="outline" className="bg-orange-500/20 border-orange-500/50 text-orange-300">
                {question.duration}s to respond
              </Badge>
            </div>
            <p className="text-white/80 leading-relaxed italic">"{question.question}"</p>
          </Card>

          {/* Response Area */}
          <Card className="p-6 bg-slate-900 border-slate-700">
            <label className="block mb-3">
              <p className="text-sm font-medium text-white mb-2">Your Response</p>
              <Textarea
                value={userResponse}
                onChange={(e) => setUserResponse(e.target.value)}
                placeholder="Speak naturally or type your response here..."
                className="bg-slate-800 border-slate-700 text-white placeholder-white/40"
                rows={4}
              />
            </label>
            <div className="flex gap-2 text-xs text-white/60">
              <Copy className="w-4 h-4" />
              <span>Hint: The AI is listening to your microphone</span>
            </div>
          </Card>

          {/* Navigation */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={currentQuestion === 0}
              onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
              className="flex-1"
            >
              Previous Question
            </Button>
            <Button
              className="flex-1"
              onClick={() => setCurrentQuestion(Math.min(MOCK_QUESTIONS.length - 1, currentQuestion + 1))}
              disabled={currentQuestion === MOCK_QUESTIONS.length - 1}
            >
              {currentQuestion === MOCK_QUESTIONS.length - 1 ? 'Finish Interview' : 'Next Question'}
            </Button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* User Video */}
          <Card className="p-4 bg-slate-900 border-slate-700 overflow-hidden">
            <p className="text-sm font-medium text-white mb-3">Your Video</p>
            <div className="aspect-square bg-slate-800 rounded-lg flex items-center justify-center relative">
              <video
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {isVideoOff && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                  <VideoOff className="w-8 h-8 text-white/40" />
                </div>
              )}
            </div>
          </Card>

          {/* Controls */}
          <Card className="p-4 bg-slate-900 border-slate-700">
            <p className="text-sm font-medium text-white mb-3">Interview Controls</p>
            <div className="flex gap-2">
              <Button
                variant={isMuted ? 'destructive' : 'outline'}
                size="lg"
                className="flex-1 gap-2"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    Muted
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    Mute
                  </>
                )}
              </Button>
              <Button
                variant={isVideoOff ? 'destructive' : 'outline'}
                size="lg"
                className="flex-1 gap-2"
                onClick={() => setIsVideoOff(!isVideoOff)}
              >
                {isVideoOff ? (
                  <>
                    <VideoOff className="w-4 h-4" />
                    Off
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    On
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Recording Status */}
          <Card className="p-4 bg-slate-900 border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <p className="text-sm font-medium text-white">Recording</p>
            </div>
            <p className="text-xs text-white/60">Your interview is being recorded for playback and analysis.</p>
          </Card>

          {/* Test Audio */}
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              // Play test tone
              const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
              const osc = audioContext.createOscillator()
              const gain = audioContext.createGain()
              osc.connect(gain)
              gain.connect(audioContext.destination)
              osc.frequency.value = 1000
              gain.gain.setValueAtTime(0.1, audioContext.currentTime)
              gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
              osc.start(audioContext.currentTime)
              osc.stop(audioContext.currentTime + 0.2)
            }}
          >
            <Volume2 className="w-4 h-4" />
            Test Audio
          </Button>
        </div>
      </div>
    </div>
  )
}
