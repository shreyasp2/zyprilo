import { describe, expect, it } from 'vitest'
import { GAMES } from '../src/games/registry'
import {
  dailyConfig,
  dailyGameId,
  DAILY_VERSION,
  hashString,
  localDateKey,
} from '../src/lib/daily'

describe('localDateKey', () => {
  it('formats the local calendar date as YYYY-MM-DD', () => {
    const d = new Date(2026, 9, 25, 23, 59, 59) // local Oct 25 2026
    expect(localDateKey(d)).toBe('2026-10-25')
    expect(localDateKey(new Date(2026, 0, 3))).toBe('2026-01-03')
  })

  it('stays on the local date regardless of hours', () => {
    // Midnight boundaries use the local day, not UTC.
    const d = new Date(2026, 4, 14, 0, 0, 0)
    expect(localDateKey(d)).toBe('2026-05-14')
  })
})

describe('hashString', () => {
  it('is deterministic and well-distributed across the game list', () => {
    expect(hashString('2026-10-25:1')).toBe(hashString('2026-10-25:1'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })
})

describe('dailyGameId', () => {
  it('is deterministic for the same date and version', () => {
    expect(dailyGameId('2026-10-25')).toBe(dailyGameId('2026-10-25'))
    expect(dailyGameId('2026-10-25', DAILY_VERSION)).toBe(dailyGameId('2026-10-25', 1))
  })

  it('always returns a valid game', () => {
    const valid = new Set(GAMES.map((g) => g.id))
    for (let i = 0; i < 400; i++) {
      const key = `2030-01-${String((i % 28) + 1).padStart(2, '0')}`
      expect(valid.has(dailyGameId(key))).toBe(true)
    }
  })

  it('changes when the version changes', () => {
    const keys = Array.from({ length: 30 }, (_, i) => `2031-02-${String(i + 1).padStart(2, '0')}`)
    const changed = keys.filter((k) => dailyGameId(k, 1) !== dailyGameId(k, 2))
    // A version bump must reshuffle the schedule for most dates.
    expect(changed.length).toBeGreaterThan(keys.length / 2)
  })

  it('spreads across many games over a year of dates', () => {
    const picked = new Set<string>()
    for (let m = 0; m < 12; m++) {
      for (let d = 1; d <= 28; d++) {
        picked.add(dailyGameId(`2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`))
      }
    }
    expect(picked.size).toBeGreaterThanOrEqual(10)
  })
})

describe('dailyConfig', () => {
  it('is deterministic per date and game', () => {
    const a = dailyConfig('mouse-accuracy', '2026-10-25')
    const b = dailyConfig('mouse-accuracy', '2026-10-25')
    expect(a).toEqual(b)
  })

  it('produces valid values for games with knobs', () => {
    const validDurations = new Set([15, 30, 60])
    for (let i = 0; i < 60; i++) {
      const key = `2032-03-${String((i % 28) + 1).padStart(2, '0')}`
      const cfg = dailyConfig('mouse-accuracy', key)
      expect(cfg).toBeDefined()
      expect(validDurations.has(cfg!.duration as number)).toBe(true)
      expect(['easy', 'medium', 'hard']).toContain(cfg!.difficulty)
      expect(cfg!.label.length).toBeGreaterThan(0)
    }
  })

  it('locks word-unscramble to Combo Rush and supports all knob games', () => {
    expect(dailyConfig('word-unscramble', '2026-10-25')?.scrambleMode).toBe('combo')
    const seq = dailyConfig('sequence-memory', '2026-10-25')
    expect([3, 4, 5, 6]).toContain(seq?.grid)
    const num = dailyConfig('number-memory', '2026-10-25')
    expect(['normal', 'hard']).toContain(num?.difficulty)
    expect(dailyConfig('typing', '2026-10-25')?.duration).toBeDefined()
    expect(dailyConfig('cps', '2026-10-25')?.duration).toBeDefined()
    expect(dailyConfig('spacebar', '2026-10-25')?.duration).toBeDefined()
    expect(dailyConfig('one-to-hundred', '2026-10-25')?.duration).toBeDefined()
    expect(dailyConfig('typing-accuracy', '2026-10-25')?.duration).toBeDefined()
    expect(dailyConfig('color-reaction', '2026-10-25')?.duration).toBeDefined()
  })

  it('returns undefined for games without mode knobs (compatible default)', () => {
    expect(dailyConfig('scroll', '2026-10-25')).toBeUndefined()
    expect(dailyConfig('reaction', '2026-10-25')).toBeUndefined()
    expect(dailyConfig('key-reaction', '2026-10-25')).toBeUndefined()
    expect(dailyConfig('visual-memory', '2026-10-25')).toBeUndefined()
  })
})
