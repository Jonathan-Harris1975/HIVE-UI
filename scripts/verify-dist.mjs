import { access, readdir, readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

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
for (const header of ['Content-Security-Policy', 'X-Robots-Tag', 'X-Frame-Options']) {
  if (!headers.includes(header)) throw new Error(`Missing security header: ${header}`)
}

const assets = await readdir(resolve('dist/assets'))
if (assets.some((name) => extname(name) === '.map')) throw new Error('Production source maps must not be published.')

for (const name of assets.filter((item) => item.endsWith('.js'))) {
  const source = await readFile(resolve('dist/assets', name), 'utf8')
  for (const forbidden of ['HIVE_ADMIN_TOKEN', 'HIVE_UI_ACCESS_KEY']) {
    if (source.includes(forbidden)) throw new Error(`Browser bundle contains forbidden server secret name: ${forbidden}`)
  }
}

console.log('HIVE-UI dist verification passed.')
