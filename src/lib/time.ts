/** Monotonic clock helpers — always prefer performance.now() over Date.now() for elapsed time. */

export function now(): number {
  return performance.now()
}

/** Elapsed ms from start to end, never negative. */
export function elapsedMs(start: number, end: number = now()): number {
  return Math.max(0, end - start)
}

export function formatSeconds(ms: number): string {
  const total = Math.max(0, ms) / 1000
  if (total < 10) return total.toFixed(2)
  if (total < 60) return total.toFixed(1)
  const minutes = Math.floor(total / 60)
  const seconds = total - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

export function formatClock(ms: number): string {
  const total = Math.max(0, ms) / 1000
  const minutes = Math.floor(total / 60)
  const seconds = total - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

/** Random integer in [min, max] (inclusive). */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Random reaction delay in ms — long enough that guessing is punished. */
export function randomDelay(minMs = 1200, maxMs = 3800): number {
  return minMs + Math.random() * (maxMs - minMs)
}
