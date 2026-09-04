import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

async function filesUnder(directory) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await filesUnder(path))
    else output.push(path)
  }
  return output
}

const browserFiles = (await filesUnder('src')).filter((path) => ['.ts', '.tsx', '.js', '.jsx'].includes(extname(path)))
const browserSource = (await Promise.all(browserFiles.map((path) => readFile(path, 'utf8')))).join('\n')

const maxTypeScriptLineLength = 200
const typeScriptSourceRoots = ['src', 'workers', 'shared', 'e2e']
for (const root of typeScriptSourceRoots) {
  for (const path of await filesUnder(root)) {
    if (!['.ts', '.tsx'].includes(extname(path))) continue
    const lines = (await readFile(path, 'utf8')).split(/\r?\n/)
    lines.forEach((line, index) => {
      if (line.length > maxTypeScriptLineLength) {
        throw new Error(
          `TypeScript source line exceeds ${maxTypeScriptLineLength} characters: ${path}:${index + 1} (${line.length})`,
        )
      }
    })
  }
}

for (const forbidden of [
  'VITE_HIVE_ADMIN_TOKEN',
  'VITE_HIVE_UI_ACCESS_KEY',
  'hive-ui-access-key',
  'X-HIVE-UI-Key',
]) {
  if (browserSource.includes(forbidden)) throw new Error(`Browser source contains forbidden legacy secret pattern: ${forbidden}`)
}

const functionSource = await readFile('workers/gateway/index.ts', 'utf8')
for (const required of [
  '__Host-hive_session',
  'HttpOnly',
  'SameSite=Strict',
  'secureStringEqual',
  'proxy_path_denied',
  'x-hive-auth-state',
  'HIVE_UI_SESSION_SECRET',
  'HIVE_COMMS_HANDOFF_SECRET',
  'LOGIN_RATE_LIMITER',
  "|| 'read_only'",
]) {
  const combined = functionSource + await readFile('workers/gateway/security.ts', 'utf8')
  if (!combined.includes(required)) throw new Error(`Worker gateway security control is missing: ${required}`)
}


const securitySource = await readFile('workers/gateway/security.ts', 'utf8')
for (const forbidden of [
  'hive-ui/session-signing/v1',
  'hive-ui/comms-handoff/v1',
]) {
  if (securitySource.includes(forbidden)) throw new Error(`Worker gateway must not derive dedicated signing secrets from the login access key: ${forbidden}`)
}

const wranglerSource = await readFile('wrangler.toml', 'utf8')
if (!/\[observability\]\s*\r?\n\s*enabled\s*=\s*true\b/.test(wranglerSource)) {
  throw new Error('Cloudflare Workers observability must be enabled in production.')
}
if (!/\[observability\.logs\]\s*\r?\n\s*enabled\s*=\s*true\b/.test(wranglerSource)) {
  throw new Error('Cloudflare Workers logs must be enabled in production.')
}
if (!/\[observability\.traces\]\s*\r?\n\s*enabled\s*=\s*true\b/.test(wranglerSource)) {
  throw new Error('Cloudflare Workers traces must be enabled in production.')
}

const packageMetadata = JSON.parse(await readFile('package.json', 'utf8'))
const bundleBudget = JSON.parse(await readFile('config/bundle-budget.json', 'utf8'))
if (bundleBudget.policyVersion !== packageMetadata.version) {
  throw new Error(`Bundle budget policy version (${bundleBudget.policyVersion}) must match package version (${packageMetadata.version}). Review bundle measurements when releasing.`)
}
const sharedVersionSource = await readFile('shared/version.ts', 'utf8')
const sharedVersionMatch = sharedVersionSource.match(/HIVE_UI_VERSION\s*=\s*'([^']+)'/)
if (!sharedVersionMatch || sharedVersionMatch[1] !== packageMetadata.version) {
  throw new Error(`Shared UI version (${sharedVersionMatch?.[1] || 'missing'}) must match package version (${packageMetadata.version}).`)
}
if (!/const UI_VERSION\s*=\s*HIVE_UI_VERSION\b/.test(functionSource)) {
  throw new Error('Worker UI version must consume the shared HIVE_UI_VERSION source.')
}
const browserBuildSource = await readFile('src/lib/build.ts', 'utf8')
if (!browserBuildSource.includes("export { HIVE_UI_VERSION } from '../../shared/version'")) {
  throw new Error('Browser UI version must consume the shared HIVE_UI_VERSION source.')
}

// Guard against reintroducing dead/duplicate source files (e.g. copy-pasted
// .d.ts shims) across the app, worker, and shared source trees.
const dedupExtensions = new Set(['.ts', '.tsx', '.d.ts'])
const dedupRoots = ['src', 'workers', 'shared']
const contentByHash = new Map()
for (const root of dedupRoots) {
  for (const path of await filesUnder(root)) {
    if (!dedupExtensions.has(extname(path)) && !path.endsWith('.d.ts')) continue
    const content = await readFile(path, 'utf8')
    const hash = createHash('sha1').update(content).digest('hex')
    const existing = contentByHash.get(hash) ?? []
    existing.push(path)
    contentByHash.set(hash, existing)
  }
}
for (const paths of contentByHash.values()) {
  if (paths.length > 1) {
    throw new Error(`Duplicate source files with identical content found (keep exactly one): ${paths.join(', ')}`)
  }
}

console.log('HIVE-UI source verification passed.')
