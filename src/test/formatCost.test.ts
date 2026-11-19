import { describe, expect, it } from 'vitest'
import { formatCost } from '../lib/format'

describe('formatCost', () => {
  it('distinguishes unavailable costs from an actual zero', () => {
    expect(formatCost(null)).toBe('Cost unavailable')
    expect(formatCost('')).toBe('Cost unavailable')
    expect(formatCost('not a number')).toBe('Cost unavailable')
    expect(formatCost(0)).toBe('$0.0000')
    expect(formatCost(0.00001)).toBe('<$0.0001')
    expect(formatCost(0.0123)).toBe('$0.0123')
  })
})
