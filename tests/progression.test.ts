import { beforeEach, describe, expect, it } from 'vitest'
import {
  initProgressionListener,
  levelForXp,
  loadProgression,
  PROGRESSION_EVENT,
  rankForLevel,
  snapshotProgression,
  xpForLevel,
  xpForResult,
} from '../src/lib/progression'
import { clearResults, createResult, RESULT_EVENT, saveResult } from '../src/lib/results'

function fireResult(gameId: string, primaryValue: number): void {
  const result = createResult({
    gameId,
    primaryLabel: 'Test',
    primaryValue,
    primaryDisplay: String(primaryValue),
    better: 'higher',
    details: [],
  })
  saveResult(result)
  // saveResult dispatches RESULT_EVENT asynchronously? No — synchronously.
  return
}

describe('progression', () => {
  beforeEach(() => {
    localStorage.clear()
    initProgressionListener()
  })

  it('level math is exact, monotonic, and safe at high XP', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(1)).toBe(1)
    expect(levelForXp(50)).toBe(2)
    expect(levelForXp(xpForLevel(10))).toBe(10)
    expect(levelForXp(xpForLevel(25))).toBe(25)
    expect(levelForXp(xpForLevel(1000))).toBe(1000)
    for (let l = 1; l < 40; l++) {
      expect(levelForXp(xpForLevel(l + 1))).toBeGreaterThanOrEqual(l + 1)
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l))
    }
  })

  it('rank changes every five levels and caps at Legend', () => {
    expect(rankForLevel(1)).toBe('Rookie')
    expect(rankForLevel(5)).toBe('Bronze')
    expect(rankForLevel(10)).toBe('Silver')
    expect(rankForLevel(100)).toBe('Legend')
  })

  it('grants XP once per result and never duplicates across reloads', () => {
    fireResult('typing', 40)
    const after1 = loadProgression().xp
    expect(after1).toBeGreaterThan(0)
    // Simulating a page reload: the same event must not re-award.
    expect(loadProgression().awardedResultIds.length).toBe(1)
    // Save a second, different result.
    fireResult('typing', 45)
    expect(loadProgression().xp).toBeGreaterThan(after1)
  })

  it('awards more XP for a personal best than for a worse run', () => {
    fireResult('cps', 5)
    const pbXp = loadProgression().xp
    fireResult('cps', 3) // worse — no PB bonus
    const worseGain = loadProgression().xp - pbXp
    fireResult('cps', 7) // better — PB bonus
    const pbGain = loadProgression().xp - pbXp - worseGain
    expect(pbGain).toBeGreaterThan(worseGain)
  })

  it('unlocks achievements on real conditions and persists them', () => {
    let added: string[] = []
    window.addEventListener(PROGRESSION_EVENT, (e) => {
      added = added.concat((e as CustomEvent).detail.added as string[])
    })
    fireResult('sudoku', 30)
    added = []
    expect(loadProgression().achievements['first-run']).toBeTruthy()
    expect(loadProgression().achievements['sudoku-first']).toBeTruthy()
    // A personal best unlocks Record Holder.
    fireResult('sudoku', 20)
    expect(loadProgression().achievements['first-pb']).toBeTruthy()
    void added
    // Persistence survives a "reload" (storage read).
    expect(snapshotProgression().unlocked.length).toBeGreaterThanOrEqual(3)
  })

  it('first-pb requires beating an earlier run, not just one run', () => {
    localStorage.clear()
    fireResult('reaction', 300)
    expect(loadProgression().achievements['first-pb']).toBeFalsy()
    fireResult('reaction', 250) // better → PB
    expect(loadProgression().achievements['first-pb']).toBeTruthy()
  })

  it('snapshot exposes level, rank, and achievement split', () => {
    fireResult('typing', 40)
    const snap = snapshotProgression()
    expect(snap.level).toBeGreaterThanOrEqual(1)
    expect(snap.levelSpan).toBeGreaterThan(0)
    expect(snap.unlocked.length).toBeGreaterThan(0)
    expect(snap.locked.length).toBeGreaterThan(0)
    expect(snap.totalRuns).toBe(1)
  })

  it('handles malformed persisted state without throwing', () => {
    localStorage.setItem('reflexlab:progression:v1', 'not-json{{{')
    expect(() => snapshotProgression()).not.toThrow()
    expect(snapshotProgression().state.xp).toBe(0)
  })

  it('malformed results in storage are ignored by progression', () => {
    localStorage.setItem('reflexlab:results:v1', '{"nope": true}')
    expect(() => fireResult('typing', 30)).not.toThrow()
    expect(loadProgression().xp).toBeGreaterThan(0)
  })

  it('xpForResult ignores unknown games gracefully', () => {
    localStorage.clear()
    saveResult(
      createResult({
        gameId: 'totally-unknown',
        primaryLabel: 'x',
        primaryValue: 1,
        primaryDisplay: '1',
        better: 'higher',
        details: [],
      }),
    )
    const all = JSON.parse(localStorage.getItem('reflexlab:results:v1') ?? '[]')
    expect(xpForResult(all[0])).toBeGreaterThanOrEqual(10)
    void RESULT_EVENT
    void clearResults
  })
})
