const MIN_REPORT_YEAR = 2000
const MAX_REPORT_YEAR = 9999

function isoPeriodNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value.trim())
  return Number.isInteger(parsed) ? parsed : null
}

/** Build the HIVE report route only from a valid ISO year/week pair. */
export function weeklyReportHtmlHref(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const report = value as Record<string, unknown>
  const period = report.period
  if (!period || typeof period !== 'object' || Array.isArray(period)) return null

  const periodRecord = period as Record<string, unknown>
  const year = isoPeriodNumber(periodRecord.iso_year)
  const week = isoPeriodNumber(periodRecord.iso_week)
  if (year === null || week === null || year < MIN_REPORT_YEAR || year > MAX_REPORT_YEAR || week < 1 || week > 53) {
    return null
  }

  return `/v1/system/lifecycle-reports/html?year=${year}&week=${week}`
}
