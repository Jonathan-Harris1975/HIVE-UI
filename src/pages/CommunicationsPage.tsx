import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react'

interface HandoffResponse {
  ok?: boolean
  url?: string
  detail?: string
}

const AIMS_ORIGIN = 'https://chat.jonathan-harris.online'

export function CommunicationsPage() {
  const [frameKey, setFrameKey] = useState(0)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setFrameUrl(null)
    setReady(false)
    setError(null)

    async function createHandoff() {
      try {
        const response = await fetch('/api/auth/comms-handoff?embed=1&format=json', {
          method: 'GET',
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        })
        const payload = await response.json().catch(() => ({})) as HandoffResponse
        if (!response.ok || !payload.url) throw new Error(payload.detail || `Communications handoff failed (${response.status}).`)
        const target = new URL(payload.url)
        if (target.origin !== AIMS_ORIGIN || target.pathname !== '/console/') throw new Error('Communications handoff returned an unexpected destination.')
        if (!cancelled) setFrameUrl(target.toString())
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Communications Interface could not be opened.')
      }
    }

    void createHandoff()
    return () => { cancelled = true }
  }, [frameKey])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== AIMS_ORIGIN) return
      if (event.data?.type === 'aims-comms-ready') {
        setReady(true)
        setError(null)
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
        return
      }
      if (event.data?.type === 'aims-comms-error') {
        const detail = typeof event.data?.detail === 'string' && event.data.detail.trim()
          ? event.data.detail.trim()
          : 'AIMS Comms Hub rejected the secure handoff.'
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
      setError('AIMS Comms Hub did not finish loading. Reload the interface to retry the secure handoff.')
    }, 12000)
    return () => { if (timeoutRef.current) window.clearTimeout(timeoutRef.current) }
  }, [frameUrl, ready])

  function reload() {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    setFrameKey((value) => value + 1)
  }

  return (
    <section className="relative h-full min-h-0 bg-hive-canvas" aria-label="AIMS Communications Interface" aria-busy={!ready && !error}>
      {!ready && !error && (
        <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex items-center justify-center bg-hive-canvas text-sm text-slate-400">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin text-cyan-300" aria-hidden="true" /> Opening AIMS Comms Hub
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-hive-canvas p-6">
          <div role="alert" className="max-w-md rounded-2xl border border-amber-300/20 bg-hive-panel p-6 text-center shadow-xl">
            <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-amber-300" />
            <h2 className="text-base font-semibold text-slate-100">Communications Interface unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{error}</p>
            <button type="button" onClick={reload} className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
              Retry
            </button>
          </div>
        </div>
      )}

      {frameUrl && (
        <iframe
          key={frameKey}
          title="AIMS Comms Hub"
          src={frameUrl}
          className="h-full w-full border-0 bg-hive-canvas"
          referrerPolicy="no-referrer"
          allow="clipboard-read; clipboard-write"
        />
      )}

      <button
        type="button"
        onClick={reload}
        className={
          "absolute bottom-4 right-4 z-30 rounded-xl border border-white/10 bg-hive-panel/95 p-2.5 " +
          "text-slate-300 shadow-xl backdrop-blur transition hover:border-cyan-300/30 " +
          "hover:text-cyan-100"
        }
        aria-label="Reload Communications Interface"
        title="Reload Communications Interface"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
    </section>
  )
}
