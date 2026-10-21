'use client'

/**
 * Hiring settings → Background checks: India vendor connections (IDfy,
 * AuthBridge) and the shared "Test connection" button. Keys are write-only
 * (the API returns "is set" flags); both vendors are off until an admin turns
 * them on.
 */
import { useState } from 'react'
import { CheckCircle2, Loader2, PlugZap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Panel, Section } from '@/components/app/page-kit'
import { Field, InlineError, NativeSelect } from '@/components/hiring/ui'
import { atsSend, errorMessage } from '@/components/hiring/lib/api'
import { CHECK_LABEL } from '@/lib/ats/bgv/catalog'
import type { AuthBridgeSettings, IdfySettings } from '@/lib/ats/bgv/types'
import type { BgvCheckType } from '@/lib/ats/contract'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

export interface VendorSettingsData {
  idfy_webhook_url: string | null
  authbridge_webhook_url: string
  idfy_meta: { task_keys: string[]; default_tasks: Record<string, string>; webhook_ips: string[] }
  authbridge_checks: BgvCheckType[]
}

interface Props {
  idfy: IdfySettings
  authbridge: AuthBridgeSettings
  keys: Record<string, boolean>
  data: VendorSettingsData
  manage: boolean
  busy: string | null
  err: Record<string, string | null>
  tenantQuery: string
  onChange: (patch: { idfy?: IdfySettings; authbridge?: AuthBridgeSettings }) => void
  save: (key: string, body: Record<string, unknown>, okText: string) => Promise<boolean>
}

const TASK_LABELS = (t: Translator): Record<string, string> => ({
  pan: 'PAN',
  'identity.driving_licence': t('hiring.identityDrivingLicence'),
  'identity.voter_id': t('hiring.identityVoterId'),
  'identity.passport': t('hiring.identityPassport'),
  uan_epfo: t('hiring.uanEpfoServiceHistory'),
  court_record: t('hiring.courtRecord'),
})

const ENV_OPTIONS = (t: Translator) => ([{ value: 'sandbox', label: t('hiring.sandbox') }, { value: 'production', label: t('hiring.production') }])

const list = (v: string[]) => v.join(', ')
const unlist = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)

