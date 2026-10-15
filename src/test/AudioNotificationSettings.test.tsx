import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acknowledgeHIVENotification, AudioNotificationSettings, notifyNewHIVEEvents, toSharedNotification } from '../components/AudioNotificationSettings'

const play = vi.fn().mockResolvedValue(undefined)
class FakeAudio {
  volume = 1
  src: string
  constructor(src: string) { this.src = src }
  play = play
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  play.mockClear()
  window.localStorage.clear()
})

describe('HIVE Elements audio notifications', () => {
  it('normalizes operational data to the shared notification event shape', () => {
    const event = toSharedNotification({ event_id: 'review-1', event_type: 'review_required', severity: 'warning', details: { requires_action: true } })
    expect(event).toMatchObject({ notification_id: 'review-1', source: 'HIVE', severity: 'review_required', requires_action: true, acknowledged_at: null, resolved_at: null })
    expect(event).toHaveProperty('action_url')
    expect(event).toHaveProperty('created_at')
  })
  it('persists settings and tests the supplied review sound', async () => {
    vi.stubGlobal('Audio', FakeAudio)
    render(<AudioNotificationSettings />)
    expect(screen.getByRole('checkbox', { name: /sound on/i })).toBeChecked()
    fireEvent.change(screen.getByRole('slider', { name: /notification volume/i }), { target: { value: '0.25' } })
    expect(JSON.parse(window.localStorage.getItem('hive-audio-notification-preferences-v1') || '{}').volume).toBe(0.25)
    fireEvent.click(screen.getByRole('button', { name: /test sound/i }))
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent('Review sound played')
  })

  it('keeps routine events silent and deduplicates actionable events', () => {
    vi.stubGlobal('Audio', FakeAudio)
    notifyNewHIVEEvents([{ event_id: 'routine', event_type: 'ci_failed', severity: 'warning' }])
    expect(play).not.toHaveBeenCalled()
    const review = { event_id: 'review-1', event_type: 'review_required', severity: 'warning', details: { requires_action: true } }
    notifyNewHIVEEvents([review])
    notifyNewHIVEEvents([review])
    expect(play).toHaveBeenCalledTimes(1)
    acknowledgeHIVENotification('review-2')
    notifyNewHIVEEvents([{ ...review, event_id: 'review-2' }])
    expect(play).toHaveBeenCalledTimes(1)
  })
})
