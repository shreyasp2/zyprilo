import { useEffect, useRef, useState } from 'react'
import { Lightbulb, Send, Shuffle } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import { WORDS } from '../typing/words'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { formatClock, now } from '../../lib/time'

type Phase = 'idle' | 'running' | 'done'
type Mode = 'combo' | 'relaxed'

const MODES: readonly Mode[] = ['combo', 'relaxed']
const TIME_LIMIT_MS = 60_000
const RELAXED_WORDS = 10
const HINT_COST = 40
/** Points: base + length bonus + consecutive-solve combo bonus. */
const BASE_POINTS = 100
const LENGTH_BONUS_PER_EXTRA = 10
const COMBO_STEP = 25
const COMBO_CAP = 4

// Words of 4–8 letters whose letter signatures are unique in the pool, so a
// scramble can never have two plausible answers.
const sigOf = (w: string) => w.split('').sort().join('')
const UNIQUE_POOL = (() => {
  const counts = new Map<string, number>()
  const candidates = WORDS.filter((w) => w.length >= 4 && w.length <= 8)
  for (const w of candidates) counts.set(sigOf(w), (counts.get(sigOf(w)) ?? 0) + 1)
  return candidates.filter((w) => counts.get(sigOf(w)) === 1)
})()

function pickScrambled(used: Set<string>): { target: string; display: string[] } {
  let target = UNIQUE_POOL[Math.floor(Math.random() * UNIQUE_POOL.length)]
  // Avoid repeating words until the pool is nearly exhausted.
  if (used.size >= UNIQUE_POOL.length - 5) used.clear()
  for (let i = 0; i < 20 && used.has(target); i++) {
    target = UNIQUE_POOL[Math.floor(Math.random() * UNIQUE_POOL.length)]
  }
  used.add(target)

  const chars = target.split('')
  let display = chars
  for (let attempt = 0; attempt < 25; attempt++) {
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    display = [...chars]
    if (display.join('') !== target) break
  }
  return { target, display: display.map((c) => c.toUpperCase()) }
}

