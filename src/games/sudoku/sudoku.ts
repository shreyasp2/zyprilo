/**
 * Sudoku engine: generation, solving, and validation for 9×9 grids.
 *
 * Grids are `number[]` of 81 cells (row-major), 0 = empty. Generation starts
 * from a complete valid grid, then removes clues while a strict uniqueness
 * check (solution count capped at 2) holds — every puzzle presented to the
 * player has exactly one solution. Difficulty targets a clue count; if the
 * removal budget runs out the puzzle is returned with more clues than the
 * target rather than ever losing uniqueness.
 */

export type SudokuGrid = number[]

export const EMPTY_GRID: SudokuGrid = new Array(81).fill(0)

export function rowOf(i: number): number {
  return Math.floor(i / 9)
}
export function colOf(i: number): number {
  return i % 9
}
export function boxOf(i: number): number {
  return Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3)
}

/** Cells in the same row, column, or 3×3 box as `i` (excluding `i`). */
export function peersOf(i: number): number[] {
  const peers: number[] = []
  for (let j = 0; j < 81; j++) {
    if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) {
      peers.push(j)
    }
  }
  return peers
}

const ROW_CANDIDATES: number[][] = Array.from({ length: 9 }, () => [1, 2, 3, 4, 5, 6, 7, 8, 9])

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function canPlace(grid: SudokuGrid, i: number, value: number): boolean {
  const r = rowOf(i)
  const c = colOf(i)
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let k = 0; k < 9; k++) {
    if (grid[r * 9 + k] === value) return false
    if (grid[k * 9 + c] === value) return false
    const bi = (br + Math.floor(k / 3)) * 9 + bc + (k % 3)
    if (grid[bi] === value) return false
  }
  return true
}

/** Solves `grid` in place (fills zeros). Returns false if unsolvable. */
export function solveGrid(grid: SudokuGrid, rng: () => number = Math.random): boolean {
  let best = -1
  let bestCandidates: number[] = []
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0) continue
    const candidates: number[] = []
    for (const v of ROW_CANDIDATES[i % 9]) {
      if (canPlace(grid, i, v)) candidates.push(v)
    }
    if (candidates.length === 0) return false
    if (best === -1 || candidates.length < bestCandidates.length) {
      best = i
      bestCandidates = candidates
      if (candidates.length === 1) break
    }
  }
  if (best === -1) return true // no empty cells — solved
  for (const v of shuffle(bestCandidates, rng)) {
    grid[best] = v
    if (solveGrid(grid, rng)) return true
    grid[best] = 0
  }
  return false
}

/** Counts solutions, stopping once `limit` is reached (default 2). */
export function countSolutions(grid: SudokuGrid, limit = 2, rng: () => number = Math.random): number {
  const work = grid.slice()
  let found = 0
  const step = (): void => {
    if (found >= limit) return
    let best = -1
    let bestCandidates: number[] = []
    for (let i = 0; i < 81; i++) {
      if (work[i] !== 0) continue
      const candidates: number[] = []
      for (let v = 1; v <= 9; v++) {
        if (canPlace(work, i, v)) candidates.push(v)
      }
      if (candidates.length === 0) return
      if (best === -1 || candidates.length < bestCandidates.length) {
        best = i
        bestCandidates = candidates
        if (candidates.length === 1) break
      }
    }
    if (best === -1) {
      found++
      return
    }
    for (const v of bestCandidates) {
      work[best] = v
      step()
      work[best] = 0
      if (found >= limit) return
    }
  }
  step()
  void rng
  return found
}

/** A complete, valid solution grid (randomized). */
export function generateSolution(rng: () => number = Math.random): SudokuGrid {
  const grid = EMPTY_GRID.slice()
  if (!solveGrid(grid, rng)) {
    // Deterministic fallback: a known-valid solved grid.
    return [
      5, 3, 4, 6, 7, 8, 9, 1, 2, 6, 7, 2, 1, 9, 5, 3, 4, 8, 1, 9, 8, 3, 4, 2, 5, 6, 7, 8, 5, 9, 7,
      6, 1, 4, 2, 3, 4, 2, 6, 8, 5, 3, 7, 9, 1, 7, 1, 3, 9, 2, 4, 8, 5, 6, 9, 6, 1, 5, 3, 7, 2, 8,
      4, 2, 8, 7, 4, 1, 9, 6, 3, 5, 3, 4, 5, 2, 8, 6, 1, 7, 9,
    ]
  }
  return grid
}

export interface SudokuPuzzle {
  /** Puzzle with 0 for empty cells. */
  grid: SudokuGrid
  /** The unique solution. */
  solution: SudokuGrid
  /** Number of given clues. */
  clues: number
  /** 1-based puzzle level (drives difficulty). */
  level: number
}

/** Clue target per level: gentle start, deep end at 26 clues. */
export function clueTargetForLevel(level: number): number {
  return Math.max(26, 48 - (level - 1) * 2)
}

/**
 * Generates a puzzle with exactly one solution. Removal proceeds in random
 * order and stops when the level's clue target is reached or the removal
 * budget is spent — uniqueness is never traded for difficulty.
 */
export function generateSudoku(level: number, rng: () => number = Math.random): SudokuPuzzle {
  const safeLevel = Math.max(1, Math.min(9999, Math.floor(level) || 1))
  const solution = generateSolution(rng)
  const targetClues = clueTargetForLevel(safeLevel)
  const puzzle = solution.slice()
  const order = shuffle(
    Array.from({ length: 81 }, (_, i) => i),
    rng,
  )
  let clues = 81
  const maxRemovalAttempts = 81 * 3
  let attempts = 0
  for (const i of order) {
    if (clues <= targetClues || attempts >= maxRemovalAttempts) break
    attempts++
    const backup = puzzle[i]
    puzzle[i] = 0
    // Uniqueness check on a scratch copy of the current puzzle state.
    if (countSolutions(puzzle.slice(), 2) !== 1) {
      puzzle[i] = backup
    } else {
      clues--
    }
  }
  return { grid: puzzle, solution, clues, level: safeLevel }
}

/** True when every cell is filled and matches the solution. */
export function isSolved(grid: SudokuGrid, solution: SudokuGrid): boolean {
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0 || grid[i] !== solution[i]) return false
  }
  return true
}

/**
 * Grades a fully-filled grid against Sudoku rules (not against a stored
 * solution): every row, column, and box must contain 1–9 exactly once.
 */
export function isValidCompletion(grid: SudokuGrid): boolean {
  const seen = (values: number[]): boolean => {
    const set = new Set<number>()
    for (const v of values) {
      if (v < 1 || v > 9 || set.has(v)) return false
      set.add(v)
    }
    return true
  }
  for (let r = 0; r < 9; r++) {
    if (!seen(Array.from({ length: 9 }, (_, c) => grid[r * 9 + c]))) return false
    if (!seen(Array.from({ length: 9 }, (_, c) => grid[c * 9 + r]))) return false
  }
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3
    const bc = (b % 3) * 3
    const values: number[] = []
    for (let i = 0; i < 9; i++) {
      values.push(grid[(br + Math.floor(i / 3)) * 9 + bc + (i % 3)])
    }
    if (!seen(values)) return false
  }
  return true
}
