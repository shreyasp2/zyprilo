import { describe, expect, it } from 'vitest'
import {
  parseTypingValue,
  rewindToWord,
  scoreAppendedChars,
} from '../src/games/typing/typingInput'

describe('parseTypingValue', () => {
  it('returns the typed tail as the active word before any space', () => {
    expect(parseTypingValue('hel', 0)).toEqual({
      submissions: [],
      activeTyped: 'hel',
      consumed: 0,
    })
  })

  it('submits a word when a trailing space arrives and consumes the space', () => {
    expect(parseTypingValue('hello ', 0)).toEqual({
      submissions: ['hello'],
      activeTyped: '',
      consumed: 6,
    })
  })

  it('does not lose the trailing space: it is counted as consumed', () => {
    const parsed = parseTypingValue('hi there ', 0)
    expect(parsed.consumed).toBe('hi there '.length)
  })

  it('parses forward from the consumed cursor on later events', () => {
    const first = parseTypingValue('hello ', 0)
    const second = parseTypingValue('hello world', first.consumed)
    expect(second.submissions).toEqual([])
    expect(second.activeTyped).toBe('world')
    expect(second.consumed).toBe(6)
  })

  it('keeps working when an IME rewrites the value at full length (mobile composition)', () => {
    // GBoard re-sends the whole value on every composition update.
    let consumed = 0
    for (const value of ['h', 'he', 'hel', 'hell', 'hello', 'hello ']) {
      const parsed = parseTypingValue(value, consumed)
      consumed = parsed.consumed
    }
    expect(consumed).toBe(6)
    expect(parseTypingValue('hello world', 6).activeTyped).toBe('world')
  })

  it('submits every word of a multi-word paste or dictation in order', () => {
    const parsed = parseTypingValue('one two three ', 0)
    expect(parsed.submissions).toEqual(['one', 'two', 'three'])
    expect(parsed.activeTyped).toBe('')
    expect(parsed.consumed).toBe(14)
  })

  it('does not collapse consecutive spaces: both are consumed, no empty word is submitted', () => {
    const parsed = parseTypingValue('word   next', 0)
    expect(parsed.submissions).toEqual(['word'])
    expect(parsed.activeTyped).toBe('next')
    expect(parsed.consumed).toBe(7) // "word" + 3 spaces
  })

  it('ignores a space typed with nothing pending (no empty submission)', () => {
    expect(parseTypingValue(' ', 0)).toEqual({ submissions: [], activeTyped: '', consumed: 1 })
    expect(parseTypingValue('   ', 0)).toEqual({
      submissions: [],
      activeTyped: '',
      consumed: 3,
    })
  })

  it('treats a non-breaking space from an on-screen keyboard as a separator', () => {
    const parsed = parseTypingValue('ab\u00A0cd ', 0)
    expect(parsed.submissions).toEqual(['ab', 'cd'])
    expect(parsed.activeTyped).toBe('')
    expect(parsed.consumed).toBe(6)
  })

  it('keeps punctuation inside the word it was typed into', () => {
    const parsed = parseTypingValue("it's! ", 0)
    expect(parsed.submissions).toEqual(["it's!"])
    expect(parsed.activeTyped).toBe('')
  })

  it('preserves incorrect characters in submissions for grading', () => {
    expect(parseTypingValue('hxllo ', 0).submissions).toEqual(['hxllo'])
  })

  it('clamps the cursor when an IME shrinks the value below it', () => {
    const parsed = parseTypingValue('hi', 10)
    expect(parsed.submissions).toEqual([])
    expect(parsed.activeTyped).toBe('')
    expect(parsed.consumed).toBe(2)
  })

  it('handles a value that never grows (no-op event)', () => {
    const first = parseTypingValue('hello', 0)
    expect(parseTypingValue('hello', first.consumed)).toEqual({
      submissions: [],
      activeTyped: 'hello',
      consumed: 0,
    })
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

describe('rewindToWord', () => {
  it('drops the separator after the previous word so it becomes active again', () => {
    const rewound = rewindToWord('hello ', 'hello')
    expect(rewound).toEqual({ value: 'hello', consumed: 0 })
    expect(rewound.value.slice(rewound.consumed)).toBe('hello')
  })

  it('keeps earlier words consumed when rewinding mid-run', () => {
    const rewound = rewindToWord('one two ', 'two')
    expect(rewound).toEqual({ value: 'one two', consumed: 4 })
    expect(rewound.value.slice(rewound.consumed)).toBe('two')
  })

  it('drops every trailing separator (double-space runs)', () => {
    const rewound = rewindToWord('word   ', 'word')
    expect(rewound.value).toBe('word')
    expect(rewound.consumed).toBe(0)
  })

  it('restores a partially mistyped word exactly as submitted', () => {
    const rewound = rewindToWord('hxllo ', 'hxllo')
    expect(rewound.value.slice(rewound.consumed)).toBe('hxllo')
  })

  it('handles an empty buffer', () => {
    expect(rewindToWord('', 'word')).toEqual({ value: '', consumed: 0 })
  })
})