export default function WordUnscrambleGame({ dailyConfig }: GameProps) {
  const [mode, setMode] = useState<Mode>(dailyConfig?.scrambleMode === 'relaxed' ? 'relaxed' : 'combo')
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [tiles, setTiles] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [score, setScore] = useState(0)
  const [solved, setSolved] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [hintLetter, setHintLetter] = useState<string | null>(null)
  const [errFlash, setErrFlash] = useState(false)
  const [remaining, setRemaining] = useState(TIME_LIMIT_MS)
  const [result, setResult] = useState<GameResult | null>(null)

  const phaseRef = useRef<Phase>('idle')
  const modeRef = useRef<Mode>(mode)
  const deadlineRef = useRef<number | null>(null)
  const targetRef = useRef('')
  const usedRef = useRef<Set<string>>(new Set())
  const scoreRef = useRef(0)
  const solvedRef = useRef(0)
  const skippedRef = useRef(0)
  const wrongRef = useRef(0)
  const streakRef = useRef(0)
  const bestStreakRef = useRef(0)
  const hintsRef = useRef(0)
  const savedRef = useRef(false)
  const timeoutFiredRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }

  const restart = (nextMode: Mode = modeRef.current) => {
    savedRef.current = false
    timeoutFiredRef.current = false
    modeRef.current = nextMode
    setMode(nextMode)
    deadlineRef.current = null
    usedRef.current = new Set()
    scoreRef.current = 0
    solvedRef.current = 0
    skippedRef.current = 0
    wrongRef.current = 0
    streakRef.current = 0
    bestStreakRef.current = 0
    hintsRef.current = 0
    setScore(0)
    setSolved(0)
    setSkipped(0)
    setWrongGuesses(0)
    setStreak(0)
    setBestStreak(0)
    setHintLetter(null)
    setTiles([])
    setInput('')
    setErrFlash(false)
    setRemaining(TIME_LIMIT_MS)
    setResult(null)
    setPhase('idle')
  }

  const finish = () => {
    if (savedRef.current || timeoutFiredRef.current) return
    timeoutFiredRef.current = true
    const combo = modeRef.current === 'combo'
    const res = createResult({
      gameId: 'word-unscramble',
      primaryLabel: combo ? 'Score · Combo Rush' : 'Words solved · Relaxed',
      primaryValue: combo ? scoreRef.current : solvedRef.current,
      primaryDisplay: combo ? String(scoreRef.current) : String(solvedRef.current),
      better: 'higher',
      details: [
        { label: 'Solved', display: String(solvedRef.current) },
        { label: 'Best streak', display: String(bestStreakRef.current) },
        { label: 'Wrong guesses', display: String(wrongRef.current) },
        { label: 'Skipped', display: String(skippedRef.current) },
        { label: 'Hints used', display: String(hintsRef.current) },
        ...(combo ? [{ label: 'Time limit', display: '60s' }] : []),
      ],
    })
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  // Combo Rush countdown — one interval per run, cleaned up on phase change.
  useEffect(() => {
    if (phase !== 'running' || modeRef.current !== 'combo' || deadlineRef.current === null) return
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

  const nextWord = () => {
    const { target, display } = pickScrambled(usedRef.current)
    targetRef.current = target
    setTiles(display)
    setInput('')
    setHintLetter(null)
    setErrFlash(false)
    inputRef.current?.focus()
    // Relaxed mode ends after the fixed word set.
    if (
      modeRef.current === 'relaxed' &&
      solvedRef.current + skippedRef.current >= RELAXED_WORDS
    ) {
      finish()
    }
  }

  const start = () => {
    savedRef.current = false
    timeoutFiredRef.current = false
    if (modeRef.current === 'combo') {
      deadlineRef.current = now() + TIME_LIMIT_MS
      setRemaining(TIME_LIMIT_MS)
    } else {
      deadlineRef.current = null
    }
    setPhase('running')
    nextWord()
  }

  const submit = () => {
    if (phaseRef.current !== 'running' || input.trim() === '') return
    // A pending interval tick must not be beaten by a late entry.
    if (modeRef.current === 'combo' && deadlineRef.current !== null && now() >= deadlineRef.current) {
      setRemaining(0)
      finish()
      return
    }
    if (input.trim().toLowerCase() === targetRef.current) {
      solvedRef.current += 1
      setSolved(solvedRef.current)
      streakRef.current += 1
      if (streakRef.current > bestStreakRef.current) bestStreakRef.current = streakRef.current
      setStreak(streakRef.current)
      setBestStreak(bestStreakRef.current)
      if (modeRef.current === 'combo') {
        const bonus = Math.min(streakRef.current - 1, COMBO_CAP) * COMBO_STEP
        scoreRef.current += BASE_POINTS + LENGTH_BONUS_PER_EXTRA * Math.max(0, targetRef.current.length - 4) + bonus
        setScore(scoreRef.current)
      }
      nextWord()
    } else {
      wrongRef.current += 1
      streakRef.current = 0
      setWrongGuesses(wrongRef.current)
      setStreak(0)
      setErrFlash(true)
      setInput('')
    }
  }

  const skip = () => {
    if (phaseRef.current !== 'running') return
    skippedRef.current += 1
    setSkipped(skippedRef.current)
    streakRef.current = 0
    setStreak(0)
    nextWord()
  }

  const useHint = () => {
    if (phaseRef.current !== 'running' || hintLetter !== null) return
    hintsRef.current += 1
    setHintLetter(targetRef.current.charAt(0).toUpperCase())
    if (modeRef.current === 'combo') {
      scoreRef.current = Math.max(0, scoreRef.current - HINT_COST)
      setScore(scoreRef.current)
    }
  }

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={() => restart()}
        share={{
          title: 'Zyprilo — Word Unscramble',
          text:
            mode === 'combo'
              ? `I scored ${result.primaryDisplay} points in Word Unscramble Combo Rush on ${new Date().toLocaleDateString()} — ${solved} words solved, best streak ${bestStreak}. Play at Zyprilo!`
              : `I solved ${result.primaryDisplay} words in Word Unscramble (Relaxed) on ${new Date().toLocaleDateString()}. Play at Zyprilo!`,
        }}
      />
    )
  }

  const combo = mode === 'combo'
  const timePct = Math.max(0, Math.min(1, remaining / TIME_LIMIT_MS))

  return (
    <>
      <div className="panel" style={{ padding: '1.1rem 1.35rem' }}>
        <ModeSelector
          label="Mode"
          modes={MODES}
          format={(m) => (m === 'combo' ? 'Combo Rush · 60s' : 'Relaxed · 10 words')}
          selected={mode}
          onSelect={(m) => restart(m)}
          disabled={phase === 'running'}
        />
      </div>

      <div className="arena panel">
        <div className="hud" aria-live="off">
          {combo && (
            <div className="hud-item">
              <span className="hud-value hud-time accent">{formatClock(remaining)}</span>
              <span className="hud-label">Time left</span>
            </div>
          )}
          <div className="hud-item">
            <span className={`hud-value${combo ? '' : ' accent'}`}>{combo ? score : solved}</span>
            <span className="hud-label">{combo ? 'Score' : 'Solved'}</span>
          </div>
          {!combo && (
            <div className="hud-item">
              <span className="hud-value">
                {solved}/{RELAXED_WORDS}
              </span>
              <span className="hud-label">Progress</span>
            </div>
          )}
          <div className="hud-item">
            <span className="hud-value combo">{streak}</span>
            <span className="hud-label">Streak</span>
          </div>
          <div className="hud-item">
            <span className="hud-value" style={{ color: wrongGuesses > 0 ? 'var(--bad)' : undefined }}>
              {wrongGuesses}
            </span>
            <span className="hud-label">Wrong</span>
          </div>
          {combo && (
            <div className="hud-item">
              <span className="hud-value">{skipped}</span>
              <span className="hud-label">Skipped</span>
            </div>
          )}
        </div>

        <div className="cta" style={{ flex: 1 }}>
          {phase === 'idle' ? (
            <>
              <Shuffle size={40} className="cta-icon" aria-hidden="true" />
              <h2>{combo ? 'Combo Rush — 60 seconds' : 'Relaxed — 10 words'}</h2>
              <p>
                {combo
                  ? 'Solve as many scrambled words as possible. Consecutive solves build a combo bonus; hints cost 40 points.'
                  : 'No clock pressure: ten words, accuracy first. Hints reveal the first letter.'}
              </p>
              <button className="btn btn-primary" onClick={start}>
                Start
              </button>
            </>
          ) : (
            <>
              <div className="scramble-tiles" aria-label="Scrambled letters">
                {tiles.map((letter, i) => (
                  <span className="scramble-tile" key={`${letter}-${i}`} aria-hidden="true">
                    {letter}
                  </span>
                ))}
              </div>
              {hintLetter && (
                <p className="feedback dim" role="status">
                  Hint: starts with “{hintLetter}”{combo ? ` (−${HINT_COST} points)` : ''}
                </p>
              )}
              <p
                className={`feedback ${errFlash ? 'bad' : 'dim'}`}
                role="status"
                aria-live="polite"
                style={{ minHeight: '1.4em' }}
              >
                {errFlash ? 'Not quite — try again!' : 'Type the unscrambled word'}
              </p>
              <form
                className="num-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
              >
                <input
                  ref={inputRef}
                  className={`num-input word-input${errFlash ? ' err' : ''}`}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 12))
                    setErrFlash(false)
                  }}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="word"
                  aria-label="Your answer"
                />
                <button className="btn btn-primary" type="submit" disabled={input === ''}>
                  <Send size={15} aria-hidden="true" /> Send
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={useHint}
                  disabled={hintLetter !== null}
                  title={combo ? `Reveals the first letter (−${HINT_COST} points)` : 'Reveals the first letter'}
                >
                  <Lightbulb size={15} aria-hidden="true" /> Hint
                </button>
                <button className="btn btn-ghost" type="button" onClick={skip}>
                  Skip
                </button>
              </form>
            </>
          )}
        </div>

        {phase === 'running' && combo && (
          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${timePct * 100}%` }} />
          </div>
        )}
      </div>
    </>
  )
}
