/**
 * LTI 1.3 launch validation (lib/integrations/lti/core.ts): signature against
 * the platform key set, iss / aud / azp / exp, nonce (expected + replay),
 * deployment, version, message types; deep-link response; AGS score mapping.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, type JWK, type CryptoKey } from 'jose'
import { LTI, agsScore, moodleDefaults, oidcAuthUrl, scoresUrl, signClientAssertion, signDeepLinkResponse, validatePlatform, verifyLaunchToken, type ToolKey } from '@/lib/integrations/lti/core'

const platform = { issuer: 'https://moodle.example.edu', client_id: 'cs-client-1', deployment_ids: ['dep-1'] }
let platformKey: CryptoKey
let otherKey: CryptoKey
let jwks: ReturnType<typeof createLocalJWKSet>
let tool: ToolKey

beforeAll(async () => {
  const p = await generateKeyPair('RS256', { extractable: true })
  platformKey = p.privateKey
  const pub = { ...(await exportJWK(p.publicKey)), kid: 'plat-1', alg: 'RS256' } as JWK
  jwks = createLocalJWKSet({ keys: [pub] })
  otherKey = (await generateKeyPair('RS256')).privateKey
  const t = await generateKeyPair('RS256', { extractable: true })
  tool = { kid: 'tool-1', privateKey: t.privateKey, publicJwk: { ...(await exportJWK(t.publicKey)), kid: 'tool-1', alg: 'RS256' } }
})

function claims(over: Record<string, unknown> = {}) {
  return {
    nonce: 'n-123',
    sub: 'lms-user-42',
    email: 'Asha@Example.edu',
    name: 'Asha Rao',
    [LTI.version]: '1.3.0',
    [LTI.messageType]: 'LtiResourceLinkRequest',
    [LTI.deploymentId]: 'dep-1',
    [LTI.resourceLink]: { id: 'rl-9' },
    [LTI.roles]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    [LTI.custom]: { exam_id: 'exam_1' },
    [LTI.ags]: { lineitem: 'https://moodle.example.edu/mod/lti/services.php/2/lineitems/7/lineitem?type_id=1', scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'] },
    ...over,
  }
}

async function token(body: Record<string, unknown>, opts: { key?: CryptoKey; iss?: string; aud?: string | string[]; exp?: number; kid?: string } = {}) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(body)
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'plat-1' })
    .setIssuer(opts.iss ?? platform.issuer)
    .setAudience(opts.aud ?? platform.client_id)
    .setIssuedAt(now)
    .setExpirationTime(opts.exp ?? now + 300)
    .sign(opts.key ?? platformKey)
}

describe('LTI launch validation', () => {
  it('accepts a valid resource-link launch and maps its claims', async () => {
    const r = await verifyLaunchToken(await token(claims()), platform, jwks, { expected: 'n-123' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.claims).toMatchObject({ kind: 'resource', sub: 'lms-user-42', email: 'asha@example.edu', resource_link_id: 'rl-9', instructor: false, custom: { exam_id: 'exam_1' } })
    expect(r.claims.ags?.lineitem).toContain('/lineitems/7/lineitem')
  })

  it('rejects a token signed with another key', async () => {
    const r = await verifyLaunchToken(await token(claims(), { key: otherKey }), platform, jwks, { expected: 'n-123' })
    expect(r).toEqual({ ok: false, error: 'bad_signature' })
  })

  it('rejects the wrong issuer and the wrong audience', async () => {
    expect(await verifyLaunchToken(await token(claims(), { iss: 'https://evil.example' }), platform, jwks, { expected: 'n-123' })).toEqual({ ok: false, error: 'bad_issuer' })
    expect(await verifyLaunchToken(await token(claims(), { aud: 'someone-else' }), platform, jwks, { expected: 'n-123' })).toEqual({ ok: false, error: 'bad_audience' })
  })

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600
    const r = await verifyLaunchToken(await token(claims(), { exp: past }), platform, jwks, { expected: 'n-123' })
    expect(r).toEqual({ ok: false, error: 'expired' })
  })

  it('rejects a nonce that is not the one issued, or one already used', async () => {
    const t = await token(claims())
    expect(await verifyLaunchToken(t, platform, jwks, { expected: 'other' })).toEqual({ ok: false, error: 'bad_nonce' })
    expect(await verifyLaunchToken(t, platform, jwks, { expected: 'n-123', seen: true })).toEqual({ ok: false, error: 'bad_nonce' })
  })

  it('requires azp = client_id when aud has several entries', async () => {
    const multi = await token(claims(), { aud: [platform.client_id, 'other-aud'] })
    expect(await verifyLaunchToken(multi, platform, jwks, { expected: 'n-123' })).toEqual({ ok: false, error: 'bad_azp' })
    const ok = await token(claims({ azp: platform.client_id }), { aud: [platform.client_id, 'other-aud'] })
    expect((await verifyLaunchToken(ok, platform, jwks, { expected: 'n-123' })).ok).toBe(true)
  })

  it('checks deployment, version, message type and required claims', async () => {
    const run = async (over: Record<string, unknown>) => verifyLaunchToken(await token(claims(over)), platform, jwks, { expected: 'n-123' })
    expect(await run({ [LTI.deploymentId]: 'dep-2' })).toEqual({ ok: false, error: 'bad_deployment' })
    expect(await run({ [LTI.version]: '1.1' })).toEqual({ ok: false, error: 'bad_version' })
    expect(await run({ [LTI.messageType]: 'LtiSomethingElse' })).toEqual({ ok: false, error: 'bad_message_type' })
    expect(await run({ [LTI.resourceLink]: {} })).toEqual({ ok: false, error: 'missing_resource_link' })
    expect(await run({ [LTI.messageType]: 'LtiDeepLinkingRequest' })).toEqual({ ok: false, error: 'missing_deep_link_settings' })
  })

  it('reads a deep-linking request from an instructor', async () => {
    const r = await verifyLaunchToken(await token(claims({
      [LTI.messageType]: 'LtiDeepLinkingRequest',
      [LTI.resourceLink]: undefined,
      [LTI.roles]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      [LTI.dlSettings]: { deep_link_return_url: 'https://moodle.example.edu/mod/lti/contentitem_return.php', accept_types: ['ltiResourceLink'], accept_multiple: true, data: 'opaque' },
    })), platform, jwks, { expected: 'n-123' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.claims).toMatchObject({ kind: 'deep_link', instructor: true, deep_link: { data: 'opaque', accept_multiple: true } })
  })
})

describe('tool-signed messages', () => {
  it('deep-link response is verifiable with the tool key and names the chosen tests', async () => {
    const jwt = await signDeepLinkResponse(tool, { clientId: platform.client_id, issuer: platform.issuer, deploymentId: 'dep-1', data: 'opaque', launchUrl: 'https://cs.example/api/lti/launch', items: [{ exam_id: 'exam_1', title: 'Java basics' }] })
    const { payload, protectedHeader } = await jwtVerify(jwt, createLocalJWKSet({ keys: [tool.publicJwk] }), { issuer: platform.client_id, audience: platform.issuer })
    expect(protectedHeader.kid).toBe('tool-1')
    expect(payload[LTI.messageType]).toBe('LtiDeepLinkingResponse')
    expect(payload[LTI.dlData]).toBe('opaque')
    expect((payload[LTI.dlContentItems] as { custom: { exam_id: string }; lineItem: { scoreMaximum: number } }[])[0]).toMatchObject({ custom: { exam_id: 'exam_1' }, lineItem: { scoreMaximum: 100 } })
  })

  it('client assertion has iss = sub = client_id and the token endpoint as audience', async () => {
    const jwt = await signClientAssertion(tool, { clientId: 'cs-client-1', aud: 'https://moodle.example.edu/mod/lti/token.php' })
    const { payload } = await jwtVerify(jwt, createLocalJWKSet({ keys: [tool.publicJwk] }), { audience: 'https://moodle.example.edu/mod/lti/token.php' })
    expect(payload.iss).toBe('cs-client-1')
    expect(payload.sub).toBe('cs-client-1')
    expect(typeof payload.jti).toBe('string')
  })
})

describe('grade mapping and helpers', () => {
  it('maps a 0–100 result to an AGS score', () => {
    expect(agsScore({ userId: 'u', percent: 83.456, timestamp: 't' })).toEqual({ userId: 'u', scoreGiven: 83.46, scoreMaximum: 100, activityProgress: 'Completed', gradingProgress: 'FullyGraded', timestamp: 't' })
    expect(agsScore({ userId: 'u', percent: 140 }).scoreGiven).toBe(100)
    expect(agsScore({ userId: 'u', percent: -5 }).scoreGiven).toBe(0)
  })

  it('builds the scores URL without dropping the line item query', () => {
    expect(scoresUrl('https://lms.example/lineitems/7/lineitem?type_id=1')).toBe('https://lms.example/lineitems/7/lineitem/scores?type_id=1')
  })

  it('OIDC auth request carries state, nonce and form_post', () => {
    const u = new URL(oidcAuthUrl({ auth_login_url: 'https://moodle.example.edu/mod/lti/auth.php', client_id: 'c' }, { redirectUri: 'https://cs.example/api/lti/launch', loginHint: 'h', messageHint: 'm', state: 's', nonce: 'n' }))
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ response_type: 'id_token', response_mode: 'form_post', scope: 'openid', prompt: 'none', state: 's', nonce: 'n', lti_message_hint: 'm', client_id: 'c' })
  })

  it('validates platform registrations and fills Moodle endpoints', () => {
    const m = moodleDefaults('https://moodle.example.edu/')!
    expect(m.jwks_url).toBe('https://moodle.example.edu/mod/lti/certs.php')
    const ok = validatePlatform({ name: 'Moodle', client_id: 'abc', deployment_ids: '1, 2', ...m })
    expect(ok.ok && ok.value.deployment_ids).toEqual(['1', '2'])
    expect(validatePlatform({ name: 'X', client_id: 'abc', deployment_ids: '1', ...m, jwks_url: 'http://insecure' }).ok).toBe(false)
    expect(validatePlatform({ name: 'X', client_id: 'abc', deployment_ids: '', ...m }).ok).toBe(false)
  })
})
