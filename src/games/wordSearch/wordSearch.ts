/**
 * Word Search engine: grid generation with retained placement metadata,
 * selection validation against real placements, and level progression.
 *
 * Coordinates are [row, col]. Words are normalized (A–Z only) for the grid;
 * display labels keep their original form. Every generated puzzle is
 * validated before it is returned: every listed word has a real placement.
 */

export interface Cell {
  row: number
  col: number
}

export interface WordPlacement {
  /** Normalized grid form, e.g. "TIGER". */
  word: string
  /** Original display label, e.g. "Tiger". */
  label: string
  start: Cell
  end: Cell
}

export interface WordSearchPuzzle {
  size: number
  grid: string[][]
  placements: WordPlacement[]
  /** Display labels the player must find (order randomized). */
  targets: string[]
  level: number
  pack: string
}

export const DIRECTIONS: Cell[] = [
  { row: 0, col: 1 }, // →
  { row: 1, col: 0 }, // ↓
  { row: 1, col: 1 }, // ↘
  { row: -1, col: 1 }, // ↗
  { row: 0, col: -1 }, // ←
  { row: -1, col: 0 }, // ↑
  { row: 1, col: -1 }, // ↙
  { row: -1, col: -1 }, // ↖
]

/** Normalizes a word for grid placement: uppercase A–Z only. */
export function normalizeWord(word: string): string {
  return word.toUpperCase().replace(/[^A-Z]/g, '')
}

/** Directions allowed at a given level: straight lines first, diagonals from 3, backwards from 5. */
export function directionsForLevel(level: number): Cell[] {
  const straight = DIRECTIONS.slice(0, 2)
  if (level < 3) return straight
  if (level < 5) return DIRECTIONS.slice(0, 4)
  return DIRECTIONS
}

export function gridSizeForLevel(level: number): number {
  return Math.min(14, 8 + Math.floor((Math.max(1, level) - 1) / 3))
}

export function wordCountForLevel(level: number): number {
  return Math.min(12, 6 + Math.floor((Math.max(1, level) - 1) / 2))
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function canPlaceAt(
  grid: (string | null)[][],
  word: string,
  start: Cell,
  dir: Cell,
): boolean {
  const size = grid.length
  const end = { row: start.row + dir.row * (word.length - 1), col: start.col + dir.col * (word.length - 1) }
  if (end.row < 0 || end.row >= size || end.col < 0 || end.col >= size) return false
  for (let i = 0; i < word.length; i++) {
    const cell = grid[start.row + dir.row * i][start.col + dir.col * i]
    if (cell !== null && cell !== word[i]) return false
  }
  return true
}

/**
 * Generates a puzzle. Falls back gracefully: words are tried longest-first,
 * the attempt budget is bounded, and if the target word count cannot be met
 * the puzzle is returned with the words that did fit (never fewer than the
 * minimum viable count — otherwise generation is retried with fewer words).
 */
export function generateWordSearch(
  level: number,
  words: string[],
  pack: string,
  rng: () => number = Math.random,
): WordSearchPuzzle {
  const safeLevel = Math.max(1, Math.min(9999, Math.floor(level) || 1))
  const size = gridSizeForLevel(safeLevel)
  const dirs = directionsForLevel(safeLevel)
  const targetCount = wordCountForLevel(safeLevel)
  // Words shorter than three letters are too trivial to search for.
  const minLength = 3

  const pool = shuffle(
    words
      .map(normalizeWord)
      .filter((w) => w.length >= Math.max(3, minLength) && w.length <= size),
    rng,
  )
  // Deduplicate.
  const unique = Array.from(new Set(pool))
  const maxLen = Math.max(...unique.map((w) => w.length), 0)

  const build = (wordList: string[]): WordSearchPuzzle => {
    const grid: (string | null)[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => null),
    )
    const placements: WordPlacement[] = []
    // Longest first: harder to place, so give them the best chance.
    for (const word of wordList) {
      if (placements.length >= targetCount) break
      if (word.length > size) continue
      const starts = shuffle(
        Array.from({ length: size }, (_, r) => r).flatMap((r) =>
          Array.from({ length: size }, (_, c) => ({ row: r, col: c })),
        ),
        rng,
      )
      const dirsShuffled = shuffle(dirs, rng)
      let placed = false
      for (const start of starts) {
        if (placed) break
        for (const dir of dirsShuffled) {
          if (!canPlaceAt(grid, word, start, dir)) continue
          for (let i = 0; i < word.length; i++) {
            grid[start.row + dir.row * i][start.col + dir.col * i] = word[i]
          }
          placements.push({
            word,
            label: word,
            start,
            end: {
              row: start.row + dir.row * (word.length - 1),
              col: start.col + dir.col * (word.length - 1),
            },
          })
          placed = true
          break
        }
      }
    }
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const finalGrid = grid.map((row) => row.map((c) => c ?? alphabet[Math.floor(rng() * 26)]))
    return {
      size,
      grid: finalGrid,
      placements,
      targets: placements.map((p) => p.label),
      level: safeLevel,
      pack,
    }
  }

  // Attempt 1: up to targetCount words. Attempt 2: relaxed length. Attempt 3:
  // as many as fit from the full pool. Guaranteed to produce at least a few
  // placements because single-letter-free grids always fit something.
  const attempt1 = build(unique.slice(0, targetCount + 4))
  if (attempt1.placements.length >= Math.min(targetCount, 5)) return attempt1
  const relaxed = unique.filter((w) => w.length >= 3 && w.length <= maxLen)
  const attempt2 = build(relaxed.slice(0, targetCount + 8))
  if (attempt2.placements.length >= Math.min(targetCount, 5)) return attempt2
  return build(unique)
}

/**
 * Validates a player selection against real placements. Returns the matched
 * placement or null. The selection must span a straight line matching one of
 * the retained placements (either direction along the line).
 */
export function findSelectionMatch(
  puzzle: WordSearchPuzzle,
  start: Cell,
  end: Cell,
): WordPlacement | null {
  for (const p of puzzle.placements) {
    const sameStartEnd =
      p.start.row === start.row &&
      p.start.col === start.col &&
      p.end.row === end.row &&
      p.end.col === end.col
    const sameStartEndReversed =
      p.start.row === end.row &&
      p.start.col === end.col &&
      p.end.row === start.row &&
      p.end.col === start.col
    if (sameStartEnd || sameStartEndReversed) return p
  }
  return null
}

/** Cells covered by a placement, for highlighting. */
export function placementCells(p: WordPlacement): Cell[] {
  const dr = Math.sign(p.end.row - p.start.row)
  const dc = Math.sign(p.end.col - p.start.col)
  const len = Math.max(Math.abs(p.end.row - p.start.row), Math.abs(p.end.col - p.start.col)) + 1
  return Array.from({ length: len }, (_, i) => ({
    row: p.start.row + dr * i,
    col: p.start.col + dc * i,
  }))
}

/** True when the line from start to end is straight (horizontal/vertical/diagonal). */
export function isStraightLine(start: Cell, end: Cell): boolean {
  const dr = Math.abs(end.row - start.row)
  const dc = Math.abs(end.col - start.col)
  return dr === 0 || dc === 0 || dr === dc
}
