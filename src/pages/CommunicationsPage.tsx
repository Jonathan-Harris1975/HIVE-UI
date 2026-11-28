import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { notifyNewHIVEEvents } from '../components/AudioNotificationSettings'

interface HandoffResponse {
  ok?: boolean
  url?: string
  detail?: string
}

const AIMS_ORIGIN = 'https://chat.jonathan-harris.online'

export function toAIMSOperationalEvent(message: unknown) {
  if (!message || typeof message !== 'object') return null
  const payload = message as Record<string, unknown>
  if (payload.type !== 'aims-comms-notification') return null
  if (typeof payload.id !== 'string') return null
  const id = payload.id.trim()
  if (!id || id.length > 200) return null
  if (typeof payload.category !== 'string') return null

  const category = payload.category
  const summaries: Record<string, string> = {
    urgent: 'An urgent AIMS communication needs your attention.',
    review_required: 'An AIMS communication needs your review.',
    new_message: 'An actionable AIMS message needs your attention.',
    resolved: 'A communication has been marked as resolved.',
  }
  if (!Object.prototype.hasOwnProperty.call(summaries, category)) return null

  return {
    event_id: `aims-comms:${id}`,
    source: 'AIMS Comms Hub',
    event_type: category === 'urgent' ? 'service_blocked' : category,
    severity: category === 'urgent' ? 'critical' : 'warning',
    details: { requires_action: category !== 'resolved' },
    title: 'AIMS Comms Hub',
    summary: summaries[category],
  }
}

export function CommunicationsPage() {
  const [frameKey, setFrameKey] = useState(0)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const requestTimeout = window.setTimeout(() => controller.abort(), 15000)
    setFrameUrl(null)
    setReady(false)
    setError(null)

    async function createHandoff() {
      try {
        const response = await fetch('/api/auth/comms-handoff?embed=1&format=json', {
          method: 'GET',
          credentials: 'same-origin',
          signal: controller.signal,
          headers: { accept: 'application/json' },
        })
        const payload = await response.json().catch(() => ({})) as HandoffResponse
        if (!response.ok || !payload.url) throw new Error(payload.detail || `Communications handoff failed (${response.status}).`)
        const target = new URL(payload.url)
        if (target.origin !== AIMS_ORIGIN || target.pathname !== '/console/') throw new Error('Communications handoff returned an unexpected destination.')
        if (!cancelled) setFrameUrl(target.toString())
      } catch (cause) {
        if (!cancelled) {
          const message = controller.signal.aborted
            ? 'Communications took too long to connect. Retry to reconnect.'
            : cause instanceof Error ? cause.message : 'Communications Interface could not be opened.'
          setError(message)
        }
      } finally {
        window.clearTimeout(requestTimeout)
      }
    }

    void createHandoff()
    return () => { cancelled = true; window.clearTimeout(requestTimeout); controller.abort() }
  }, [frameKey])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== AIMS_ORIGIN) return
      if (event.source !== frameRef.current?.contentWindow) return
      if (event.data?.type === 'aims-comms-notification') {
        const notificationEvent = toAIMSOperationalEvent(event.data)
        if (notificationEvent) notifyNewHIVEEvents([notificationEvent], { playAudio: false })
        return
      }
      if (event.data?.type === 'aims-comms-ready') {
        setReady(true)
        setError(null)
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
        return
      }
      if (event.data?.type === 'aims-comms-error') {
        const detail = typeof event.data?.detail === 'string' && event.data.detail.trim()
          ? event.data.detail.trim()
          : 'Communications could not establish a secure connection.'
        setReady(false)
        setError(detail)
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!frameUrl || ready) return
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => {
      setError('Communications took too long to load. Retry to reconnect.')
    }, 30000)
    return () => { if (timeoutRef.current) window.clearTimeout(timeoutRef.current) }
  }, [frameUrl, ready])

  function reload() {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    setReady(false)
    setError(null)
    setFrameUrl(null)
    setFrameKey((value) => value + 1)
  }

  return (
    <section className="relative h-full min-h-0 bg-hive-canvas" aria-label="Communications workspace" aria-busy={!ready && !error}>
      {!ready && !error && (
        <div role="status" aria-live="polite" className="absolute inset-0 z-10 overflow-hidden bg-hive-canvas">
          <div className="border-b border-hive-border bg-hive-canvas px-3 sm:px-6">
            <div aria-hidden="true" className="flex h-12 items-center gap-5 overflow-hidden">
              {[80, 112, 56, 88, 72].map((width, index) => (
                <span key={index} style={{ width }} className="h-3 shrink-0 rounded bg-white/[0.08] motion-safe:animate-pulse" />
              ))}
            </div>
          </div>
          <div className="space-y-4 p-3 sm:p-6">
            <p className="text-sm font-medium text-hive-muted">Loading communications…</p>
            <div aria-hidden="true" className="space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="rounded-hive border border-hive-border bg-hive-panel p-4 motion-safe:animate-pulse">
                  <div className="mb-3 h-3 w-2/5 rounded bg-white/[0.08]" />
                  <div className="h-3 w-3/4 rounded bg-white/[0.05]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-hive-canvas p-6">
          <div role="alert" className="max-w-md rounded-2xl border border-amber-300/20 bg-hive-panel p-6 text-center shadow-xl">
            <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-amber-300" />
            <h2 className="text-base font-semibold text-slate-100">Communications unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{error}</p>
            <button type="button" onClick={reload} className="mt-5 min-h-11 rounded-hive border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
              Retry
            </button>
          </div>
        </div>
      )}

      {frameUrl && (
        <iframe
          key={frameKey}
          ref={frameRef}
          title="AIMS Comms Hub"
          src={frameUrl}
          className={`block h-full w-full border-0 bg-hive-canvas ${!ready || error ? 'invisible' : ''}`}
          tabIndex={ready && !error ? 0 : -1}
          aria-hidden={!ready || Boolean(error)}
          referrerPolicy="no-referrer"
          allow="autoplay https://chat.jonathan-harris.online; clipboard-read; clipboard-write"
        />
      )}

    </section>
  )
}
