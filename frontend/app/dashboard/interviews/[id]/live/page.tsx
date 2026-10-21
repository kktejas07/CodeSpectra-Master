'use client'
import { csrfFetch } from '@/lib/csrf-fetch'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Room, RoomEvent, Track, type Participant, type TrackPublication } from 'livekit-client'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'
import { ArrowLeft, Mic, MicOff, VideoIcon, VideoOff } from 'lucide-react'
import Link from 'next/link'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'

export default function LiveInterviewPage() {
  const apiError = useApiError()
  const { t } = useT()
  const gate = usePageGuard('user')
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const roomRef = useRef<Room | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [participants, setParticipants] = useState<Participant[]>([])

  const syncParticipants = useCallback((room: Room) => {
    const list = [room.localParticipant, ...Array.from(room.remoteParticipants.values())]
    setParticipants([...list])
  }, [])

  useEffect(() => {
    let cancelled = false

    async function join() {
      try {
        const authRes = await fetch('/api/auth/session', { credentials: 'include' })
        const authJson = await authRes.json().catch(() => ({}))
        const userId = authJson?.user?.id || authJson?.uid || 'anonymous'
        const userName = authJson?.user?.name || authJson?.user?.fullName || undefined

        const res = await csrfFetch(`/api/interviews/${id}/live/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ identity: userId, name: userName }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(apiError(json, t('career.failedToGetToken')))
        }
        const { token, url } = await res.json()
        if (cancelled) return

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        })
        roomRef.current = room

        room.on(RoomEvent.Connected, () => {
          if (!cancelled) setConnected(true)
          syncParticipants(room)
        })
        room.on(RoomEvent.TrackSubscribed, () => syncParticipants(room))
        room.on(RoomEvent.TrackUnsubscribed, () => syncParticipants(room))
        room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room))
        room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room))

        await room.connect(url, token)
        if (cancelled) { room.disconnect(); return }

        await room.localParticipant.setCameraEnabled(true)
        await room.localParticipant.setMicrophoneEnabled(true)
        syncParticipants(room)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }

    void join()
    return () => {
      cancelled = true
      roomRef.current?.disconnect()
      roomRef.current = null
    }
  }, [id, syncParticipants])

  const toggleMic = async () => {
    const p = roomRef.current?.localParticipant
    if (!p) return
    const enabled = !micOn
    await p.setMicrophoneEnabled(enabled)
    setMicOn(enabled)
  }

  const toggleCam = async () => {
    const p = roomRef.current?.localParticipant
    if (!p) return
    const enabled = !camOn
    await p.setCameraEnabled(enabled)
    setCamOn(enabled)
  }

  const leave = () => {
    roomRef.current?.disconnect()
    router.back()
  }

  if (!gate.ready) return null

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[60vh]">
        <p className="text-destructive text-sm max-w-md text-center">{error}</p>
        {error.includes('unreachable') && (
          <p className="text-muted-foreground text-xs">{t('career.theVideoServiceIsntReachableRight36b')}</p>
        )}
        <Link href={`/dashboard/interviews/${id}`} className="text-sm text-primary hover:underline">{t('career.backToInterview')}</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-card">
        <Link href={`/dashboard/interviews/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" />{' '}{t('common.back')}</Link>
        <h1 className="text-sm font-medium text-foreground">{t('career.interviewLiveRoom')}</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={micOn ? 'default' : 'destructive'} onClick={toggleMic} aria-label={micOn ? t('career.muteMicrophone') : t('career.unmuteMicrophone')} aria-pressed={!micOn}>
            {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant={camOn ? 'default' : 'destructive'} onClick={toggleCam} aria-label={camOn ? t('career.turnCameraOff') : t('career.turnCameraOn')} aria-pressed={!camOn}>
            {camOn ? <VideoIcon className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={leave}>{t('career.leave')}</Button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 grid gap-2 p-2" style={{
        gridTemplateColumns: participants.length <= 1 ? '1fr' : `repeat(${Math.min(participants.length, 2)}, 1fr)`,
        gridAutoRows: '1fr',
      }}>
        {participants.map((p) => (
          <ParticipantTile key={p.identity} participant={p} />
        ))}
        {!connected && participants.length === 0 && (
          <div className="flex items-center justify-center text-muted-foreground text-sm">{t('career.connectingToRoom')}</div>
        )}
      </div>
    </div>
  )
}

function ParticipantTile({ participant }: { participant: Participant }) {
  const { t } = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [videoTrack, setVideoTrack] = useState<TrackPublication | null>(null)
  const [audioTrack, setAudioTrack] = useState<TrackPublication | null>(null)

  useEffect(() => {
    const onPub = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) setVideoTrack(pub)
      if (pub.source === Track.Source.Microphone) setAudioTrack(pub)
    }
    const onUnsub = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) setVideoTrack(null)
      if (pub.source === Track.Source.Microphone) setAudioTrack(null)
    }

    const existingVideo = participant.getTrackPublication(Track.Source.Camera)
    const existingAudio = participant.getTrackPublication(Track.Source.Microphone)
    if (existingVideo) setVideoTrack(existingVideo)
    if (existingAudio) setAudioTrack(existingAudio)

    participant.on('trackPublished', onPub)
    participant.on('trackUnpublished', onUnsub)
    return () => {
      participant.off('trackPublished', onPub)
      participant.off('trackUnpublished', onUnsub)
    }
  }, [participant])

  useEffect(() => {
    const track = videoTrack?.track
    if (videoRef.current && track) {
      track.attach(videoRef.current)
      return () => { track.detach(videoRef.current!) }
    }
  }, [videoTrack])

  useEffect(() => {
    const track = audioTrack?.track
    if (audioRef.current && track) {
      track.attach(audioRef.current)
      return () => { track.detach(audioRef.current!) }
    }
  }, [audioTrack])

  return (
    <div className="relative rounded-2xl overflow-hidden bg-neutral-900 flex items-center justify-center">
      <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted={participant.isLocal} />
      <audio ref={audioRef} autoPlay />
      <span className="absolute bottom-2 left-2 text-xs bg-black/60 text-white px-2 py-0.5 rounded">
        {participant.name || participant.identity}{participant.isLocal ? t('career.you') : ''}
      </span>
    </div>
  )
}
