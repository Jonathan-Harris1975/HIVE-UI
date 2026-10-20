import { describe, expect, it } from 'vitest'
import { weeklyReportHtmlHref } from '../lib/weekly-lifecycle-report'

describe('weekly lifecycle report link', () => {
  it('builds a route for a valid ISO year and week', () => {
    expect(weeklyReportHtmlHref({ period: { iso_year: 2026, iso_week: 43 } }))
      .toBe('/v1/system/lifecycle-reports/html?year=2026&week=43')
    expect(weeklyReportHtmlHref({ period: { iso_year: '2026', iso_week: '43' } }))
      .toBe('/v1/system/lifecycle-reports/html?year=2026&week=43')
  })

  it.each([
    null,
    undefined,
    '',
    false,
    0,
    { period: null },
    { period: { iso_year: null, iso_week: 43 } },
    { period: { iso_year: '', iso_week: 43 } },
    { period: { iso_year: false, iso_week: 43 } },
    { period: { iso_year: 1999, iso_week: 43 } },
    { period: { iso_year: 10000, iso_week: 43 } },
    { period: { iso_year: 2026, iso_week: 0 } },
    { period: { iso_year: 2026, iso_week: 54 } },
    { period: { iso_year: 2026, iso_week: 1.5 } },
  ])('rejects an invalid report period: %j', (report) => {
    expect(weeklyReportHtmlHref(report)).toBeNull()
  })
})
