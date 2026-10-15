import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acknowledgeHIVENotification, AudioNotificationSettings, notifyNewHIVEEvents, toSharedNotification } from '../components/AudioNotificationSettings'
import { CommunicationsPage, toAIMSOperationalEvent } from '../pages/CommunicationsPage'

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

  it('routes only validated, actionable AIMS alerts to HIVE browser notifications', () => {
    vi.stubGlobal('Audio', FakeAudio)
    const shown: Array<{ title: string; options?: NotificationOptions }> = []
    class FakeNotification {
      static permission = 'granted'
      onclick: (() => void) | null = null
      title: string
      options?: NotificationOptions
      constructor(title: string, options?: NotificationOptions) {
        this.title = title
        this.options = options
        shown.push({ title, options })
      }
      close() {}
    }
    vi.stubGlobal('Notification', FakeNotification)

    const event = toAIMSOperationalEvent({
      type: 'aims-comms-notification',
      id: 'review-1',
      category: 'review_required',
      title: 'Private message subject',
      summary: 'Private message body',
    })
    expect(event).toMatchObject({
      event_id: 'aims-comms:review-1',
      source: 'AIMS Comms Hub',
      title: 'AIMS Comms Hub',
      summary: 'An AIMS communication needs your review.',
    })
    notifyNewHIVEEvents(event ? [event] : [], { playAudio: false })
    expect(shown).toEqual([{ title: 'AIMS Comms Hub', options: { body: 'An AIMS communication needs your review.' } }])
    expect(play).not.toHaveBeenCalled()
    expect(toAIMSOperationalEvent({ type: 'aims-comms-notification', id: 'routine', category: 'info' })).toBeNull()
  })

  it('accepts AIMS alerts only from the embedded trusted frame', async () => {
    const shown: string[] = []
    class FakeNotification {
      static permission = 'granted'
      constructor(title: string) { shown.push(title) }
      close() {}
    }
    vi.stubGlobal('Notification', FakeNotification)
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://chat.jonathan-harris.online/console/?embed=1' }),
    }))
    render(<CommunicationsPage />)
    const frame = await screen.findByTitle('AIMS Comms Hub') as HTMLIFrameElement
    const data = {
      type: 'aims-comms-notification',
      id: 'review-2',
      category: 'review_required',
    }

    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', source: frame.contentWindow, data }))
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://chat.jonathan-harris.online', source: window, data }))
    expect(shown).toEqual([])

    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://chat.jonathan-harris.online',
      source: frame.contentWindow,
      data,
    }))
    await waitFor(() => expect(shown).toEqual(['AIMS Comms Hub']))
  })
})
