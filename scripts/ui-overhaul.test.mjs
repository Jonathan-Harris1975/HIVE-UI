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


test('chat mobile controls remain reachable and reset cleanly', () => {
  const chat = source('src/pages/ChatPage.tsx')
  const shell = source('src/components/AppShell.tsx')
  const skills = source('src/pages/SkillsPage.tsx')
  const css = source('src/index.css')
  assert.match(chat, /chat-empty-state/)
  assert.match(css, /\.chat-empty-state \{ justify-content: safe center; \}/)
  assert.match(chat, /aria-label="Send message"/)
  assert.match(chat, /aria-label="Choose files for chat"/)
  assert.match(chat, /aria-label=\{useSkillContext \? 'Disable shared skills' : 'Enable shared skills'\}/)
  assert.match(chat, /hasAttachedFiles \|\| attachedSkillId \|\| error/)
  assert.match(chat, /removeAttachedSkill/)
  assert.match(chat, /event\.nativeEvent\.isComposing/)
  assert.match(chat, /newConversationRequested/)
  assert.match(shell, /navigate\('\/chat\?new=1'\)/)
  assert.match(skills, /skill_id: skillId/)
  assert.match(skills, /skill_title: title/)
})

test('model picker escapes composer clipping with a viewport-positioned portal', () => {
  const picker = source('src/components/ModelPicker.tsx')
  assert.match(picker, /createPortal/)
  assert.match(picker, /getBoundingClientRect\(\)/)
  assert.match(picker, /window\.visualViewport/)
  assert.match(picker, /className="fixed z-\[80\]/)
  assert.match(picker, /popupRef\.current\?\.contains/)
})


test('operations health cards expose aggregate status and no tier branding', () => {
  const ops = source('src/pages/OpsPage.tsx')
  const apiTypes = source('src/types/api.ts')
  assert.match(ops, /status=\{item\.status \|\| item\.operational\?\.status \|\| item\.readiness\?\.status \|\| item\.liveness\?\.status\}/)
  const removedTierField = ['free', 'tier', 'safe'].join('_')
  assert.doesNotMatch(ops, new RegExp(removedTierField, 'i'))
  assert.doesNotMatch(apiTypes, new RegExp(removedTierField, 'i'))
})

test('repository pages use the live HIVE catalogue and expose setup recovery', () => {
  const repositories = source('src/pages/RepositoriesPage.tsx')
  const memory = source('src/pages/RepositoryMemoryPage.tsx')
  const intelligence = source('src/pages/RepositoryIntelligencePage.tsx')
  const catalogue = source('src/hooks/useRepositoryCatalog.ts')

  assert.match(catalogue, /apiFetch<RepositoryListResponse>\('\/v1\/repositories'\)/)
  assert.match(repositories, /\/repositories\/\$\{encodeURIComponent\(repositoryId\)\}\/setup/)
  assert.match(repositories, /Retry setup/)
  assert.match(repositories, /pipelineStatus === 'setup_incomplete'/)
  assert.match(repositories, /noticeTone === 'warning'/)
  assert.match(memory, /useRepositoryCatalog\(\)/)
  assert.match(memory, /memoryWritable/)
  assert.match(intelligence, /useRepositoryCatalog\(\)/)
  assert.match(intelligence, /selectedRepository\.memory_ready/)
  assert.match(intelligence, /Repository setup is incomplete/)
  assert.doesNotMatch(memory, /GOVERNED_REPOSITORIES/)
  assert.doesNotMatch(intelligence, /GOVERNED_REPOSITORIES/)
})

test('repository memory and intelligence are one durable workspace', () => {
  const app = source('src/App.tsx')
  const shell = source('src/components/AppShell.tsx')
  const intelligence = source('src/pages/RepositoryIntelligencePage.tsx')

  assert.match(app, /function LegacyRepositoryMemoryRedirect\(\)/)
  assert.match(app, /Navigate to=\{`\/intelligence\$\{location\.search\}`\} replace/)
  assert.match(shell, /Memory & Intelligence/)
  assert.match(intelligence, /\/intelligence\/run/)
  assert.match(intelligence, /<RepositoryMemoryPage embedded \/>/)
  assert.match(intelligence, /Run Repository Intelligence/)
  assert.doesNotMatch(intelligence, />Run QA</)
  assert.doesNotMatch(intelligence, />Run review</)
})
