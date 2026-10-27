import { describe, expect, it } from 'vitest'
import {
  directionsForLevel,
  findSelectionMatch,
  generateWordSearch,
  gridSizeForLevel,
  isStraightLine,
  normalizeWord,
  placementCells,
  wordCountForLevel,
} from '../src/games/wordSearch/wordSearch'
import { WORD_PACKS } from '../src/games/wordSearch/wordPacks'

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('word search engine', () => {
  it('normalizes words to uppercase A–Z', () => {
    expect(normalizeWord('Tiger')).toBe('TIGER')
    expect(normalizeWord('ice-cream')).toBe('ICECREAM')
    expect(normalizeWord('à la carte')).toBe('LACARTE')
  })

  it('every generated puzzle contains all its listed words as real placements', () => {
    for (let level = 1; level <= 12; level++) {
      const pack = WORD_PACKS[level % WORD_PACKS.length]
      const puzzle = generateWordSearch(level, pack.words, pack.name, seeded(level))
      expect(puzzle.grid.length).toBe(puzzle.size)
      expect(puzzle.targets.length).toBe(puzzle.placements.length)
      expect(new Set(puzzle.targets).size).toBe(puzzle.placements.length)
      for (const placement of puzzle.placements) {
        expect(placement.word.length).toBeLessThanOrEqual(puzzle.size)
        const cells = placementCells(placement)
        expect(cells.length).toBe(placement.word.length)
        for (let i = 0; i < cells.length; i++) {
          expect(puzzle.grid[cells[i].row][cells[i].col]).toBe(placement.word[i])
        }
      }
    }
  })

  it('validates selections against retained placements (both directions)', () => {
    const puzzle = generateWordSearch(2, WORD_PACKS[0].words, 'Animals', seeded(4))
    expect(puzzle.placements.length).toBeGreaterThan(0)
    for (const placement of puzzle.placements.slice(0, 3)) {
      const forward = findSelectionMatch(puzzle, placement.start, placement.end)
      expect(forward?.word).toBe(placement.word)
      const backward = findSelectionMatch(puzzle, placement.end, placement.start)
      expect(backward?.word).toBe(placement.word)
    }
    // A non-straight or wrong selection matches nothing.
    const bogus = findSelectionMatch(puzzle, { row: 0, col: 0 }, { row: 1, col: 2 })
    expect(bogus).toBeNull()
  })

  it('isStraightLine accepts rows, columns and diagonals only', () => {
    expect(isStraightLine({ row: 0, col: 0 }, { row: 0, col: 5 })).toBe(true)
    expect(isStraightLine({ row: 0, col: 0 }, { row: 5, col: 0 })).toBe(true)
    expect(isStraightLine({ row: 0, col: 0 }, { row: 4, col: 4 })).toBe(true)
    expect(isStraightLine({ row: 0, col: 0 }, { row: 1, col: 2 })).toBe(false)
  })

  it('difficulty progression: grids grow and directions unlock', () => {
    expect(gridSizeForLevel(1)).toBe(8)
    expect(gridSizeForLevel(4)).toBe(9)
    expect(gridSizeForLevel(13)).toBe(12)
    expect(gridSizeForLevel(99)).toBe(14)
    expect(wordCountForLevel(1)).toBe(6)
    expect(wordCountForLevel(13)).toBe(12)
    expect(directionsForLevel(1)).toHaveLength(2)
    expect(directionsForLevel(3)).toHaveLength(4)
    expect(directionsForLevel(5)).toHaveLength(8)
  })

  it('generation falls back safely with a tiny word list', () => {
    const puzzle = generateWordSearch(6, ['CAT', 'DOG'], 'Test', seeded(9))
    expect(puzzle.placements.length).toBeGreaterThanOrEqual(2)
    expect(puzzle.grid.length).toBe(puzzle.size)
    for (const row of puzzle.grid) {
      expect(row.every((ch) => ch >= 'A' && ch <= 'Z')).toBe(true)
    }
  })

  it('packs are non-empty and engine consumes every pack without error', () => {
    expect(WORD_PACKS.length).toBeGreaterThanOrEqual(8)
    WORD_PACKS.forEach((pack, i) => {
      expect(pack.words.length).toBeGreaterThanOrEqual(20)
      const puzzle = generateWordSearch(3, pack.words, pack.name, seeded(50 + i))
      expect(puzzle.placements.length).toBeGreaterThanOrEqual(4)
    })
  })
})
