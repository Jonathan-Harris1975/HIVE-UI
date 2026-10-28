export interface SpendReport {
  date: string
  timezone: string
  collected_at: string
  usd: number
  gbp: { estimate: number; rate: number; rateDate: string; source: string } | null
  requests: number
  tokens: Record<string, number>
  models: Array<{ model: string; usd: number; requests: number }>
  provisional: boolean
  fresh: boolean
  source: string
  scope: string
  reconciled: boolean
}

export interface SpendResponse {
  ok: boolean
  available: boolean
  expected_date: string
  reason?: string
  report: SpendReport | null
  comparisons: Array<{
    label: string
    date: string
    available: boolean
    usd?: number
    change_usd?: number
    change_percent?: number | null
  }>
}

export function spendMoney(value: number, currency: 'USD' | 'GBP' = 'USD'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: currency === 'USD' ? 4 : 2,
  }).format(value)
}

export function spendDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London',
  }).format(new Date(`${date}T12:00:00Z`))
}

export function comparisonHint(row: SpendResponse['comparisons'][number]): string {
  if (!row.available || row.usd === undefined) return `${row.date}: no verified comparison snapshot`
  const percentage = row.change_percent === null || row.change_percent === undefined
    ? 'Percentage unavailable'
    : `${row.change_percent > 0 ? '+' : ''}${row.change_percent.toFixed(1)}%`
  return `${row.date}: ${spendMoney(row.usd)} · ${percentage}`
}
