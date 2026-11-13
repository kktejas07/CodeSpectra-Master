'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, HelpCircle, KeyRound, Plug, ShieldAlert } from 'lucide-react'
import { Github } from '@/components/ui/brand-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GitHubIntegrationSetup } from '@/components/integrations/github-setup-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { useAdminT } from '@/lib/i18n/admin'

type SecretsMap = Record<string, string | null | boolean>

// ─── ATS key dialog (Greenhouse / Lever) ─────────────────────────────────────

function ApiKeyDialog({
  open, onOpenChange, title, description, placeholder, userIdLabel, userIdHelp, onSave, saving,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  placeholder: string
  /** Label for the ATS user the push is recorded against (both ATS APIs require one for writes). */
  userIdLabel: string
  userIdHelp: string
  onSave: (key: string, userId: string) => void
  saving: boolean
}) {
  const { t } = useAdminT()
  const [value, setValue] = useState('')
  const [userId, setUserId] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="ats-api-key">{t('atsInt.apiKey')}</Label>
          <Input
            id="ats-api-key"
            type="password"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
          <Label htmlFor="ats-user-id">{userIdLabel}</Label>
          <Input
            id="ats-user-id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            autoComplete="off"
            aria-describedby="ats-user-id-help"
          />
          <p id="ats-user-id-help" className="text-xs text-muted-foreground">{userIdHelp}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={!value.trim() || !userId.trim() || saving} onClick={() => onSave(value.trim(), userId.trim())}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Workday dialog ───────────────────────────────────────────────────────────

function WorkdayDialog({
  open, onOpenChange, onSave, saving,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSave: (url: string, secret: string) => void
  saving: boolean
}) {
  const { t } = useAdminT()
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('atsInt.connectWorkday')}</DialogTitle>
          <DialogDescription>
            {t('atsInt.workdayHelp')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="wd-url">{t('atsInt.webhookUrl')}</Label>
            <Input
              id="wd-url"
              type="url"
              placeholder="https://wd2.myworkday.com/…/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wd-secret">{t('atsInt.signingSecret')} <span className="text-muted-foreground font-normal">{t('atsInt.optional')}</span></Label>
            <Input
              id="wd-secret"
              type="password"
              placeholder={t('atsInt.signingSecretPlaceholder')}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={!url.trim() || saving} onClick={() => onSave(url.trim(), secret.trim())}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const gate = usePageGuard('superadmin')
  const { t } = useAdminT()
  const addToast = useToast()
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [greenhouseDialogOpen, setGreenhouseDialogOpen] = useState(false)
  const [leverDialogOpen, setLeverDialogOpen] = useState(false)
  const [workdayDialogOpen, setWorkdayDialogOpen] = useState(false)
  const [secrets, setSecrets] = useState<SecretsMap | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!gate.ready) return
    setLoadError(null)
    fetch('/api/admin/server-secrets', { credentials: 'include' })
      .then(async r => {
        const json = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`)
        setSecrets(json.secrets || {})
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Request failed'))
  }, [gate.ready, reloadKey])

  if (!gate.ready) return null

  const refreshSecrets = async () => {
    const r = await fetch('/api/admin/server-secrets', { credentials: 'include' })
    const json = await r.json().catch(() => ({}))
    setSecrets(json.secrets || {})
  }

  const saveSecrets = async (patch: Record<string, string | null>, toastMsg: string, provider: string) => {
    setSaving(provider)
    try {
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('Failed to save')
      addToast({ type: 'success', title: toastMsg })
      await refreshSecrets()
    } catch {
      addToast({ type: 'error', title: `Failed to update ${provider}` })
    } finally {
      setSaving(null)
    }
  }

  const disconnect = async (patch: Record<string, null>, provider: string) => {
    setDisconnecting(provider)
    try {
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('Failed')
      addToast({ type: 'success', title: `${provider} disconnected` })
      await refreshSecrets()
    } catch {
      addToast({ type: 'error', title: `Failed to disconnect ${provider}` })
    } finally {
      setDisconnecting(null)
    }
  }

  const githubConnected = secrets?.['has_github_app_token'] === true
  const greenhouseConnected = secrets?.['has_greenhouse_api_key'] === true
  const leverConnected = secrets?.['has_lever_api_key'] === true
  const workdayConnected = Boolean(secrets?.['workday_webhook_url'])

  const IntegrationCard = ({
    name, icon, description, connected, onConnect, onDisconnect, disconnectKeys,
    disableConnect,
  }: {
    name: string
    icon: React.ReactNode
    description: string
    connected: boolean
    onConnect: () => void
    onDisconnect: () => void
    disconnectKeys: Record<string, null>
    disableConnect?: boolean
  }) => (
    <Panel>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">{name}</h3>
              <Badge
                variant={connected ? 'default' : 'secondary'}
                className="text-xs"
              >
                {secrets === null
                  ? (loadError ? 'Unknown' : 'Checking…')
                  : connected
                    ? 'Connected'
                    : 'Not connected'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected ? (
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={onDisconnect}
              disabled={disconnecting === name}
            >
              <KeyRound className="h-4 w-4" />
              {disconnecting === name ? 'Removing…' : 'Disconnect'}
            </Button>
          ) : (
            <Button
              className="gap-2"
              onClick={onConnect}
              disabled={secrets === null || disableConnect}
            >
              <Plug className="h-4 w-4" />
              Connect
            </Button>
          )}
        </div>
      </div>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="integrations"
        title={
          <>
            Integrations
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label="About integrations" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">Connect outside services if you need them. The scanner, interviews and dashboards are built in and need no plugins.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description="Optional connections to outside services."
        icon={<Plug />}
      />

      {githubConnected && (
        <Panel className="border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">A GitHub token is saved on the server</p>
              <p className="text-sm text-muted-foreground">
                A GitHub personal access token is configured. Disconnect below to remove it if the token is no longer valid.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {loadError && (
        <Panel role="alert" className="flex flex-wrap items-center justify-between gap-3 border-destructive/40 p-4">
          <p className="text-sm text-destructive">Couldn&apos;t check which services are connected: {loadError}</p>
          <Button variant="outline" size="sm" onClick={() => setReloadKey(k => k + 1)}>Try again</Button>
        </Panel>
      )}

      <Section title={t('atsInt.devTools')}>
        <div className="space-y-4">
          <IntegrationCard
            name="GitHub"
            icon={<Github className="h-6 w-6" />}
            description={t('atsInt.githubDesc')}
            connected={githubConnected}
            onConnect={() => setGithubDialogOpen(true)}
            onDisconnect={() => disconnect({ github_app_token: null }, 'GitHub')}
            disconnectKeys={{ github_app_token: null }}
          />
        </div>
      </Section>

      <Section
        title={t('atsInt.sectionTitle')}
        description={t('atsInt.sectionDesc')}
      >
        <div className="space-y-4">
          <IntegrationCard
            name="Greenhouse"
            icon={
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
              </svg>
            }
            description={t('atsInt.greenhouseDesc')}
            connected={greenhouseConnected}
            onConnect={() => setGreenhouseDialogOpen(true)}
            onDisconnect={() => disconnect({ greenhouse_api_key: null, greenhouse_user_id: null }, 'Greenhouse')}
            disconnectKeys={{ greenhouse_api_key: null, greenhouse_user_id: null }}
          />

          <IntegrationCard
            name="Lever"
            icon={
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden>
                <path d="M20 6h-2.18c.07-.44.18-.86.18-1a3 3 0 0 0-6 0c0 .14.11.56.18 1H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8-2a1 1 0 0 1 2 0c0 .14-.16.79-.25 1h-1.5C12.16 4.79 12 4.14 12 4zm8 16H4V8h16v12z" />
              </svg>
            }
            description={t('atsInt.leverDesc')}
            connected={leverConnected}
            onConnect={() => setLeverDialogOpen(true)}
            onDisconnect={() => disconnect({ lever_api_key: null, lever_user_id: null }, 'Lever')}
            disconnectKeys={{ lever_api_key: null, lever_user_id: null }}
          />

          <IntegrationCard
            name="Workday"
            icon={
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden>
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-6h2zm0-8h-2V7h2z" />
              </svg>
            }
            description={t('atsInt.workdayDesc')}
            connected={workdayConnected}
            onConnect={() => setWorkdayDialogOpen(true)}
            onDisconnect={() => disconnect({ workday_webhook_url: null, workday_webhook_secret: null }, 'Workday')}
            disconnectKeys={{ workday_webhook_url: null, workday_webhook_secret: null }}
          />
        </div>

        {(greenhouseConnected || leverConnected || workdayConnected) && (
          <Panel className="mt-4 border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">{t('atsInt.readyTitle')}</p>
                <p className="text-muted-foreground">
                  {t('atsInt.readyBody', { providers: [
                    greenhouseConnected && 'Greenhouse',
                    leverConnected && 'Lever',
                    workdayConnected && 'Workday',
                  ].filter(Boolean).join(', ') })}
                </p>
              </div>
            </div>
          </Panel>
        )}
      </Section>

      {/* Dialogs */}
      <GitHubIntegrationSetup
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        onConfirm={async (token) => {
          await saveSecrets({ github_app_token: token }, 'GitHub connected', 'GitHub')
          setGithubDialogOpen(false)
        }}
      />

      <ApiKeyDialog
        open={greenhouseDialogOpen}
        onOpenChange={setGreenhouseDialogOpen}
        title={t('atsInt.connectGreenhouse')}
        description={t('atsInt.greenhouseKeyHelp')}
        placeholder="••••••••••••••••••••••••••"
        saving={saving === 'Greenhouse'}
        userIdLabel={t('atsInt.greenhouseUserId')}
        userIdHelp={t('atsInt.greenhouseUserIdHelp')}
        onSave={async (key, userId) => {
          await saveSecrets({ greenhouse_api_key: key, greenhouse_user_id: userId }, 'Greenhouse connected', 'Greenhouse')
          setGreenhouseDialogOpen(false)
        }}
      />

      <ApiKeyDialog
        open={leverDialogOpen}
        onOpenChange={setLeverDialogOpen}
        title={t('atsInt.connectLever')}
        description={t('atsInt.leverKeyHelp')}
        placeholder="••••••••••••••••••••••••••"
        saving={saving === 'Lever'}
        userIdLabel={t('atsInt.leverUserId')}
        userIdHelp={t('atsInt.leverUserIdHelp')}
        onSave={async (key, userId) => {
          await saveSecrets({ lever_api_key: key, lever_user_id: userId }, 'Lever connected', 'Lever')
          setLeverDialogOpen(false)
        }}
      />

      <WorkdayDialog
        open={workdayDialogOpen}
        onOpenChange={setWorkdayDialogOpen}
        saving={saving === 'Workday'}
        onSave={async (url, secret) => {
          await saveSecrets(
            { workday_webhook_url: url, ...(secret ? { workday_webhook_secret: secret } : {}) },
            'Workday connected',
            'Workday',
          )
          setWorkdayDialogOpen(false)
        }}
      />
    </div>
  )
}
