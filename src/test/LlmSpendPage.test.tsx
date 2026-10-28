import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmSpendPage } from '../pages/LlmSpendPage'
import { apiFetch } from '../lib/api'
import type { SpendResponse } from '../lib/llm-spend'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))
const fetchReport = vi.mocked(apiFetch)
const fixture = (): SpendResponse => ({
  ok: true,
  available: true,
  expected_date: '2026-10-27',
  comparisons: [{ label: 'Previous day', date: '2026-10-26', available: false }],
  report: {
    date: '2026-10-27',
    timezone: 'Europe/London',
    collected_at: '2026-10-28T07:00:00Z',
    usd: 2.25,
    gbp: null,
    requests: 8,
    tokens: { tokens_prompt: 0 },
    models: [{ model: 'Luna', usd: 2.25, requests: 8 }],
    provisional: true,
    fresh: true,
    reconciled: true,
    source: 'OpenRouter Analytics API',
    scope: 'Whole OpenRouter account',
  },
})

beforeEach(() => vi.resetAllMocks())

describe('daily LLM spend report', () => {
  it('shows recorded charges and honest gaps without inventing GBP, tokens or quality', async () => {
    fetchReport.mockResolvedValue(fixture())
    render(<LlmSpendPage />)
    expect(await screen.findByText('27 October 2026')).toBeInTheDocument()
    expect(screen.getAllByText('US$2.25')).toHaveLength(2)
    expect(screen.getByText('Luna')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText(/Quality pass rates.*not yet linked/)).toBeInTheDocument()
    expect(screen.queryByText(/savings achieved/i)).not.toBeInTheDocument()
  })

  it('does not render missing evidence as zero spend', async () => {
    fetchReport.mockResolvedValue({
      ok: true,
      available: false,
      report: null,
      expected_date: '2026-10-27',
      comparisons: [],
    })
    render(<LlmSpendPage />)
    expect(await screen.findByText('Report unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Recorded USD spend')).not.toBeInTheDocument()
    expect(screen.queryByText('US$0.00')).not.toBeInTheDocument()
  })

  it('labels stale evidence and sourced GBP estimates', async () => {
    const response = fixture()
    response.report!.fresh = false
    response.report!.gbp = { estimate: 1.69, rate: 0.75, rateDate: '2026-10-27', source: 'Example reference' }
    fetchReport.mockResolvedValue(response)
    render(<LlmSpendPage />)
    expect(await screen.findByText('Out of date')).toBeInTheDocument()
    expect(screen.getByText('£1.69')).toBeInTheDocument()
    expect(screen.getByText(/Converted using Example reference, 2026-10-27/)).toBeInTheDocument()
  })

  it('requests a selected date through the authenticated same-origin API without refreshing provider usage', async () => {
    fetchReport.mockResolvedValue(fixture())
    render(<LlmSpendPage />)
    await screen.findByText('Luna')
    fireEvent.change(screen.getByLabelText('Reporting date'), { target: { value: '2026-10-26' } })
    fireEvent.click(screen.getByRole('button', { name: 'View report' }))
    await waitFor(() =>
      expect(fetchReport).toHaveBeenLastCalledWith(
        '/v1/system/llm-spend?date=2026-10-26',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    )
    expect(fetchReport.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  })

  it('shows a readable service failure instead of fabricated figures', async () => {
    fetchReport.mockRejectedValue(new Error('private upstream detail'))
    render(<LlmSpendPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The spend report could not be loaded')
    expect(screen.queryByText('private upstream detail')).not.toBeInTheDocument()
    expect(screen.queryByText('Recorded USD spend')).not.toBeInTheDocument()
  })
})
