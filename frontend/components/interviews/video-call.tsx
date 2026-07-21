'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Video, VideoOff, Mic, MicOff, Phone, PhoneOff,
  Monitor, MessageCircle, Loader2,
} from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'

interface VideoCallProps {
  roomId: string
  userId: string
  role: 'interviewer' | 'candidate'
  onEnd?: () => void
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export function VideoCall({ roomId, userId, role, onEnd }: VideoCallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSignalRef = useRef<string>('')

  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [connected, setConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle')

  // Start local media
  useEffect(() => {
    let mounted = true
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        setLocalStream(stream)
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      })
      .catch(() => setStatus('failed'))
    return () => { mounted = false }
  }, [])

  // Create peer connection when local stream is ready
  useEffect(() => {
    if (!localStream) return

    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc

    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream)
    })

    // Handle remote stream
    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0]
      }
      setConnected(true)
      setStatus('connected')
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        csrfFetch('/api/webrtc/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: roomId,
            type: 'ice-candidate',
            payload: event.candidate.toJSON(),
          }),
        }).catch(() => null)
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') setStatus('failed')
      if (pc.connectionState === 'disconnected') setConnected(false)
    }

    return () => {
      pc.close()
      pcRef.current = null
    }
  }, [localStream, roomId])

  // Create offer (interviewer initiates)
  useEffect(() => {
    if (!pcRef.current || role !== 'interviewer') return
    setStatus('connecting')

    const createOffer = async () => {
      const pc = pcRef.current
      if (!pc) return

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await csrfFetch('/api/webrtc/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          type: 'offer',
          payload: offer,
        }),
      }).catch(() => null)
    }

    // Wait for local stream to be added before creating offer
    const timer = setTimeout(createOffer, 500)
    return () => clearTimeout(timer)
  }, [localStream, role, roomId])

  // Poll for signaling messages
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await csrfFetch(`/api/webrtc/signal?room_id=${roomId}&since=${lastSignalRef.current}`)
        const data = await res.json()
        if (!data.messages) return

        for (const msg of data.messages) {
          lastSignalRef.current = msg.created_at
          const pc = pcRef.current
          if (!pc) continue

          if (msg.type === 'offer' && role === 'candidate') {
            setStatus('connecting')
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await csrfFetch('/api/webrtc/signal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                room_id: roomId,
                type: 'answer',
                payload: answer,
              }),
            }).catch(() => null)
          } else if (msg.type === 'answer' && role === 'interviewer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload))
          } else if (msg.type === 'ice-candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload))
          }
        }
      } catch {} // polling errors are expected
    }

    pollRef.current = setInterval(poll, 1000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [roomId, role])

  const toggleMute = useCallback(() => {
    if (!localStream) return
    localStream.getAudioTracks().forEach(t => { t.enabled = isMuted })
    setIsMuted(!isMuted)
  }, [localStream, isMuted])

  const toggleVideo = useCallback(() => {
    if (!localStream) return
    localStream.getVideoTracks().forEach(t => { t.enabled = isVideoOff })
    setIsVideoOff(!isVideoOff)
  }, [localStream, isVideoOff])

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Revert to camera
      if (localStream && pcRef.current) {
        const videoTrack = localStream.getVideoTracks()[0]
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
        if (sender && videoTrack) sender.replaceTrack(videoTrack)
      }
      setIsScreenSharing(false)
      return
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const screenTrack = screenStream.getVideoTracks()[0]
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(screenTrack)
      }
      screenTrack.onended = () => {
        if (localStream && pcRef.current) {
          const videoTrack = localStream.getVideoTracks()[0]
          const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
          if (sender && videoTrack) sender.replaceTrack(videoTrack)
        }
        setIsScreenSharing(false)
      }
      setIsScreenSharing(true)
    } catch {} // user cancelled
  }, [isScreenSharing, localStream])

  const endCall = useCallback(() => {
    // Send leave signal
    csrfFetch('/api/webrtc/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, type: 'leave', payload: null }),
    }).catch(() => null)

    localStream?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    if (pollRef.current) clearInterval(pollRef.current)
    onEnd?.()
  }, [roomId, localStream, onEnd])

  return (
    <div className="flex flex-col gap-4">
      {/* Video Grid */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="relative overflow-hidden bg-black aspect-video">
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute bottom-2 left-2 text-xs text-white bg-black/50 px-2 py-1 rounded">
            You ({role})
          </div>
          {isVideoOff && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <VideoOff className="h-12 w-12 text-white/50" />
            </div>
          )}
        </Card>
        <Card className="relative overflow-hidden bg-black aspect-video">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-2 left-2 text-xs text-white bg-black/50 px-2 py-1 rounded">
            {role === 'interviewer' ? 'Candidate' : 'Interviewer'}
          </div>
          {!connected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center text-white/70">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p className="text-sm">Waiting for peer...</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant={isMuted ? 'destructive' : 'outline'}
          size="icon"
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button
          variant={isVideoOff ? 'destructive' : 'outline'}
          size="icon"
          onClick={toggleVideo}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
        </Button>
        <Button
          variant={isScreenSharing ? 'default' : 'outline'}
          size="icon"
          onClick={toggleScreenShare}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          <Monitor className="h-4 w-4" />
        </Button>
        <Button variant="destructive" size="icon" onClick={endCall} title="End call">
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>

      {/* Status */}
      <div className="text-center text-xs text-muted-foreground">
        {status === 'connected' && 'Connected'}
        {status === 'connecting' && 'Connecting...'}
        {status === 'failed' && 'Connection failed. Try refreshing.'}
        {status === 'idle' && 'Initializing...'}
      </div>
    </div>
  )
}
