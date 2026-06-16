import { access, readdir, readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const required = [
  'dist/index.html',
  'dist/_headers',
  'dist/_redirects',
  'dist/favicon.ico',
  'dist/favicon.svg',
  'dist/apple-touch-icon.png',
  'dist/site.webmanifest',
  'dist/robots.txt',
]

for (const path of required) await access(resolve(path))

const index = await readFile(resolve('dist/index.html'), 'utf8')
const requiredReferences = ['/favicon.ico', '/favicon.svg', '/site.webmanifest', '/apple-touch-icon.png']
for (const reference of requiredReferences) {
  if (!index.includes(reference)) throw new Error(`Missing production reference: ${reference}`)
}

const headers = await readFile(resolve('dist/_headers'), 'utf8')
for (const header of [
  'Content-Security-Policy',
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy',
  'Strict-Transport-Security',
  'X-Robots-Tag',
  'X-Frame-Options',
]) {
  if (!headers.includes(header)) throw new Error(`Missing security header: ${header}`)
}

const assets = await readdir(resolve('dist/assets'))
if (assets.some((name) => extname(name) === '.map')) throw new Error('Production source maps must not be published.')

let totalGzipBytes = 0
for (const name of assets.filter((item) => item.endsWith('.js'))) {
  const path = resolve('dist/assets', name)
  const source = await readFile(path)
  const gzipBytes = gzipSync(source).byteLength
  totalGzipBytes += gzipBytes
  if (gzipBytes > 160 * 1024) throw new Error(`JavaScript chunk exceeds 160 KiB gzip budget: ${name}`)

  const text = source.toString('utf8')
  for (const forbidden of ['HIVE_ADMIN_TOKEN', 'HIVE_UI_ACCESS_KEY', 'X-HIVE-UI-Key', 'hive-ui-access-key']) {
    if (text.includes(forbidden)) throw new Error(`Browser bundle contains forbidden secret pattern: ${forbidden}`)
  }
}

if (totalGzipBytes > 320 * 1024) {
  throw new Error(`Total JavaScript exceeds 320 KiB gzip budget: ${Math.ceil(totalGzipBytes / 1024)} KiB`)
}

const indexSize = (await stat(resolve('dist/index.html'))).size
if (indexSize > 8 * 1024) throw new Error('Production index.html exceeds 8 KiB.')

console.log(`HIVE-UI dist verification passed (${Math.ceil(totalGzipBytes / 1024)} KiB JavaScript gzip).`)
