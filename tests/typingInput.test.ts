import { describe, expect, it } from 'vitest'
import {
  scoreAppendedChars,
  TypingInputMachine,
  type TypingAction,
} from '../src/games/typing/typingInput'

function submitted(actions: TypingAction[]): string[] {
  return actions.filter((a) => a.type === 'submit').map((a) => (a as { word: string }).word)
}

function press(
  m: TypingInputMachine,
  data: string | null,
  opts: { composing?: boolean; inputType?: string; value?: string } = {},
): TypingAction[] {
  return m.handleInput({
    data,
    inputType: opts.inputType ?? (opts.composing ? 'insertCompositionText' : 'insertText'),
    value: opts.value ?? '',
  })
}

describe('TypingInputMachine — letters never complete a word', () => {
  it('keeps the target index unchanged while typing "hello" one letter at a time (composing)', () => {
    const m = new TypingInputMachine()
    m.compositionStart()
    let text = ''
    for (const ch of 'hello') {
      text += ch
      const actions = press(m, text, { composing: true })
      expect(submitted(actions)).toEqual([])
      expect(m.activeWord).toBe(text)
    }
  })

  it('keeps the target index unchanged while typing letters without composition', () => {
    const m = new TypingInputMachine()
    let text = ''
    for (const ch of 'hello') {
      text += ch
      const actions = press(m, ch)
      expect(submitted(actions)).toEqual([])
      expect(m.activeWord).toBe(text)
    }
  })

  it('emits only change actions for letters, carrying the full active word', () => {
    const m = new TypingInputMachine()
    const actions = press(m, 'hel')
    expect(actions).toEqual([{ type: 'change' }])
    expect(m.activeWord).toBe('hel')
  })
})

describe('TypingInputMachine — separators submit exactly one word', () => {
  it('advances exactly once on the first space and clears the active word', () => {
    const m = new TypingInputMachine()
    m.compositionStart()
    press(m, 'hello', { composing: true })
    const actions = press(m, 'hello ', { composing: true })
    expect(submitted(actions)).toEqual(['hello'])
    expect(m.activeWord).toBe('')
  })

  it('keeps the target on "world" until its own separator', () => {
    const m = new TypingInputMachine()
    m.compositionStart()
    press(m, 'hello', { composing: true })
    press(m, 'hello ', { composing: true })
    let text = 'hello '
    for (const ch of 'world') {
      text += ch
      const actions = press(m, text, { composing: true })
      expect(submitted(actions)).toEqual([])
      expect(m.activeWord).toBe(text.slice(6))
    }
    const done = press(m, `${text} `, { composing: true })
    expect(submitted(done)).toEqual(['world'])
  })

  it('submits at most one word per separator across five consecutive words', () => {
    const m = new TypingInputMachine()
    const words = ['one', 'two', 'three', 'four', 'five']
    const all: string[] = []
    for (let w = 0; w < words.length; w++) {
      if (w > 0) m.compositionStart() // GBoard starts a new composition per word
      let text = ''
      for (const ch of words[w]) {
        text += ch
        all.push(...submitted(press(m, text, { composing: true })))
      }
      all.push(...submitted(press(m, `${text} `, { composing: true })))
    }
    expect(all).toEqual(words)
  })

  it('never submits empty words: repeated and leading separators are ignored', () => {
    const m = new TypingInputMachine()
    expect(submitted(press(m, ' '))).toEqual([])
    expect(submitted(press(m, '   '))).toEqual([])
    expect(submitted(press(m, 'a  b ', { composing: true }))).toEqual(['a', 'b'])
    expect(m.activeWord).toBe('')
  })

  it('keeps punctuation inside the word it was typed into', () => {
    const m = new TypingInputMachine()
    expect(submitted(press(m, "it's! "))).toEqual(["it's!"])
  })

  it('treats a non-breaking space as a separator', () => {
    const m = new TypingInputMachine()
    expect(submitted(press(m, 'ab\u00A0'))).toEqual(['ab'])
  })
})

