import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SpellCheck } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { elapsedMs, formatClock, now } from '../../lib/time'
import { generateWords } from '../typing/words'
import { emptyCursor, parseTypingValue, rewindToWord, scoreAppendedChars } from '../typing/typingInput'

type Phase = 'idle' | 'running' | 'done'
/** 'free' keeps the original untimed 15-word flow. */
type Mode = 30 | 60 | 120 | 'free'

const MODES: readonly Mode[] = [30, 60, 120, 'free']
const FREE_WORDS = 15

const isTimed = (m: Mode): m is 30 | 60 | 120 => typeof m === 'number'
const modeLabel = (m: Mode) => (isTimed(m) ? `${m}s` : 'Free · 15 words')

interface FinishedWord {
  text: string
  typed: string
}

export default function TypingAccuracyGame({ dailyConfig }: GameProps) {
  const [mode, setMode] = useState<Mode>(
    dailyConfig?.duration === 30 || dailyConfig?.duration === 60 || dailyConfig?.duration === 120
      ? dailyConfig.duration
      : 60,
  )
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [words, setWords] = useState<string[]>(() =>
    generateWords(isTimed(mode) ? 200 : FREE_WORDS),
  )
  const [wordIndex, setWordIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [finished, setFinished] = useState<FinishedWord[]>([])
  const [focused, setFocused] = useState(true)
  const [result, setResult] = useState<GameResult | null>(null)
  const [keystrokes, setKeystrokes] = useState(0)
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0)
  const [remaining, setRemaining] = useState(isTimed(mode) ? mode * 1000 : 0)

  const phaseRef = useRef<Phase>('idle')
  const modeRef = useRef<Mode>(mode)
  const wordIndexRef = useRef(0)
  const typedRef = useRef('')
  const finishedRef = useRef<FinishedWord[]>([])
  const startedAtRef = useRef<number | null>(null)
  const deadlineRef = useRef<number | null>(null)
  const keystrokesRef = useRef(0)
  const correctKeystrokesRef = useRef(0)
  // Parse cursor into the hidden input's accumulating value: everything before
  // it is already parsed into submitted words. The cursor records the consumed
  // text, so IME composing-region rewrites below it are detected and healed
  // (see typingInput.ts). The input's DOM value itself is never reset while
  // typing, which is what keeps mobile keyboards in sync.
  const cursorRef = useRef(emptyCursor())
  // True between compositionstart and compositionend: Android/iOS soft
  // keyboards compose words (the space included) through this window.
  const composingRef = useRef(false)
  const savedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeWordRef = useRef<HTMLSpanElement | null>(null)
  const [typingOffset, setTypingOffset] = useState(0)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }

  // submitWord can finish the run mid-input; TS cannot see ref mutations, so
  // route done-checks through a function to avoid narrowed-type false positives.
  const isDone = () => phaseRef.current === 'done'

  const restart = (nextMode: Mode = modeRef.current) => {
    savedRef.current = false
    modeRef.current = nextMode
    setMode(nextMode)
    wordIndexRef.current = 0
    typedRef.current = ''
    finishedRef.current = []
    startedAtRef.current = null
    deadlineRef.current = null
    keystrokesRef.current = 0
    correctKeystrokesRef.current = 0
    cursorRef.current = emptyCursor()
    if (inputRef.current) inputRef.current.value = ''
    setWords(generateWords(isTimed(nextMode) ? 200 : FREE_WORDS))
    setWordIndex(0)
    setTyped('')
    setFinished([])
    setResult(null)
    setKeystrokes(0)
    setCorrectKeystrokes(0)
    setRemaining(isTimed(nextMode) ? nextMode * 1000 : 0)
    setTypingOffset(0)
    setPhase('idle')
    inputRef.current?.focus()
  }

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true
    const total = keystrokesRef.current
    const correct = correctKeystrokesRef.current
    const accuracy = total === 0 ? 100 : Math.round((correct / total) * 100)
    const cleanWords = finishedRef.current.filter((f) => f.typed === f.text).length
    const totalMs = startedAtRef.current === null ? 0 : elapsedMs(startedAtRef.current)
    const minutes = Math.max(totalMs / 60_000, 1 / 60)
    const wpm = Math.round(correct / 5 / minutes)
    const res = createResult({
      gameId: 'typing-accuracy',
      primaryLabel: `Accuracy · ${modeLabel(modeRef.current)}`,
      primaryValue: accuracy,
      primaryDisplay: `${accuracy}%`,
      better: 'higher',
      details: [
        { label: 'Clean words', display: String(cleanWords) },
        { label: 'Correct keys', display: String(correct) },
        { label: 'Wrong keys', display: String(total - correct) },
        { label: 'Net WPM', display: String(wpm) },
        { label: 'Time', display: formatClock(totalMs) },
      ],
    })
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  // Countdown for timed modes — starts on the first keystroke.
  useEffect(() => {
    if (phase !== 'running' || !isTimed(mode) || deadlineRef.current === null) return
    const deadline = deadlineRef.current
    const iv = window.setInterval(() => {
      const left = deadline - now()
      if (left <= 0) {
        setRemaining(0)
        finish()
      } else {
        setRemaining(left)
      }
    }, 100)
    return () => window.clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode])

  // Scroll the word stream so the active word stays visible.
  useLayoutEffect(() => {
    const el = activeWordRef.current
    if (el) setTypingOffset(Math.max(0, el.offsetTop - 0))
  }, [wordIndex])

  const beginRunIfNeeded = () => {
    if (phaseRef.current === 'idle' && startedAtRef.current === null) {
      startedAtRef.current = now()
      if (isTimed(modeRef.current)) {
        deadlineRef.current = startedAtRef.current + modeRef.current * 1000
      }
      setPhase('running')
    }
  }

  const scoreAppended = (before: string, after: string) => {
    const target = words[wordIndexRef.current] ?? ''
    const delta = scoreAppendedChars(before, after, target)
    keystrokesRef.current += delta.keystrokes
    correctKeystrokesRef.current += delta.correct
    setKeystrokes(keystrokesRef.current)
    setCorrectKeystrokes(correctKeystrokesRef.current)
  }

  const submitWord = (value: string) => {
    finishedRef.current = [
      ...finishedRef.current,
      { text: words[wordIndexRef.current] ?? '', typed: value },
    ]
    setFinished(finishedRef.current)
    wordIndexRef.current += 1
    setWordIndex(wordIndexRef.current)
    typedRef.current = ''
    setTyped('')
    // Untimed runs end after the fixed word set; timed runs keep feeding words.
    if (isTimed(modeRef.current)) {
      if (wordIndexRef.current + 20 > words.length) {
        setWords((w) => [...w, ...generateWords(40)])
      }
    } else if (wordIndexRef.current >= words.length) {
      finish()
    }
  }

  const handleInput = (raw: string) => {
    if (isDone()) return
    // parseTypingValue verifies the consumed prefix on every event and rebuilds
    // the cursor when an IME composing region rewrote it (GBoard keeps the
    // submitted word + separator inside its region), so this survives every
    // mobile keyboard flow. The input's value is never trimmed, collapsed, or
    // reset here — trailing and consecutive separators all reach the parser.
    const parsed = parseTypingValue(raw, cursorRef.current)
    cursorRef.current = parsed.cursor

    for (const word of parsed.submissions) {
      beginRunIfNeeded()
      // Score only chars not already scored while typing (handles pastes).
      scoreAppended(typedRef.current, word)
      submitWord(word)
      if (isDone()) return
    }

    const target = words[wordIndexRef.current] ?? ''
    const capped = parsed.activeTyped.slice(0, target.length + 10)
    if (capped === typedRef.current) return
    if (capped.length > typedRef.current.length) {
      beginRunIfNeeded()
      scoreAppended(typedRef.current, capped)
    }
    typedRef.current = capped
    setTyped(capped)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Nothing wraps the input in a form; keep it that way so Enter/Space can
      // never submit anything. Spaces in particular must reach the input so
      // on-screen keyboards insert them and onChange turns them into word
      // submissions (preventDefault here would break mobile text entry).
      e.preventDefault()
      return
    }
    if (
      e.key === 'Backspace' &&
      typedRef.current === '' &&
      finishedRef.current.length > 0 &&
      phaseRef.current !== 'done' &&
      !composingRef.current
    ) {
      // Never rewrite the DOM value while a composition is active (requirement
      // for mobile IMEs); the parser's desync recovery handles that case.
      e.preventDefault()
      const prev = finishedRef.current[finishedRef.current.length - 1]
      finishedRef.current = finishedRef.current.slice(0, -1)
      setFinished(finishedRef.current)
      wordIndexRef.current -= 1
      setWordIndex(wordIndexRef.current)
      typedRef.current = prev.typed
      setTyped(prev.typed)
      // Rewind the buffer: the previous word is still in the input verbatim,
      // only the separator after it is dropped so it becomes active again.
      const el = inputRef.current
      if (el) {
        const rewound = rewindToWord(el.value, prev.typed, cursorRef.current)
        el.value = rewound.value
        cursorRef.current = rewound.cursor
      }
    }
  }

  // Live stats.
  const liveStats = useMemo(() => {
    const cleanWords = finished.filter((f) => f.typed === f.text).length
    const accuracy = keystrokes === 0 ? 100 : Math.round((correctKeystrokes / keystrokes) * 100)
    return { cleanWords, accuracy, errors: keystrokes - correctKeystrokes }
  }, [finished, keystrokes, correctKeystrokes])

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={() => restart()}
        share={{
          title: 'Zyprilo — Typing Accuracy',
          text: `I typed at ${result.primaryDisplay} accuracy in Typing Accuracy Mode (${modeLabel(mode)}) on ${new Date().toLocaleDateString()}. Play at Zyprilo!`,
        }}
      />
    )
  }

  const currentWord = words[wordIndex] ?? ''
  const extraCount = Math.max(0, typed.length - currentWord.length)
  const totalChars = currentWord.length + extraCount
  // The caret lives inside the char it sits against so it advances with every
  // keystroke: just before the next expected char, or just after the last
  // char once the word is fully typed (extras included).
  const caretBefore = typed.length < currentWord.length ? typed.length : -1
  const caretAfter = caretBefore < 0 && totalChars > 0 ? totalChars - 1 : -1
  const chars: React.ReactNode[] = []
  for (let i = 0; i < totalChars; i++) {
    const inWord = i < currentWord.length
    const state = !inWord
      ? 'extra'
      : typed[i] === undefined
        ? 'pending'
        : typed[i] === currentWord[i]
          ? 'correct'
          : 'incorrect'
    chars.push(
      <span className={`tchar ${state}`} key={inWord ? `c${i}` : `x${i}`}>
        {inWord ? currentWord[i] : typed[i]}
        {i === caretBefore && <span className="tcaret" aria-hidden="true" />}
        {i === caretAfter && <span className="tcaret tcaret-after" aria-hidden="true" />}
      </span>,
    )
  }
  // Degenerate empty-word fallback: keep the caret visible inside the word box.
  if (totalChars === 0) {
    chars.push(<span className="tcaret" key="caret" aria-hidden="true" />)
  }

  const timed = isTimed(mode)

  return (
    <>
      <div className="panel" style={{ padding: '1.1rem 1.35rem' }}>
        <ModeSelector
          label="Mode"
          modes={MODES}
          format={(m) => (isTimed(m) ? `${m}s` : 'Free')}
          selected={mode}
          onSelect={(m) => restart(m)}
          disabled={phase === 'running'}
        />
      </div>

      <div className="arena panel">
        <div className="hud" aria-live="off">
          {timed && (
            <div className="hud-item">
              <span className="hud-value hud-time accent">{formatClock(remaining)}</span>
              <span className="hud-label">Time left</span>
            </div>
          )}
          <div className="hud-item">
            <span className={`hud-value${timed ? '' : ' accent'}`}>{liveStats.accuracy}%</span>
            <span className="hud-label">Accuracy</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">
              {wordIndex}
              {timed ? '' : `/${TOTAL_WORDS_LABEL}`}
            </span>
            <span className="hud-label">Words</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">
              {liveStats.cleanWords}
              {timed ? '' : `/${TOTAL_WORDS_LABEL}`}
            </span>
            <span className="hud-label">Clean</span>
          </div>
          <div className="hud-item">
            <span className="hud-value" style={{ color: liveStats.errors > 0 ? 'var(--bad)' : undefined }}>
              {liveStats.errors}
            </span>
            <span className="hud-label">Errors</span>
          </div>
        </div>

        <div className="typing-wrap" onClick={() => inputRef.current?.focus()}>
          <div
            className="typing-text"
            role="button"
            tabIndex={-1}
            aria-label="Typing area — click, then type the shown words"
          >
            <div
              className="typing-words"
              style={{ '--typing-offset': `-${typingOffset}px` } as React.CSSProperties}
            >
              {words.slice(0, Math.max(wordIndex + 60, 60)).map((word, i) => {
                if (i < wordIndex) {
                  const entry = finished[i]
                  const ok = entry && entry.typed === entry.text
                  return (
                    <span className={`tword ${ok ? 'done-ok' : 'done-bad'}`} key={i}>
                      {word}
                    </span>
                  )
                }
                if (i === wordIndex) {
                  return (
                    <span className="tword active" key={i} ref={activeWordRef}>
                      {chars}
                    </span>
                  )
                }
                return (
                  <span className="tword" key={i}>
                    {word}
                  </span>
                )
              })}
            </div>
            <input
              ref={inputRef}
              className="typing-input"
              // Uncontrolled on purpose: the input accumulates everything the
              // keyboard inserts and handleInput parses it via typingInput.ts.
              // Writing value={typed} back after every word resets the DOM
              // mid-composition and desyncs mobile IMEs (spaces get lost).
              onChange={(e) => handleInput(e.target.value)}
              onCompositionStart={() => {
                composingRef.current = true
              }}
              // handleInput is idempotent here: it re-parses the committed
              // value in case the final commit differs from the last
              // composition update (some keyboards swap text at commit).
              onCompositionEnd={(e) => {
                composingRef.current = false
                handleInput(e.currentTarget.value)
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              aria-label="Type the displayed words here"
            />
            {phase !== 'done' && !focused && (
              <div className="typing-focus-hint">
                <SpellCheck size={18} aria-hidden="true" /> Click here and start typing
              </div>
            )}
          </div>
        </div>

        <p className="feedback dim" style={{ textAlign: 'center' }}>
          {phase === 'idle'
            ? timed
              ? `Countdown starts on your first keystroke — ${mode}s of pure accuracy.`
              : `No timer — every keystroke is graded. Space submits each word.`
            : timed
              ? `Accuracy over speed — ${formatClock(remaining)} left`
              : `${words.length - wordIndex} words to go`}
        </p>
      </div>
    </>
  )
}

const TOTAL_WORDS_LABEL = 15
