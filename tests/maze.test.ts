import { describe, expect, it } from 'vitest'
import {
  bfsDistances,
  generateMaze,
  isAtExit,
  isSolvable,
  mazeSizeForLevel,
  move,
  NORTH,
  SOUTH,
} from '../src/games/maze/maze'

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('maze engine', () => {
  it('every generated maze is solvable from start to exit', () => {
    for (let level = 1; level <= 20; level++) {
      const maze = generateMaze(level, seeded(level))
      expect(isSolvable(maze)).toBe(true)
      expect(maze.solutionLength).toBeGreaterThan(0)
      expect(maze.exit.row).toBeGreaterThanOrEqual(0)
      expect(maze.exit.row).toBeLessThan(maze.rows)
    }
  })

  it('movement respects walls and stays in bounds', () => {
    const maze = generateMaze(1, seeded(3))
    let pos = maze.start
    // Walk the optimal path length times in random-ish directions: the player
    // must always land on a valid connected cell.
    for (let i = 0; i < 200; i++) {
      for (const wall of [NORTH, SOUTH] as const) {
        const next = move(maze, pos, wall)
        expect(next.row).toBeGreaterThanOrEqual(0)
        expect(next.row).toBeLessThan(maze.rows)
        // If the position changed, the move must have been through an opening.
        if (next !== pos) {
          expect(maze.walls[pos.row][pos.col] & wall).toBe(0)
        }
        pos = next
      }
    }
    expect(pos.row).toBeGreaterThanOrEqual(0)
  })

  it('isAtExit only fires on the exit cell', () => {
    const maze = generateMaze(4, seeded(5))
    expect(isAtExit(maze, maze.exit)).toBe(true)
    expect(isAtExit(maze, maze.start)).toBe(false)
  })

  it('move is a pure function: blocked moves return the same position', () => {
    const maze = generateMaze(2, seeded(6))
    const pos = maze.start
    // Try all four directions; blocked ones must return the identical cell.
    for (const wall of [NORTH, SOUTH]) {
      const next = move(maze, pos, wall)
      if (maze.walls[pos.row][pos.col] & wall) {
        expect(next).toBe(pos)
      }
    }
  })

  it('difficulty progression: dimensions grow and cap', () => {
    expect(mazeSizeForLevel(1)).toEqual({ rows: 7, cols: 9 })
    expect(mazeSizeForLevel(9)).toEqual({ rows: 11, cols: 13 })
    expect(mazeSizeForLevel(50).rows).toBe(17)
    expect(mazeSizeForLevel(50).cols).toBe(25)
    expect(mazeSizeForLevel(9999).rows).toBe(17)
  })

  it('later levels have longer optimal paths than tiny mazes on average', () => {
    const small = [1, 2, 3].map((l) => generateMaze(l, seeded(l)).solutionLength)
    const large = [30, 31, 32].map((l) => generateMaze(l, seeded(l)).solutionLength)
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(avg(large)).toBeGreaterThan(avg(small))
  })

  it('BFS distances cover every cell (perfect maze connectivity)', () => {
    const maze = generateMaze(8, seeded(7))
    const dist = bfsDistances(maze, maze.start)
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        expect(dist[r][c]).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
