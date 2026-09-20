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


test('operations health cards expose aggregate status and no tier branding', () => {
  const ops = source('src/pages/OpsPage.tsx')
  const apiTypes = source('src/types/api.ts')
  assert.match(ops, /status=\{livenessStatus\} variant="liveness"/)
  assert.match(ops, /status=\{readinessStatus\} variant="readiness"/)
  assert.match(ops, /Each service reports liveness and readiness separately/)
  assert.match(ops, /grid-cols-1 gap-2 sm:grid-cols-2/)
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
  assert.match(repositories, /Monthly repository automation/)
  assert.match(repositories, /refreshConfig\.expected_repository_count/)
  assert.match(repositories, /Trigger: \{refreshConfig\.trigger\}/)
  assert.match(memory, /useRepositoryCatalog\(\)/)
  assert.match(memory, /memoryWritable/)
  assert.match(intelligence, /useRepositoryCatalog\(\)/)
  assert.match(intelligence, /selectedRepository\.memory_ready/)
  assert.match(intelligence, /Repository setup is incomplete/)
  assert.match(intelligence, /repairRepositorySetup/)
  assert.match(intelligence, /\/repositories\/\$\{encodeURIComponent\(repo\)\}\/setup/)
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
  assert.match(intelligence, /<RepositoryMemoryPage embedded repositoryId=\{repositoryId\} \/>/)
  assert.match(intelligence, /Run Repository Intelligence/)
  assert.doesNotMatch(intelligence, />Run QA</)
  assert.doesNotMatch(intelligence, />Run review</)
})

test('repository workspace can safely apply and download snapshot-specific improvements', () => {
  const intelligence = source('src/pages/RepositoryIntelligencePage.tsx')
  const types = source('src/types/api.ts')

  assert.match(intelligence, /Carry out improvements/)
  assert.match(intelligence, /\/improvements\/run/)
  assert.match(intelligence, /\/improvements\/latest/)
  assert.match(intelligence, /download\/\$\{kind\}/)
  assert.match(intelligence, /Download changed files/)
  assert.match(intelligence, /Download updated repository/)
  assert.match(intelligence, /repository_context\.fingerprint === selectedRepository\.fingerprint/)
  assert.match(types, /export interface RepositoryImprovementJob/)
})

test('repository workspace prevents mobile intrinsic-width overflow', () => {
  const intelligence = source('src/pages/RepositoryIntelligencePage.tsx')
  const memory = source('src/pages/RepositoryMemoryPage.tsx')

  assert.match(intelligence, /overflow-x-hidden/)
  assert.match(intelligence, /repository-workspace-selector/)
  assert.match(intelligence, /onChange=\{\(event\) => selectRepository\(event\.target\.value\)\}/)
  assert.match(intelligence, /w-full min-w-0 max-w-full/)
  assert.match(memory, /overflow-x-hidden/)
  assert.match(memory, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/)
})


test('repository workspace rejects cross-repository async responses and stale prompts', () => {
  const intelligence = source('src/pages/RepositoryIntelligencePage.tsx')
  const memory = source('src/pages/RepositoryMemoryPage.tsx')

  assert.match(intelligence, /activeRepositoryRef/)
  assert.match(intelligence, /response\.repository_id !== repo/)
  assert.match(intelligence, /value\.repository_id !== expectedRepositoryId/)
  assert.match(intelligence, /value\.summary\.repository_id !== expectedRepositoryId/)
  assert.match(intelligence, /context\.repository_id !== expectedRepositoryId/)
  assert.match(intelligence, /report\.repository_id !== repo/)
  assert.match(intelligence, /job\.repository_id !== repo/)
  assert.match(intelligence, /improvementJob\.repository_id !== repositoryId/)
  assert.match(memory, /controlledRepositoryId/)
  assert.match(memory, /response\.repository_id !== repo/)
})

test('TypeScript source stays within the Repository Intelligence line-length budget', () => {
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
  assert.match(plan, /Preview a controlled execution plan/)
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
  assert.match(app, /return <Navigate to={`\/intelligence\$\{location\.search\}`} replace \/>/)
  assert.match(app, /path="execution-simulation" element={<Navigate to="\/execution" replace \/>}/)
  assert.match(app, /path="\*" element={<Navigate to="\/chat" replace \/>}/)
  assert.doesNotMatch(app, /\b(?:loader|action)=/)
})
