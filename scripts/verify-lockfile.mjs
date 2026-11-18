import { readFile } from 'node:fs/promises'

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
if (lock.lockfileVersion !== 3) throw new Error(`Expected package-lock version 3, found ${lock.lockfileVersion}`)

const allowedHosts = new Set(['registry.npmjs.org'])
const problems = []
const allowedLocalLinks = new Map([
  ['node_modules/picomatch', 'vendor/picomatch'],
])

for (const [name, entry] of Object.entries(lock.packages ?? {})) {
  if (!entry || typeof entry !== 'object' || typeof entry.resolved !== 'string') continue

  const allowedLocalTarget = allowedLocalLinks.get(name)
  if (entry.link === true && entry.resolved === allowedLocalTarget) continue

  let url
  try {
    url = new URL(entry.resolved)
  } catch {
    problems.push(`${name || '<root>'}: invalid resolved URL`)
    continue
  }
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname)) {
    problems.push(`${name || '<root>'}: ${url.protocol}//${url.hostname}`)
  }
}

const rootPicomatch = lock.packages?.['']?.devDependencies?.picomatch
const vendoredPicomatch = lock.packages?.['vendor/picomatch']
if (rootPicomatch !== 'file:vendor/picomatch') {
  problems.push(`root picomatch dependency must be file:vendor/picomatch, found ${rootPicomatch ?? '<missing>'}`)
}
if (vendoredPicomatch?.version !== '4.0.8-hive.1') {
  problems.push(`vendored picomatch version must be 4.0.8-hive.1, found ${vendoredPicomatch?.version ?? '<missing>'}`)
}

if (problems.length) {
  throw new Error(`package-lock contains non-public or insecure registry URLs:\n${problems.join('\n')}`)
}

console.log('HIVE-UI lockfile verification passed.')
