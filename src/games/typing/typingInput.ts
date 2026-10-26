/**
 * Shared input pipeline for the typing games.
 *
 * Each game keeps a single hidden <input> that accumulates everything the
 * keyboard inserts, plus a `consumed` cursor marking how much of that text
 * has already been turned into submitted words. Parsing forward from the
 * cursor — instead of resetting the input's value after every word — keeps
 * mobile IMEs (GBoard, iOS QuickType) in sync: their composing region keeps
 * pointing at text the page never rewrites mid-composition, so spaces from
 * the on-screen keyboard arrive through onChange like any other character.
 */

/** Characters that end a word. Mobile keyboards may insert a non-breaking space. */
export const isWordSeparator = (ch: string) => ch === ' ' || ch === '\u00A0'

export interface ParsedTypingValue {
  /** Complete words the input event finished, in order (never contain separators). */
  submissions: string[]
  /** Unconsumed tail: the word currently being typed (never contains separators). */
  activeTyped: string
  /** How much of the input's value has been consumed (submitted words + their separators). */
  consumed: number
}

/**
 * Fold the input's value into submitted words and an active word.
 * `consumedBefore` is the cursor from the previous event; an IME may rewrite
 * text at or below it, so parsing never re-reads already-consumed characters.
 */
export function parseTypingValue(value: string, consumedBefore: number): ParsedTypingValue {
  const start = Math.min(consumedBefore, value.length)
  const submissions: string[] = []
  let wordStart = start
  for (let i = start; i < value.length; i++) {
    if (!isWordSeparator(value[i])) continue
    if (i > wordStart) submissions.push(value.slice(wordStart, i))
    wordStart = i + 1
  }
  const activeTyped = value.slice(wordStart)
  return { submissions, activeTyped, consumed: value.length - activeTyped.length }
}

export interface KeystrokeDelta {
  keystrokes: number
  correct: number
}

/**
 * Score the characters appended to the active word (`before` → `after`)
 * against `target`. Every appended character counts as a keystroke; a
 * character is correct only when it matches the target at the same index.
 * This mirrors the original per-keystroke scoring exactly.
 */
export function scoreAppendedChars(before: string, after: string, target: string): KeystrokeDelta {
  let keystrokes = 0
  let correct = 0
  for (let i = before.length; i < after.length; i++) {
    keystrokes++
    if (i < target.length && after[i] === target[i]) correct++
  }
  return { keystrokes, correct }
}

/**
 * Rewind the input buffer after a backspace past the word boundary: drop the
 * separator(s) after the previously submitted word so its text becomes the
 * active tail again. `word` is still in the buffer verbatim because submitted
 * words are stored and consumed exactly as they appeared in the input.
 */
export function rewindToWord(
  value: string,
  word: string,
): { value: string; consumed: number } {
  let end = value.length
  while (end > 0 && isWordSeparator(value[end - 1])) end--
  return { value: value.slice(0, end), consumed: Math.max(0, end - word.length) }
}
