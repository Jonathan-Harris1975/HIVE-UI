const packageName = 'picomatch'
const upstreamVersion = '4.0.7'
const reviewedAdvisories = new Set(['GHSA-FC5Q-39XC-VJPF'])
const endpoint = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'

const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 30_000)

let response
try {
  response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ [packageName]: [upstreamVersion] }),
    signal: controller.signal,
  })
} finally {
  clearTimeout(timeout)
}

if (!response.ok) {
  throw new Error(`Vendored advisory query failed closed with HTTP ${response.status}`)
}

const payload = await response.json()
const advisories = payload?.[packageName]
if (!Array.isArray(advisories)) {
  throw new Error('Vendored advisory query returned an unexpected response')
}

const unknown = advisories.filter((advisory) => {
  const match = String(advisory.url ?? '').match(/GHSA-[a-z0-9-]+/i)
  return !match || !reviewedAdvisories.has(match[0].toUpperCase())
})

if (unknown.length > 0) {
  const details = unknown.map((advisory) => `${advisory.url ?? advisory.id}: ${advisory.title}`).join('\n')
  throw new Error(`Unreviewed advisories affect vendored ${packageName}@${upstreamVersion}:\n${details}`)
}

console.log(`Vendored ${packageName}@${upstreamVersion} advisory check passed (${advisories.length} reviewed advisory).`)
