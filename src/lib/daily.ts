import { GAMES, type GameId } from '../games/registry'

/**
 * Daily Challenge: deterministic per-local-calendar-date selection of one
 * game plus a fixed mode configuration. Everyone with the same date and
 * DAILY_VERSION gets the same challenge. No server, no global state.
 */

export const DAILY_VERSION = 1
const STORAGE_KEY = 'reflexlab:daily:v1'

export interface DailyGameConfig {
  /** Seconds, for games with a duration mode. */
  duration?: number
  difficulty?: 'easy' | 'medium' | 'hard' | 'normal'
  /** Sequence Memory grid edge. */
  grid?: 3 | 4 | 5 | 6
  /** Word Unscramble mode. */
  scrambleMode?: 'combo' | 'relaxed'
  /** Typing Speed Sudden Death flag. */
  suddenDeath?: boolean
  /** Human-readable summary shown on cards/banners. */
  label: string
}

/** Local calendar date as YYYY-MM-DD (visitor's own timezone). */
export function localDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** FNV-1a — stable, dependency-free string hash. */
export function hashString(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministically picks one of the games for the given date. */
export function dailyGameId(dateKey: string, version = DAILY_VERSION): GameId {
  return GAMES[hashString(`${dateKey}:${version}`) % GAMES.length].id
}

/** Per-game allowed variations for the fixed daily configuration. */
const CONFIG_POOLS: Partial<Record<GameId, { durations?: number[]; difficulties?: string[]; grids?: number[] }>> = {
  typing: { durations: [15, 30, 60, 120] },
  'typing-accuracy': { durations: [30, 60, 120] },
  cps: { durations: [1, 2, 5, 10] },
  spacebar: { durations: [5, 10, 30] },
  'one-to-hundred': { durations: [30, 60, 90, 120] },
  'mouse-accuracy': { durations: [15, 30, 60], difficulties: ['easy', 'medium', 'hard'] },
  'number-memory': { difficulties: ['normal', 'hard'] },
  'sequence-memory': { grids: [3, 4, 5, 6] },
  'color-reaction': { durations: [15, 30, 60], difficulties: ['easy', 'medium', 'hard'] },
  sudoku: { difficulties: ['easy', 'medium', 'hard'] },
  'word-search': { difficulties: ['easy', 'medium', 'hard'] },
  maze: { difficulties: ['easy', 'medium', 'hard'] },
}

/**
 * Fixed configuration for the day. Games without mode knobs return
 * undefined — they run in their standard (compatible) mode.
 */
export function dailyConfig(gameId: GameId, dateKey: string, version = DAILY_VERSION): DailyGameConfig | undefined {
  const base = hashString(`${dateKey}:${gameId}:${version}`)
  const pick = <T,>(arr: T[], salt: number): T => arr[(base >>> (salt * 4)) % arr.length] ?? arr[0]

  // Word Unscramble's daily challenge is always the Combo Rush mode.
  if (gameId === 'word-unscramble') {
    return { scrambleMode: 'combo', label: 'Combo Rush' }
  }

  const pool = CONFIG_POOLS[gameId]
  if (!pool) return undefined

  const cfg: DailyGameConfig = { label: '' }
  const parts: string[] = []
  if (pool.durations) {
    cfg.duration = pick(pool.durations, 1)
    parts.push(`${cfg.duration}s`)
  }
  if (pool.difficulties) {
    cfg.difficulty = pick(pool.difficulties, 2) as DailyGameConfig['difficulty']
    parts.push(String(cfg.difficulty))
  }
  if (pool.grids) {
    cfg.grid = pick(pool.grids, 3) as DailyGameConfig['grid']
    parts.push(`${cfg.grid}×${cfg.grid}`)
  }
  cfg.label = parts.join(' · ')
  return cfg
}

export interface DailyCompletion {
  date: string
  gameId: string
  resultId: string
  primaryDisplay: string
}

function isValidCompletion(value: unknown): value is DailyCompletion {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DailyCompletion).date === 'string' &&
    typeof (value as DailyCompletion).gameId === 'string' &&
    typeof (value as DailyCompletion).resultId === 'string' &&
    typeof (value as DailyCompletion).primaryDisplay === 'string'
  )
}

/** All stored daily completions keyed by date. Malformed data is dropped. */
export function loadDailyCompletions(): Record<string, DailyCompletion> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {}
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, DailyCompletion> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (isValidCompletion(value) && value.date === key) out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

export function getDailyCompletion(dateKey: string): DailyCompletion | undefined {
  return loadDailyCompletions()[dateKey]
}

/** Records the official daily attempt for a date (one per date, first wins). */
export function recordDailyCompletion(completion: DailyCompletion): void {
  try {
    const all = loadDailyCompletions()
    if (all[completion.date]) return // already completed — never overwrite
    all[completion.date] = completion
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Storage unavailable — daily completion simply isn't persisted.
  }
}
