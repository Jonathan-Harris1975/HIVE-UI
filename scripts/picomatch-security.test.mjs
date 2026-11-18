import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import picomatch from 'picomatch'
import { auditPicomatchVersion } from './audit-vendored-picomatch.mjs'

const vulnerablePatterns = new Map([
  ['+(*)', '^(?:\\+\\(\\*\\))$'],
  ['+(*a)', '^(?:\\+\\(\\*a\\))$'],
  ['+(a*)', '^(?:\\+\\(a\\*\\))$'],
  ['+(app*)', '^(?:\\+\\(app\\*\\))$'],
  ['+(src/**/foo)', '^(?:\\+\\(src\\/\\*\\*\\/foo\\))$'],
  ['*(a*|b)', '^(?:\\*\\(a\\*\\|b\\))$'],
  ['+(ab|abab)', '^(?:\\+\\(ab\\|abab\\))$'],
])

test('vendored picomatch literalises CVE-2026-112366 patterns', () => {
  for (const [pattern, expectedSource] of vulnerablePatterns) {
    const source = picomatch.makeRe(pattern).source
    assert.equal(source, expectedSource, `${pattern} was not literalised`)
  }
})

test('vendored picomatch rejects crafted ReDoS inputs within a bounded time', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const picomatch = require('picomatch')
    if (picomatch.isMatch('a'.repeat(100) + '!', '+(*a)')) process.exit(1)
    if (picomatch.isMatch('ab'.repeat(100) + 'c', '+(ab|abab)')) process.exit(1)
  `], { encoding: 'utf8', timeout: 2_000 })

  assert.equal(result.error, undefined, `crafted patterns exceeded 2 seconds: ${result.error}`)
  assert.equal(result.status, 0, result.stderr)
})

test('ordinary extglobs retain their expected behaviour', () => {
  assert.equal(picomatch.isMatch('jsjsx', '+(js|jsx)'), true)
  assert.equal(picomatch.isMatch('foobar', '*(foo|bar)'), true)
})

test('vendored picomatch advisory audit checks the exact package version', async () => {
  let request
  await auditPicomatchVersion('4.0.8-hive.1', async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => ({}) }
  })

  assert.equal(request.url, 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk')
  assert.equal(request.options.method, 'POST')
  assert.deepEqual(JSON.parse(request.options.body), { picomatch: ['4.0.8-hive.1'] })
})

test('vendored picomatch advisory audit rejects vulnerable versions', async () => {
  await assert.rejects(
    auditPicomatchVersion('4.0.7', async () => ({
      ok: true,
      json: async () => ({ picomatch: [{ url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf' }] }),
    })),
    /GHSA-fc5q-39xc-vjpf/,
  )
})

test('vendored picomatch advisory audit fails closed when the registry is unavailable', async () => {
  await assert.rejects(
    auditPicomatchVersion('4.0.8-hive.1', async () => ({ ok: false, status: 503 })),
    /npm advisory audit failed: HTTP 503/,
  )
})
