'use client'

/**
 * Video room for ATS interviews (built-in LiveKit), adapted from the live
 * interview page. The caller supplies how to get a token: panel members use
 * their session, candidates their signed link. The video canvas is dark in
 * both themes, so light-on-dark text is fine inside it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track, type Participant, type TrackPublication } from 'livekit-client'
import { Loader2, Mic, MicOff, PhoneOff, VideoIcon, VideoOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LiveRoom({
  getToken,
  title,
  onLeave,
}: {
  getToken: () => Promise<{ token: string; url: string }>
  title: string
  onLeave: () => void
}) {
  const roomRef = useRef<Room | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [participants, setParticipants] = useState<Participant[]>([])

  const sync = useCallback((room: Room) => {
    setParticipants([room.localParticipant, ...Array.from(room.remoteParticipants.values())])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { token, url } = await getToken()
        if (cancelled) return
        const room = new Room({ adaptiveStream: true, dynacast: true })
        roomRef.current = room
        room.on(RoomEvent.Connected, () => { if (!cancelled) setConnected(true); sync(room) })
        room.on(RoomEvent.Disconnected, () => { if (!cancelled) setConnected(false) })
        for (const ev of [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected]) {
          room.on(ev, () => sync(room))
        }
        await room.connect(url, token)
        if (cancelled) { room.disconnect(); return }
        try {
          await room.localParticipant.setCameraEnabled(true)
          await room.localParticipant.setMicrophoneEnabled(true)
        } catch {
          setError('Allow camera and microphone access in your browser to be seen and heard.')
        }
        sync(room)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
      roomRef.current?.disconnect()
      roomRef.current = null
    }
  }, [getToken, sync])

  const toggleMic = async () => {
    const p = roomRef.current?.localParticipant
    if (!p) return
    await p.setMicrophoneEnabled(!micOn)
    setMicOn(!micOn)
  }
  const toggleCam = async () => {
    const p = roomRef.current?.localParticipant
    if (!p) return
    await p.setCameraEnabled(!camOn)
    setCamOn(!camOn)
  }
  const leave = () => {
    roomRef.current?.disconnect()
    onLeave()
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[420px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h1 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={micOn ? 'outline' : 'destructive'} onClick={toggleMic} disabled={!connected} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} aria-pressed={!micOn} className="h-10 w-10 p-0">
            {micOn ? <Mic className="h-4 w-4" aria-hidden /> : <MicOff className="h-4 w-4" aria-hidden />}
          </Button>
          <Button size="sm" variant={camOn ? 'outline' : 'destructive'} onClick={toggleCam} disabled={!connected} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} aria-pressed={!camOn} className="h-10 w-10 p-0">
            {camOn ? <VideoIcon className="h-4 w-4" aria-hidden /> : <VideoOff className="h-4 w-4" aria-hidden />}
          </Button>
          <Button size="sm" variant="destructive" onClick={leave} className="h-10 gap-1.5">
            <PhoneOff className="h-4 w-4" aria-hidden /> Leave
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="border-b border-border bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">{error}</p>}
      <div
        className="grid flex-1 gap-2 bg-neutral-950 p-2"
        style={{ gridTemplateColumns: participants.length <= 1 ? '1fr' : `repeat(${Math.min(participants.length, 2)}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}
      >
        {participants.map((p) => <Tile key={p.identity} participant={p} />)}
        {!connected && !participants.length && (
          <div className="flex items-center justify-center gap-2 text-sm text-neutral-300" role="status">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Connecting to the room…
          </div>
        )}
      </div>
    </div>
  )
}

function Tile({ participant }: { participant: Participant }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [video, setVideo] = useState<TrackPublication | null>(null)
  const [audio, setAudio] = useState<TrackPublication | null>(null)

  useEffect(() => {
    const pick = () => {
      setVideo(participant.getTrackPublication(Track.Source.Camera) ?? null)
      setAudio(participant.getTrackPublication(Track.Source.Microphone) ?? null)
    }
    pick()
    participant.on('trackPublished', pick)
    participant.on('trackUnpublished', pick)
    participant.on('trackSubscribed', pick)
    participant.on('localTrackPublished', pick)
    return () => {
      participant.off('trackPublished', pick)
      participant.off('trackUnpublished', pick)
      participant.off('trackSubscribed', pick)
      participant.off('localTrackPublished', pick)
    }
  }, [participant])

  useEffect(() => {
    const t = video?.track
    const el = videoRef.current
    if (t && el) { t.attach(el); return () => { t.detach(el) } }
  }, [video, video?.track])

  useEffect(() => {
    const t = audio?.track
    const el = audioRef.current
    if (t && el && !participant.isLocal) { t.attach(el); return () => { t.detach(el) } }
  }, [audio, audio?.track, participant.isLocal])

  const label = (participant.name || participant.identity).replace(/^(panel|candidate):.*/, 'Participant')
  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-neutral-900">
      <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted={participant.isLocal} />
      <audio ref={audioRef} autoPlay />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {label}{participant.isLocal ? ' (you)' : ''}
      </span>
    </div>
  )
}
