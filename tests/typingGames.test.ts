import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TypingGame from '../src/games/typing/TypingGame'
import TypingAccuracyGame from '../src/games/typingAccuracy/TypingAccuracyGame'
import { WORDS } from '../src/games/typing/words'

// Deterministic word stream: generateWords() is WORDS[floor(random * len)],
// and Math.random is pinned, so every word in every run is THE_WORD.
const RANDOM_SEED = 0.42
const THE_WORD = WORDS[Math.floor(RANDOM_SEED * WORDS.length)]
const W = THE_WORD

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(RANDOM_SEED)
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true
  delete (globalThis as unknown as { __zypriloTypingTrace?: unknown[] }).__zypriloTypingTrace
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  vi.restoreAllMocks()
})

function mount(element: ReturnType<typeof createElement>): HTMLInputElement {
  act(() => {
    root = createRoot(container)
    root.render(element)
  })
  return getInput()
}

function getInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input.typing-input')
  if (!input) throw new Error('typing input not rendered')
  return input
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
}

/** Desktop-style event: value change with no `data` (engine fallback path). */
function typeValue(input: HTMLInputElement, value: string) {
  act(() => {
    setNativeValue(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Mobile-style event: InputEvent carrying the inserted text (`data`). */
function imeInput(input: HTMLInputElement, data: string, value: string) {
  act(() => {
    setNativeValue(input, value)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data }))
  })
}

function composition(input: HTMLInputElement, type: 'compositionstart' | 'compositionend', data = '') {
  act(() => {
    input.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }))
  })
}

function pressKey(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

function clickButton(text: string) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  )
  if (!btn) throw new Error(`button containing "${text}" not rendered`)
  act(() => {
    btn.click()
  })
}

/** Target-word index: position of the active word in the rendered stream. */
function activeIndex(): number {
  const words = Array.from(container.querySelectorAll('.tword'))
  const i = words.findIndex((w) => w.classList.contains('active'))
  if (i === -1) throw new Error('active word not rendered')
  return i
}

/** Completed (scored) words: green or red, regardless of correctness. */
function submittedCount(): number {
  return container.querySelectorAll('.tword.done-ok, .tword.done-bad').length
}

function hudValue(label: string): string | null {
  const item = Array.from(container.querySelectorAll('.hud-item')).find(
    (el) => el.querySelector('.hud-label')?.textContent === label,
  )
  return item?.querySelector('.hud-value')?.textContent ?? null
}

interface CaretInfo {
  pos: number
  after: boolean
}

function caretInfo(): CaretInfo {
  const active = container.querySelector('.tword.active')
  if (!active) throw new Error('active word not rendered')
  const chars = Array.from(active.querySelectorAll('.tchar'))
  const caret = active.querySelector('.tcaret')
  if (!caret) throw new Error('caret not rendered')
  const parentIndex = chars.indexOf(caret.parentElement as Element)
  const after = caret.classList.contains('tcaret-after')
  return { pos: after ? parentIndex + 1 : parentIndex, after }
}

function charClasses(): string[] {
  return Array.from(container.querySelectorAll('.tword.active .tchar')).map((c) => c.className)
}

/**
 * Type one word the way GBoard does: a composition covering the word and its
 * trailing space. `hostileValue` re-inserts an already-submitted prefix into
 * the field (the real-device failure trigger) while `data` stays truthful.
 */
function gboardWord(
  input: HTMLInputElement,
  opts: { collapseFrom?: boolean; hostilePrefix?: string } = {},
) {
  const { collapseFrom = false, hostilePrefix = '' } = opts
  if (!collapseFrom) composition(input, 'compositionstart')
  let text = ''
  for (const ch of W) {
    text += ch
    imeInput(input, text, hostilePrefix + text)
  }
  imeInput(input, `${text} `, hostilePrefix + `${text} `)
}

