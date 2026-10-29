import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpsPage } from '../pages/OpsPage'
import { apiFetch } from '../lib/api'

const { refreshHealth } = vi.hoisted(() => ({ refreshHealth: vi.fn() }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ refreshHealth }) }))
vi.mock('../context/InspectorContext', () => ({ useInspector: () => ({ setPayload: vi.fn(), setOpen: vi.fn() }) }))
vi.mock('../components/AudioNotificationSettings', () => ({
  AudioNotificationSettings: () => null,
  notifyNewHIVEEvents: vi.fn(), acknowledgeHIVENotification: vi.fn(),
}))
vi.mock('../lib/api', async (original) => ({ ...await original<typeof import('../lib/api')>(), apiFetch: vi.fn() }))

const fetchApi = vi.mocked(apiFetch)
let failing = false
let visibility = 'visible'

function response(path: string): unknown {
  if (failing) throw new Error('Upstream unavailable')
  if (path === '/health') return { ok: true, openrouter_configured: true }
  if (path.includes('/templates')) return { templates: {} }
  if (path.includes('/ops-events')) return { ok: true, items: [], count: 0 }
  if (path.includes('/purge-reset/targets')) return { ok: true, targets: [] }
  if (path.includes('/lifecycle-reports/current')) return {
    ok: true, available: true, report: { report_id: 'weekly-2026-W44', overall_status: 'UNKNOWN', repositories: [] },
  }
  return { ok: true, items: [] }
}

async function mount() {
  render(<MemoryRouter><OpsPage /></MemoryRouter>)
  await act(async () => {})
}

beforeEach(() => {
  vi.useFakeTimers()
  failing = false
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  fetchApi.mockReset().mockImplementation(async (path) => response(path))
  refreshHealth.mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe('Operations snapshot refresh', () => {
  it('does not expire a response received after the previous freshness clock tick', async () => {
    fetchApi.mockImplementation(async (path) => {
      await new Promise(resolve => setTimeout(resolve, 750))
      return response(path)
    })
    await mount()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(screen.getByText(/weekly-2026-W44/)).toBeInTheDocument()
    expect(screen.queryByText(/Operational data is stale/)).not.toBeInTheDocument()
  })

  it('keeps the entire snapshot current beyond the two-minute expiry', async () => {
    await mount()
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000) })
    expect(fetchApi.mock.calls.filter(([p]) => p === '/v1/system/lifecycle-reports/current')).toHaveLength(4)
    expect(screen.getByText(/weekly-2026-W44/)).toBeInTheDocument()
    expect(screen.queryByText(/Operational data is stale/)).not.toBeInTheDocument()
  })

  it('refreshes the full snapshot immediately after returning to a suspended tab', async () => {
    await mount()
    visibility = 'hidden'
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000) })
    expect(screen.getAllByText(/Operational data is stale/).length).toBeGreaterThan(0)
    visibility = 'visible'
    await act(async () => { fireEvent(document, new Event('visibilitychange')) })
    expect(screen.getByText(/weekly-2026-W44/)).toBeInTheDocument()
    expect(screen.queryByText(/Operational data is stale/)).not.toBeInTheDocument()
  })

  it('clears failed data and recovers on the next automatic refresh', async () => {
    await mount()
    failing = true
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(screen.queryByText(/weekly-2026-W44/)).not.toBeInTheDocument()
    expect(screen.getByText(/Upstream unavailable/)).toBeInTheDocument()
    failing = false
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(screen.getByText(/weekly-2026-W44/)).toBeInTheDocument()
    expect(screen.queryByText(/Upstream unavailable/)).not.toBeInTheDocument()
  })
})
