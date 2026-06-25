'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mic, Sliders, AlertCircle, CheckCircle, Copy } from 'lucide-react'

interface AudioCameraSettingsProps {
  onContinue?: () => void
  onBack?: () => void
}

interface MediaDevice {
  kind: 'audioinput' | 'videoinput' | 'audiooutput'
  deviceId: string
  label: string
}

interface PermissionStatus {
  microphone: 'granted' | 'denied' | 'prompt' | 'unknown'
  camera: 'granted' | 'denied' | 'prompt' | 'unknown'
  sound: 'granted' | 'denied' | 'prompt' | 'unknown'
}

export function AudioCameraSettings({ onContinue, onBack }: AudioCameraSettingsProps) {
  const [permissions, setPermissions] = useState<PermissionStatus>({
    microphone: 'unknown',
    camera: 'unknown',
    sound: 'unknown',
  })
  const [devices, setDevices] = useState({
    microphone: [] as MediaDevice[],
    camera: [] as MediaDevice[],
    speaker: [] as MediaDevice[],
  })
  const [selectedDevices, setSelectedDevices] = useState({
    microphone: '',
    camera: '',
    speaker: '',
  })
  const [videoPreview, setVideoPreview] = useState<string>('')
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false)

  useEffect(() => {
    checkPermissions()
    enumerateDevices()
  }, [])

  const checkPermissions = async () => {
    try {
      const micResult = await navigator.permissions.query({ name: 'microphone' as any })
      const cameraResult = await navigator.permissions.query({ name: 'camera' as any })

      setPermissions({
        microphone: micResult.state as any,
        camera: cameraResult.state as any,
        sound: 'unknown',
      })
    } catch (err) {
      console.log('Permission check not fully supported')
    }
  }

  const enumerateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const grouped = {
        microphone: [] as MediaDevice[],
        camera: [] as MediaDevice[],
        speaker: [] as MediaDevice[],
      }

      devices.forEach((device) => {
        if (device.kind === 'audioinput') {
          grouped.microphone.push({
            kind: device.kind,
            deviceId: device.deviceId,
            label: device.label || `Microphone ${grouped.microphone.length + 1}`,
          })
        } else if (device.kind === 'videoinput') {
          grouped.camera.push({
            kind: device.kind,
            deviceId: device.deviceId,
            label: device.label || `Camera ${grouped.camera.length + 1}`,
          })
        } else if (device.kind === 'audiooutput') {
          grouped.speaker.push({
            kind: device.kind,
            deviceId: device.deviceId,
            label: device.label || `Speaker ${grouped.speaker.length + 1}`,
          })
        }
      })

      setDevices(grouped)
      if (grouped.microphone.length > 0) setSelectedDevices((d) => ({ ...d, microphone: grouped.microphone[0].deviceId }))
      if (grouped.camera.length > 0) setSelectedDevices((d) => ({ ...d, camera: grouped.camera[0].deviceId }))
      if (grouped.speaker.length > 0) setSelectedDevices((d) => ({ ...d, speaker: grouped.speaker[0].deviceId }))
    } catch (err) {
      console.error('Error enumerating devices:', err)
    }
  }

  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedDevices.microphone ? { exact: selectedDevices.microphone } : undefined },
        video: { deviceId: selectedDevices.camera ? { exact: selectedDevices.camera } : undefined },
      })

      // Start camera preview
      const videoElement = document.getElementById('camera-preview') as HTMLVideoElement
      if (videoElement) {
        videoElement.srcObject = stream
        setVideoPreview('active')
      }

      setPermissions({
        ...permissions,
        microphone: 'granted',
        camera: 'granted',
      })

      return stream
    } catch (err) {
      console.error('Permission error:', err)
      setPermissions({
        ...permissions,
        microphone: 'denied',
        camera: 'denied',
      })
    }
  }

  const testSpeaker = () => {
    setIsTestingSpeaker(true)
    // Play a test tone
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 1000
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)

    setTimeout(() => setIsTestingSpeaker(false), 500)
  }

  const getStatusBadge = (status: string) => {
    if (status === 'granted') {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Access Granted</Badge>
    }
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">Access Required</Badge>
  }

  return (
    <Card className="w-full max-w-2xl mx-auto p-8">
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sliders className="w-6 h-6" />
            Audio & Camera Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            You must enable camera and microphone access before joining the AI interview.
          </p>
        </div>

        {/* Camera Preview */}
        {permissions.camera === 'granted' && (
          <div className="rounded-lg overflow-hidden bg-black aspect-video">
            <video
              id="camera-preview"
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {permissions.camera !== 'granted' && (
          <div className="rounded-lg bg-muted flex items-center justify-center aspect-video">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Camera Access Required</p>
              <p className="text-xs text-muted-foreground mt-1">
                You must enable camera access before joining the interview.
              </p>
            </div>
          </div>
        )}

        {/* Device Selection */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Microphone */}
          <div className="space-y-3">
            <label className="block">
              <p className="font-medium text-foreground mb-2 flex items-center gap-2">
                <Mic className="w-4 h-4" />
                Microphone
              </p>
              <select
                value={selectedDevices.microphone}
                onChange={(e) => setSelectedDevices({ ...selectedDevices, microphone: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground"
              >
                {devices.microphone.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
            {getStatusBadge(permissions.microphone)}
          </div>

          {/* Camera */}
          <div className="space-y-3">
            <label className="block">
              <p className="font-medium text-foreground mb-2 flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                Camera
              </p>
              <select
                value={selectedDevices.camera}
                onChange={(e) => setSelectedDevices({ ...selectedDevices, camera: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground"
              >
                {devices.camera.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
            {getStatusBadge(permissions.camera)}
          </div>
        </div>

        {/* Speaker Test */}
        <div className="p-4 bg-muted rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Test Speaker</p>
              <p className="text-sm text-muted-foreground">Click to test your speaker volume</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={testSpeaker}
              disabled={isTestingSpeaker}
            >
              {isTestingSpeaker ? 'Testing...' : 'Test Speakers'}
            </Button>
          </div>
        </div>

        {/* Permission Summary */}
        <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
          <p className="font-medium text-foreground text-sm">Permission Status</p>
          <div className="space-y-2">
            {['Microphone', 'Sound', 'Camera'].map((item) => (
              <div key={item} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item}</span>
                {permissions[item.toLowerCase() as keyof PermissionStatus] === 'granted' ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button
            onClick={() => {
              requestPermissions().then(() => onContinue?.())
            }}
            className="flex-1"
          >
            Start Interview
          </Button>
        </div>
      </div>
    </Card>
  )
}