describe('TypingGame — desktop flow (value events, no data)', () => {
  it('letters never advance the target; index asserted after every event', () => {
    const input = mount(createElement(TypingGame, {}))
    let value = ''
    for (const ch of W) {
      value += ch
      typeValue(input, value)
      expect(activeIndex()).toBe(0)
      expect(submittedCount()).toBe(0)
    }
    expect(caretInfo().pos).toBe(W.length)
    expect(caretInfo().after).toBe(true)
  })

  it('the first space advances the target exactly once', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${W} `)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
    expect(container.querySelector('.tword')?.className).toContain('done-ok')
    expect(input.value).toBe(`${W} `) // the field is never cleared mid-run
  })

  it('the target stays on the second word until its own separator', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${W} `)
    let value = `${W} `
    for (const ch of W) {
      value += ch
      typeValue(input, value)
      expect(activeIndex()).toBe(1)
      expect(submittedCount()).toBe(1)
    }
    typeValue(input, `${value} `)
    expect(activeIndex()).toBe(2)
    expect(submittedCount()).toBe(2)
  })

  it('accepts five consecutive words without tapping the input again', () => {
    const input = mount(createElement(TypingGame, {}))
    let value = ''
    for (let i = 0; i < 5; i++) {
      value += `${W} `
      typeValue(input, value)
      expect(activeIndex()).toBe(i + 1)
      expect(submittedCount()).toBe(i + 1)
      expect(hudValue('Errors')).toBe('0')
      expect(hudValue('Accuracy')).toBe('100%')
    }
    expect(input.value).toBe(`${W} `.repeat(5))
  })

  it('ignores repeated and leading spaces (no empty submissions)', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, ' ')
    expect(activeIndex()).toBe(0)
    expect(submittedCount()).toBe(0)
    typeValue(input, ` ${W} `)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
    // A double space between words consumes the extra separator without
    // submitting an empty word: the target advances exactly once.
    typeValue(input, ` ${W}  `)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
    typeValue(input, ` ${W}  ${W}`)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
    typeValue(input, ` ${W}  ${W} `)
    expect(activeIndex()).toBe(2)
    expect(submittedCount()).toBe(2)
  })

  it('treats a non-breaking space as a separator and keeps it in the field', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${W}\u00A0`)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
    expect(input.value).toBe(`${W}\u00A0`)
  })

  it('grades punctuation as an extra character and counts it as an error', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${W}!`)
    expect(charClasses().at(-1)).toContain('extra')
    expect(hudValue('Errors')).toBe('1')
    typeValue(input, `${W}! `)
    expect(activeIndex()).toBe(1)
    expect(container.querySelector('.tword')?.className).toContain('done-bad')
  })

  it('grades incorrect letters as errors without advancing the target', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, 'X')
    expect(activeIndex()).toBe(0)
    expect(hudValue('Errors')).toBe('1')
    expect(hudValue('Accuracy')).toBe('0%')
    typeValue(input, `X${W[1]}`)
    expect(activeIndex()).toBe(0)
    expect(hudValue('Errors')).toBe('1')
  })

  it('mid-word backspace deletes letters without touching the target', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, W)
    typeValue(input, W.slice(0, -1))
    expect(activeIndex()).toBe(0)
    expect(caretInfo().pos).toBe(W.length - 1)
  })

  it('backspace across the word boundary restores the previous word', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${W} `)
    pressKey(input, 'Backspace')
    expect(activeIndex()).toBe(0)
    expect(submittedCount()).toBe(0)
    expect(input.value).toBe(W)
    expect(caretInfo()).toEqual({ pos: W.length, after: true })
    typeValue(input, `${W}x`)
    expect(charClasses().at(-1)).toContain('extra')
    typeValue(input, `${W}x `)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
  })

  it('restores the previous word on a Gboard soft-keyboard backspace (no keydown)', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${W} `)
    expect(submittedCount()).toBe(1)
    // Gboard's backspace deletes the separator and reports it as
    // deleteContentBackward with no `data` and no keydown event.
    act(() => {
      setNativeValue(input, W)
      input.dispatchEvent(
        new InputEvent('input', { bubbles: true, data: null, inputType: 'deleteContentBackward' }),
      )
    })
    expect(activeIndex()).toBe(0)
    expect(submittedCount()).toBe(0)
    expect(input.value).toBe(W)
    expect(caretInfo()).toEqual({ pos: W.length, after: true })
    // Typing continues from the restored word and resubmits it cleanly.
    typeValue(input, `${W} `)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
    expect(container.querySelector('.tword')?.className).toContain('done-ok')
  })

  it('Enter submits nothing and breaks nothing', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, W)
    pressKey(input, 'Enter')
    expect(activeIndex()).toBe(0)
    expect(submittedCount()).toBe(0)
  })
})

