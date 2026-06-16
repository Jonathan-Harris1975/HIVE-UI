import { readFile } from 'node:fs/promises'

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
if (lock.lockfileVersion !== 3) throw new Error(`Expected package-lock version 3, found ${lock.lockfileVersion}`)

const allowedHosts = new Set(['registry.npmjs.org'])
const problems = []

for (const [name, entry] of Object.entries(lock.packages ?? {})) {
  if (!entry || typeof entry !== 'object' || typeof entry.resolved !== 'string') continue
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

if (problems.length) {
  throw new Error(`package-lock contains non-public or insecure registry URLs:\n${problems.join('\n')}`)
}

console.log('HIVE-UI lockfile verification passed.')
