import { useEffect, useRef, useState } from 'react'
import { Send, TimerOff } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameResult } from '../../lib/results'
import { newResultId, saveResult } from '../../lib/results'
import { goHome } from '../../router'
import { elapsedMs, formatClock, now } from '../../lib/time'

type Phase = 'idle' | 'running' | 'success' | 'timeout'
type Mode = 30 | 60 | 90 | 120

const MODES: readonly Mode[] = [30, 60, 90, 120]
const LAST = 100

export default function TypeTo100Game() {
  const [mode, setMode] = useState<Mode>(60)
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [target, setTarget] = useState(1)
  const [input, setInput] = useState('')
  const [mistakes, setMistakes] = useState(0)
  const [errFlash, setErrFlash] = useState(false)
  const [remaining, setRemaining] = useState(mode * 1000)
  const [result, setResult] = useState<GameResult | null>(null)
  const [timeoutInfo, setTimeoutInfo] = useState<{
    completed: number
    mistakes: number
  } | null>(null)

  // Phase mirrored into a ref synchronously so submit handlers and the
  // countdown callback can never act on a stale phase between commits.
  const phaseRef = useRef<Phase>('idle')
  const startedAtRef = useRef<number | null>(null)
  const deadlineRef = useRef<number | null>(null)
  const targetRef = useRef(1)
  const mistakesRef = useRef(0)
  const savedRef = useRef(false) // a record was saved for this attempt
  const timeoutFiredRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }

  // Resets the attempt completely: mode changes and restarts both funnel here,
  // so no stale numbers, timers or results can leak into the next attempt.
  const resetAttempt = (nextMode: Mode = mode) => {
    setMode(nextMode)
    setPhase('idle')
    targetRef.current = 1
    mistakesRef.current = 0
    startedAtRef.current = null
    deadlineRef.current = null
    savedRef.current = false
    timeoutFiredRef.current = false
    setTarget(1)
    setInput('')
    setMistakes(0)
    setErrFlash(false)
    setRemaining(nextMode * 1000)
    setResult(null)
    setTimeoutInfo(null)
    inputRef.current?.focus()
  }

  const finishSuccess = () => {
    if (savedRef.current) return
    savedRef.current = true
    const totalMs = Math.max(1, elapsedMs(startedAtRef.current ?? now()))
    const res: GameResult = {
      id: newResultId(),
      gameId: 'one-to-hundred',
      playedAt: Date.now(),
      primaryLabel: `Time 1 → 100 · ${mode}s`,
      primaryValue: Number((totalMs / 1000).toFixed(2)),
      primaryDisplay: formatClock(totalMs),
      better: 'lower',
      details: [
        { label: 'Mistakes', display: String(mistakesRef.current) },
        { label: 'Avg / number', display: `${(totalMs / LAST / 1000).toFixed(2)}s` },
        { label: 'Time limit', display: `${mode}s` },
      ],
    }
    saveResult(res)
    setResult(res)
    setPhase('success')
  }

  const finishTimeout = () => {
    if (timeoutFiredRef.current || savedRef.current) return
    timeoutFiredRef.current = true
    setTimeoutInfo({ completed: targetRef.current - 1, mistakes: mistakesRef.current })
    setRemaining(0)
    // Deliberately NOT saved: a timed-out attempt is never a completion record.
    setPhase('timeout')
  }

  // Countdown — exactly one interval per attempt, cleaned up on every phase
  // change and unmount. The deadline is pinned in a ref when the run starts.
  useEffect(() => {
    if (phase !== 'running' || deadlineRef.current === null) return
    const deadline = deadlineRef.current
    const iv = window.setInterval(() => {
      const left = deadline - now()
      if (left <= 0) {
        finishTimeout()
      } else {
        setRemaining(left)
      }
    }, 100)
    return () => window.clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode])

  const handleInputChange = (value: string) => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'running') return
    const clean = value.replace(/[^0-9]/g, '').slice(0, 3)
    setInput(clean)
    setErrFlash(false)
  }

  const submit = () => {
    const current = phaseRef.current
    if (current !== 'idle' && current !== 'running') return
    if (input === '') return
    // The interval tick may be pending — a late entry must not beat the clock.
    if (current === 'running' && deadlineRef.current !== null && now() >= deadlineRef.current) {
      finishTimeout()
      return
    }
    const expected = targetRef.current
    if (Number(input) === expected) {
      if (current === 'idle') {
        // The countdown starts on the first VALID submitted number.
        startedAtRef.current = now()
        deadlineRef.current = startedAtRef.current + mode * 1000
        setPhase('running')
      }
      const next = expected + 1
      targetRef.current = next
      setTarget(next)
      setInput('')
      if (next > LAST) {
        finishSuccess()
        return
      }
    } else {
      mistakesRef.current += 1
      setMistakes(mistakesRef.current)
      setErrFlash(true)
      setInput('')
    }
    inputRef.current?.focus()
  }

  if (phase === 'success' && result) {
    return <ResultPanel result={result} onRestart={() => resetAttempt()} />
  }

  if (phase === 'timeout' && timeoutInfo) {
    return (
      <section className="result-panel panel" role="status" aria-live="polite">
        <span
          className="result-badge"
          style={{
            color: 'var(--bad)',
            borderColor: 'rgba(248,113,113,.4)',
            background: 'rgba(248,113,113,.12)',
          }}
        >
          <TimerOff size={13} aria-hidden="true" /> Time's up
        </span>
        <div>
          <div className="result-primary-value">
            {timeoutInfo.completed}
            <span style={{ fontSize: '0.4em', color: 'var(--text-dim)' }}> / {LAST}</span>
          </div>
          <div className="result-primary-label">Numbers completed</div>
        </div>
        <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.9rem' }}>
          You reached number {Math.max(0, timeoutInfo.completed + 1)} of {LAST}. Timed-out
          attempts are not recorded.
        </p>
        <div className="result-details">
          <div className="result-detail">
            <span className="result-detail-value">{timeoutInfo.mistakes}</span>
            <span className="result-detail-label">Mistakes</span>
          </div>
          <div className="result-detail">
            <span className="result-detail-value">{formatClock(mode * 1000)}</span>
            <span className="result-detail-label">Elapsed</span>
          </div>
          <div className="result-detail">
            <span className="result-detail-value">{mode}s</span>
            <span className="result-detail-label">Time limit</span>
          </div>
        </div>
        <div className="result-actions">
          <button className="btn btn-primary" onClick={() => resetAttempt()}>
            Try again
          </button>
          <button className="btn" onClick={goHome}>
            All games
          </button>
        </div>
      </section>
    )
  }

  const timePct = Math.max(0, Math.min(1, remaining / (mode * 1000)))
  const progressPct = ((target - 1) / LAST) * 100

  return (
    <>
      <div className="panel" style={{ padding: '1.1rem 1.35rem' }}>
        <ModeSelector
          label="Time limit"
          modes={MODES}
          format={(m) => `${m}s`}
          selected={mode}
          onSelect={(m) => resetAttempt(m)}
          disabled={phase === 'running'}
        />
      </div>

      <div className="arena panel">
        <div className="hud" aria-live="off">
          <div className="hud-item">
            <span className="hud-value hud-time accent">{formatClock(remaining)}</span>
            <span className="hud-label">Time left</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">
              {target - 1}/{LAST}
            </span>
            <span className="hud-label">Completed</span>
          </div>
          <div className="hud-item">
            <span className="hud-value" style={{ color: mistakes > 0 ? 'var(--bad)' : undefined }}>
              {mistakes}
            </span>
            <span className="hud-label">Mistakes</span>
          </div>
        </div>

        <div className="cta" style={{ gap: '0.4rem' }}>
          <span className="num-next-prev">
            {phase === 'idle'
              ? `Countdown starts on your first correct number · limit ${mode}s`
              : target > 1
                ? `previous ${target - 1}`
                : 'start with 1'}
          </span>
          <div className="num-display" aria-label={`Type the number ${target}`}>
            <span className="num-current">{target}</span>
            <span className="num-next-prev">/ {LAST}</span>
          </div>
          <p className="feedback dim" role="status" aria-live="polite">
            {phase === 'idle'
              ? 'Type the number above and hit Enter — the clock starts on that entry.'
              : errFlash
                ? 'Wrong number! That one counts as a mistake.'
                : `Next up: ${target}`}
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
              className={`num-input${errFlash ? ' err' : ''}`}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              aria-label={`Number ${target} of ${LAST}`}
            />
            <button className="btn btn-primary" type="submit" disabled={input === ''}>
              <Send size={15} aria-hidden="true" /> Send
            </button>
          </form>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: 'auto' }}>
          <div className="progress-track" style={{ flex: 1 }} aria-hidden="true">
            <div className="progress-fill" style={{ width: `${timePct * 100}%` }} />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--text-dim)',
              minWidth: '3.2rem',
              textAlign: 'right',
            }}
          >
            {Math.floor(progressPct)}% of 100
          </span>
        </div>
      </div>
    </>
  )
}
