import { describe, test, expect } from 'vitest'
import { removeUndefinedFields, formatNumber, omit, getAPIBaseURL } from './utils'

describe('removeUndefinedFields', () => {
  test('removes undefined fields', () => {
    const result = removeUndefinedFields({ a: 1, b: undefined, c: 3 })
    expect(result).toEqual({ a: 1, c: 3 })
  })

  test('removes null fields', () => {
    const result = removeUndefinedFields({ a: 1, b: null, c: 3 })
    expect(result).toEqual({ a: 1, c: 3 })
  })

  test('keeps falsy values that are not null/undefined', () => {
    const result = removeUndefinedFields({ a: 0, b: '', c: false })
    expect(result).toEqual({ a: 0, b: '', c: false })
  })

  test('handles empty object', () => {
    const result = removeUndefinedFields({})
    expect(result).toEqual({})
  })

  test('handles object with all undefined values', () => {
    const result = removeUndefinedFields({ a: undefined, b: undefined })
    expect(result).toEqual({})
  })
})

describe('formatNumber', () => {
  // Note: formatNumber uses zh-CN locale with 'min2' option
  // which only adds grouping for numbers >= 10000

  test('formats integer (small number without grouping)', () => {
    const result = formatNumber(1234)
    // 'min2' option means no grouping for numbers < 10000
    expect(result).toBe('1234')
  })

  test('formats decimal (small number without grouping)', () => {
    const result = formatNumber(1234.56)
    expect(result).toBe('1234.56')
  })

  test('returns default forNaN value for NaN', () => {
    const result = formatNumber(NaN)
    expect(result).toBe('-')
  })

  test('returns custom forNaN value', () => {
    const result = formatNumber(NaN, 'N/A')
    expect(result).toBe('N/A')
  })

  test('formats zero', () => {
    const result = formatNumber(0)
    expect(result).toBe('0')
  })

  test('formats negative number (small without grouping)', () => {
    const result = formatNumber(-1234)
    expect(result).toBe('-1234')
  })

  test('formats large number with grouping', () => {
    const result = formatNumber(1234567890)
    // Large numbers get grouping
    expect(result).toBe('1,234,567,890')
  })

  test('formats small number (less than 1000)', () => {
    const result = formatNumber(999)
    expect(result).toBe('999')
  })

  test('formats number >= 10000 with grouping', () => {
    const result = formatNumber(12345)
    expect(result).toBe('12,345')
  })
})

describe('omit', () => {
  test('removes single key', () => {
    const result = omit({ a: 1, b: 2, c: 3 }, ['b'])
    expect(result).toEqual({ a: 1, c: 3 })
  })

  test('removes multiple keys', () => {
    const result = omit({ a: 1, b: 2, c: 3, d: 4 }, ['b', 'd'])
    expect(result).toEqual({ a: 1, c: 3 })
  })

  test('handles empty keys array', () => {
    const result = omit({ a: 1, b: 2 }, [])
    expect(result).toEqual({ a: 1, b: 2 })
  })

  test('handles non-existent keys', () => {
    const result = omit({ a: 1, b: 2 }, ['c' as any])
    expect(result).toEqual({ a: 1, b: 2 })
  })

  test('does not mutate original object', () => {
    const original = { a: 1, b: 2, c: 3 }
    omit(original, ['b'])
    expect(original).toEqual({ a: 1, b: 2, c: 3 })
  })
})

describe('getAPIBaseURL', () => {
  test('returns v1 URL based on location.origin', () => {
    // Mock location.origin
    const originalLocation = window.location
    delete (window as any).location
    window.location = { origin: 'http://localhost:3000' } as any

    const result = getAPIBaseURL()
    expect(result).toBe('http://localhost:3000/v1')

    // Restore original location
    window.location = originalLocation
  })
})
