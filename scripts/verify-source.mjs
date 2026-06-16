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

const functionSource = await readFile('functions/api/[[path]].ts', 'utf8')
for (const required of [
  '__Host-hive_session',
  'HttpOnly',
  'SameSite=Strict',
  'secureStringEqual',
  'proxy_path_denied',
  'x-hive-auth-state',
]) {
  const combined = functionSource + await readFile('functions/_lib/security.ts', 'utf8')
  if (!combined.includes(required)) throw new Error(`Pages Function security control is missing: ${required}`)
}

console.log('HIVE-UI source verification passed.')