describe('TypingGame — GBoard composition flow (InputEvent with data)', () => {
  it('REGRESSION (real-device report): hostile re-expanding values never advance the target on letters', () => {
    const input = mount(createElement(TypingGame, {}))
    // Word 1 composed normally; its space submits it.
    gboardWord(input)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
    // GBoard replaces its composing region with the next word's first letter:
    // the field collapses to that single letter.
    imeInput(input, W[0], W[0])
    expect(activeIndex()).toBe(1) // the collapse itself must not advance
    expect(submittedCount()).toBe(1)
    // Then GBoard re-expands the field so it CONTAINS the already-submitted
    // word and separator — with the old parser this re-submitted the word on
    // every letter and the target jumped. The machine ignores the value.
    let composing = W[0]
    for (let i = 1; i < W.length; i++) {
      composing += W[i]
      const hostile = `${W} ${composing}`
      imeInput(input, composing, hostile)
      expect(activeIndex()).toBe(1)
      expect(submittedCount()).toBe(1)
      expect(hudValue('Errors')).toBe('0')
    }
    // Only the second word's own separator may advance the target.
    imeInput(input, `${composing} `, `${W} ${composing} `)
    expect(activeIndex()).toBe(2)
    expect(submittedCount()).toBe(2)
    expect(hudValue('Accuracy')).toBe('100%')
  })

  it('five consecutive composed words, index and counts asserted after every event', () => {
    const input = mount(createElement(TypingGame, {}))
    gboardWord(input) // word 1: fresh composition
    expect(activeIndex()).toBe(1)
    for (let i = 2; i <= 5; i++) {
      // Each later word starts from a region replacement (collapse).
      gboardWord(input, { collapseFrom: true, hostilePrefix: '' })
      expect(activeIndex()).toBe(i)
      expect(submittedCount()).toBe(i)
      expect(hudValue('Errors')).toBe('0')
    }
    expect(hudValue('Accuracy')).toBe('100%')
  })

  it('duplicate input and compositionend events never double-submit', () => {
    const input = mount(createElement(TypingGame, {}))
    composition(input, 'compositionstart')
    let text = ''
    for (const ch of W) {
      text += ch
      imeInput(input, text, text)
    }
    // Same data twice (keyboard re-sending the update).
    imeInput(input, text, text)
    expect(activeIndex()).toBe(0)
    expect(submittedCount()).toBe(0)
    // Space submits exactly once…
    imeInput(input, `${text} `, `${text} `)
    expect(submittedCount()).toBe(1)
    // …and every duplicate afterwards (same update, commit echo, stale
    // change event with identical value) leaves it at one.
    imeInput(input, `${text} `, `${text} `)
    composition(input, 'compositionend', text)
    composition(input, 'compositionend', text)
    typeValue(input, `${text} `)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
  })

  it('a final autocorrect commit (compositionend data differs) is applied once', () => {
    const input = mount(createElement(TypingGame, {}))
    composition(input, 'compositionstart')
    let text = ''
    for (let i = 0; i < W.length - 1; i++) {
      text += W[i]
      imeInput(input, text, text)
    }
    // The keyboard corrects the word at commit time: the final composition
    // update carries the corrected text, then compositionend confirms it.
    imeInput(input, W, W)
    composition(input, 'compositionend', W)
    expect(activeIndex()).toBe(0)
    expect(submittedCount()).toBe(0)
    expect(caretInfo()).toEqual({ pos: W.length, after: true })
    // The following space (committed insertText) submits the corrected word.
    typeValue(input, `${W} `)
    expect(submittedCount()).toBe(1)
    expect(container.querySelector('.tword')?.className).toContain('done-ok')
  })

  it('a composition that restarts without ending keeps working', () => {
    const input = mount(createElement(TypingGame, {}))
    composition(input, 'compositionstart')
    imeInput(input, W, W)
    imeInput(input, `${W} `, `${W} `)
    composition(input, 'compositionstart') // some keyboards just restart
    imeInput(input, W[0], W[0])
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
    expect(charClasses()[0]).toContain('correct')
  })

  it('records a development-only trace usable for device diagnostics', () => {
    const input = mount(createElement(TypingGame, {}))
    composition(input, 'compositionstart')
    imeInput(input, W[0], W[0])
    const trace = (globalThis as unknown as { __zypriloTypingTrace?: unknown[] })
      .__zypriloTypingTrace
    expect(Array.isArray(trace)).toBe(true)
    expect(trace!.length).toBeGreaterThan(0)
  })
})

