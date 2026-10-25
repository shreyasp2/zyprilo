import { describe, expect, it } from 'vitest'
import { elapsedMs, formatClock, formatSeconds, randomInt } from '../src/lib/time'

describe('elapsedMs', () => {
  it('measures positive durations', () => {
    expect(elapsedMs(1000, 1500)).toBe(500)
  })

  it('never returns a negative time', () => {
    expect(elapsedMs(2000, 1500)).toBe(0)
  })

  it('defaults the end to the monotonic clock', () => {
    const start = performance.now() - 10
    expect(elapsedMs(start)).toBeGreaterThanOrEqual(10)
  })
})

describe('formatSeconds / formatClock', () => {
  it('keeps two decimals under ten seconds', () => {
    expect(formatSeconds(1234)).toBe('1.23')
  })

  it('switches to one decimal from ten seconds', () => {
    expect(formatSeconds(12_345)).toBe('12.3')
  })

  it('formats minutes as m:ss.s', () => {
    expect(formatClock(65_400)).toBe('1:05.4')
    expect(formatClock(30_000)).toBe('0:30.0')
  })

  it('clamps negative inputs to zero', () => {
    expect(formatSeconds(-50)).toBe('0.00')
    expect(formatClock(-1)).toBe('0:00.0')
  })
})

describe('randomInt', () => {
  it('stays within the inclusive bounds', () => {
    for (let i = 0; i < 500; i++) {
      const n = randomInt(3, 7)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(7)
      expect(Number.isInteger(n)).toBe(true)
    }
  })
})
