'use client'

/**
 * Mic button for a chat composer: asks once per tab for consent (what is
 * heard, where it goes, that nothing is stored), then toggles listening with
 * a visible recording indicator and a live region for screen readers.
 */
import { useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useT } from '@/lib/i18n/client'
import { LOCALE_META } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'
import type { useBrowserVoice } from './use-browser-voice'

const CONSENT_KEY = 'cs_voice_consent'

function hasConsent(): boolean {
  try { return window.sessionStorage.getItem(CONSENT_KEY) === '1' } catch { return false }
}
function saveConsent() {
  try { window.sessionStorage.setItem(CONSENT_KEY, '1') } catch { /* private mode: ask again next time */ }
}

export function VoiceInputButton({ voice, disabled, className }: { voice: ReturnType<typeof useBrowserVoice>; disabled?: boolean; className?: string }) {
  const { t, locale } = useT()
  const [asking, setAsking] = useState(false)
  if (!voice.supported) return null
  const toggle = () => {
    if (voice.listening) { voice.stop(); return }
    if (!hasConsent()) { setAsking(true); return }
    voice.start()
  }
  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        variant={voice.listening ? 'destructive' : 'outline'}
        onClick={toggle}
        disabled={disabled}
        aria-pressed={voice.listening}
        aria-label={voice.listening ? t('common.voiceStop') : t('common.voiceStart')}
        title={voice.listening ? t('common.voiceStop') : t('common.voiceStart')}
        className={cn('relative size-11 rounded-xl', className)}
      >
        {voice.listening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
        {voice.listening && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
          </span>
        )}
      </Button>
      <span className="sr-only" aria-live="assertive">{voice.listening ? t('common.voiceListening') : ''}</span>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.voiceConsentTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.voiceConsentBody', { language: LOCALE_META[locale].native })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { saveConsent(); setAsking(false); voice.start() }}>{t('common.voiceConsentAccept')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** "Listening…" strip with the live transcript, shown above the composer while the mic is open. */
export function VoiceListeningBar({ voice }: { voice: ReturnType<typeof useBrowserVoice> }) {
  const { t } = useT()
  if (!voice.listening && !voice.error) return null
  return (
    <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm" role="status">
      {voice.listening ? (
        <>
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none" aria-hidden />
          <span className="font-medium text-foreground">{t('common.voiceListening')}</span>
          <span className="min-w-0 truncate text-muted-foreground">{voice.interim}</span>
        </>
      ) : (
        <span className="text-destructive">{voice.error}</span>
      )}
    </div>
  )
}
