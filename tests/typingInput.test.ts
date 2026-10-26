import { describe, expect, it } from 'vitest'
import {
  emptyCursor,
  parseTypingValue,
  rewindToWord,
  scoreAppendedChars,
} from '../src/games/typing/typingInput'

describe('parseTypingValue', () => {
  it('returns the typed tail as the active word before any space', () => {
    expect(parseTypingValue('hel', emptyCursor())).toEqual({
      submissions: [],
      activeTyped: 'hel',
      cursor: { consumed: 0, text: '' },
    })
  })

  it('submits a word when a trailing space arrives and consumes the space', () => {
    expect(parseTypingValue('hello ', emptyCursor())).toEqual({
      submissions: ['hello'],
      activeTyped: '',
      cursor: { consumed: 6, text: 'hello ' },
    })
  })

  it('does not lose the trailing space: it is counted as consumed', () => {
    const parsed = parseTypingValue('hi there ', emptyCursor())
    expect(parsed.cursor.consumed).toBe('hi there '.length)
  })

  it('parses forward from the returned cursor on later events', () => {
    const first = parseTypingValue('hello ', emptyCursor())
    const second = parseTypingValue('hello world', first.cursor)
    expect(second.submissions).toEqual([])
    expect(second.activeTyped).toBe('world')
    expect(second.cursor).toEqual({ consumed: 6, text: 'hello ' })
  })

  it('keeps working when an IME re-sends the whole value per composition update', () => {
    let cursor = emptyCursor()
    for (const value of ['h', 'he', 'hel', 'hell', 'hello', 'hello ']) {
      cursor = parseTypingValue(value, cursor).cursor
    }
    expect(cursor.consumed).toBe(6)
    expect(parseTypingValue('hello world', cursor).activeTyped).toBe('world')
  })

  it('recovers when GBoard replaces its composing region below the cursor (space included)', () => {
    // GBoard kept "hello " inside its composing region; the next letter
    // replaces the whole region, so the value shrinks from 6 chars to 1.
    const afterWord = parseTypingValue('hello ', emptyCursor())
    const healed = parseTypingValue('w', afterWord.cursor)
    expect(healed.submissions).toEqual([])
    expect(healed.activeTyped).toBe('w')
    expect(healed.cursor).toEqual({ consumed: 0, text: '' })
    // Typing continues cleanly from the rebuilt cursor.
    let cursor = healed.cursor
    for (const value of ['wo', 'wor', 'worl', 'world']) {
      cursor = parseTypingValue(value, cursor).cursor
    }
    const parsed = parseTypingValue('world ', cursor)
    expect(parsed.submissions).toEqual(['world'])
  })

  it('re-anchors to the field when an IME rewrite changes the consumed prefix', () => {
    const afterWord = parseTypingValue('hello ', emptyCursor())
    // Region replaced with different text of the same total length: the game
    // re-records what the field now contains (the rewritten word submits in
    // place of the old one) instead of freezing on a stale cursor.
    const healed = parseTypingValue('jello w', afterWord.cursor)
    expect(healed.submissions).toEqual(['jello'])
    expect(healed.activeTyped).toBe('w')
    expect(healed.cursor).toEqual({ consumed: 6, text: 'jello ' })
  })

  it('heals backspace-past-boundary: value shrank to the previous word', () => {
    const afterWord = parseTypingValue('hello ', emptyCursor())
    const healed = parseTypingValue('hello', afterWord.cursor)
    expect(healed.submissions).toEqual([])
    expect(healed.activeTyped).toBe('hello')
    expect(healed.cursor).toEqual({ consumed: 0, text: '' })
  })

  it('does not re-parse consumed text while the prefix is intact', () => {
    const first = parseTypingValue('one two ', emptyCursor())
    // GBoard re-sends the full field value on the next composition update.
    const second = parseTypingValue('one two three', first.cursor)
    expect(second.submissions).toEqual([])
    expect(second.activeTyped).toBe('three')
    expect(second.cursor.consumed).toBe(8)
  })

  it('submits every word of a multi-word paste or dictation in order', () => {
    const parsed = parseTypingValue('one two three ', emptyCursor())
    expect(parsed.submissions).toEqual(['one', 'two', 'three'])
    expect(parsed.activeTyped).toBe('')
    expect(parsed.cursor.consumed).toBe(14)
  })

  it('does not collapse consecutive spaces: both are consumed, no empty word is submitted', () => {
    const parsed = parseTypingValue('word   next', emptyCursor())
    expect(parsed.submissions).toEqual(['word'])
    expect(parsed.activeTyped).toBe('next')
    expect(parsed.cursor.consumed).toBe(7) // "word" + 3 spaces
  })

  it('ignores a space typed with nothing pending (no empty submission)', () => {
    expect(parseTypingValue(' ', emptyCursor())).toEqual({
      submissions: [],
      activeTyped: '',
      cursor: { consumed: 1, text: ' ' },
    })
    expect(parseTypingValue('   ', emptyCursor())).toEqual({
      submissions: [],
      activeTyped: '',
      cursor: { consumed: 3, text: '   ' },
    })
  })

  it('treats a non-breaking space from an on-screen keyboard as a separator', () => {
    const parsed = parseTypingValue('ab\u00A0cd ', emptyCursor())
    expect(parsed.submissions).toEqual(['ab', 'cd'])
    expect(parsed.activeTyped).toBe('')
    expect(parsed.cursor.consumed).toBe(6)
  })

  it('keeps punctuation inside the word it was typed into', () => {
    const parsed = parseTypingValue("it's! ", emptyCursor())
    expect(parsed.submissions).toEqual(["it's!"])
    expect(parsed.activeTyped).toBe('')
  })

  it('preserves incorrect characters in submissions for grading', () => {
    expect(parseTypingValue('hxllo ', emptyCursor()).submissions).toEqual(['hxllo'])
  })

  it('clamps an out-of-range cursor via the prefix check (defensive)', () => {
    // A cursor claiming 10 consumed chars cannot match a 2-char value; the
    // prefix verification treats it as a desync and re-parses everything.
    const parsed = parseTypingValue('hi', { consumed: 10, text: 'xxxxxxxxxx' })
    expect(parsed.submissions).toEqual([])
    expect(parsed.activeTyped).toBe('hi')
    expect(parsed.cursor).toEqual({ consumed: 0, text: '' })
  })

  it('handles a no-op event without changing state', () => {
    const first = parseTypingValue('hello', emptyCursor())
    expect(parseTypingValue('hello', first.cursor)).toEqual({
      submissions: [],
      activeTyped: 'hello',
      cursor: { consumed: 0, text: '' },
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
    const rewound = rewindToWord('hello ', 'hello', { consumed: 6, text: 'hello ' })
    expect(rewound).toEqual({ value: 'hello', cursor: { consumed: 0, text: '' } })
    expect(rewound.value.slice(rewound.cursor.consumed)).toBe('hello')
  })

  it('keeps earlier words consumed when rewinding mid-run', () => {
    const rewound = rewindToWord('one two ', 'two', { consumed: 8, text: 'one two ' })
    expect(rewound).toEqual({ value: 'one two', cursor: { consumed: 4, text: 'one ' } })
    expect(rewound.value.slice(rewound.cursor.consumed)).toBe('two')
  })

  it('drops every trailing separator (double-space runs)', () => {
    const rewound = rewindToWord('word   ', 'word', { consumed: 7, text: 'word   ' })
    expect(rewound.value).toBe('word')
    expect(rewound.cursor.consumed).toBe(0)
  })

  it('restores a partially mistyped word exactly as submitted', () => {
    const rewound = rewindToWord('hxllo ', 'hxllo', { consumed: 6, text: 'hxllo ' })
    expect(rewound.value.slice(rewound.cursor.consumed)).toBe('hxllo')
  })

  it('handles an empty buffer', () => {
    expect(rewindToWord('', 'word', emptyCursor())).toEqual({
      value: '',
      cursor: { consumed: 0, text: '' },
    })
  })
})
