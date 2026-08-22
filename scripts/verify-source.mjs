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
  'LOGIN_RATE_LIMITER',
  "|| 'read_only'",
]) {
  const combined = functionSource + await readFile('workers/gateway/security.ts', 'utf8')
  if (!combined.includes(required)) throw new Error(`Worker gateway security control is missing: ${required}`)
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

console.log('HIVE-UI source verification passed.')
