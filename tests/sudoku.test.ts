import { describe, expect, it } from 'vitest'
import {
  clueTargetForLevel,
  countSolutions,
  generateSudoku,
  generateSolution,
  isSolved,
  isValidCompletion,
  solveGrid,
} from '../src/games/sudoku/sudoku'

/** Deterministic RNG for reproducible tests. */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('sudoku engine', () => {
  it('generates complete valid solutions', () => {
    for (let i = 0; i < 3; i++) {
      const solution = generateSolution(seeded(i + 1))
      expect(isValidCompletion(solution)).toBe(true)
    }
  })

  it('solveGrid fills a puzzle to a valid completion', () => {
    const { grid } = generateSudoku(1, seeded(7))
    const scratch = grid.slice()
    expect(solveGrid(scratch, seeded(8))).toBe(true)
    expect(isValidCompletion(scratch)).toBe(true)
  })

  it('every generated puzzle has exactly one solution', () => {
    for (const level of [1, 5, 12, 30]) {
      const { grid, solution, clues } = generateSudoku(level, seeded(level))
      expect(countSolutions(grid, 2)).toBe(1)
      expect(clues).toBeGreaterThan(0)
      expect(grid.filter((v) => v === 0).length).toBe(81 - clues)
      expect(solution.filter((v) => v >= 1 && v <= 9).length).toBe(81)
      expect(isSolved(solution, solution)).toBe(true)
    }
  })

  it('clue target decreases with level and never drops below 26', () => {
    expect(clueTargetForLevel(1)).toBe(48)
    expect(clueTargetForLevel(10)).toBe(30)
    expect(clueTargetForLevel(11)).toBe(28)
    expect(clueTargetForLevel(50)).toBe(26)
    expect(clueTargetForLevel(9999)).toBe(26)
  })

  it('isSolved rejects wrong and partial grids', () => {
    const { grid, solution } = generateSudoku(1, seeded(3))
    expect(isSolved(grid, solution)).toBe(false)
    const wrong = solution.slice()
    wrong[0] = wrong[0] === 1 ? 2 : 1
    expect(isSolved(wrong, solution)).toBe(false)
    expect(isSolved(solution, solution)).toBe(true)
  })

  it('isValidCompletion rejects invalid fillings', () => {
    const valid = generateSolution(seeded(5))
    expect(isValidCompletion(valid)).toBe(true)
    const broken = valid.slice()
    broken[0] = broken[1]
    expect(isValidCompletion(broken)).toBe(false)
    const partial = valid.slice()
    partial[0] = 0
    expect(isValidCompletion(partial)).toBe(false)
  })

  it('countSolutions respects the limit', () => {
    const { grid } = generateSudoku(1, seeded(11))
    // An empty-ish grid has many solutions; the cap must stop the search.
    const empty = new Array(81).fill(0)
    expect(countSolutions(empty, 2)).toBe(2)
    void grid
  })

  it('generation bounds: extreme levels stay safe and unique', () => {
    for (const level of [1, 100, 9999]) {
      const { grid, level: returned } = generateSudoku(level, seeded(level % 97 + 1))
      expect(returned).toBe(Math.min(9999, Math.max(1, Math.floor(level))))
      expect(countSolutions(grid, 2)).toBe(1)
    }
  })
})
