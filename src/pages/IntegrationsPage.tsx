import { AlertCircle, Boxes, LoaderCircle, Plug, RefreshCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { apiFetch } from '../lib/api'
import type { BucketSummary, BucketsResponse, ConnectorReport, ConnectorsResponse } from '../types/api'

function connectorLabel(name: string): string {
  if (name === 'cloudflare_ai_search') return 'Cloudflare AI Search'
  if (name === 'cloudflare_r2') return 'Cloudflare R2'
  if (name === 'openrouter') return 'OpenRouter'
  if (name === 'github') return 'GitHub'
  return name.replace(/_/g, ' ')
}

function connectorStatus(connector: ConnectorReport): string {
  if (!connector.configured) return 'not_configured'
  if (!connector.authenticated) return 'blocked'
  if (!connector.healthy) return 'down'
  return 'healthy'
}

export function IntegrationsPage() {
  const [connectors, setConnectors] = useState<ConnectorReport[]>([])
  const [connectorsLoading, setConnectorsLoading] = useState(true)
  const [connectorsError, setConnectorsError] = useState<string | null>(null)

  const [buckets, setBuckets] = useState<BucketSummary[]>([])
  const [bucketsLoading, setBucketsLoading] = useState(true)
  const [bucketsError, setBucketsError] = useState<string | null>(null)

  const loadConnectors = useCallback(async () => {
    setConnectorsLoading(true)
    setConnectorsError(null)
    try {
      const response = await apiFetch<ConnectorsResponse>('/v1/connectors')
      setConnectors(response.connectors ?? [])
    } catch (caught) {
      setConnectorsError(caught instanceof Error ? caught.message : 'Connector status could not be loaded.')
      setConnectors([])
    } finally {
      setConnectorsLoading(false)
    }
  }, [])

  const loadBuckets = useCallback(async () => {
    setBucketsLoading(true)
    setBucketsError(null)
    try {
      const response = await apiFetch<BucketsResponse>('/v1/buckets')
      const normalised = (response.buckets ?? []).map((item) =>
        typeof item === 'string'
          ? { bucket: item, configured: true, readable: true, writable: false, access_mode: 'read_only' }
          : item,
      )
      setBuckets(normalised)
    } catch (caught) {
      setBucketsError(caught instanceof Error ? caught.message : 'Bucket list could not be loaded.')
      setBuckets([])
    } finally {
      setBucketsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConnectors()
    void loadBuckets()
  }, [loadConnectors, loadBuckets])

  const healthyCount = connectors.filter((c) => connectorStatus(c) === 'healthy').length

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Integrations</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">External connector &amp; storage health</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Live status for every external connector HIVE talks to, plus the R2 buckets currently accessible to
                this deployment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadConnectors()
                void loadBuckets()
              }}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 hover:bg-white/[0.07]"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              <Plug className="h-4 w-4" /> Connectors
            </h3>
            {!connectorsLoading && connectors.length > 0 && (
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">
                {healthyCount}/{connectors.length} healthy
              </span>
            )}
          </div>

          {connectorsError && (
            <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{connectorsError}</div>
          )}

          {connectorsLoading ? (
            <div className="mt-4 flex items-center justify-center py-12 text-slate-400">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading connectors
            </div>
          ) : connectors.length === 0 ? (
            !connectorsError && (
              <div className="mt-3">
                <EmptyState icon={<Plug className="h-5 w-5" />} title="No connectors reported." />
              </div>
            )
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {connectors.map((connector) => {
                const aiSearchDiagnostics = connector.name === 'cloudflare_ai_search' ? connector.diagnostics : null
                const aiSearchTotal = typeof aiSearchDiagnostics?.instance_count === 'number' ? aiSearchDiagnostics.instance_count : null
                const aiSearchActive = typeof aiSearchDiagnostics?.active_instance_count === 'number' ? aiSearchDiagnostics.active_instance_count : null
                const aiSearchPaused = typeof aiSearchDiagnostics?.paused_instance_count === 'number' ? aiSearchDiagnostics.paused_instance_count : 0
                const aiSearchErrors = typeof aiSearchDiagnostics?.indexing_error_count === 'number' ? aiSearchDiagnostics.indexing_error_count : 0
                const aiSearchStatsFailures = typeof aiSearchDiagnostics?.stats_failure_count === 'number' ? aiSearchDiagnostics.stats_failure_count : 0
                const aiSearchInstances = Array.isArray(aiSearchDiagnostics?.instances) ? aiSearchDiagnostics.instances : []
                const pausedNames = aiSearchInstances
                  .filter((item) => item && typeof item === 'object' && 'paused' in item && item.paused === true)
                  .map((item) => String('name' in item && item.name ? item.name : 'id' in item ? item.id : 'unknown'))
                const errorNames = aiSearchInstances
                  .filter((item) => item && typeof item === 'object' && 'error' in item && typeof item.error === 'number' && item.error > 0)
                  .map((item) => `${String('name' in item && item.name ? item.name : 'id' in item ? item.id : 'unknown')} (${String(item.error)})`)

                return (
                  <article key={connector.name} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-sm font-semibold text-white">{connectorLabel(connector.name)}</h4>
                      <StatusBadge status={connectorStatus(connector)} variant="liveness" compact />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-400">
                      <span className="rounded-full border border-white/10 px-2 py-0.5">
                        {connector.configured ? 'Configured' : 'Not configured'}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5">
                        {connector.authenticated ? 'Authenticated' : 'Not authenticated'}
                      </span>
                      {aiSearchTotal !== null && (
                        <span className="rounded-full border border-cyan-300/15 bg-cyan-300/7 px-2 py-0.5 text-cyan-100">
                          {aiSearchActive ?? aiSearchTotal}/{aiSearchTotal} AI Search indexes active
                        </span>
                      )}
                    </div>
                    {connector.capabilities.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">{connector.capabilities.join(' · ')}</p>
                    )}
                    {aiSearchPaused > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-200">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        {aiSearchPaused} AI Search index{aiSearchPaused === 1 ? ' is' : 'es are'} paused{pausedNames.length ? `: ${pausedNames.join(', ')}` : '.'}
                      </p>
                    )}
                    {aiSearchErrors > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        {aiSearchErrors} AI Search indexing error{aiSearchErrors === 1 ? '' : 's'}{errorNames.length ? `: ${errorNames.join(', ')}` : '.'}
                      </p>
                    )}
                    {aiSearchStatsFailures > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-200">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        Indexing statistics could not be verified for {aiSearchStatsFailures} AI Search index{aiSearchStatsFailures === 1 ? '' : 'es'}.
                      </p>
                    )}
                    {(connector.error || (typeof connector.diagnostics?.reason === 'string' ? connector.diagnostics.reason : null)) && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {connector.error || String(connector.diagnostics?.reason)}
                      </p>
                    )}
                    {connector.rate_limit && (
                      <details className="mt-2 text-xs text-slate-500">
                        <summary className="cursor-pointer text-slate-400">Rate limit</summary>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-[#061126] p-2 font-mono text-xs">
                          {JSON.stringify(connector.rate_limit, null, 2)}
                        </pre>
                      </details>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <Boxes className="h-4 w-4" /> Accessible R2 buckets
          </h3>
          {bucketsError && (
            <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{bucketsError}</div>
          )}
          {bucketsLoading ? (
            <div className="mt-4 flex items-center justify-center py-12 text-slate-400">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading buckets
            </div>
          ) : buckets.length === 0 ? (
            !bucketsError && (
              <div className="mt-3">
                <EmptyState icon={<Boxes className="h-5 w-5" />} title="No buckets accessible." body="This deployment has no configured R2 buckets, or hidden buckets are filtered out." />
              </div>
            )
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {buckets.map((bucket) => {
                const status = !bucket.configured
                  ? 'not_configured'
                  : bucket.writable
                    ? 'healthy'
                    : bucket.readable
                      ? 'ready'
                      : 'degraded'
                return (
                  <article key={`${bucket.lane ?? 'bucket'}:${bucket.bucket}`} className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-100">{bucket.bucket}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {bucket.lane ? `${bucket.lane.replace(/_/g, ' ')} · ` : ''}{bucket.access_mode ?? 'unknown access'}
                        </p>
                      </div>
                      <StatusBadge status={status} variant="readiness" compact />
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
