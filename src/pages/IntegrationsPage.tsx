import { AlertCircle, Boxes, LoaderCircle, Plug, RefreshCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { apiFetch } from '../lib/api'
import type { BucketsResponse, ConnectorReport, ConnectorsResponse } from '../types/api'

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

  const [buckets, setBuckets] = useState<string[]>([])
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
      setBuckets(response.buckets ?? [])
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
              {connectors.map((connector) => (
                <article key={connector.name} className="rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-semibold text-white">{connector.name}</h4>
                    <StatusBadge status={connectorStatus(connector)} variant="liveness" compact />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                      {connector.configured ? 'Configured' : 'Not configured'}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                      {connector.authenticated ? 'Authenticated' : 'Not authenticated'}
                    </span>
                  </div>
                  {connector.capabilities.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-500">{connector.capabilities.join(' · ')}</p>
                  )}
                  {connector.error && (
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] text-rose-300">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {connector.error}
                    </p>
                  )}
                  {connector.rate_limit && (
                    <details className="mt-2 text-[11px] text-slate-500">
                      <summary className="cursor-pointer text-slate-400">Rate limit</summary>
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-[#061126] p-2 font-mono text-[10px]">
                        {JSON.stringify(connector.rate_limit, null, 2)}
                      </pre>
                    </details>
                  )}
                </article>
              ))}
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
            <div className="mt-3 flex flex-wrap gap-2">
              {buckets.map((bucket) => (
                <span key={bucket} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
                  {bucket}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
