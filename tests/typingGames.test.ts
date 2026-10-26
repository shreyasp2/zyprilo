import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TypingGame from '../src/games/typing/TypingGame'
import TypingAccuracyGame from '../src/games/typingAccuracy/TypingAccuracyGame'
import { WORDS } from '../src/games/typing/words'

// Deterministic word stream: generateWords() is WORDS[floor(random * len)].
const RANDOM_SEED = 0.42
const THE_WORD = WORDS[Math.floor(RANDOM_SEED * WORDS.length)]

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(RANDOM_SEED)
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true
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
  const input = container.querySelector<HTMLInputElement>('input.typing-input')
  if (!input) throw new Error('typing input not rendered')
  return input
}

/**
 * Simulate an input event the way a mobile keyboard delivers it: the full
 * current value is set natively, then an `input` event bubbles to React.
 */
function typeValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function pressKey(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })
}

function activeWordText(): string {
  return container.querySelector('.tword.active')?.textContent ?? ''
}

interface CaretInfo {
  /** Logical caret position: chars fully typed to its left (extras included). */
  pos: number
  /** True when the caret sits after the final char (word fully typed). */
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
  return Array.from(container.querySelectorAll('.tword.active .tchar')).map((c) =>
    c.className,
  )
}

function hudValue(label: string): string | null {
  const item = Array.from(container.querySelectorAll('.hud-item')).find((el) =>
    el.querySelector('.hud-label')?.textContent === label,
  )
  return item?.querySelector('.hud-value')?.textContent ?? null
}

