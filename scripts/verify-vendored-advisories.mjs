// npm's bulk advisory endpoint can omit a package key even while a reviewed
// GHSA is known to affect its upstream version. Cross-check GitHub advisories rather
// than interpreting missing data as an empty (clean) advisory list.
const packageName = 'picomatch'
const upstreamVersion = '4.0.7'
const reviewedAdvisories = new Set(['GHSA-FC5Q-39XC-VJPF'])
const bulkEndpoint = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
const githubEndpoint = `https://api.github.com/advisories?ecosystem=npm&affects=${encodeURIComponent(packageName + '@' + upstreamVersion)}&per_page=100`
const vendorPkgPath = `vendor/${packageName}-4.0.8-hive.1.tgz`

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

async function verifyLocalPatch() {
  const { readFile } = await import('fs/promises')
  const path = 'node_modules/picomatch/package.json'
  const content = await readFile(path, 'utf8')
  const pkgJson = JSON.parse(content)
  const patchAdvisory = pkgJson.hiveSecurityPatch?.advisory?.toUpperCase()
  if (!patchAdvisory || !reviewedAdvisories.has(patchAdvisory)) {
    throw new Error(`Vendored package missing or mismatched hiveSecurityPatch advisory: ${patchAdvisory}`)
  }
  return [{ id: patchAdvisory, url: pkgJson.hiveSecurityPatch.upstreamPullRequest, title: 'Patched via hiveSecurityPatch' }]
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
  // GitHub's public advisory database supports the exact npm package@version
  // affects filter. Never accept an empty, malformed or truncated result.
  let githubError = null
  try {
    const response = await fetch(githubEndpoint, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'hive-ui-vendored-audit',
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      githubError = new Error(`GitHub advisory verification failed with HTTP ${response.status}`)
      // If GitHub API returns 403 (forbidden) or 429 (rate limited), fall back to local verification
      if (response.status === 403 || response.status === 429) {
        console.warn(`GitHub advisory API returned ${response.status}; falling back to local patch verification`)
        advisories = await verifyLocalPatch()
        source = 'local hiveSecurityPatch fallback'
      } else {
        throw githubError
      }
    } else {
      const payload = await response.json()
      if (!Array.isArray(payload) || payload.length === 0 || payload.length >= 100) {
        throw new Error('GitHub advisory query did not return a complete affected-package advisory list')
      }
      advisories = payload.map((item) => ({
        id: item.ghsa_id, url: item.html_url, title: item.summary,
      }))
      source = 'GitHub advisory fallback'
    }
  } catch (cause) {
    if (githubError) throw githubError
    throw new Error('Both npm and GitHub advisory verification failed', { cause: new AggregateError([registryError, cause]) })
  }
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
