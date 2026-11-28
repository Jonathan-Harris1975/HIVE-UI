import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EcosystemProductionPanel, ScheduledWorkPanel } from '../components/EcosystemProductionPanel'
import { apiFetch } from '../lib/api'
import { GOVERNED_REPOSITORIES, healthyServiceCount, healthEvidenceFresh } from '../lib/repositories'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))
const request = vi.mocked(apiFetch)
const report = () => ({
  ok: true, state: 'GREEN', release_decision: 'ALLOW', generated_at: new Date().toISOString(),
  repositories: GOVERNED_REPOSITORIES.map((id) => ({ repository_id: id, state: 'GREEN', runtime_state: 'GREEN',
    gate_evidence: { sha: 'a'.repeat(40), deployment: { status: 'success' }, additional_workflows_complete: true, required_workflows: { CI: { status: 'success' } } } })),
})
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers() })

it('shows an explicit unknown loading state before evidence arrives', () => {
  request.mockReturnValue(new Promise(() => {}))
  render(<EcosystemProductionPanel />)
  expect(screen.getByText(/Checking live runtime and release evidence/)).toBeInTheDocument()
  expect(screen.getByText('Release decision: Not verified')).toBeInTheDocument()
  expect(screen.getByText('Runtime health: Not verified')).toBeInTheDocument()
})

it('filters repository cards to the attention items', async () => {
  const value = report()
  value.repositories[1].state = 'BLOCKED'
  request.mockResolvedValue(value)
  render(<EcosystemProductionPanel />)
  await screen.findByText('Release decision: Allowed')
  fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'attention' } })
  const section = screen.getByLabelText('Ecosystem production readiness')
  expect(within(section).getByRole('heading', { name: 'HIVE-UI' })).toBeInTheDocument()
  expect(within(section).queryByRole('heading', { name: 'HIVE' })).not.toBeInTheDocument()
  expect(within(section).getByText('Showing 1 of 8 repositories')).toBeInTheDocument()
})

it('shows production gates for all eight repositories independently of snapshots', async () => {
  request.mockResolvedValue(report())
  render(<EcosystemProductionPanel />)
  await screen.findByText('Release decision: Allowed')
  expect(screen.getAllByRole('article')).toHaveLength(8)
  expect(request).toHaveBeenCalledWith('/v1/system/production-manager', expect.anything())
})

it('renders governed snapshot details in the corresponding production card', async () => {
  request.mockResolvedValue(report())
  render(<EcosystemProductionPanel renderRepositoryDetails={(id) => <span>Snapshot for {id}</span>} />)
  await screen.findByText('Release decision: Allowed')
  for (const id of GOVERNED_REPOSITORIES) {
    const card = screen.getByRole('heading', { name: id }).closest('article')
    expect(card).not.toBeNull()
    expect(within(card!).getByText(`Snapshot for ${id}`)).toBeInTheDocument()
  }
})

it('shows Ok for green runtimes and dot-only indicators without hiding warnings', async () => {
  const value = report()
  value.repositories[1].runtime_state = 'BLOCKED'
  value.repositories[1].state = 'BLOCKED'
  request.mockResolvedValue(value)
  render(<EcosystemProductionPanel />)
  await screen.findByText('Release decision: Allowed')
  expect(screen.getAllByText('Runtime: Ok')).toHaveLength(7)
  expect(screen.getByText('Runtime: Blocked')).toBeInTheDocument()
  const section = screen.getByLabelText('Ecosystem production readiness')
  const cards = within(section).getAllByRole('article')
  const readyLabels = cards.flatMap((card) => within(card).queryAllByText('Ready'))
  const blockedLabels = cards.flatMap((card) => within(card).queryAllByText('Blocked'))
  expect(readyLabels).toHaveLength(7)
  expect(blockedLabels).toHaveLength(1)
  expect([...readyLabels, ...blockedLabels].every((label) =>
    label.parentElement?.querySelector('[aria-hidden="true"]'),
  )).toBe(true)
})

