import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Keyboard } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import WpmGraph, { type WpmSample } from '../../components/WpmGraph'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { elapsedMs, formatClock, now } from '../../lib/time'
import { generateWords } from './words'

type Phase = 'idle' | 'running' | 'done'
type Mode = 15 | 30 | 60 | 120

interface FinishedWord {
  text: string
  typed: string
}

const MODES: readonly Mode[] = [15, 30, 60, 120]
const STARTING_WORDS = 450
/** Sudden Death: the run ends as soon as this many keystroke errors occur. */
const SUDDEN_ALLOWANCE = 3

export default function TypingGame({ dailyConfig }: GameProps) {
  const [mode, setMode] = useState<Mode>(
    dailyConfig?.duration === 15 || dailyConfig?.duration === 30 || dailyConfig?.duration === 60
      ? dailyConfig.duration
      : dailyConfig?.duration === 120
        ? 120
        : 30,
  )
  const [sudden, setSudden] = useState<boolean>(dailyConfig?.suddenDeath ?? false)
  const [phase, setPhaseState] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const modeRef = useRef<Mode>(mode)
  const [words, setWords] = useState<string[]>(() => generateWords(STARTING_WORDS))
  const [wordIndex, setWordIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [finished, setFinished] = useState<FinishedWord[]>([])
  const [timeLeft, setTimeLeft] = useState(mode * 1000)
  const [focused, setFocused] = useState(true)
  const [result, setResult] = useState<GameResult | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [keystrokes, setKeystrokes] = useState(0)
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0)
  const [samples, setSamples] = useState<WpmSample[]>([])

  // Phase mirrored synchronously so late timers can never reopen a finished run.
  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }
  // finish() can run mid-input (Sudden Death); TS cannot see ref mutations.
  const isDone = () => phaseRef.current === 'done'

  const startedAtRef = useRef<number | null>(null)
  const wordIndexRef = useRef(0)
  const typedRef = useRef('')
  const finishedRef = useRef<FinishedWord[]>([])
  const keystrokesRef = useRef(0)
  const correctKeystrokesRef = useRef(0)
  const suddenRef = useRef(sudden)
  const savedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeWordRef = useRef<HTMLSpanElement | null>(null)
  const [typingOffset, setTypingOffset] = useState(0)

  /* ---------- run control (declared before the effects that use them) ---------- */

  const restart = (nextMode: Mode = modeRef.current, nextSudden: boolean = suddenRef.current) => {
    modeRef.current = nextMode
    setMode(nextMode)
    setSudden(nextSudden)
    suddenRef.current = nextSudden
    setPhase('idle')
    setWords(generateWords(STARTING_WORDS))
    setWordIndex(0)
    wordIndexRef.current = 0
    setTyped('')
    typedRef.current = ''
    setFinished([])
    finishedRef.current = []
    keystrokesRef.current = 0
    setKeystrokes(0)
    correctKeystrokesRef.current = 0
    setCorrectKeystrokes(0)
    startedAtRef.current = null
    setStartedAt(null)
    setTimeLeft(nextMode * 1000)
    setResult(null)
    setSamples([])
    savedRef.current = false
    setTypingOffset(0)
    inputRef.current?.focus()
  }

  /** Correct chars across all submitted words plus the active word (from refs). */
  const computeCorrectChars = () => {
    let correctChars = 0
    for (const entry of finishedRef.current) {
      if (entry.typed === entry.text) correctChars += entry.text.length + 1 // word + following space
    }
    const currentText = words[wordIndexRef.current] ?? ''
    const currentTyped = typedRef.current
    for (let i = 0; i < Math.min(currentTyped.length, currentText.length); i++) {
      if (currentTyped[i] === currentText[i]) correctChars++
    }
    return correctChars
  }

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true

    const minutes = mode / 60
    const correctChars = computeCorrectChars()
    const wpm = minutes > 0 ? Math.round(correctChars / 5 / minutes) : 0
    const totalKeystrokes = keystrokesRef.current
    const totalCorrectKeystrokes = correctKeystrokesRef.current
    const accuracy =
      totalKeystrokes === 0 ? 100 : Math.round((totalCorrectKeystrokes / totalKeystrokes) * 100)
    const totalMs = startedAtRef.current === null ? 0 : elapsedMs(startedAtRef.current)
    const errors = totalKeystrokes - totalCorrectKeystrokes

    const res = createResult({
      gameId: 'typing',
      primaryLabel: `WPM · ${mode}s${suddenRef.current ? ' · Sudden Death' : ''}`,
      primaryValue: wpm,
      primaryDisplay: String(wpm),
      better: 'higher',
      details: [
        { label: 'Accuracy', display: `${accuracy}%` },
        { label: 'Correct chars', display: String(correctChars) },
        { label: 'Errors', display: String(errors) },
        { label: 'Keystrokes', display: String(totalKeystrokes) },
        ...(suddenRef.current
          ? [{ label: 'Sudden death', display: `${errors}/${SUDDEN_ALLOWANCE} allowed` }]
          : []),
        { label: 'Time typed', display: formatClock(Math.min(totalMs, mode * 1000)) },
      ],
    })
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  const beginRunIfNeeded = () => {
    if (phase === 'idle' && startedAtRef.current === null) {
      startedAtRef.current = now()
      setStartedAt(startedAtRef.current)
      setPhase('running')
    }
  }

  const scoreAppended = (before: string, after: string) => {
    const target = words[wordIndexRef.current] ?? ''
    for (let i = before.length; i < after.length; i++) {
      keystrokesRef.current++
      if (i < target.length && after[i] === target[i]) {
        correctKeystrokesRef.current++
      }
    }
    setKeystrokes(keystrokesRef.current)
    setCorrectKeystrokes(correctKeystrokesRef.current)
    // Sudden Death: end immediately once the allowance is exceeded.
    if (
      suddenRef.current &&
      keystrokesRef.current - correctKeystrokesRef.current > SUDDEN_ALLOWANCE &&
      !savedRef.current
    ) {
      finish()
    }
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
    // Keep an untyped buffer of words ahead of the player.
    if (wordIndexRef.current + 120 > words.length) {
      setWords((w) => [...w, ...generateWords(200)])
    }
  }

  const handleInput = (raw: string) => {
    if (isDone()) return
    let value = raw

    // Space(s) submit the current word; a space with nothing typed is ignored.
    while (value.includes(' ')) {
      const spaceAt = value.indexOf(' ')
      const word = value.slice(0, spaceAt)
      if (word.length > 0) {
        beginRunIfNeeded()
        // Score only chars not already scored while typing (handles pastes).
        scoreAppended(typedRef.current, word)
        submitWord(word)
        if (isDone()) return
      }
      value = value.slice(spaceAt + 1)
    }

    if (value === typedRef.current) return

    const target = words[wordIndexRef.current] ?? ''
    const capped = value.slice(0, target.length + 10)
    if (capped.length > typedRef.current.length) {
      beginRunIfNeeded()
      scoreAppended(typedRef.current, capped)
      if (isDone()) return
    }
    typedRef.current = capped
    setTyped(capped)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === 'Backspace' &&
      typedRef.current === '' &&
      finishedRef.current.length > 0 &&
      !isDone()
    ) {
      e.preventDefault()
      const prev = finishedRef.current[finishedRef.current.length - 1]
      finishedRef.current = finishedRef.current.slice(0, -1)
      setFinished(finishedRef.current)
      wordIndexRef.current -= 1
      setWordIndex(wordIndexRef.current)
      typedRef.current = prev.typed
      setTyped(prev.typed)
    }
    // Spaces are NOT prevented here: they must reach the controlled input so
    // onChange can turn them into word submissions.
  }

  /* ---------- effects ---------- */

  // Countdown — one interval per run, only while running. Also samples WPM.
  useEffect(() => {
    if (phase !== 'running' || startedAtRef.current === null) return
    const endTime = startedAtRef.current + mode * 1000
    const startedAt = startedAtRef.current
    let lastSampleAt = 0
    const iv = window.setInterval(() => {
      const remaining = endTime - now()
      if (remaining <= 0) {
        setTimeLeft(0)
        finish()
      } else {
        setTimeLeft(remaining)
        // Sample WPM every ~2 seconds for the results graph.
        const elapsedSec = elapsedMs(startedAt) / 1000
        if (elapsedSec - lastSampleAt >= 2) {
          lastSampleAt = elapsedSec
          const correctChars = computeCorrectChars()
          const wpm = Math.round(correctChars / 5 / Math.max(elapsedSec, 1) * 60)
          setSamples((s) => [...s, { t: Math.round(elapsedSec * 10) / 10, wpm }])
        }
      }
    }, 100)
    return () => window.clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode])

  // Scroll the word stream so the active word stays on the second line.
  useLayoutEffect(() => {
    const el = activeWordRef.current
    if (el) setTypingOffset(Math.max(0, el.offsetTop - 0))
  }, [wordIndex])

  // Live stats.
  const liveStats = useMemo(() => {
    let correctChars = 0
    for (const entry of finished) {
      if (entry.typed === entry.text) correctChars += entry.text.length + 1
    }
    const currentText = words[wordIndex] ?? ''
    for (let i = 0; i < Math.min(typed.length, currentText.length); i++) {
      if (typed[i] === currentText[i]) correctChars++
    }
    const elapsedSec = startedAt === null ? 0 : elapsedMs(startedAt) / 1000
    const wpm = elapsedSec > 0.75 ? Math.round(correctChars / 5 / (elapsedSec / 60)) : 0
    const accuracy = keystrokes === 0 ? 100 : Math.round((correctKeystrokes / keystrokes) * 100)
    return { wpm, accuracy, errors: keystrokes - correctKeystrokes }
  }, [typed, finished, wordIndex, words, startedAt, keystrokes, correctKeystrokes])

  /* ---------- render ---------- */

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={() => restart()}
        extra={<WpmGraph samples={samples} />}
        share={{
          title: 'Zyprilo — Typing Speed',
          text: `I typed ${result.primaryDisplay} WPM at ${result.details[0]?.display ?? ''} accuracy in Typing Speed (${mode}s${sudden ? ' · Sudden Death' : ''}) on ${new Date().toLocaleDateString()}. Play at Zyprilo!`,
        }}
      />
    )
  }

  const currentWord = words[wordIndex] ?? ''
  const chars: React.ReactNode[] = []

  for (let i = 0; i < currentWord.length; i++) {
    const typedChar = typed[i]
    const state =
      typedChar === undefined ? 'pending' : typedChar === currentWord[i] ? 'correct' : 'incorrect'
    chars.push(
      <span className={`tchar ${state}`} key={`c${i}`}>
        {currentWord[i]}
      </span>,
    )
  }
  for (let i = currentWord.length; i < typed.length; i++) {
    chars.push(
      <span className="tchar extra" key={`x${i}`}>
        {typed[i]}
      </span>,
    )
  }
  chars.splice(Math.min(typed.length, chars.length), 0, <span className="tcaret" key="caret" />)

  return (
    <>
      <div className="panel" style={{ padding: '1.1rem 1.35rem' }}>
        <ModeSelector
          label="Duration"
          modes={MODES}
          format={(m) => `${m}s`}
          selected={mode}
          onSelect={(m) => restart(m)}
          disabled={phase === 'running'}
        />
        <ModeSelector
          label="Sudden death"
          modes={['off', 'on'] as const}
          format={(v) => (v === 'on' ? `On (max ${SUDDEN_ALLOWANCE} errors)` : 'Off')}
          selected={sudden ? 'on' : 'off'}
          onSelect={(v) => restart(modeRef.current, v === 'on')}
          disabled={phase === 'running'}
        />
      </div>

      <div className="arena panel">
        <div className="hud" aria-live="off">
          <div className="hud-item">
            <span className={`hud-value${phase === 'running' ? ' accent' : ''}`}>
              {formatClock(timeLeft)}
            </span>
            <span className="hud-label">Time left</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{liveStats.wpm}</span>
            <span className="hud-label">WPM</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{liveStats.accuracy}%</span>
            <span className="hud-label">Accuracy</span>
          </div>
          <div className="hud-item">
            <span
              className="hud-value"
              style={{ color: liveStats.errors > 0 ? 'var(--bad)' : undefined }}
            >
              {liveStats.errors}
              {sudden ? `/${SUDDEN_ALLOWANCE}` : ''}
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
              value={typed}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="text"
              aria-label="Type the displayed words here"
            />
            {phase !== 'done' && !focused && (
              <div className="typing-focus-hint">
                <Keyboard size={18} aria-hidden="true" /> Click here and start typing
              </div>
            )}
          </div>
        </div>

        {sudden && (
          <p className="feedback bad" style={{ textAlign: 'center' }}>
            Sudden Death: {SUDDEN_ALLOWANCE - liveStats.errors} mistakes left — exceed them and the
            run ends.
          </p>
        )}
      </div>
    </>
  )
}
