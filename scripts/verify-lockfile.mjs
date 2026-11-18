import { readFile } from 'node:fs/promises'

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
if (lock.lockfileVersion !== 3) throw new Error(`Expected package-lock version 3, found ${lock.lockfileVersion}`)

const allowedHosts = new Set(['registry.npmjs.org'])
const problems = []
const patchedPicomatchPath = 'file:vendor/picomatch-4.0.8-hive.1.tgz'
const patchedPicomatchIntegrity = 'sha512-wqB7oiTLB0cIGtDFo9DK3xhqTzo973jJOLwUeikx43NhEVXBIaiqr6c2nrZk8NFod88p583e8Gmt3JUNY0jlkA=='

for (const [name, entry] of Object.entries(lock.packages ?? {})) {
  if (!entry || typeof entry !== 'object' || typeof entry.resolved !== 'string') continue

  if (name === 'node_modules/picomatch' && entry.resolved === patchedPicomatchPath) continue

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
const vendoredPicomatch = lock.packages?.['node_modules/picomatch']
if (rootPicomatch !== patchedPicomatchPath) {
  problems.push(`root picomatch dependency must be ${patchedPicomatchPath}, found ${rootPicomatch ?? '<missing>'}`)
}
if (vendoredPicomatch?.version !== '4.0.8-hive.1') {
  problems.push(`vendored picomatch version must be 4.0.8-hive.1, found ${vendoredPicomatch?.version ?? '<missing>'}`)
}
if (vendoredPicomatch?.integrity !== patchedPicomatchIntegrity) {
  problems.push(`vendored picomatch integrity does not match the reviewed tarball`)
}

if (problems.length) {
  throw new Error(`package-lock contains non-public or insecure registry URLs:\n${problems.join('\n')}`)
}

console.log('HIVE-UI lockfile verification passed.')
