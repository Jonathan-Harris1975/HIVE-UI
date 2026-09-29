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
  assert.match(shell, /min-h-0 min-w-0 flex-1 overflow-hidden/)
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
  assert.match(css, /--text-hive-xs: 0\.75rem;/)
  assert.doesNotMatch(css, /\.text-xs \{ font-size:/)
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
})


test('chat mobile controls remain reachable and reset cleanly', () => {
  const chat = source('src/pages/ChatPage.tsx')
  const shell = source('src/components/AppShell.tsx')
  const css = source('src/index.css')
  assert.match(chat, /chat-empty-state/)
  assert.match(css, /\.chat-empty-state \{ justify-content: safe center; \}/)
  assert.match(chat, /aria-label="Send message"/)
  assert.match(chat, /aria-label="Choose files for chat"/)
  assert.match(chat, /event\.nativeEvent\.isComposing/)
  assert.match(chat, /newConversationRequested/)
  assert.match(shell, /navigate\('\/chat\?new=1'\)/)
})

test('model picker escapes composer clipping with a viewport-positioned portal', () => {
  const picker = source('src/components/ModelPicker.tsx')
  assert.match(picker, /createPortal/)
  assert.match(picker, /getBoundingClientRect\(\)/)
  assert.match(picker, /window\.visualViewport/)
  assert.match(picker, /className="fixed z-\[80\]/)
  assert.match(picker, /popupRef\.current\?\.contains/)
})


test('repositories are a read-only overview of the automated estate', () => {
  const repositories = source('src/pages/RepositoriesPage.tsx')
  const catalogue = source('src/hooks/useRepositoryCatalog.ts')

  assert.match(catalogue, /apiFetch<RepositoryListResponse>\('\/v1\/repositories'\)/)
  assert.match(repositories, /Automated repository estate/)
  assert.match(repositories, /Repository overview/)
  assert.match(repositories, /backend automation and repository CI/)
  assert.match(repositories, /\/v1\/repositories\/refresh-config/)
  assert.match(repositories, /\/v1\/system\/repo-health\?force_refresh=/)
  assert.match(repositories, /GOVERNED_REPOSITORIES\.map/)
  assert.match(repositories, /No repair or mutation controls/)
  assert.doesNotMatch(repositories, /method: 'POST'/)
  assert.doesNotMatch(repositories, /method: 'DELETE'/)
  assert.doesNotMatch(repositories, /RepositoryOperationsPanel/)
  assert.doesNotMatch(repositories, /Run Repository Intelligence/)
  assert.doesNotMatch(repositories, /Carry out improvements/)
})

test('legacy repository routes collapse into the single overview', () => {
  const app = source('src/App.tsx')
  const shell = source('src/components/AppShell.tsx')

  assert.match(app, /function LegacyRepositoriesRedirect\(\)/)
  assert.match(app, /Navigate to=\{`\/repositories\$\{location\.search\}`\} replace/)
  assert.match(app, /path="memory" element=\{<LegacyRepositoriesRedirect \/>\}/)
  assert.match(app, /path="intelligence" element=\{<LegacyRepositoriesRedirect \/>\}/)
  assert.doesNotMatch(app, /RepositoryIntelligencePage/)
  assert.doesNotMatch(shell, /Memory & Intelligence/)
  assert.match(shell, /Automated repository estate overview/)
})

test('operations does not duplicate repository overview status', () => {
  const ops = source('src/pages/OpsPage.tsx')
  const repositories = source('src/pages/RepositoriesPage.tsx')

  assert.match(repositories, /\/v1\/system\/repo-health/)
  assert.doesNotMatch(ops, /\/v1\/system\/repo-health/)
  assert.doesNotMatch(ops, /RepoHealthCard/)
  assert.doesNotMatch(ops, /repository_manager/)
  assert.doesNotMatch(ops, /Services healthy/)
  assert.match(ops, /Integration readiness/)
  assert.match(ops, /Operational alerts/)
  assert.match(ops, /Live system snapshot/)
  assert.match(ops, /Workflow lab/)
})

test('TypeScript source stays within the UI line-length budget', () => {
  const roots = ['src', 'workers', 'shared', 'e2e']

  for (const root of roots) {
    const directory = new URL(`../${root}/`, import.meta.url)
    const files = walk(directory.pathname).filter((path) => /\.tsx?$/.test(path))

    for (const path of files) {
      const lines = readFileSync(path, 'utf8').split(/\r?\n/)
      lines.forEach((line, index) => {
        assert.ok(
          line.length <= 200,
          `${path}:${index + 1} exceeds the 200-character Repository Intelligence source limit (${line.length})`,
        )
      })
    }
  }
})

test('execution planning is separated from optimisation and retains legacy routing', () => {
  const app = source('src/App.tsx')
  const shell = source('src/components/AppShell.tsx')
  const plan = source('src/pages/ExecutionPlanPage.tsx')
  const reviews = source('src/pages/ExecutionReviewsPage.tsx')
  const optimisation = source('src/pages/OptimisationPage.tsx')
  const types = source('src/types/api.ts')

  assert.match(app, /path="execution" element={<ExecutionPlanPage \/>}/)
  assert.match(app, /path="execution-simulation" element={<Navigate to="\/execution" replace \/>}/)
  assert.match(shell, /to: '\/execution', label: 'Execution'/)
  assert.doesNotMatch(shell, /to: '\/optimisation'.*execution-reviews/)
  assert.match(plan, /\['Preview', 'Review', 'Approve', 'Execute'\]/)
  assert.match(plan, /source_preview_id: sourcePreviewId/)
  assert.match(plan, /preview_id: simulation\.preview_id \|\| null/)
  assert.match(plan, /simulation_id: simulation\.simulation_id \|\| null/)
  assert.match(plan, /workflow_preset: simulation\.workflow_preset \?\? null/)
  assert.match(plan, /await persistPreview\(\)/)
  assert.match(reviews, /Build an execution preview first/)
  assert.match(reviews, /Manual review plan/)
  assert.match(reviews, /response\.export_document/)
  assert.doesNotMatch(reviews, /response\.content[^_]/)
  assert.match(reviews, /review\.metadata/)
  assert.match(optimisation, /ConfirmDialog/)
  assert.match(optimisation, /statsResponse\.ok === false/)
  assert.match(optimisation, /Ledger records/)
  assert.match(optimisation, /proposed, not applied/)
  assert.match(optimisation, /Mark reverted/)
  assert.match(optimisation, /External state was not changed/)
  assert.doesNotMatch(optimisation, /Environment Variable Audit/)
  assert.match(types, /export interface ExecutionServiceRequirement/)
  assert.match(types, /export interface ExecutionReviewExportResponse/)
})

test('declarative router keeps protected routes and compatibility redirects stable', () => {
  const main = source('src/main.tsx')
  const app = source('src/App.tsx')

  assert.match(main, /import \{ BrowserRouter \} from 'react-router'/)
  assert.match(main, /<BrowserRouter>[\s\S]*<AuthProvider>[\s\S]*<App \/>[\s\S]*<\/AuthProvider>[\s\S]*<\/BrowserRouter>/)
  assert.match(app, /import \{ Navigate, Route, Routes, useLocation \} from 'react-router'/)
  assert.match(app, /if \(status === 'signed-out'\) return <LoginScreen \/>/)
  assert.match(app, /<Route index element={<Navigate to="\/chat" replace \/>} \/>/)
  assert.match(app, /return <Navigate to={`\/repositories\$\{location\.search\}`} replace \/>/)
  assert.match(app, /path="execution-simulation" element={<Navigate to="\/execution" replace \/>}/)
  assert.match(app, /path="\*" element={<Navigate to="\/chat" replace \/>}/)
  assert.doesNotMatch(app, /\b(?:loader|action)=/)
})

