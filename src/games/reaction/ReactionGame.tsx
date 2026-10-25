import { useEffect, useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import ResultPanel from '../../components/ResultPanel'
import type { GameResult } from '../../lib/results'
import { newResultId, saveResult } from '../../lib/results'
import { now, randomDelay } from '../../lib/time'

type Phase = 'idle' | 'waiting' | 'go' | 'early' | 'done'

const ROUNDS = 5

export default function ReactionGame() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [times, setTimes] = useState<number[]>([])
  const [lastTime, setLastTime] = useState<number | null>(null)
  const [fouls, setFouls] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)

  const goAtRef = useRef<number | null>(null)
  const timesRef = useRef<number[]>([])
  const timeoutRef = useRef<number | null>(null)
  const savedRef = useRef(false)

  const clearTimeout_ = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const restart = () => {
    clearTimeout_()
    savedRef.current = false
    goAtRef.current = null
    timesRef.current = []
    setPhase('idle')
    setTimes([])
    setLastTime(null)
    setFouls(0)
    setResult(null)
  }

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true
    const valid = timesRef.current
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length
    const best = Math.min(...valid)
    const worst = Math.max(...valid)
    const res: GameResult = {
      id: newResultId(),
      gameId: 'reaction',
      playedAt: Date.now(),
      primaryLabel: 'Avg reaction time',
      primaryValue: Math.round(avg),
      primaryDisplay: `${Math.round(avg)} ms`,
      better: 'lower',
      details: [
        { label: 'Best round', display: `${Math.round(best)} ms` },
        { label: 'Worst round', display: `${Math.round(worst)} ms` },
        { label: 'Valid rounds', display: `${valid.length} / ${ROUNDS}` },
        { label: 'Early clicks', display: String(fouls) },
      ],
    }
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  const armRound = () => {
    clearTimeout_()
    setPhase('waiting')
    // Single live timeout at a time; randomized wait so rhythm-guessing fails.
    timeoutRef.current = window.setTimeout(() => {
      goAtRef.current = now()
      setPhase('go')
    }, randomDelay(1300, 4200))
  }

  // Always release the pending timeout when leaving the game.
  useEffect(() => () => clearTimeout_(), [])

  const handlePress = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return

    if (phase === 'idle' || phase === 'early') {
      armRound()
      return
    }
    if (phase === 'waiting') {
      // Premature click: penalty — the round must be redone.
      clearTimeout_()
      setFouls((f) => f + 1)
      setPhase('early')
      return
    }
    if (phase === 'go' && goAtRef.current !== null) {
      const t = Math.max(0, Math.round(now() - goAtRef.current))
      timesRef.current = [...timesRef.current, t]
      setTimes(timesRef.current)
      setLastTime(t)
      if (timesRef.current.length >= ROUNDS) {
        finish()
      } else {
        armRound()
      }
    }
  }

  if (phase === 'done' && result) {
    return <ResultPanel result={result} onRestart={restart} />
  }

  const padClass =
    phase === 'go' ? 'pad pad-live' : phase === 'waiting' ? 'pad pad-armed pad-pulse' : 'pad'

  return (
    <div className="arena panel">
      <div className="hud" aria-live="off">
        <div className="hud-item">
          <span className="hud-value accent">
            {times.length} / {ROUNDS}
          </span>
          <span className="hud-label">Rounds</span>
        </div>
        <div className="hud-item">
          <span className="hud-value">{lastTime !== null ? `${Math.round(lastTime)} ms` : '—'}</span>
          <span className="hud-label">Last</span>
        </div>
        <div className="hud-item">
          <span className="hud-value" style={{ color: fouls > 0 ? 'var(--bad)' : undefined }}>
            {fouls}
          </span>
          <span className="hud-label">Early clicks</span>
        </div>
      </div>

      <button
        className={padClass}
        onPointerDown={handlePress}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Reaction pad — click when it turns green"
      >
        {phase === 'idle' && (
          <>
            <Zap size={40} className="cta-icon" aria-hidden="true" />
            <h2>{ROUNDS} rounds of pure reflex</h2>
            <p>Click to arm the first round. Wait for green… then click. Too early is a foul.</p>
          </>
        )}
        {phase === 'waiting' && (
          <>
            <span className="pad-count" aria-hidden="true">
              ···
            </span>
            <p className="feedback bad" role="status" aria-live="polite">
              Wait for green…
            </p>
          </>
        )}
        {phase === 'go' && (
          <>
            <span className="pad-count">CLICK!</span>
            <p className="feedback good">Now! Right now!</p>
          </>
        )}
        {phase === 'early' && (
          <>
            <span className="pad-count" style={{ color: 'var(--bad)' }} aria-hidden="true">
              ✕
            </span>
            <p className="feedback bad" role="status" aria-live="polite">
              Too early! Click to retry this round.
            </p>
          </>
        )}
      </button>

      <div className="round-dots" style={{ marginTop: '1rem' }} aria-hidden="true">
        {Array.from({ length: ROUNDS }, (_, i) => (
          <span key={i} className={`rdot${i < times.length ? ' filled' : ''}`} />
        ))}
      </div>
    </div>
  )
}
