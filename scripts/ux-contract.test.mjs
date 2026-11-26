import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('ConfirmDialog keeps Escape wired to cancel with branded dialog semantics', () => {
  const component = source('src/components/ConfirmDialog.tsx')
  assert.match(component, /role="dialog"/)
  assert.match(component, /aria-modal="true"/)
  assert.match(component, /event\.key === 'Escape'/)
  assert.match(component, /onCancel\(\)/)
  assert.match(component, /querySelectorAll<HTMLElement>/)
})

test('ModelPicker supports keyboard list navigation and skips disabled models', () => {
  const component = source('src/components/ModelPicker.tsx')
  assert.match(component, /role="listbox"/)
  assert.match(component, /role="option"/)
  assert.match(component, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'/)
  assert.match(component, /selectableOptions\.length/)
  assert.match(component, /item\.chat_selectable !== false/)
  assert.match(component, /onKeyDown=\{handleListKeyDown\}/)
})

test('ChatPage checks title and auto_titled state before requesting auto-title', () => {
  const page = source('src/pages/ChatPage.tsx')
  assert.match(page, /currentConversationSummary\?\.title/)
  assert.match(page, /currentConversationSummary\.auto_titled === false/)
  assert.match(page, /autoTitleConversation\(completedConversationId\)/)
})

test('Operations database reset is read-only in HIVE-UI', () => {
  const page = source('src/pages/OpsPage.tsx')
  assert.match(page, /\/v1\/db\/purge-reset\/targets/)
  assert.match(page, /\/v1\/db\/purge-reset\/preview/)
  assert.match(page, /Database to preview/)
  assert.match(page, /This preview is read-only\. Approved database resets must use the trusted operator channel\./)
  assert.match(page, /Preview row counts/)
  assert.match(page, /No application rows were reported in this preview/)
  assert.doesNotMatch(page, /apiFetch<DatabasePurgeResetResponse>\('\/v1\/db\/purge-reset'/)
  assert.doesNotMatch(page, /Review reset of/)
  assert.doesNotMatch(page, /purgeResetDatabases/)
})

test('Operational alert deletion updates the inbox without a full page refresh', () => {
  const page = source('src/pages/OpsPage.tsx')
  const deletion = page.slice(page.indexOf('const deleteOpsEvents'), page.indexOf('const previewDatabaseReset'))
  assert.match(deletion, /setOpsEvents\(\(current\)/)
  assert.doesNotMatch(deletion, /await loadOps\(\)/)
})
