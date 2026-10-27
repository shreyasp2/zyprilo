import { GAMES } from '../games/registry'
import { loadDailyCompletions } from './daily'
import { loadResults, RESULT_EVENT } from './results'

/**
 * Unified player progression: XP, levels, ranks, and achievements.
 *
 * XP is granted when game results are saved — the RESULT_EVENT dispatched by
 * the results store drives evaluation, so every game (existing or future)
 * participates automatically and XP is granted exactly once per result
 * (result ids are remembered). The state is persisted in its own localStorage
 * key and every read is defensive: malformed data yields a fresh state rather
 * than an error, so existing players' records are never reset.
 */

const STORAGE_KEY = 'reflexlab:progression:v1'
export const PROGRESSION_EVENT = 'reflexlab:progression'

export interface ProgressionState {
  xp: number
  /** Achievement id → unlocked timestamp (epoch ms). */
  achievements: Record<string, number>
  /** Result ids that already granted XP — prevents duplicate awards. */
  awardedResultIds: string[]
}

export interface AchievementDef {
  id: string
  name: string
  description: string
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-run', name: 'First Steps', description: 'Complete your first game.' },
  { id: 'first-pb', name: 'Record Holder', description: 'Set your first personal best.' },
  { id: 'games-5', name: 'Explorer', description: 'Play five different games.' },
  { id: 'games-all', name: 'Full Sweep', description: 'Play every game on Zyprilo.' },
  { id: 'runs-25', name: 'Regular', description: 'Complete 25 runs.' },
  { id: 'runs-100', name: 'Dedicated', description: 'Complete 100 runs.' },
  { id: 'daily-first', name: 'Daily Dose', description: 'Complete your first daily challenge.' },
  { id: 'daily-7', name: 'Week Streak', description: 'Complete seven daily challenges.' },
  { id: 'sudoku-first', name: 'Logic Initiate', description: 'Solve your first Sudoku.' },
  { id: 'sudoku-5', name: 'Grid Master', description: 'Solve five Sudokus.' },
  { id: 'wordsearch-first', name: 'Word Hunter', description: 'Complete your first Word Search.' },
  { id: 'maze-first', name: 'Escape Artist', description: 'Escape your first maze.' },
  { id: 'level-5', name: 'Rising Star', description: 'Reach level 5.' },
  { id: 'level-10', name: 'Veteran', description: 'Reach level 10.' },
  { id: 'level-25', name: 'Zyprilo Legend', description: 'Reach level 25.' },
]

const EMPTY_STATE: ProgressionState = { xp: 0, achievements: {}, awardedResultIds: [] }

function isValidState(value: unknown): value is ProgressionState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as ProgressionState
  return (
    typeof v.xp === 'number' && Number.isFinite(v.xp) && v.xp >= 0 &&
    typeof v.achievements === 'object' && v.achievements !== null &&
    Array.isArray(v.awardedResultIds) && v.awardedResultIds.every((id) => typeof id === 'string')
  )
}

function sanitizeState(value: unknown): ProgressionState {
  if (!isValidState(value)) return EMPTY_STATE
  // Cap the awarded-ids log so the key can never grow unbounded.
  return { ...value, awardedResultIds: value.awardedResultIds.slice(-500) }
}

export function loadProgression(): ProgressionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    return sanitizeState(JSON.parse(raw))
  } catch {
    return EMPTY_STATE
  }
}

function saveProgression(state: ProgressionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable — progression stays in-memory for this session.
  }
}

/** Cumulative XP required to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level))
  return 25 * l * (l - 1)
}

/** Level for a given XP total — closed form, safe at any magnitude. */
export function levelForXp(xp: number): number {
  const l = Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 25)) / 2)
  return Math.max(1, l)
}

const RANKS = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Legend']

/** Rank title for a level — changes every five levels, caps at Legend. */
export function rankForLevel(level: number): string {
  return RANKS[Math.min(RANKS.length - 1, Math.floor(Math.max(1, level) / 5))]
}

export interface ProgressionSnapshot {
  state: ProgressionState
  level: number
  rank: string
  /** XP already earned inside the current level. */
  intoLevel: number
  /** XP needed to complete the current level. */
  levelSpan: number
  totalRuns: number
  unlocked: AchievementDef[]
  locked: AchievementDef[]
}