describe('TypingInputMachine — GBoard composing-region replacement', () => {
  it('accepts the next word after the region collapses, submitting nothing on the collapse', () => {
    const m = new TypingInputMachine()
    m.compositionStart()
    press(m, 'hello', { composing: true })
    press(m, 'hello ', { composing: true }) // space inside the composition
    // GBoard replaces the whole region with the next word's first letter.
    const actions = press(m, 'w', { composing: true })
    expect(submitted(actions)).toEqual([])
    expect(actions).toEqual([{ type: 'change' }])
    expect(m.activeWord).toBe('w')
    // Typing continues normally from the replaced region.
    expect(submitted(press(m, 'wo', { composing: true }))).toEqual([])
    expect(m.activeWord).toBe('wo')
    expect(submitted(press(m, 'world ', { composing: true }))).toEqual(['world'])
  })

  it('never submits when the value re-expands around the collapse (real-device failure)', () => {
    // Regression for the Android failure: after the region collapse, GBoard
    // re-inserts the committed word into the field. The machine must not
    // re-submit it — the value is ignored whenever event data is present.
    const m = new TypingInputMachine()
    m.compositionStart()
    press(m, 'hello', { composing: true })
    press(m, 'hello ', { composing: true, value: 'hello ' })
    let value = 'hello ' // GBoard re-expands the field below the collapse
    for (const ch of 'world') {
      value += ch
      const actions = press(m, (m.activeWord ?? '') + ch, {
        composing: true,
        value, // hostile: the field contains the already-submitted word
      })
      expect(submitted(actions)).toEqual([])
    }
    const done = press(m, 'world ', { composing: true, value: `${value} ` })
    expect(submitted(done)).toEqual(['world'])
  })

  it('ignores duplicate composition updates and duplicate compositionend data', () => {
    const m = new TypingInputMachine()
    m.compositionStart()
    expect(press(m, 'hello', { composing: true })).toHaveLength(1)
    expect(press(m, 'hello', { composing: true })).toEqual([]) // duplicate
    expect(m.compositionEnd('hello')).toEqual([]) // same data again
    expect(m.compositionEnd('hello')).toEqual([])
    expect(m.activeWord).toBe('hello')
  })

  it('processes a final commit that differs from the last update exactly once', () => {
    const m = new TypingInputMachine()
    m.compositionStart()
    press(m, 'hel', { composing: true })
    const actions = m.compositionEnd('hello')
    expect(submitted(actions)).toEqual([])
    expect(m.activeWord).toBe('hello')
    // Letters after a commit continue the SAME active word (no separator).
    m.compositionStart()
    expect(submitted(press(m, 'x', { composing: true }))).toEqual([])
    expect(m.activeWord).toBe('hellox')
  })

  it('re-bases instead of duplicating when a composition re-covers the active word', () => {
    const m = new TypingInputMachine()
    press(m, 'hel') // non-composing inserts built the active word
    m.compositionStart()
    // Keyboard starts composing and re-sends the whole word as its base.
    expect(submitted(press(m, 'hel', { composing: true }))).toEqual([])
    expect(m.activeWord).toBe('hel')
    expect(submitted(press(m, 'hello', { composing: true }))).toEqual([])
    expect(m.activeWord).toBe('hello')
    expect(submitted(press(m, 'hello ', { composing: true }))).toEqual(['hello'])
  })

  it('handles a composition that never ends before the next one starts', () => {
    const m = new TypingInputMachine()
    m.compositionStart()
    press(m, 'hello ', { composing: true })
    m.compositionStart() // some keyboards restart without ending
    expect(submitted(press(m, 'a', { composing: true }))).toEqual([])
    expect(m.activeWord).toBe('a')
  })
})

