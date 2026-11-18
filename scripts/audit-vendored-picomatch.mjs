import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const advisoryEndpoint = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'

export const auditPicomatchVersion = async (version, fetchImpl = fetch) => {
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('picomatch version is missing from package-lock.json')
  }

  const response = await fetchImpl(advisoryEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ picomatch: [version] }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`npm advisory audit failed: HTTP ${response.status}`)
  }

  const advisories = await response.json()
  const matches = advisories.picomatch ?? []
  if (!Array.isArray(matches)) {
    throw new Error('npm advisory audit returned an invalid picomatch result')
  }

  if (matches.length > 0) {
    const details = matches.map(advisory => advisory.url ?? advisory.title ?? `advisory ${advisory.id}`)
    throw new Error(`picomatch@${version} has npm advisories: ${details.join(', ')}`)
  }
}

const main = async () => {
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const version = lock.packages?.['node_modules/picomatch']?.version

  await auditPicomatchVersion(version)
  console.log(`npm advisory audit passed for picomatch@${version}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