it('does not certify an incomplete eight-repository report', async () => {
  const value = report()
  value.repositories.pop()
  request.mockResolvedValue(value)
  render(<EcosystemProductionPanel />)
  await screen.findByText(/Evidence is stale or incomplete/)
  expect(screen.queryByText('Release decision: Allowed')).not.toBeInTheDocument()
})

it('expires an old green decision instead of leaving it green indefinitely', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  request.mockResolvedValue(report())
  render(<EcosystemProductionPanel />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText('Release decision: Allowed')).toBeInTheDocument()
  await act(async () => { vi.advanceTimersByTime(135_000) })
  expect(screen.getByText('Release decision: Not verified')).toBeInTheDocument()
})

it('reports a failed fetch as unknown without certifying any repository', async () => {
  request.mockRejectedValue(new Error('Evidence unavailable'))
  render(<EcosystemProductionPanel />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Evidence unavailable'))
  expect(screen.queryByText('Release decision: Allowed')).not.toBeInTheDocument()
})

it('shows failed business work even when the scheduler heartbeat is healthy', () => {
  render(<ScheduledWorkPanel scheduler={{ repo: 'MAST', status: 'healthy', operational: { status: 'healthy', payload: {
    last_tick_at: '2026-11-12T14:00:00Z', recent_jobs: [
      { job: 'operation-thursday-am', group: 'operations', ok: false, finished_at: '2026-11-12T10:56:00Z' },
      { job: 'kdp-weekly-research', group: 'kdp', ok: true, finished_at: '2026-11-12T12:00:00Z' },
    ],
  } } }} />)
  expect(screen.getByText('Failed')).toBeInTheDocument()
  expect(screen.getByText('Succeeded')).toBeInTheDocument()
  expect(screen.getByText('operation-thursday-am')).toBeInTheDocument()
})


it('does not present a partial additional-workflow scan as complete', async () => {
  const value = report()
  for (const item of value.repositories) item.gate_evidence!.additional_workflows_complete = false
  request.mockResolvedValue(value)
  render(<EcosystemProductionPanel />)
  await screen.findByText(/Additional workflow discovery is incomplete for 8 repositories/)
})


it.each([
  ['pending', 'DEGRADED', 'Verification in progress'],
  ['missing', 'DEGRADED', 'Awaiting verification'],
  ['failure', 'BLOCKED', 'Release verification failed'],
  ['cancelled', 'DEGRADED', 'Release unverified'],
  ['skipped', 'DEGRADED', 'Release unverified'],
  ['unavailable', 'DEGRADED', 'Evidence unavailable'],
])('distinguishes %s release evidence from healthy runtime across all repositories', async (status, state, label) => {
  const value = report()
  value.state = state
  value.release_decision = state === 'BLOCKED' ? 'BLOCK' : 'HOLD'
  for (const item of value.repositories) {
    item.state = state
    item.gate_evidence.required_workflows.CI.status = status
  }
  request.mockResolvedValue(value)
  render(<EcosystemProductionPanel />)
  await screen.findByText('Runtime health: 8/8 healthy')
  for (const id of GOVERNED_REPOSITORIES) {
    const card = screen.getByRole('heading', { name: id }).closest('article')!
    expect(within(card).getByText(label)).toBeVisible()
    expect(within(card).getByText('Runtime: Ok')).toBeVisible()
    expect(within(card).getByText('Deployment: success')).toBeVisible()
    expect(within(card).getByText('CI/deployment: CI: ' + status)).toBeVisible()
  }
  expect(screen.queryByText('Release decision: Allowed')).not.toBeInTheDocument()
})

it('counts only genuinely healthy services and expires old or missing health evidence', () => {
  expect(healthyServiceCount([{ status: 'healthy' }, { status: 'busy' }, { status: 'standby' }])).toBe(1)
  const now = Date.now()
  expect(healthEvidenceFresh(new Date(now - 121_000).toISOString(), now)).toBe(false)
  expect(healthEvidenceFresh(undefined, now)).toBe(false)
  expect(healthEvidenceFresh(new Date(now).toISOString(), now)).toBe(true)
})