describe('TypingGame — caret rendering', () => {
  it('starts before the first character and advances per keystroke', () => {
    const input = mount(createElement(TypingGame, {}))
    expect(caretInfo()).toEqual({ pos: 0, after: false })
    typeValue(input, W.slice(0, 2))
    expect(caretInfo().pos).toBe(2)
    typeValue(input, W)
    expect(caretInfo()).toEqual({ pos: W.length, after: true })
    typeValue(input, `${W} `)
    expect(caretInfo()).toEqual({ pos: 0, after: false })
  })

  it('stays after the last extra character when typing past the word', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${W}!!`)
    expect(caretInfo().after).toBe(true)
    expect(caretInfo().pos).toBe(W.length + 2)
    expect(charClasses().at(-1)).toContain('extra')
  })
})

describe('TypingGame — restart', () => {
  it('clears the field, machine, and caret when switching modes while idle', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, ' ') // buffered separator: no run started, still idle
    expect(input.value).toBe(' ')
    clickButton('15s')
    expect(getInput().value).toBe('')
    expect(activeIndex()).toBe(0)
    expect(submittedCount()).toBe(0)
    expect(caretInfo()).toEqual({ pos: 0, after: false })
    // The machine is fresh: typing works immediately after restart.
    typeValue(getInput(), W)
    expect(caretInfo().pos).toBe(W.length)
  })
})

describe('TypingAccuracyGame — desktop flow', () => {
  it('letters never advance the target; the space advances it once', () => {
    const input = mount(createElement(TypingAccuracyGame, {}))
    let value = ''
    for (const ch of W) {
      value += ch
      typeValue(input, value)
      expect(activeIndex()).toBe(0)
      expect(submittedCount()).toBe(0)
      expect(hudValue('Words')).toBe('0')
    }
    typeValue(input, `${value} `)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
    expect(hudValue('Words')).toBe('1')
    expect(hudValue('Errors')).toBe('0')
  })

  it('accepts five consecutive words without re-tapping', () => {
    const input = mount(createElement(TypingAccuracyGame, {}))
    let value = ''
    for (let i = 0; i < 5; i++) {
      value += `${W} `
      typeValue(input, value)
      expect(activeIndex()).toBe(i + 1)
      expect(hudValue('Words')).toBe(String(i + 1))
      expect(hudValue('Clean')).toBe(String(i + 1))
    }
  })

  it('backspace across the boundary restores and re-submits the edited word', () => {
    const input = mount(createElement(TypingAccuracyGame, {}))
    typeValue(input, `${W} `)
    pressKey(input, 'Backspace')
    expect(activeIndex()).toBe(0)
    expect(input.value).toBe(W)
    typeValue(input, `${W} `)
    expect(activeIndex()).toBe(1)
    expect(submittedCount()).toBe(1)
  })
})

describe('TypingAccuracyGame — GBoard composition flow', () => {
  it('REGRESSION (real-device report): letters with hostile values never advance the target', () => {
    const input = mount(createElement(TypingAccuracyGame, {}))
    gboardWord(input)
    expect(activeIndex()).toBe(1)
    imeInput(input, W[0], W[0]) // region collapse
    expect(activeIndex()).toBe(1)
    let composing = W[0]
    for (let i = 1; i < W.length; i++) {
      composing += W[i]
      imeInput(input, composing, `${W} ${composing}`)
      expect(activeIndex()).toBe(1)
      expect(submittedCount()).toBe(1)
      expect(hudValue('Errors')).toBe('0')
    }
    imeInput(input, `${composing} `, `${W} ${composing} `)
    expect(activeIndex()).toBe(2)
    expect(hudValue('Accuracy')).toBe('100%')
  })

  it('duplicate events and composition echoes never double-submit', () => {
    const input = mount(createElement(TypingAccuracyGame, {}))
    composition(input, 'compositionstart')
    imeInput(input, W, W)
    imeInput(input, W, W)
    imeInput(input, `${W} `, `${W} `)
    imeInput(input, `${W} `, `${W} `)
    composition(input, 'compositionend', W)
    expect(submittedCount()).toBe(1)
    expect(hudValue('Words')).toBe('1')
  })
})

describe('TypingAccuracyGame — full run and restart after typing', () => {
  it('free mode: finish 15 words, restart from the result panel, type again', () => {
    mount(createElement(TypingAccuracyGame, {}))
    clickButton('Free')
    const fresh = getInput()
    let value = ''
    for (let i = 0; i < 15; i++) {
      value += `${W} `
      typeValue(fresh, value)
      if (i < 14) expect(activeIndex()).toBe(i + 1)
    }
    // The 15th word ends the run: the result panel replaces the arena.
    expect(container.querySelector('input.typing-input')).toBeNull()
    expect(container.textContent).toContain('Accuracy')
    clickButton('Play again')
    const restarted = getInput()
    expect(restarted.value).toBe('')
    expect(activeIndex()).toBe(0)
    expect(hudValue('Words')).toBe('0/15')
    // Typing works immediately on the fresh run.
    typeValue(restarted, W)
    expect(caretInfo().pos).toBe(W.length)
  })

  it('restart while idle clears buffered input', () => {
    const input = mount(createElement(TypingAccuracyGame, {}))
    typeValue(input, ' ')
    clickButton('30s')
    expect(getInput().value).toBe('')
    expect(activeIndex()).toBe(0)
  })
})
