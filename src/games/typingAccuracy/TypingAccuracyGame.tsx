import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SpellCheck } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { elapsedMs, formatClock, now } from '../../lib/time'
import { generateWords } from '../typing/words'

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
    for (let i = before.length; i < after.length; i++) {
      keystrokesRef.current++
      if (i < target.length && after[i] === target[i]) correctKeystrokesRef.current++
    }
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
    }
    typedRef.current = capped
    setTyped(capped)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === 'Backspace' &&
      typedRef.current === '' &&
      finishedRef.current.length > 0 &&
      phaseRef.current !== 'done'
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
