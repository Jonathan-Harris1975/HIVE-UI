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

test('Operations database reset requires explicit destructive confirmation', () => {
  const page = source('src/pages/OpsPage.tsx')
  assert.match(page, /DATABASE_PURGE_CONFIRMATION = 'PURGE ALL DATABASES'/)
  assert.match(page, /apiFetch<DatabasePurgeResetResponse>\('\/v1\/db\/purge-reset'/)
  assert.match(page, /confirmDisabled=\{purgeConfirmation !== DATABASE_PURGE_CONFIRMATION\}/)
  assert.match(page, /database-hive/)
  assert.match(page, /database-comms-hub/)
  assert.match(page, /R2, Vectorize, Workers KV and Durable Object storage are not touched/)
})
