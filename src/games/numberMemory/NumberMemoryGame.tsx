import { useEffect, useRef, useState } from 'react'
import { Brain, Play } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { randomInt } from '../../lib/time'

type Phase = 'idle' | 'showing' | 'input' | 'done'
type Difficulty = 'normal' | 'hard'

const MAX_LIVES = 3
const DIFFICULTIES: readonly Difficulty[] = ['normal', 'hard']
const DIFF_LABEL: Record<Difficulty, string> = { normal: 'Normal', hard: 'Hard' }

/** Level 1 shows 3 digits (Normal) or 4 (Hard); every level adds one. */
const digitsForLevel = (level: number, difficulty: Difficulty) => level + (difficulty === 'hard' ? 3 : 2)
/** Viewing window grows with length; Hard shows numbers for less time. */
const viewMsFor = (len: number, difficulty: Difficulty) =>
  Math.round((1100 + len * 650) * (difficulty === 'hard' ? 0.65 : 1))

function generateNumber(len: number): string {
  let out = String(randomInt(1, 9))
  for (let i = 1; i < len; i++) out += String(randomInt(0, 9))
  return out
}

export default function NumberMemoryGame({ dailyConfig }: GameProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>(
    dailyConfig?.difficulty === 'hard' ? 'hard' : 'normal',
  )
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [level, setLevel] = useState(1)
  const [display, setDisplay] = useState('')
  const [lives, setLives] = useState(MAX_LIVES)
  const [input, setInput] = useState('')
  const [errFlash, setErrFlash] = useState(false)
  const [result, setResult] = useState<GameResult | null>(null)

  const phaseRef = useRef<Phase>('idle')
  const difficultyRef = useRef<Difficulty>(difficulty)
  const levelRef = useRef(1)
  const livesRef = useRef(MAX_LIVES)
  const targetRef = useRef('')
  const bestDigitsRef = useRef(0)
  const typedRef = useRef(0)
  const showTimeoutRef = useRef<number | null>(null)
  const savedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }

  const clearShowTimeout = () => {
    if (showTimeoutRef.current !== null) {
      window.clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
  }

  const restart = (nextDifficulty: Difficulty = difficultyRef.current) => {
    clearShowTimeout()
    savedRef.current = false
    difficultyRef.current = nextDifficulty
    setDifficulty(nextDifficulty)
    levelRef.current = 1
    livesRef.current = MAX_LIVES
    bestDigitsRef.current = 0
    typedRef.current = 0
    targetRef.current = ''
    setLevel(1)
    setLives(MAX_LIVES)
    setDisplay('')
    setInput('')
    setErrFlash(false)
    setResult(null)
    setPhase('idle')
  }

  // Release any pending hide timeout when leaving the game.
  useEffect(() => () => clearShowTimeout(), [])

  const scheduleHide = (len: number) => {
    clearShowTimeout()
    showTimeoutRef.current = window.setTimeout(() => {
      setDisplay('')
      setPhase('input')
      inputRef.current?.focus()
    }, viewMsFor(len, difficultyRef.current))
  }

  const showNumber = () => {
    const len = digitsForLevel(levelRef.current, difficultyRef.current)
    const value = generateNumber(len)
    targetRef.current = value
    setDisplay(value)
    setInput('')
    setErrFlash(false)
    setPhase('showing')
    // Single live timeout per level; cleared on restart/unmount.
    scheduleHide(len)
  }

  const start = () => {
    savedRef.current = false
    showNumber()
  }

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true
    clearShowTimeout()
    const best = bestDigitsRef.current
    const res = createResult({
      gameId: 'number-memory',
      primaryLabel: `Longest number recalled · ${DIFF_LABEL[difficultyRef.current]}`,
      primaryValue: best,
      primaryDisplay: `${best} digits`,
      better: 'higher',
      details: [
        { label: 'Level reached', display: String(levelRef.current) },
        { label: 'Numbers typed', display: String(typedRef.current) },
        { label: 'Lives left', display: '0' },
      ],
    })
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  const submit = () => {
    if (phaseRef.current !== 'input' || input === '') return
    typedRef.current += 1
    if (input === targetRef.current) {
      bestDigitsRef.current = Math.max(bestDigitsRef.current, targetRef.current.length)
      levelRef.current += 1
      setLevel(levelRef.current)
      showNumber()
    } else {
      livesRef.current -= 1
      setLives(livesRef.current)
      setErrFlash(true)
      setInput('')
      if (livesRef.current <= 0) {
        finish()
      } else {
        // Re-show the same number so the level can be retried.
        setDisplay(targetRef.current)
        setPhase('showing')
        scheduleHide(targetRef.current.length)
      }
    }
  }

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={() => restart()}
        share={{
          title: 'Zyprilo — Number Memory',
          text: `I recalled a ${result.primaryDisplay} number in Number Memory (${DIFF_LABEL[difficulty]}) on ${new Date().toLocaleDateString()} — level ${level} reached. Play at Zyprilo!`,
        }}
      />
    )
  }

  return (
    <>
      <div className="panel" style={{ padding: '1.1rem 1.35rem' }}>
        <ModeSelector
          label="Difficulty"
          modes={DIFFICULTIES}
          format={(d) => DIFF_LABEL[d]}
          selected={difficulty}
          onSelect={(d) => restart(d)}
          disabled={phase !== 'idle'}
        />
      </div>

      <div className="arena panel">
        <div className="hud" aria-live="off">
          <div className="hud-item">
            <span className="hud-value accent">{level}</span>
            <span className="hud-label">Level</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{digitsForLevel(level, difficulty)}</span>
            <span className="hud-label">Digits</span>
          </div>
          <div className="hud-item">
            <span className="round-dots" aria-label={`${lives} lives left`}>
              {Array.from({ length: MAX_LIVES }, (_, i) => (
                <span key={i} className={`rdot${i < lives ? ' filled' : ''}`} />
              ))}
            </span>
            <span className="hud-label">Lives</span>
          </div>
        </div>

        <div className="cta" style={{ flex: 1 }}>
          {phase === 'idle' ? (
            <>
              <Brain size={40} className="cta-icon" aria-hidden="true" />
              <h2>Memorize the number</h2>
              <p>
                It appears briefly, then hides. Each level adds a digit; three slips end the run.
                {difficulty === 'hard' ? ' Hard mode: one extra digit and 35% less viewing time.' : ''}
              </p>
              <button className="btn btn-primary" onClick={start}>
                <Play size={15} aria-hidden="true" /> Start
              </button>
            </>
          ) : phase === 'showing' ? (
            <>
              <div className="num-memory-display" role="status" aria-live="polite">
                {display}
              </div>
              <p className="feedback dim">Memorize it…</p>
            </>
          ) : (
            <>
              <p className="feedback dim">Now type it back:</p>
              <form
                className="num-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
              >
                <input
                  ref={inputRef}
                  className={`num-input${errFlash ? ' err' : ''}`}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))
                    setErrFlash(false)
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  aria-label="Type the number you memorized"
                />
                <button className="btn btn-primary" type="submit" disabled={input === ''}>
                  Check
                </button>
              </form>
              <p
                className="feedback bad"
                role="status"
                aria-live="polite"
                style={{ minHeight: '1.4em' }}
              >
                {errFlash ? 'Wrong — watch again!' : ''}
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}
