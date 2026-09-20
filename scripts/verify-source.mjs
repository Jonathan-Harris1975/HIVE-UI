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
  'backend_write_outcome_unknown',
  'HIVE_API_FALLBACK_URLS',
  'HIVE_API_TIMEOUT_MS',
  'AbortSignal.timeout',
  "script-src-attr 'none'",
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

const durableObjectBinding = wranglerSource.match(/\[\[durable_objects\.bindings\]\]([\s\S]*?)(?=\n\[\[|$)/)?.[1] ?? ''
if (!/name\s*=\s*"LOGIN_RATE_LIMITER"/.test(durableObjectBinding) || !/class_name\s*=\s*"LoginRateLimiter"/.test(durableObjectBinding)) {
  throw new Error('wrangler.toml must bind LOGIN_RATE_LIMITER to the LoginRateLimiter Durable Object class.')
}
const durableObjectMigrations = [...wranglerSource.matchAll(/\[\[migrations\]\]([\s\S]*?)(?=\n\[\[|$)/g)].map((match) => match[1])
const hasLoginLimiterMigration = durableObjectMigrations.some((migration) => (
  /new_sqlite_classes\s*=\s*\[[^\]]*"LoginRateLimiter"[^\]]*\]/.test(migration)
))
if (!hasLoginLimiterMigration) {
  throw new Error('wrangler.toml must retain a SQLite Durable Object migration for LoginRateLimiter.')
}

const productionDocs = {
  'README.md': await readFile('README.md', 'utf8'),
  'SECURITY.md': await readFile('SECURITY.md', 'utf8'),
  'docs/API_CONTRACT.md': await readFile('docs/API_CONTRACT.md', 'utf8'),
  'docs/OPERATIONS.md': await readFile('docs/OPERATIONS.md', 'utf8'),
  'docs/PRODUCTION_READINESS.md': await readFile('docs/PRODUCTION_READINESS.md', 'utf8'),
  'docs/DEPLOYMENT_CHECKLIST.md': await readFile('docs/DEPLOYMENT_CHECKLIST.md', 'utf8'),
}
for (const [path, source] of Object.entries(productionDocs)) {
  for (const required of ['LOGIN_RATE_LIMITER', 'LoginRateLimiter']) {
    if (!source.includes(required)) throw new Error(`${path} must document the ${required} authentication contract.`)
  }
  for (const stale of [
    /best-effort per-client edge throttling/i,
    /Durable global rate limiting using KV or Durable Objects/i,
  ]) {
    if (stale.test(source)) throw new Error(`${path} contains a stale login-rate-limiter description: ${stale}`)
  }
}
const apiContract = productionDocs['docs/API_CONTRACT.md']
if (/session is HMAC-signed using the configured UI access secret/i.test(apiContract)) {
  throw new Error('API contract must not describe HIVE_UI_ACCESS_KEY as the session-signing secret.')
}
if (!apiContract.includes('HIVE_UI_SESSION_SECRET') || !apiContract.includes('login_rate_limiter_unavailable')) {
  throw new Error('API contract must document the independent session secret and fail-closed login limiter.')
}

const productionReadiness = productionDocs['docs/PRODUCTION_READINESS.md']
for (const required of ['10 minutes', 'fifth', 'HTTP 503', 'login_rate_limiter_unavailable', 'new_sqlite_classes']) {
  if (!productionReadiness.includes(required)) {
    throw new Error(`Production-readiness documentation is missing login limiter detail: ${required}`)
  }
}
const envExample = await readFile('.env.example', 'utf8')
if (/HIVE_UI_SESSION_SECRET=.*optional/i.test(envExample) || /If omitted.*HIVE_UI_ACCESS_KEY/i.test(envExample)) {
  throw new Error('.env.example must not describe mandatory signing secrets as optional or derived from HIVE_UI_ACCESS_KEY.')
}

const packageMetadata = JSON.parse(await readFile('package.json', 'utf8'))
const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const declaredReactRouter = packageMetadata.dependencies?.['react-router']
const lockedReactRouter = packageLock.packages?.['node_modules/react-router']?.version
if (declaredReactRouter !== '8.4.0' || lockedReactRouter !== '8.4.0') {
  throw new Error(`React Router must remain on the reviewed 8.4.0 release (manifest=${declaredReactRouter || 'missing'}, lock=${lockedReactRouter || 'missing'}).`)
}
if (!packageLock.packages?.['node_modules/react-router']?.dependencies?.['@remix-run/route-pattern']) {
  throw new Error('React Router 8.4.0 lock entry must retain its @remix-run/route-pattern dependency.')
}
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