export function snapshotProgression(): ProgressionSnapshot {
  const state = loadProgression()
  const level = levelForXp(state.xp)
  const levelBase = xpForLevel(level)
  const nextBase = xpForLevel(level + 1)
  const unlockedIds = new Set(Object.keys(state.achievements))
  return {
    state,
    level,
    rank: rankForLevel(level),
    intoLevel: state.xp - levelBase,
    levelSpan: Math.max(1, nextBase - levelBase),
    totalRuns: loadResults().length,
    unlocked: ACHIEVEMENTS.filter((a) => unlockedIds.has(a.id)),
    locked: ACHIEVEMENTS.filter((a) => !unlockedIds.has(a.id)),
  }
}

/** XP for one saved run: base + personal-best bonus + daily-official bonus. */
export function xpForResult(result: { gameId: string; id: string; primaryValue: number }): number {
  let xp = 10
  const all = loadResults()
  const mine = all.filter((r) => r.gameId === result.gameId)
  const meta = GAMES.find((g) => g.id === result.gameId)
  const better = meta?.better ?? 'higher'
  // Personal best when this run beats every OTHER run of the same game (the
  // result itself is already saved by the time the event fires).
  const others = mine.filter((r) => r.id !== result.id)
  const isPersonalBest =
    others.length === 0 ||
    others.every((r) =>
      better === 'higher' ? result.primaryValue >= r.primaryValue : result.primaryValue <= r.primaryValue,
    )
  if (isPersonalBest) xp += 20
  const completions = loadDailyCompletions()
  if (Object.values(completions).some((c) => c.resultId === result.id)) xp += 30
  return xp
}

function evaluateAchievements(state: ProgressionState): string[] {
  const results = loadResults()
  const completions = loadDailyCompletions()
  const level = levelForXp(state.xp)
  const distinctGames = new Set(results.map((r) => r.gameId))
  const count = (gameId: string) => results.filter((r) => r.gameId === gameId).length
  const unlocked: string[] = []
  const check = (id: string, condition: boolean): void => {
    if (condition && !state.achievements[id] && !unlocked.includes(id)) unlocked.push(id)
  }
  check('first-run', results.length >= 1)
  check('games-5', distinctGames.size >= 5)
  check('games-all', GAMES.every((g) => distinctGames.has(g.id)))
  check('runs-25', results.length >= 25)
  check('runs-100', results.length >= 100)
  check('daily-first', Object.keys(completions).length >= 1)
  check('daily-7', Object.keys(completions).length >= 7)
  check('sudoku-first', count('sudoku') >= 1)
  check('sudoku-5', count('sudoku') >= 5)
  check('wordsearch-first', count('word-search') >= 1)
  check('maze-first', count('maze') >= 1)
  check('level-5', level >= 5)
  check('level-10', level >= 10)
  check('level-25', level >= 25)
  // first-pb: any game with at least two runs where the newest run is its best.
  const firstPb = GAMES.some((g) => {
    const mine = results.filter((r) => r.gameId === g.id)
    if (mine.length < 2) return false
    const newest = mine[0]
    return mine.every((r) => (g.better === 'higher' ? newest.primaryValue >= r.primaryValue : newest.primaryValue <= r.primaryValue))
  })
  check('first-pb', firstPb)
  return unlocked
}

/** Result listener: grants XP once per result and evaluates achievements. */
function onResultEvent(e: Event): void {
  const detail = (e as CustomEvent).detail as
    | { id?: string; gameId?: string; primaryValue?: number }
    | undefined
  if (!detail || typeof detail.id !== 'string') return
  const state = loadProgression()
  if (state.awardedResultIds.includes(detail.id)) return
  const xp = xpForResult({
    gameId: detail.gameId ?? '',
    id: detail.id,
    primaryValue: typeof detail.primaryValue === 'number' ? detail.primaryValue : 0,
  })
  let next: ProgressionState = {
    ...state,
    xp: state.xp + xp,
    awardedResultIds: [...state.awardedResultIds, detail.id].slice(-500),
  }
  const unlocked = evaluateAchievements(next)
  const achievements = { ...next.achievements }
  for (const id of unlocked) achievements[id] = Date.now()
  next = { ...next, achievements }
  saveProgression(next)
  window.dispatchEvent(new CustomEvent(PROGRESSION_EVENT, { detail: { xp, added: unlocked } }))
}

let listenerInstalled = false

/** Installs the RESULT_EVENT listener once per page load. Safe to call twice. */
export function initProgressionListener(): void {
  if (listenerInstalled || typeof window === 'undefined') return
  listenerInstalled = true
  window.addEventListener(RESULT_EVENT, onResultEvent)
}

/** Clears all progression state (used by a future settings reset; exported for tests). */
export function clearProgression(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
