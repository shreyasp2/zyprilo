import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearResults,
  formatRelativeTime,
  loadResults,
  newResultId,
  personalBest,
  resultsForGame,
  saveResult,
  type GameResult,
} from '../src/lib/results'

function makeResult(overrides: Partial<GameResult> = {}): GameResult {
  return {
    id: newResultId(),
    gameId: 'scroll',
    playedAt: Date.now(),
    primaryLabel: 'Scroll time',
    primaryValue: 2.5,
    primaryDisplay: '2.50',
    better: 'lower',
    details: [{ label: 'Avg speed', display: '4000 px/s' }],
    ...overrides,
  }
}

describe('results store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists and loads saved results, newest first', () => {
    const a = saveResult(makeResult({ playedAt: 1000 }))
    const b = saveResult(makeResult({ playedAt: 2000 }))
    const all = loadResults()
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe(b.id)
    expect(all[1].id).toBe(a.id)
  })

  it('drops malformed JSON instead of throwing', () => {
    localStorage.setItem('reflexlab:results:v1', '{not valid json!!')
    expect(loadResults()).toEqual([])
  })

  it('drops entries with wrong shapes or non-finite values', () => {
    localStorage.setItem(
      'reflexlab:results:v1',
      JSON.stringify([
        { garbage: true },
        { id: 5 },
        null,
        42,
        makeResult(),
        makeResult({ primaryValue: Number.NaN }),
        makeResult({ better: 'up' }),
      ]),
    )
    const all = loadResults()
    expect(all).toHaveLength(1)
    expect(all[0].better).toBe('lower')
  })

  it('deduplicates by id when loading', () => {
    const r = makeResult()
    localStorage.setItem('reflexlab:results:v1', JSON.stringify([r, r, r]))
    expect(loadResults()).toHaveLength(1)
  })

  it('filters by game and computes personal bests in both directions', () => {
    saveResult(makeResult({ gameId: 'scroll', primaryValue: 3.0 }))
    saveResult(makeResult({ gameId: 'scroll', primaryValue: 1.5 }))
    saveResult(makeResult({ gameId: 'typing', primaryValue: 40, better: 'higher' }))
    saveResult(makeResult({ gameId: 'typing', primaryValue: 65, better: 'higher' }))

    expect(resultsForGame('scroll')).toHaveLength(2)
    expect(personalBest('scroll', 'lower')?.primaryValue).toBe(1.5)
    expect(personalBest('typing', 'higher')?.primaryValue).toBe(65)
    expect(personalBest('cps', 'higher')).toBeNull()
  })

  it('clears one game or everything', () => {
    saveResult(makeResult({ gameId: 'scroll' }))
    saveResult(makeResult({ gameId: 'typing' }))
    clearResults('scroll')
    expect(resultsForGame('scroll')).toHaveLength(0)
    expect(loadResults()).toHaveLength(1)
    clearResults()
    expect(loadResults()).toHaveLength(0)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newResultId()))
    expect(ids.size).toBe(200)
  })
})

describe('formatRelativeTime', () => {
  const nowMs = 1_000_000_000

  it('formats the whole range of relative labels', () => {
    expect(formatRelativeTime(nowMs - 5_000, nowMs)).toBe('just now')
    expect(formatRelativeTime(nowMs - 45_000, nowMs)).toBe('45s ago')
    expect(formatRelativeTime(nowMs - 10 * 60_000, nowMs)).toBe('10m ago')
    expect(formatRelativeTime(nowMs - 5 * 3_600_000, nowMs)).toBe('5h ago')
    expect(formatRelativeTime(nowMs - 3 * 86_400_000, nowMs)).toBe('3d ago')
  })

  it('never produces negative labels for future timestamps', () => {
    expect(formatRelativeTime(nowMs + 60_000, nowMs)).toBe('just now')
  })
})
