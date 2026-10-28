import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertOrigin, configFor, flavourUrls, IAP_UA, offlineFor, PLACEHOLDER, withIap } from './flavor-configs.mjs'

test('flavour URLs default and override', () => {
  assert.deepEqual(flavourUrls({}, 'https://codespectra.ai'), {
    dev: 'https://dev.codespectra.ai', staging: 'https://staging.codespectra.ai', prod: 'https://codespectra.ai',
  })
  assert.equal(flavourUrls({ CS_DEV_URL: 'https://x.example' }).dev, 'https://x.example')
})

test('only bare https origins are accepted', () => {
  assert.equal(assertOrigin('https://staging.codespectra.ai/'), 'https://staging.codespectra.ai')
  for (const bad of ['http://codespectra.ai', 'https://a@codespectra.ai', 'https://codespectra.ai/dashboard', 'https://codespectra.ai?x=1', 'javascript:alert(1)']) {
    assert.throws(() => assertOrigin(bad), bad)
  }
})

test('config swaps only server.url', () => {
  const base = { appId: 'ai.codespectra.app', server: { url: 'https://codespectra.ai', errorPath: 'offline.html' }, plugins: { A: 1 } }
  const out = configFor(base, 'https://staging.codespectra.ai')
  assert.equal(out.server.url, 'https://staging.codespectra.ai')
  assert.equal(out.server.errorPath, 'offline.html')
  assert.deepEqual(out.plugins, { A: 1 })
  assert.equal(base.server.url, 'https://codespectra.ai')
})

test('offline page gets the flavour URL', () => {
  assert.equal(offlineFor(`var S="${PLACEHOLDER}"`, 'https://dev.codespectra.ai'), 'var S="https://dev.codespectra.ai"')
})

test('IAP flag tags the user agent only when enabled (idempotent)', () => {
  const base = { android: { appendUserAgent: 'CodeSpectraAndroid/1' } }
  assert.equal(withIap(base, false).android.appendUserAgent, 'CodeSpectraAndroid/1')
  const on = withIap(base, true)
  assert.equal(on.android.appendUserAgent, `CodeSpectraAndroid/1 ${IAP_UA}`)
  assert.equal(withIap(on, true).android.appendUserAgent, `CodeSpectraAndroid/1 ${IAP_UA}`)
  assert.equal(withIap(on, false).android.appendUserAgent, 'CodeSpectraAndroid/1')
  assert.equal(base.android.appendUserAgent, 'CodeSpectraAndroid/1')
})
