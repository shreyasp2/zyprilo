/**
 * Maze engine: perfect-maze generation (recursive backtracker, iterative),
 * guaranteed-solvable by construction, with farthest-corner exits so the
 * solution path is as long as the maze allows. Dimensions grow with level
 * and cap at view-friendly limits; beyond the cap, challenge continues
 * through the long solution path of the largest size.
 */

export interface MazeCell {
  row: number
  col: number
}

export interface Maze {
  /** Number of cell rows. */
  rows: number
  /** Number of cell columns. */
  cols: number
  /** walls[r][c] = bitmask of walls for the cell: 1=N, 2=E, 4=S, 8=W. */
  walls: number[][]
  start: MazeCell
  exit: MazeCell
  /** Longest shortest-path length between start and exit (solution steps). */
  solutionLength: number
  level: number
}

export const NORTH = 1
export const EAST = 2
export const SOUTH = 4
export const WEST = 8

const DELTA: Record<number, MazeCell> = {
  [NORTH]: { row: -1, col: 0 },
  [EAST]: { row: 0, col: 1 },
  [SOUTH]: { row: 1, col: 0 },
  [WEST]: { row: 0, col: -1 },
}
const OPPOSITE: Record<number, number> = { [NORTH]: SOUTH, [EAST]: WEST, [SOUTH]: NORTH, [WEST]: EAST }

export function mazeSizeForLevel(level: number): { rows: number; cols: number } {
  const l = Math.max(1, level)
  // Rows grow to 17, cols to 25 — readable on phones while complexity grows.
  const rows = Math.min(17, 7 + Math.floor((l - 1) / 2))
  const cols = Math.min(25, 9 + Math.floor((l - 1) / 2))
  return { rows, cols }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** BFS shortest-path distances from a cell (all cells reachable in a perfect maze). */
export function bfsDistances(maze: Maze, from: MazeCell): number[][] {
  const dist: number[][] = Array.from({ length: maze.rows }, () =>
    Array.from({ length: maze.cols }, () => -1),
  )
  const queue: MazeCell[] = [from]
  dist[from.row][from.col] = 0
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const wall of [NORTH, EAST, SOUTH, WEST]) {
      if (maze.walls[cur.row][cur.col] & wall) continue
      const d = DELTA[wall]
      const nr = cur.row + d.row
      const nc = cur.col + d.col
      if (nr < 0 || nr >= maze.rows || nc < 0 || nc >= maze.cols) continue
      if (dist[nr][nc] !== -1) continue
      dist[nr][nc] = dist[cur.row][cur.col] + 1
      queue.push({ row: nr, col: nc })
    }
  }
  return dist
}

/** True when the exit is reachable from start (always true for perfect mazes). */
export function isSolvable(maze: Maze): boolean {
  const dist = bfsDistances(maze, maze.start)
  return dist[maze.exit.row][maze.exit.col] >= 0
}

/**
 * Generates a level's maze. Start is the top-left cell; the exit is the cell
 * farthest from it (BFS diameter endpoint), maximizing the solution path.
 */
export function generateMaze(level: number, rng: () => number = Math.random): Maze {
  const safeLevel = Math.max(1, Math.min(9999, Math.floor(level) || 1))
  const { rows, cols } = mazeSizeForLevel(safeLevel)
  const walls: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 15))
  const visited: boolean[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
  const stack: MazeCell[] = [{ row: 0, col: 0 }]
  visited[0][0] = true
  while (stack.length > 0) {
    const cur = stack[stack.length - 1]
    const neighbors = shuffle(
      [NORTH, EAST, SOUTH, WEST].filter((wall) => {
        const d = DELTA[wall]
        const nr = cur.row + d.row
        const nc = cur.col + d.col
        return nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]
      }),
      rng,
    )
    if (neighbors.length === 0) {
      stack.pop()
      continue
    }
    const wall = neighbors[0]
    const d = DELTA[wall]
    const nr = cur.row + d.row
    const nc = cur.col + d.col
    walls[cur.row][cur.col] &= ~wall
    walls[nr][nc] &= ~OPPOSITE[wall]
    visited[nr][nc] = true
    stack.push({ row: nr, col: nc })
  }
  const start: MazeCell = { row: 0, col: 0 }
  // Exit = farthest cell from start (longest guaranteed solution).
  const dist = bfsDistances({ rows, cols, walls, start, exit: start, solutionLength: 0, level: safeLevel }, start)
  let exit: MazeCell = start
  let bestDist = -1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (dist[r][c] > bestDist) {
        bestDist = dist[r][c]
        exit = { row: r, col: c }
      }
    }
  }
  return { rows, cols, walls, start, exit, solutionLength: bestDist, level: safeLevel }
}

/**
 * Moves the player one cell if no wall blocks the direction. Returns the new
 * position; unchanged if the move is blocked or out of bounds. Collision
 * checks always run — rapid input cannot skip them because every call is
 * self-contained.
 */
export function move(maze: Maze, from: MazeCell, wall: number): MazeCell {
  if (maze.walls[from.row][from.col] & wall) return from
  const d = DELTA[wall]
  const nr = from.row + d.row
  const nc = from.col + d.col
  if (nr < 0 || nr >= maze.rows || nc < 0 || nc >= maze.cols) return from
  return { row: nr, col: nc }
}

export function isAtExit(maze: Maze, pos: MazeCell): boolean {
  return pos.row === maze.exit.row && pos.col === maze.exit.col
}
