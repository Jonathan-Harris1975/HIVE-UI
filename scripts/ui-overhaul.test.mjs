import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

test('shell keeps keyboard and mobile viewport affordances', () => {
  const shell = source('src/components/AppShell.tsx')
  assert.match(shell, /href="#hive-main-content"/)
  assert.match(shell, /h-dvh/)
  assert.match(shell, /aria-label="Search conversations"/)
  assert.match(shell, /role="dialog"/)
  assert.match(shell, /aria-controls="hive-mobile-navigation"/)
  assert.match(shell, /aria-label="Inspector"/)
})

test('core HIVE palette is expressed through theme tokens rather than repeated hex utilities', () => {
  const root = new URL('../src/', import.meta.url)
  const files = walk(root.pathname).filter((path) => /\.tsx$/.test(path))
  const joined = files.map((path) => readFileSync(path, 'utf8')).join('\n')
  for (const literal of ['bg-[#061126]', 'bg-[#0a192d]', 'bg-[#071426]', 'bg-[#0b1b31]', 'text-[#052035]']) {
    assert.doesNotMatch(joined, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  const css = source('src/index.css')
  assert.match(css, /--color-hive-canvas:/)
  assert.match(css, /--color-hive-panel:/)
  assert.match(css, /--color-hive-surface:/)
})

test('dense controls and copy retain a readable interaction baseline', () => {
  const css = source('src/index.css')
  assert.match(css, /\.text-xs \{ font-size: 0\.8125rem; \}/)
  assert.match(css, /@media \(pointer: coarse\)/)
  assert.match(css, /min-height: 44px/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('chat and operational cards expose native and announced interaction semantics', () => {
  const chat = source('src/pages/ChatPage.tsx')
  const ops = source('src/pages/OpsPage.tsx')
  const dialog = source('src/components/ConfirmDialog.tsx')
  assert.match(chat, /aria-label="Chat mode"/)
  assert.match(chat, /aria-label="Workflow preset"/)
  assert.match(chat, /role="alert"/)
  assert.doesNotMatch(ops, /role="button"/)
  assert.match(dialog, /aria-busy=\{busy\}/)
  assert.match(dialog, /role="alert"/)

  const communications = source('src/pages/CommunicationsPage.tsx')
  const files = source('src/pages/FilesPage.tsx')
  assert.match(communications, /aria-busy=\{!ready && !error\}/)
  assert.match(communications, /role="status"/)
  assert.match(files, /aria-label=\{loadingSkills \? "Searching skills" : "Search skills"\}/)
})
