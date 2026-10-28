import { useEffect, useState, type FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card, PageHeader, Section, Stat } from '../components/ui'
import { apiFetch } from '../lib/api'
import { comparisonHint, spendDate, spendMoney, type SpendResponse } from '../lib/llm-spend'

const count = (value: number | undefined) =>
  value === undefined ? 'Unavailable' : value.toLocaleString('en-GB')
const tokenLabels = [
  ['tokens_prompt', 'Input tokens'],
  ['tokens_completion', 'Output tokens'],
  ['tokens_reasoning', 'Reasoning tokens'],
  ['tokens_cached', 'Cached tokens'],
] as const

export function LlmSpendPage() {
  const [date, setDate] = useState('')
  const [activeDate, setActiveDate] = useState('')
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<SpendResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    void apiFetch<SpendResponse>(
      `/v1/system/llm-spend${activeDate ? `?date=${encodeURIComponent(activeDate)}` : ''}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled)
          setError('The spend report could not be loaded. Try again when the service is available.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeDate, revision])

  function viewDate(event: FormEvent) {
    event.preventDefault()
    setActiveDate(date)
    setRevision((value) => value + 1)
  }

  const report = data?.available ? data.report : null
  const button =
    'rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-100 hover:bg-white/10 disabled:opacity-50'

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Daily LLM spend"
        description="OpenRouter charges across your account, with model costs and clear evidence gaps."
        action={
          <button className={button} disabled={loading} onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Reload report
          </button>
        }
      />
      <form onSubmit={viewDate} className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm text-slate-300">
          <span className="block">Reporting date</span>
          <input
            aria-label="Reporting date"
            type="date"
            value={date}
            max={data?.expected_date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-lg border border-white/15 bg-hive-surface px-3 py-2 text-white"
          />
        </label>
        <button className={button} disabled={loading}>
          View report
        </button>
        <button
          type="button"
          className={button}
          disabled={loading}
          onClick={() => {
            setDate('')
            setActiveDate('')
            setRevision((value) => value + 1)
          }}
        >
          Latest report
        </button>
        <p className="text-sm text-slate-400">Complete calendar days · UK time</p>
      </form>
      {loading && (
        <p role="status" className="text-slate-300">
          Loading spend evidence…
        </p>
      )}
      {error && (
        <Card>
          <p role="alert" className="text-amber-200">
            {error}
          </p>
          <p className="mt-2 text-sm text-slate-400">Spend is unavailable until the report can be read.</p>
        </Card>
      )}
      {!loading && !error && !report && (
        <Card>
          <h3 className="font-semibold text-white">Report unavailable</h3>
          <p className="mt-2 text-slate-300">
            {data?.reason || 'No verified spend evidence is available for this day.'}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Missing evidence is not £0 spend. Collection or private report access needs checking.
          </p>
        </Card>
      )}
      {report && (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{spendDate(report.date)}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {report.scope} · {report.source}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm ${!activeDate && !report.fresh ? 'bg-amber-300/10 text-amber-200' : 'bg-cyan-300/10 text-cyan-200'}`}
              >
                {activeDate ? 'Historical report' : report.fresh ? 'Current daily report' : 'Out of date'}
              </span>
            </div>
            {!activeDate && !report.fresh && (
              <p role="status" className="mt-3 text-amber-200">
                The latest snapshot is older than expected. These are dated figures, not current daily spend.
              </p>
            )}
            <p className="mt-3 text-sm text-slate-400">
              Collected {new Date(report.collected_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}{' '}
              UK time. Provider totals are provisional and may be adjusted.
            </p>
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <Stat
                label="Estimated GBP spend"
                value={report.gbp ? spendMoney(report.gbp.estimate, 'GBP') : 'Unavailable'}
                hint={
                  report.gbp
                    ? `Converted using ${report.gbp.source}, ${report.gbp.rateDate}. Card settlement may differ.`
                    : 'A dated exchange-rate source is required. Recorded USD is shown alongside.'
                }
              />
            </Card>
            <Card>
              <Stat
                label="Recorded USD spend"
                value={spendMoney(report.usd)}
                hint="Usage charges recorded by OpenRouter; excludes inferred VAT and top-ups."
              />
            </Card>
            <Card>
              <Stat
                label="Provider requests"
                value={count(report.requests)}
                hint="API requests, not completed tasks or standards."
              />
            </Card>
          </div>
          <Section
            title="Account spend comparison"
            description="Changes in account totals can reflect workload changes. They do not prove efficiency savings or maintained quality."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {data?.comparisons.map((row) => (
                <Card key={row.label}>
                  <Stat
                    label={row.label}
                    value={
                      row.available && row.change_usd !== undefined
                        ? `${row.change_usd > 0 ? '+' : row.change_usd < 0 ? '−' : ''}${spendMoney(Math.abs(row.change_usd))}`
                        : 'Unavailable'
                    }
                    hint={comparisonHint(row)}
                  />
                </Card>
              ))}
            </div>
          </Section>
          <Section
            title="Spend by model"
            description="Model totals reconcile with the account charge. Repository attribution is not inferred from model names."
          >
            <Card className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">OpenRouter model usage for {report.date}</caption>
                <thead className="border-b border-white/10 text-slate-400">
                  <tr>
                    <th scope="col" className="pb-3 pr-4">
                      Model
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right">
                      Recorded USD
                    </th>
                    <th scope="col" className="pb-3 text-right">
                      Requests
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.models.map((row) => (
                    <tr key={row.model} className="border-b border-white/5 text-slate-200">
                      <th scope="row" className="py-3 pr-4 font-normal">
                        {row.model}
                      </th>
                      <td className="py-3 pr-4 text-right tabular-nums">{spendMoney(row.usd)}</td>
                      <td className="py-3 text-right tabular-nums">{count(row.requests)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.models.length === 0 && (
                <p className="mt-3 text-slate-300">
                  The verified report contains no billable model activity.
                </p>
              )}
            </Card>
          </Section>
          <Section title="Token usage">
            <Card>
              <div className="grid gap-5 sm:grid-cols-4">
                {tokenLabels.map(([key, label]) => (
                  <Stat key={key} label={label} value={count(report.tokens[key])} />
                ))}
              </div>
            </Card>
          </Section>
        </>
      )}
      <Section title="What this report can establish">
        <Card>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
            <li>OpenRouter is the only LLM provider currently in scope. All account traffic is included.</li>
            <li>
              Cost per successful standard, repository/task allocation, podcast separation and retry costs are
              unavailable until task evidence is linked.
            </li>
            <li>
              Quality pass rates and publication outcomes are not yet linked here. Lower spend alone does not
              show that quality has been maintained.
            </li>
            <li>
              The historical £6 per standard remains an unverified reference. Like-for-like savings require a
              measured baseline.
            </li>
          </ul>
        </Card>
      </Section>
    </div>
  )
}
