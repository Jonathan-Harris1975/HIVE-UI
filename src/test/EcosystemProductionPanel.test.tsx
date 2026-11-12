import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EcosystemProductionPanel, ScheduledWorkPanel } from '../components/EcosystemProductionPanel'
import { apiFetch } from '../lib/api'
import { GOVERNED_REPOSITORIES } from '../lib/repositories'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))
const request = vi.mocked(apiFetch)
const report = () => ({
  ok: true, state: 'GREEN', release_decision: 'ALLOW', generated_at: new Date().toISOString(),
  repositories: GOVERNED_REPOSITORIES.map((id) => ({ repository_id: id, state: 'GREEN', runtime_state: 'GREEN',
    gate_evidence: { sha: 'a'.repeat(40), deployment: { status: 'success' }, required_workflows: { CI: { status: 'success' } } } })),
})
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers() })

it('shows production gates for all eight repositories independently of snapshots', async () => {
  request.mockResolvedValue(report())
  render(<EcosystemProductionPanel />)
  await screen.findByText('Release decision: ALLOW')
  expect(screen.getAllByRole('article')).toHaveLength(8)
  expect(request).toHaveBeenCalledWith('/v1/system/production-manager', expect.anything())
})

it('does not certify an incomplete eight-repository report', async () => {
  const value = report()
  value.repositories.pop()
  request.mockResolvedValue(value)
  render(<EcosystemProductionPanel />)
  await screen.findByText(/Evidence is stale or incomplete/)
  expect(screen.queryByText('Release decision: ALLOW')).not.toBeInTheDocument()
})

it('expires an old green decision instead of leaving it green indefinitely', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  request.mockResolvedValue(report())
  render(<EcosystemProductionPanel />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText('Release decision: ALLOW')).toBeInTheDocument()
  await act(async () => { vi.advanceTimersByTime(135_000) })
  expect(screen.getByText('Release decision: Not verified')).toBeInTheDocument()
})

it('reports a failed fetch as unknown without certifying any repository', async () => {
  request.mockRejectedValue(new Error('Evidence unavailable'))
  render(<EcosystemProductionPanel />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Evidence unavailable'))
  expect(screen.queryByText('Release decision: ALLOW')).not.toBeInTheDocument()
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
  request.mockResolvedValue(report())
  render(<EcosystemProductionPanel />)
  await screen.findByText(/Additional workflow discovery is incomplete for 8 repositories/)
})