describe('TypingInputMachine — non-composing insertText and fallbacks', () => {
  it('submits on a committed separator that arrives after compositionend', () => {
    const m = new TypingInputMachine()
    m.compositionStart()
    press(m, 'hello', { composing: true })
    m.compositionEnd('hello')
    expect(submitted(press(m, ' '))).toEqual(['hello'])
    expect(m.activeWord).toBe('')
  })

  it('multi-word paste submits every word in order', () => {
    const m = new TypingInputMachine()
    expect(submitted(press(m, 'one two three '))).toEqual(['one', 'two', 'three'])
    expect(m.activeWord).toBe('')
  })

  it('no-data fallback appends via single-step value diff and never re-scans', () => {
    const m = new TypingInputMachine()
    press(m, null, { value: 'hel' })
    expect(m.activeWord).toBe('hel')
    press(m, null, { value: 'hello' })
    expect(m.activeWord).toBe('hello')
    expect(submitted(press(m, null, { value: 'hello ' }))).toEqual(['hello'])
  })

  it('no-data fallback recovers letters from rewrites without ever submitting', () => {
    const m = new TypingInputMachine()
    press(m, null, { value: 'hello' })
    // Field rewritten to unrelated content: the active word re-derives from
    // the tail (typing keeps working) and nothing is submitted — a value
    // change alone never completes a word.
    expect(submitted(press(m, null, { value: 'x' }))).toEqual([])
    expect(m.activeWord).toBe('x')
    // Even a rewrite that re-inserts old words + separators cannot submit.
    expect(submitted(press(m, null, { value: 'hello world x' }))).toEqual([])
    expect(m.activeWord).toBe('x')
  })

  it('no-data fallback pops characters on tail deletion', () => {
    const m = new TypingInputMachine()
    press(m, null, { value: 'hel' })
    press(m, null, { value: 'he' })
    expect(m.activeWord).toBe('he')
    // Deleting the whole active word empties it without ever submitting.
    expect(submitted(press(m, null, { value: '' }))).toEqual([])
    expect(m.activeWord).toBe('')
    // Deletions can never walk backwards into already-submitted words.
    press(m, null, { value: 'one two ' })
    press(m, null, { value: 'one' })
    expect(m.activeWord).toBe('')
  })

  it('flags a soft-keyboard backspace crossing the word boundary (deleteContentBackward)', () => {
    // Gboard's backspace key never sends a keydown; the restore must be
    // triggered from the deleteContentBackward input event instead.
    const m = new TypingInputMachine()
    press(m, 'hello ', { value: 'hello ' })
    expect(m.activeWord).toBe('')
    const actions = press(m, null, {
      inputType: 'deleteContentBackward',
      value: 'hello',
    })
    expect(actions).toEqual([{ type: 'boundaryDelete' }])
    // The game responds via restoreWord; typing then continues in the old word.
    m.restoreWord('hello', 'hello')
    expect(m.activeWord).toBe('hello')
    expect(submitted(press(m, 'x', { value: 'hellox' }))).toEqual([])
    expect(m.activeWord).toBe('hellox')
  })

  it('ignores a boundary-crossing deleteContentBackward with nothing submitted', () => {
    const m = new TypingInputMachine()
    press(m, null, { value: ' ' })
    const actions = press(m, null, {
      inputType: 'deleteContentBackward',
      value: '',
    })
    expect(actions).toEqual([])
  })

  it('still ignores multi-character deletions at the boundary (IME bookkeeping)', () => {
    const m = new TypingInputMachine()
    press(m, 'hello ', { value: 'hello ' })
    const actions = press(m, null, {
      inputType: 'deleteContentBackward',
      value: 'he',
    })
    expect(actions).toEqual([])
    expect(m.activeWord).toBe('')
  })
})

describe('TypingInputMachine — backspace restoration and restart', () => {
  it('restoreWord re-activates the previous word and refreshes the value baseline', () => {
    const m = new TypingInputMachine()
    press(m, 'one two ') // submits one, two; active empty
    m.restoreWord('two', 'one two')
    expect(m.activeWord).toBe('two')
    // Typing continues from the restored word.
    expect(submitted(press(m, 'x'))).toEqual([])
    expect(m.activeWord).toBe('twox')
    expect(submitted(press(m, ' '))).toEqual(['twox'])
  })

  it('reset clears everything mid-composition; the next composition starts clean', () => {
    const m = new TypingInputMachine()
    m.compositionStart()
    press(m, 'hello ', { composing: true, value: 'hello ' })
    m.reset('')
    expect(m.activeWord).toBe('')
    m.compositionStart()
    expect(submitted(press(m, 'hi ', { composing: true }))).toEqual(['hi'])
  })
})

describe('scoreAppendedChars', () => {
  it('counts appended correct characters', () => {
    expect(scoreAppendedChars('', 'hel', 'hello')).toEqual({ keystrokes: 3, correct: 3 })
  })

  it('counts incorrect characters as keystrokes but not correct ones', () => {
    // 'h' and 'l' match 'hello' positionally, the 'x' does not.
    expect(scoreAppendedChars('', 'hxl', 'hello')).toEqual({ keystrokes: 3, correct: 2 })
    expect(scoreAppendedChars('', 'xxx', 'hello')).toEqual({ keystrokes: 3, correct: 0 })
  })

  it('scores only the newly appended part (chars already scored are skipped)', () => {
    expect(scoreAppendedChars('hel', 'hello', 'hello')).toEqual({ keystrokes: 2, correct: 2 })
  })

  it('counts characters typed beyond the target as errors', () => {
    expect(scoreAppendedChars('', 'helloo', 'hello')).toEqual({ keystrokes: 6, correct: 5 })
    expect(scoreAppendedChars('', 'ab!!', 'ab')).toEqual({ keystrokes: 4, correct: 2 })
  })

  it('scores a rewritten (longer) composition tail positionally', () => {
    // GBoard replaced "helo" with "hello": index 3 is newly scored against 'l'.
    expect(scoreAppendedChars('helo', 'hello', 'hello')).toEqual({ keystrokes: 1, correct: 1 })
  })

  it('never scores a shrinking tail (backspace inside a word)', () => {
    expect(scoreAppendedChars('hello', 'hel', 'hello')).toEqual({ keystrokes: 0, correct: 0 })
  })
})