export function TestConnection({ vendor, tenantQuery, disabled }: { vendor: string; tenantQuery: string; disabled?: boolean }) {
  const { t } = useT()
  const [state, setState] = useState<{ busy: boolean; result: { ok: boolean; message: string } | null; error: string | null }>({ busy: false, result: null, error: null })
  async function run() {
    setState({ busy: true, result: null, error: null })
    try {
      const r = await atsSend<{ ok: boolean; message: string }>(`/api/ats/bgv/settings/test${tenantQuery}`, 'POST', { vendor })
      setState({ busy: false, result: r, error: null })
    } catch (e) {
      setState({ busy: false, result: null, error: errorMessage(e) })
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" className="min-h-11" disabled={disabled || state.busy} onClick={() => void run()}>
        {state.busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />}{' '}{t('hiring.testConnection')}</Button>
      <span role="status" aria-live="polite" className="text-sm">
        {state.result && <span className={state.result.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>{state.result.message}</span>}
        {state.error && <span className="text-red-700 dark:text-red-400">{state.error}</span>}
      </span>
    </div>
  )
}

function KeyBadge({ set, on, off }: { set: boolean; on: string; off: string }) {
  return <Badge variant={set ? 'success' : 'outline'}>{set ? <><CheckCircle2 aria-hidden /> {on}</> : off}</Badge>
}

function Toggle({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input id={id} type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function IndiaVendorSettings({ idfy, authbridge: ab, keys, data, manage, busy, err, tenantQuery, onChange, save }: Props) {
  const { t: tr } = useT()
  const [ik, setIk] = useState({ idfy_account_id: '', idfy_api_key: '' })
  const [ak, setAk] = useState({ authbridge_client_id: '', authbridge_client_secret: '', authbridge_api_key: '', authbridge_webhook_secret: '' })
  const filled = <T extends Record<string, string>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim()))
  const setI = (p: Partial<IdfySettings>) => onChange({ idfy: { ...idfy, ...p } })
  const setA = (p: Partial<AuthBridgeSettings>) => onChange({ authbridge: { ...ab, ...p } })
  const setMap = (p: Partial<AuthBridgeSettings['mapping']>) => setA({ mapping: { ...ab.mapping, ...p } })
  const saveBtn = (key: string, onClick: () => void, label = 'Save') => manage && (
    <Button className="min-h-11" disabled={!!busy} onClick={onClick}>{busy === key && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} {label}</Button>
  )

  return (
    <>
      <Section title={tr('hiring.vendorIdfyIndia')} description={tr('hiring.checksPanDrivingLicenceVoterIdc9a')}>
        <Panel className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={idfy.enabled ? 'success' : 'outline'}>{idfy.enabled ? tr('hiring.on') : tr('hiring.off')}</Badge>
            <KeyBadge set={!!keys.idfy_account_id && !!keys.idfy_api_key} on="Account ID and API key set" off="No credentials" />
            <KeyBadge set={!!keys.idfy_webhook_token} on="Callback token set" off="No callback token yet" />
          </div>
          <Toggle id="idfy-on" label={tr('hiring.useIdfyForIndiaBackgroundChecks6ba')} checked={idfy.enabled} disabled={!manage} onChange={(v) => setI({ enabled: v })} />
          {manage && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr('hiring.idfyAccountId')} htmlFor="idfy-acc" hint={tr('hiring.leaveEmptyToKeepTheCurrent0ce')}><Input id="idfy-acc" type="password" autoComplete="off" className="h-11" value={ik.idfy_account_id} onChange={(e) => setIk({ ...ik, idfy_account_id: e.target.value })} /></Field>
              <Field label={tr('hiring.idfyApiKey')} htmlFor="idfy-key" hint={tr('hiring.idfyIssuesSeparateAccountsForSandboxca0')}><Input id="idfy-key" type="password" autoComplete="off" className="h-11" value={ik.idfy_api_key} onChange={(e) => setIk({ ...ik, idfy_api_key: e.target.value })} /></Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tr('hiring.environment')} htmlFor="idfy-env"><NativeSelect id="idfy-env" className="h-11" value={idfy.env} disabled={!manage} onChange={(v) => setI({ env: v as IdfySettings['env'] })} options={ENV_OPTIONS(tr)} /></Field>
            <Field label={tr('hiring.sandboxBaseUrl')} htmlFor="idfy-sb"><Input id="idfy-sb" className="h-11" value={idfy.sandbox_base_url} disabled={!manage} onChange={(e) => setI({ sandbox_base_url: e.target.value })} /></Field>
            <Field label={tr('hiring.productionBaseUrl')} htmlFor="idfy-pr"><Input id="idfy-pr" className="h-11" value={idfy.production_base_url} disabled={!manage} onChange={(e) => setI({ production_base_url: e.target.value })} /></Field>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{tr('hiring.taskPaths')}</h3>
            <p className="text-xs text-muted-foreground">{tr('hiring.fromYourIdfyAccountEveV37f3')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.idfy_meta.task_keys.map((k) => (
                <Field key={k} label={TASK_LABELS(tr)[k] || k} htmlFor={`idfy-t-${k}`} hint={data.idfy_meta.default_tasks[k] ? undefined : tr('hiring.askIdfyForThisTaskPath')}>
                  <Input id={`idfy-t-${k}`} className="h-11 font-mono text-sm" value={idfy.tasks[k] || ''} disabled={!manage} onChange={(e) => setI({ tasks: { ...idfy.tasks, [k]: e.target.value } })} />
                </Field>
              ))}
            </div>
          </div>
          <Toggle id="idfy-name" label={tr('hiring.flagADiscrepancyWhenTheNameedb')} checked={idfy.name_match} disabled={!manage} onChange={(v) => setI({ name_match: v })} />
          <Toggle id="idfy-ip" label={tr('hiring.onlyAcceptCallbacksFromIdfysIp1c6')} checked={idfy.enforce_ip_allowlist} disabled={!manage} onChange={(v) => setI({ enforce_ip_allowlist: v })} />
          {idfy.enforce_ip_allowlist && (
            <Field label={tr('hiring.allowedCallbackIps')} htmlFor="idfy-ips" hint={tr('hiring.commaSeparatedIdfyPublishesValueNeeds045', { value: list(data.idfy_meta.webhook_ips) })}>
              <Input id="idfy-ips" className="h-11 font-mono text-sm" value={list(idfy.ip_allowlist)} disabled={!manage} onChange={(e) => setI({ ip_allowlist: unlist(e.target.value) })} />
            </Field>
          )}
          {manage && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {data.idfy_webhook_url
                ? <p>{tr('hiring.callbackUrlEmailItToIdfybc4')}{' '}<code className="break-all font-mono">{data.idfy_webhook_url}</code></p>
                : <p>{tr('hiring.turnIdfyOnAndSaveTo2e6')}</p>}
            </div>
          )}
          <InlineError message={err.idfy} />
          <div className="flex flex-wrap gap-2">
            {saveBtn('idfy', () => void save('idfy', { idfy, vendor_keys: filled(ik) }, 'IDfy settings saved').then((ok) => ok && setIk({ idfy_account_id: '', idfy_api_key: '' })))}
            {manage && <TestConnection vendor="idfy" tenantQuery={tenantQuery} disabled={!keys.idfy_api_key} />}
            {manage && keys.idfy_webhook_token && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void save('idfy', { rotate_idfy_webhook_token: true }, 'New callback token — send IDfy the new URL')}>{tr('hiring.newCallbackToken')}</Button>}
            {manage && keys.idfy_api_key && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void save('idfy', { idfy: { enabled: false }, vendor_keys: { idfy_account_id: null, idfy_api_key: null } }, 'IDfy keys removed')}>{tr('hiring.removeKeys')}</Button>}
          </div>
        </Panel>
      </Section>

      <Section title={tr('hiring.vendorAuthbridgeIndia')} description={tr('hiring.configureFromYourAuthbridgeOnboardingPac142')}>
        <Panel className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={ab.enabled ? 'success' : 'outline'}>{ab.enabled ? tr('hiring.on') : tr('hiring.off')}</Badge>
            <KeyBadge set={ab.auth_mode === 'api_key' ? !!keys.authbridge_api_key : !!keys.authbridge_client_id && !!keys.authbridge_client_secret} on="Credentials set" off="No credentials" />
            <KeyBadge set={!!keys.authbridge_webhook_secret} on="Webhook secret set" off="No webhook secret" />
          </div>
          <Toggle id="ab-on" label={tr('hiring.useAuthbridgeForIndiaBackgroundChecks281')} checked={ab.enabled} disabled={!manage} onChange={(v) => setA({ enabled: v })} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tr('hiring.environment')} htmlFor="ab-env"><NativeSelect id="ab-env" className="h-11" value={ab.env} disabled={!manage} onChange={(v) => setA({ env: v as AuthBridgeSettings['env'] })} options={ENV_OPTIONS(tr)} /></Field>
            <Field label={tr('hiring.sandboxBaseUrl')} htmlFor="ab-sb"><Input id="ab-sb" className="h-11" placeholder="https://…" value={ab.sandbox_base_url || ''} disabled={!manage} onChange={(e) => setA({ sandbox_base_url: e.target.value })} /></Field>
            <Field label={tr('hiring.productionBaseUrl')} htmlFor="ab-pr"><Input id="ab-pr" className="h-11" placeholder="https://…" value={ab.production_base_url || ''} disabled={!manage} onChange={(e) => setA({ production_base_url: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tr('hiring.signInMethod')} htmlFor="ab-auth"><NativeSelect id="ab-auth" className="h-11" value={ab.auth_mode} disabled={!manage} onChange={(v) => setA({ auth_mode: v as AuthBridgeSettings['auth_mode'] })} options={[{ value: 'oauth_client_credentials', label: tr('hiring.oauthClientCredentials') }, { value: 'api_key', label: tr('hiring.apiKeyHeader') }, { value: 'basic', label: tr('hiring.basicClientIdSecret') }]} /></Field>
            {ab.auth_mode === 'oauth_client_credentials' && <Field label={tr('hiring.tokenPath')} htmlFor="ab-tok"><Input id="ab-tok" className="h-11 font-mono text-sm" value={ab.token_path} disabled={!manage} onChange={(e) => setA({ token_path: e.target.value })} /></Field>}
            {ab.auth_mode === 'oauth_client_credentials' && <Field label={tr('hiring.scopeOptional')} htmlFor="ab-scope"><Input id="ab-scope" className="h-11" value={ab.scope || ''} disabled={!manage} onChange={(e) => setA({ scope: e.target.value })} /></Field>}
            {ab.auth_mode === 'api_key' && <Field label={tr('hiring.apiKeyHeader')} htmlFor="ab-hdr"><Input id="ab-hdr" className="h-11 font-mono text-sm" value={ab.api_key_header} disabled={!manage} onChange={(e) => setA({ api_key_header: e.target.value })} /></Field>}
          </div>
          {manage && (
            <div className="grid gap-4 sm:grid-cols-2">
              {ab.auth_mode === 'api_key'
                ? <Field label={tr('hiring.apiKey')} htmlFor="ab-key" hint={tr('hiring.leaveEmptyToKeepTheCurrent0ce')}><Input id="ab-key" type="password" autoComplete="off" className="h-11" value={ak.authbridge_api_key} onChange={(e) => setAk({ ...ak, authbridge_api_key: e.target.value })} /></Field>
                : <>
                    <Field label={tr('hiring.clientId')} htmlFor="ab-cid" hint={tr('hiring.leaveEmptyToKeepTheCurrent0ce')}><Input id="ab-cid" type="password" autoComplete="off" className="h-11" value={ak.authbridge_client_id} onChange={(e) => setAk({ ...ak, authbridge_client_id: e.target.value })} /></Field>
                    <Field label={tr('hiring.clientSecret')} htmlFor="ab-cs"><Input id="ab-cs" type="password" autoComplete="off" className="h-11" value={ak.authbridge_client_secret} onChange={(e) => setAk({ ...ak, authbridge_client_secret: e.target.value })} /></Field>
                  </>}
              <Field label={tr('hiring.webhookSigningSecret')} htmlFor="ab-whs"><Input id="ab-whs" type="password" autoComplete="off" className="h-11" value={ak.authbridge_webhook_secret} onChange={(e) => setAk({ ...ak, authbridge_webhook_secret: e.target.value })} /></Field>
            </div>
          )}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{tr('hiring.checks')}</h3>
            <p className="text-xs text-muted-foreground">{tr('hiring.pathToSendEachCheckTo27d')}</p>
            <div className="space-y-2">
              {data.authbridge_checks.map((t) => {
                const row = ab.checks[t] || { path: '', code: '' }
                const setRow = (p: Partial<typeof row>) => setA({ checks: { ...ab.checks, [t]: { ...row, ...p } } })
                return (
                  <div key={t} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[10rem_1fr_10rem] sm:items-end">
                    <p className="text-sm font-medium text-foreground">{CHECK_LABEL('IN', t)}</p>
                    <Field label={tr('hiring.path')} htmlFor={`ab-p-${t}`}><Input id={`ab-p-${t}`} className="h-11 font-mono text-sm" placeholder="/…" value={row.path} disabled={!manage} onChange={(e) => setRow({ path: e.target.value })} /></Field>
                    <Field label={tr('hiring.checkCode')} htmlFor={`ab-c-${t}`}><Input id={`ab-c-${t}`} className="h-11 font-mono text-sm" value={row.code} disabled={!manage} onChange={(e) => setRow({ code: e.target.value })} /></Field>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{tr('hiring.responseMapping')}</h3>
            <p className="text-xs text-muted-foreground">{tr('hiring.dottedPathsIntoAuthbridgesJsonE170')}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={tr('hiring.referenceFieldOrderAnswer')} htmlFor="ab-m-ref"><Input id="ab-m-ref" className="h-11 font-mono text-sm" value={ab.mapping.ref_field} disabled={!manage} onChange={(e) => setMap({ ref_field: e.target.value })} /></Field>
              <Field label={tr('hiring.statusFieldStatusAnswer')} htmlFor="ab-m-st"><Input id="ab-m-st" className="h-11 font-mono text-sm" value={ab.mapping.status_field} disabled={!manage} onChange={(e) => setMap({ status_field: e.target.value })} /></Field>
              <Field label={tr('hiring.noteFieldOptional')} htmlFor="ab-m-n"><Input id="ab-m-n" className="h-11 font-mono text-sm" value={ab.mapping.notes_field || ''} disabled={!manage} onChange={(e) => setMap({ notes_field: e.target.value })} /></Field>
              <Field label={tr('hiring.statusPathOptional')} htmlFor="ab-sp" hint={tr('hiring.getPathWithRefEnablesPolling')}><Input id="ab-sp" className="h-11 font-mono text-sm" value={ab.status_path || ''} disabled={!manage} onChange={(e) => setA({ status_path: e.target.value })} /></Field>
              <Field label={tr('hiring.testPathOptional')} htmlFor="ab-tp" hint={tr('hiring.anyHarmlessGetForTestConnection')}><Input id="ab-tp" className="h-11 font-mono text-sm" value={ab.test_path || ''} disabled={!manage} onChange={(e) => setA({ test_path: e.target.value })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={tr('hiring.verifiedValues')} htmlFor="ab-v"><Input id="ab-v" className="h-11" value={list(ab.mapping.verified)} disabled={!manage} onChange={(e) => setMap({ verified: unlist(e.target.value) })} /></Field>
              <Field label={tr('hiring.discrepancyValues')} htmlFor="ab-d"><Input id="ab-d" className="h-11" value={list(ab.mapping.discrepancy)} disabled={!manage} onChange={(e) => setMap({ discrepancy: unlist(e.target.value) })} /></Field>
              <Field label={tr('hiring.unableToVerifyValues')} htmlFor="ab-u"><Input id="ab-u" className="h-11" value={list(ab.mapping.unable_to_verify)} disabled={!manage} onChange={(e) => setMap({ unable_to_verify: unlist(e.target.value) })} /></Field>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{tr('hiring.webhook')}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={tr('hiring.signatureHeader')} htmlFor="ab-wh"><Input id="ab-wh" className="h-11 font-mono text-sm" value={ab.webhook.header} disabled={!manage} onChange={(e) => setA({ webhook: { ...ab.webhook, header: e.target.value } })} /></Field>
              <Field label={tr('hiring.algorithm')} htmlFor="ab-wa"><NativeSelect id="ab-wa" className="h-11" value={ab.webhook.algorithm} disabled={!manage} onChange={(v) => setA({ webhook: { ...ab.webhook, algorithm: v as AuthBridgeSettings['webhook']['algorithm'] } })} options={[{ value: 'sha256', label: tr('hiring.hmacSha256') }, { value: 'sha512', label: tr('hiring.hmacSha512') }, { value: 'sha1', label: tr('hiring.hmacSha1') }]} /></Field>
              <Field label={tr('hiring.encoding')} htmlFor="ab-we"><NativeSelect id="ab-we" className="h-11" value={ab.webhook.encoding} disabled={!manage} onChange={(v) => setA({ webhook: { ...ab.webhook, encoding: v as 'hex' | 'base64' } })} options={[{ value: 'hex', label: tr('hiring.hex') }, { value: 'base64', label: tr('hiring.base64') }]} /></Field>
              <Field label={tr('hiring.prefixOptional')} htmlFor="ab-wp" hint={tr('hiring.eGSha256')}><Input id="ab-wp" className="h-11 font-mono text-sm" value={ab.webhook.prefix} disabled={!manage} onChange={(e) => setA({ webhook: { ...ab.webhook, prefix: e.target.value } })} /></Field>
              <Field label={tr('hiring.eventIdField')} htmlFor="ab-wid"><Input id="ab-wid" className="h-11 font-mono text-sm" value={ab.mapping.webhook_event_id_field} disabled={!manage} onChange={(e) => setMap({ webhook_event_id_field: e.target.value })} /></Field>
              <Field label={tr('hiring.referenceField')} htmlFor="ab-wr"><Input id="ab-wr" className="h-11 font-mono text-sm" value={ab.mapping.webhook_ref_field} disabled={!manage} onChange={(e) => setMap({ webhook_ref_field: e.target.value })} /></Field>
              <Field label={tr('hiring.statusField')} htmlFor="ab-ws"><Input id="ab-ws" className="h-11 font-mono text-sm" value={ab.mapping.webhook_status_field} disabled={!manage} onChange={(e) => setMap({ webhook_status_field: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-muted-foreground">{tr('hiring.webhookUrlToGiveAuthbridge')}{' '}<code className="break-all font-mono">{data.authbridge_webhook_url}</code></p>
          </div>
          <InlineError message={err.authbridge} />
          <div className="flex flex-wrap gap-2">
            {saveBtn('authbridge', () => void save('authbridge', { authbridge: ab, vendor_keys: filled(ak) }, 'AuthBridge settings saved').then((ok) => ok && setAk({ authbridge_client_id: '', authbridge_client_secret: '', authbridge_api_key: '', authbridge_webhook_secret: '' })))}
            {manage && <TestConnection vendor="authbridge" tenantQuery={tenantQuery} />}
            {manage && (keys.authbridge_client_id || keys.authbridge_api_key) && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void save('authbridge', { authbridge: { enabled: false }, vendor_keys: { authbridge_client_id: null, authbridge_client_secret: null, authbridge_api_key: null, authbridge_webhook_secret: null } }, 'AuthBridge keys removed')}>{tr('hiring.removeKeys')}</Button>}
          </div>
        </Panel>
      </Section>
    </>
  )
}
