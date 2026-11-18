// npm's bulk advisory endpoint can omit a package key even while a reviewed
// GHSA is known to affect its upstream version. Cross-check with OSV rather
// than interpreting missing data as an empty (clean) advisory list.
const packageName = 'picomatch'
const upstreamVersion = '4.0.7'
const reviewedAdvisories = new Set(['GHSA-FC5Q-39XC-VJPF'])
const bulkEndpoint = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
const osvEndpoint = 'https://api.osv.dev/v1/query'

async function query(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Vendored advisory query failed closed with HTTP ${response.status}`)
  const payload = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Vendored advisory query returned an unexpected response')
  }
  return payload
}

function ghsaIds(value) {
  return [value?.id, value?.url, ...(Array.isArray(value?.aliases) ? value.aliases : [])]
    .flatMap((field) => String(field || '').match(/GHSA-[a-z0-9-]+/gi) || [])
    .map((id) => id.toUpperCase())
}

let advisories
let source = 'npm registry'
try {
  const payload = await query(bulkEndpoint, { [packageName]: [upstreamVersion] })
  const rows = payload[packageName]
  if (!Array.isArray(rows) || !rows.some((advisory) => ghsaIds(advisory).some((id) => reviewedAdvisories.has(id)))) {
    throw new Error('npm bulk advisories omitted the known reviewed GHSA')
  }
  advisories = rows
} catch (registryError) {
  // A secondary independent vulnerability source preserves fail-closed CI
  // without depending exclusively on npm registry response shape or freshness.
  const payload = await query(osvEndpoint, {
    version: upstreamVersion,
    package: { name: packageName, ecosystem: 'npm' },
  }).catch((cause) => {
    throw new Error('Both npm and OSV advisory verification failed', { cause: new AggregateError([registryError, cause]) })
  })
  if (!Array.isArray(payload.vulns)) {
    throw new Error('OSV advisory query did not certify the known vulnerable upstream version')
  }
  advisories = payload.vulns
  source = 'OSV fallback'
}

if (!advisories.some((advisory) => ghsaIds(advisory).some((id) => reviewedAdvisories.has(id)))) {
  throw new Error(`Vendored ${packageName}@${upstreamVersion} known advisory was not independently reported`)
}
const unknown = advisories.filter((advisory) => {
  const ids = ghsaIds(advisory)
  return ids.length === 0 || ids.some((id) => !reviewedAdvisories.has(id))
})
if (unknown.length > 0) {
  const details = unknown.map((item) => `${item.url ?? item.id}: ${item.title ?? item.summary ?? 'unreviewed vulnerability'}`).join('\n')
  throw new Error(`Unreviewed advisories affect vendored ${packageName}@${upstreamVersion}:\n${details}`)
}
console.log(`Vendored ${packageName}@${upstreamVersion} advisory check passed (${advisories.length} reviewed advisories via ${source}).`)
