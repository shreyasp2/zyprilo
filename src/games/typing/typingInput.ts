/**
 * Shared input pipeline for the typing games.
 *
 * Each game keeps a single hidden <input> that accumulates everything the
 * keyboard inserts. The input's DOM value is never trimmed, collapsed, or
 * reset while typing, so mobile IMEs (GBoard, iOS QuickType) never see their
 * composing region rewritten underneath them.
 *
 * The parser is defensive about the one thing IMEs legitimately do: rewrite
 * text at or below the parse cursor. GBoard in particular often keeps the
 * submitted word AND its separator inside its composing region, so the first
 * letter of the next word replaces the whole region and the value shrinks
 * from "hello " to "w". A blind byte-offset cursor would treat "w" as
 * already-consumed and freeze the game; instead the cursor records the exact
 * consumed text and every event verifies it. On any mismatch the cursor is
 * rebuilt from zero and the entire current value is re-parsed.
 */

/** Characters that end a word. Mobile keyboards may insert a non-breaking space. */
export const isWordSeparator = (ch: string) => ch === ' ' || ch === '\u00A0'

/** How far the input's accumulated value has been parsed into submitted words. */
export interface TypingCursor {
  /** Number of leading characters of the input's value already consumed. */
  consumed: number
  /** The exact consumed text — verifying it detects IME rewrites below the cursor. */
  text: string
}

export const emptyCursor = (): TypingCursor => ({ consumed: 0, text: '' })

export interface ParsedTypingValue {
  /** Complete words the input event finished, in order (never contain separators). */
  submissions: string[]
  /** Unconsumed tail: the word currently being typed (never contains separators). */
  activeTyped: string
  /** Cursor to store for the next event. */
  cursor: TypingCursor
}

function parseFrom(value: string, start: number, prevText: string): ParsedTypingValue {
  const submissions: string[] = []
  let wordStart = start
  for (let i = start; i < value.length; i++) {
    if (!isWordSeparator(value[i])) continue
    if (i > wordStart) submissions.push(value.slice(wordStart, i))
    wordStart = i + 1
  }
  const activeTyped = value.slice(wordStart)
  const consumed = value.length - activeTyped.length
  return {
    submissions,
    activeTyped,
    cursor: { consumed, text: prevText + value.slice(start, consumed) },
  }
}

export function parseTypingValue(value: string, cursor: TypingCursor): ParsedTypingValue {
  // Fast path: every consumed character is still exactly where we left it.
  if (
    value.length >= cursor.consumed &&
    value.slice(0, cursor.consumed) === cursor.text
  ) {
    return parseFrom(value, cursor.consumed, cursor.text)
  }
  // Desync: an IME composing region replaced text at/below the cursor (or a
  // backspace deleted the separator after the last submitted word). Rebuild:
  // treat the entire current value as unconsumed and re-anchor to it.
  return parseFrom(value, 0, '')
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
 * words are consumed exactly as they appeared in the input.
 */
export function rewindToWord(
  value: string,
  word: string,
  cursor: TypingCursor,
): { value: string; cursor: TypingCursor } {
  let end = value.length
  while (end > 0 && isWordSeparator(value[end - 1])) end--
  const consumed = Math.max(0, end - word.length)
  return { value: value.slice(0, end), cursor: { consumed, text: cursor.text.slice(0, consumed) } }
}
