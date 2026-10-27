/**
 * Input state machine for the typing games.
 *
 * Why this exists: on Android, GBoard owns the input's DOM value and rewrites
 * it arbitrarily — it replaces its composing region (the field collapses from
 * "hello " to "w"), then re-expands it (the committed word reappears). The
 * field value is therefore NOT a reliable log of what the user typed, and any
 * parser that derives completed words from value content will eventually
 * re-submit old words: the target word advances after ordinary letters.
 *
 * The machine instead consumes per-event facts that the browser/IME cannot
 * retroactively rewrite:
 *   - `InputEvent.data`  — the text inserted by THIS event
 *   - `InputEvent.inputType` — whether this event is a composition update
 *   - composition start/end boundaries
 *
 * Invariants (each one is regression-tested):
 *   - An ordinary letter NEVER completes a word.
 *   - A word is submitted only when a separator character arrives through the
 *     event stream, and each separator submits at most one word.
 *   - Duplicate events (the same composing text re-sent) do nothing.
 *   - A composing-region rewrite/shortening NEVER produces submissions; it
 *     only re-derives the active word from the region's tail.
 *   - The DOM value is read only as a last-resort single-step diff (engines
 *     without `data`), and that diff never re-scans earlier text, never
 *     submits on shrink or uninterpretable rewrites.
 *   - The DOM value is never cleared or rewritten by the machine.
 */

export type TypingAction =
  /** A separator completed the active word; the game must submit it. */
  | { type: 'submit'; word: string }
  /** The active word changed without a submission (letters appended or removed). */
  | { type: 'change' }
  /**
   * A soft-keyboard backspace deleted the separator after the last submitted
   * word (deleteContentBackward, one character, active word empty). The game
   * must un-submit that word and make it active again — soft keyboards do not
   * emit a keydown for their backspace key, so this cannot be handled there.
   */
  | { type: 'boundaryDelete' }
  /** Nothing to do (duplicate event, ignored separator, uninterpretable rewrite). */
  | { type: 'none' }

export interface TypingInputEvent {
  /** `InputEvent.data` — null for deletions and engines that do not set it. */
  data: string | null
  /** `InputEvent.inputType` — absent on engines that do not set it. */
  inputType?: string
  /** The input's current DOM value; used only for the single-step fallback diff. */
  value: string
}

const isSeparator = (ch: string) => ch === ' ' || ch === '\u00A0'

const tailAfterLastSeparator = (text: string): string => {
  const i = Math.max(text.lastIndexOf(' '), text.lastIndexOf('\u00A0'))
  return i === -1 ? text : text.slice(i + 1)
}

export class TypingInputMachine {
  /** Letters typed for the current target word; never contains separators. */
  private active = ''
  private composing = false
  /** Composing text observed so far within the current composition. */
  private composingText = ''
  /** Last DOM value seen — used only by the no-`data` fallback diff. */
  private lastValue = ''
  /** How many words the machine has asked the game to submit (via its actions). */
  private submittedCount = 0

  get activeWord(): string {
    return this.active
  }

  get isComposing(): boolean {
    return this.composing
  }

  compositionStart(): void {
    this.composing = true
    this.composingText = ''
  }

  compositionEnd(data: string | null): TypingAction[] {
    if (!this.composing || data == null) {
      this.composing = false
      this.composingText = ''
      return []
    }
    const actions = this.processComposing(data)
    this.composing = false
    this.composingText = ''
    return actions
  }

  handleInput(evt: TypingInputEvent): TypingAction[] {
    const isComposition = this.composing || evt.inputType === 'insertCompositionText'
    let actions: TypingAction[]
    if (evt.data != null) {
      actions = isComposition ? this.processComposing(evt.data) : this.processChars(evt.data)
    } else {
      // Deletions and engines without `data`: single-step value diff only.
      actions = this.processValueDelta(evt.value, evt.inputType)
    }
    this.lastValue = evt.value
    return actions
  }

  /**
   * Word-boundary backspace: the game un-submitted the previous word and made
   * it active again. `value` is the input's DOM value after the game dropped
   * the trailing separator; it only refreshes the fallback-diff baseline.
   */
  restoreWord(word: string, value: string): void {
    this.active = word
    this.lastValue = value
  }

  reset(value = ''): void {
    this.active = ''
    this.composing = false
    this.composingText = ''
    this.lastValue = value
    this.submittedCount = 0
  }