describe('TypingGame caret', () => {
  it('starts immediately before the first expected character', () => {
    mount(createElement(TypingGame, {}))
    expect(activeWordText()).toBe(THE_WORD)
    expect(caretInfo()).toEqual({ pos: 0, after: false })
  })

  it('advances after every keystroke, including incorrect characters', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, THE_WORD[0])
    expect(caretInfo().pos).toBe(1)
    typeValue(input, `${THE_WORD[0]}X`)
    expect(caretInfo().pos).toBe(2)
    const classes = charClasses()
    expect(classes[0]).toContain('correct')
    expect(classes[1]).toContain('incorrect')
  })

  it('sits after the last char once the word is fully typed, then jumps to the next word on space', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, THE_WORD)
    expect(caretInfo()).toEqual({ pos: THE_WORD.length, after: true })
    typeValue(input, `${THE_WORD} `)
    expect(caretInfo()).toEqual({ pos: 0, after: false })
  })

  it('stays after the last extra character when typing past the word', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${THE_WORD}!!`)
    const info = caretInfo()
    expect(info.after).toBe(true)
    expect(info.pos).toBe(THE_WORD.length + 2)
    expect(charClasses().at(-1)).toContain('extra')
  })
})

describe('TypingGame spaces (mobile-style input events)', () => {
  it('registers a space through onChange, submits the word, and never resets the input value', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, THE_WORD)
    typeValue(input, `${THE_WORD} `)
    expect(container.querySelector('.tword')?.className).toContain('done-ok')
    // The buffer must keep everything the keyboard inserted: resetting it
    // mid-composition is what desyncs mobile IMEs and loses spaces.
    expect(input.value).toBe(`${THE_WORD} `)
    expect(input.getAttribute('autocapitalize')).toBe('none')
    expect(input.getAttribute('autocorrect')).toBe('off')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(input.getAttribute('inputmode')).toBe('text')
  })

  it('keeps parsing the accumulating buffer across consecutive words', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${THE_WORD} `)
    typeValue(input, `${THE_WORD} ${THE_WORD}`)
    typeValue(input, `${THE_WORD} ${THE_WORD} `)
    expect(container.querySelectorAll('.tword.done-ok')).toHaveLength(2)
    expect(input.value).toBe(`${THE_WORD} ${THE_WORD} `)
  })

  it('consumes consecutive spaces without submitting empty words', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${THE_WORD} `)
    typeValue(input, `${THE_WORD}  `)
    expect(container.querySelectorAll('.tword.done-ok')).toHaveLength(1)
    expect(caretInfo()).toEqual({ pos: 0, after: false })
    expect(input.value).toBe(`${THE_WORD}  `)
  })

  it('ignores a space typed with nothing pending', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, ' ')
    expect(container.querySelectorAll('.tword.done-ok')).toHaveLength(0)
    expect(container.querySelector('.tword')?.className).toContain('active')
  })

  it('treats a non-breaking space as a word separator', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${THE_WORD}\u00A0`)
    expect(container.querySelectorAll('.tword.done-ok')).toHaveLength(1)
    expect(input.value).toBe(`${THE_WORD}\u00A0`)
  })

  it('evaluates punctuation typed into a word as an error and counts it', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${THE_WORD}!`)
    expect(charClasses().at(-1)).toContain('extra')
    typeValue(input, `${THE_WORD}! `)
    expect(container.querySelector('.tword')?.className).toContain('done-bad')
    expect(hudValue('Errors')).toBe('1')
  })

  it('counts incorrect characters in the live error total', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, 'X')
    expect(hudValue('Errors')).toBe('1')
  })
})

describe('TypingGame word-boundary backspace', () => {
  it('restores the previous word and rewinds the input buffer', () => {
    const input = mount(createElement(TypingGame, {}))
    typeValue(input, `${THE_WORD} `)
    pressKey(input, 'Backspace')
    expect(container.querySelector('.tword')?.className).toContain('active')
    expect(input.value).toBe(THE_WORD)
    expect(caretInfo()).toEqual({ pos: THE_WORD.length, after: true })
    // Typing continues from the restored word without corrupting the buffer.
    typeValue(input, `${THE_WORD}X`)
    expect(charClasses().at(-1)).toContain('extra')
  })
})

describe('TypingGame restart', () => {
  it('clears the input buffer and caret when the mode changes', () => {
    const input = mount(createElement(TypingGame, {}))
    // A space with nothing pending stays in the buffer without starting the
    // run (mode buttons are disabled while running, like in the real app).
    typeValue(input, ' ')
    expect(input.value).toBe(' ')
    const modeButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === '15s',
    )
    if (!modeButton) throw new Error('15s mode button not rendered')
    act(() => {
      modeButton.click()
    })
    expect(input.value).toBe('')
    expect(caretInfo()).toEqual({ pos: 0, after: false })
  })
})

describe('TypingAccuracyGame', () => {
  it('moves the caret with each keystroke and on word submission', () => {
    const input = mount(createElement(TypingAccuracyGame, {}))
    expect(caretInfo()).toEqual({ pos: 0, after: false })
    typeValue(input, THE_WORD.slice(0, 2))
    expect(caretInfo().pos).toBe(2)
    typeValue(input, `${THE_WORD} `)
    expect(caretInfo()).toEqual({ pos: 0, after: false })
  })

  it('registers spaces from mobile-style events and keeps the buffer intact', () => {
    const input = mount(createElement(TypingAccuracyGame, {}))
    typeValue(input, THE_WORD)
    typeValue(input, `${THE_WORD} `)
    expect(container.querySelector('.tword')?.className).toContain('done-ok')
    expect(input.value).toBe(`${THE_WORD} `)
    typeValue(input, `${THE_WORD} ${THE_WORD}!`)
    expect(charClasses().at(-1)).toContain('extra')
    typeValue(input, `${THE_WORD} ${THE_WORD}! `)
    expect(container.querySelectorAll('.tword.done-bad')).toHaveLength(1)
    expect(container.querySelectorAll('.tword.done-ok')).toHaveLength(1)
    expect(input.value).toBe(`${THE_WORD} ${THE_WORD}! `)
  })

  it('submits on a non-breaking space from an on-screen keyboard', () => {
    const input = mount(createElement(TypingAccuracyGame, {}))
    typeValue(input, `${THE_WORD}\u00A0`)
    expect(container.querySelectorAll('.tword.done-ok')).toHaveLength(1)
    expect(input.value).toBe(`${THE_WORD}\u00A0`)
  })
})
