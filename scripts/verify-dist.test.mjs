import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const verifier = resolve('scripts/verify-dist.mjs')
const required = ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'site.webmanifest', 'robots.txt']

async function fixture(entry = '<script type="module" src="/assets/main.js"></script>') {
  const root = await mkdtemp(join(tmpdir(), 'hive-ui-dist-test-'))
  await mkdir(join(root, 'dist', 'assets'), { recursive: true })
  for (const file of required) await writeFile(join(root, 'dist', file), 'fixture')
  await writeFile(join(root, 'dist', '_headers'), 'Content-Security-Policy: default-src self\nX-Robots-Tag: noindex\nX-Frame-Options: DENY\n')
  await writeFile(join(root, 'dist', 'index.html'), `<html><head><link href="/favicon.ico"><link href="/favicon.svg"><link href="/site.webmanifest"><link href="/apple-touch-icon.png"></head><body>${entry}</body></html>`)
  await writeFile(join(root, 'dist', 'assets', 'main.js'), 'console.log("fixture")')
  return root
}

async function verify(entry, expectedSuccess, expectedMessage) {
  const root = await fixture(entry)
  try {
    const result = spawnSync(process.execPath, [verifier], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status === 0, expectedSuccess, result.stderr || result.stdout)
    if (expectedMessage) assert.match(result.stderr + result.stdout, expectedMessage)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('accepts existing JavaScript entry point', async () => {
  await verify('<script type="module" src="/assets/main.js"></script>', true)
})

test('rejects absent JavaScript entry point', async () => {
  await verify('<link rel="stylesheet" href="/assets/main.css">', false, /JavaScript entry point|ENOENT/)
})

test('rejects referenced JavaScript asset that is missing', async () => {
  await verify('<script type="module" src="/assets/missing.js"></script>', false, /ENOENT|absent/)
})

test('rejects traversing asset references', async () => {
  await verify('<script type="module" src="/assets/../main.js"></script>', false, /Invalid bundled asset reference/)
})