  /**
   * Composition updates re-send the composing text as it grows ("h", "he",
   * …, "hello", "hello "). Only the APPENDED part is new input. A fresh
   * composition may re-cover text already sitting in the active word (some
   * keyboards re-send the committed word as their composing base) — that is a
   * re-base, never an append, so letters can never duplicate. A rewrite
   * (GBoard replacing the region, a shrink from backspace) is never new
   * completed input: no submissions, just re-derive the active word.
   */
  private processComposing(data: string): TypingAction[] {
    if (data === this.composingText) return [] // duplicate update — nothing new
    if (data.startsWith(this.composingText)) {
      // Prefer the longest text the update already covers: the composing text
      // (normal growth, and the separator after a just-submitted word) or the
      // active word (a fresh composition re-covering already-typed letters).
      // Using the longest base guarantees appended never re-includes text the
      // update already contains, so a word can never be submitted twice.
      const base =
        data.startsWith(this.active) && this.active.length > this.composingText.length
          ? this.active
          : this.composingText
      const appended = data.slice(base.length)
      this.composingText = data
      return this.processChars(appended)
    }
    // Composing region rewritten or shortened.
    this.composingText = data
    const next = tailAfterLastSeparator(data)
    if (next === this.active) return []
    this.active = next
    return [{ type: 'change' }]
  }

  /**
   * Feed inserted characters through the word rules. Each separator submits
   * at most the current active word (empty words are ignored, so repeated
   * separators never advance the target twice).
   */
  private processChars(text: string): TypingAction[] {
    const actions: TypingAction[] = []
    let appended = ''
    for (const ch of text) {
      if (isSeparator(ch)) {
        if (appended) {
          actions.push({ type: 'change' })
          appended = ''
        }
        if (this.active) {
          const word = this.active
          this.active = ''
          this.submittedCount++
          actions.push({ type: 'submit', word })
        }
      } else {
        this.active += ch
        appended += ch
      }
    }
    if (appended) actions.push({ type: 'change' })
    return actions
  }

  /**
   * Fallback for engines that provide no `data`: a single-step diff against
   * the value seen at the PREVIOUS event. It never re-scans earlier text, so
   * it cannot resurrect already-submitted words. Uninterpretable rewrites are
   * dropped entirely.
   */
  private processValueDelta(value: string, inputType?: string): TypingAction[] {
    if (value === this.lastValue) return []
    if (value.startsWith(this.lastValue)) {
      return this.processChars(value.slice(this.lastValue.length))
    }
    if (this.lastValue.startsWith(value)) {
      const removed = this.lastValue.length - value.length
      // A one-character deleteContentBackward that crosses the word boundary
      // is a soft-keyboard backspace past the submitted word: the game must
      // un-submit it. Soft keyboards never send a keydown for their backspace
      // key, so this is the only place the restore can be triggered. Larger
      // deletions and rewrites stay ignored — they are IME bookkeeping, not
      // user intent.
      if (removed === 1 && this.active === '' && inputType === 'deleteContentBackward') {
        return this.submittedCount > 0 ? [{ type: 'boundaryDelete' }] : []
      }
      if (removed <= this.active.length && this.lastValue.endsWith(this.active)) {
        for (let i = 0; i < removed; i++) this.active = this.active.slice(0, -1)
        return [{ type: 'change' }]
      }
      return []
    }
    // Uninterpretable rewrite with no event data: re-derive the active word
    // from the field's tail so typing continues on data-less engines, but
    // NEVER submit — a value change alone never completes a word.
    const next = tailAfterLastSeparator(value)
    if (next === this.active) return []
    this.active = next
    return [{ type: 'change' }]
  }
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
 * Development-only input trace for real-device diagnostics. Vite inlines
 * `import.meta.env.DEV` per mode, so the production build resolves this to a
 * shared no-op and the entire logging body (strings included) is dropped by
 * tree-shaking — verify with a grep for '[zyprilo:typing]' in dist/.
 * In dev, entries land in the console and in `window.__zypriloTypingTrace`
 * (capped), so a USB remote-debugging session can copy the last events.
 */
const TRACE_LIMIT = 400

type DevTraceFn = (entry: Record<string, unknown>) => void

export const devTrace: DevTraceFn = import.meta.env.DEV
  ? (entry) => {
      const host = globalThis as typeof globalThis & { __zypriloTypingTrace?: unknown[] }
      if (!Array.isArray(host.__zypriloTypingTrace)) host.__zypriloTypingTrace = []
      const trace = host.__zypriloTypingTrace
      if (trace.length >= TRACE_LIMIT) trace.shift()
      trace.push(entry)
      console.info('[zyprilo:typing]', JSON.stringify(entry))
    }
  : () => {}
