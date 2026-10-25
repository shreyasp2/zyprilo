/**
 * Shared game-result format and localStorage persistence.
 *
 * Every game reports one `GameResult` with a primary metric (the number the
 * game is about) plus human-readable detail rows. Results are stored locally
 * under a versioned key; malformed data is dropped instead of crashing.
 */

export type ScoreDirection = 'higher' | 'lower'

export interface ResultDetail {
  label: string
  display: string
}

export interface GameResult {
  id: string
  gameId: string
  playedAt: number // epoch ms
  primaryLabel: string
  primaryValue: number
  primaryDisplay: string
  better: ScoreDirection
  details: ResultDetail[]
}

const STORAGE_KEY = 'reflexlab:results:v1'
const MAX_STORED = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidResult(value: unknown): value is GameResult {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.gameId === 'string' &&
    typeof value.playedAt === 'number' &&
    Number.isFinite(value.playedAt) &&
    typeof value.primaryLabel === 'string' &&
    typeof value.primaryValue === 'number' &&
    Number.isFinite(value.primaryValue) &&
    typeof value.primaryDisplay === 'string' &&
    (value.better === 'higher' || value.better === 'lower') &&
    Array.isArray(value.details) &&
    value.details.every(
      (d) => isRecord(d) && typeof d.label === 'string' && typeof d.display === 'string',
    )
  )
}

export function loadResults(): GameResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return []
    }
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(isValidResult)
    // Drop duplicates by id (defensive: never score the same run twice).
    const seen = new Set<string>()
    const unique = valid.filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
    return unique.sort((a, b) => b.playedAt - a.playedAt)
  } catch {
    return []
  }
}

/** Event fired on window after a result is stored, so views can refresh. */
export const RESULT_EVENT = 'reflexlab:result'

export function saveResult(result: GameResult): GameResult {
  const all = loadResults()
  all.unshift(result)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_STORED)))
  } catch {
    // Storage full or unavailable — results simply aren't persisted.
  }
  window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: result }))
  return result
}

export function resultsForGame(gameId: string): GameResult[] {
  return loadResults().filter((r) => r.gameId === gameId)
}

export function personalBest(
  gameId: string,
  better: ScoreDirection,
): GameResult | null {
  const results = resultsForGame(gameId)
  if (results.length === 0) return null
  return results.reduce((best, r) =>
    (better === 'higher' ? r.primaryValue > best.primaryValue : r.primaryValue < best.primaryValue)
      ? r
      : best,
  )
}

export function newResultId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Builds a complete result with a fresh id and timestamp. Module-level so
 * game components never call impure constructors inside their own scope.
 */
export function createResult(input: Omit<GameResult, 'id' | 'playedAt'>): GameResult {
  return {
    id: newResultId(),
    playedAt: Date.now(),
    ...input,
  }
}

export function clearResults(gameId?: string): void {
  try {
    if (gameId === undefined) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      const kept = loadResults().filter((r) => r.gameId !== gameId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(kept))
    }
  } catch {
    // Nothing sensible to do if storage is unavailable.
  }
}

export function formatRelativeTime(playedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - playedAt) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
