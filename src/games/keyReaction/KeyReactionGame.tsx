import { useEffect, useRef, useState } from 'react'
import { Play, Target } from 'lucide-react'
import ResultPanel from '../../components/ResultPanel'
import type { GameResult } from '../../lib/results'
import { newResultId, saveResult } from '../../lib/results'
import { now, randomDelay } from '../../lib/time'

type Phase = 'idle' | 'waiting' | 'go' | 'early' | 'done'

const ROUNDS = 5
const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function randomKey(): string {
  return KEYS[Math.floor(Math.random() * KEYS.length)]
}

export default function KeyReactionGame() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [targetKey, setTargetKey] = useState<string | null>(null)
  const [times, setTimes] = useState<number[]>([])
  const [lastTime, setLastTime] = useState<number | null>(null)
  const [misses, setMisses] = useState(0)
  const [fouls, setFouls] = useState(0)
  const [feedback, setFeedback] = useState<string>('')
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
    setTargetKey(null)
    setTimes([])
    setLastTime(null)
    setMisses(0)
    setFouls(0)
    setFeedback('')
    setResult(null)
  }

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true
    const valid = timesRef.current
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length
    const best = Math.min(...valid)
    const res: GameResult = {
      id: newResultId(),
      gameId: 'key-reaction',
      playedAt: Date.now(),
      primaryLabel: 'Avg key response',
      primaryValue: Math.round(avg),
      primaryDisplay: `${Math.round(avg)} ms`,
      better: 'lower',
      details: [
        { label: 'Best round', display: `${Math.round(best)} ms` },
        { label: 'Wrong keys', display: String(misses) },
        { label: 'Early presses', display: String(fouls) },
        { label: 'Valid rounds', display: `${valid.length} / ${ROUNDS}` },
      ],
    }
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  const armRound = () => {
    clearTimeout_()
    setTargetKey(null)
    setFeedback('Eyes on the key…')
    setPhase('waiting')
    timeoutRef.current = window.setTimeout(() => {
      const key = randomKey()
      goAtRef.current = now()
      setTargetKey(key)
      setFeedback('')
      setPhase('go')
    }, randomDelay(1300, 3600))
  }

  // Always release the pending timeout when leaving the game.
  useEffect(() => () => clearTimeout_(), [])

  const handleKey = (key: string) => {
    if (phase === 'idle' || phase === 'early') {
      armRound()
      return
    }
    if (phase === 'waiting') {
      clearTimeout_()
      setFouls((f) => f + 1)
      setFeedback('Too early! Press any key to retry.')
      setPhase('early')
      return
    }
    if (phase === 'go' && goAtRef.current !== null) {
      if (key === targetKey) {
        const t = Math.max(0, Math.round(now() - goAtRef.current))
        timesRef.current = [...timesRef.current, t]
        setTimes(timesRef.current)
        setLastTime(t)
        if (timesRef.current.length >= ROUNDS) {
          finish()
        } else {
          setFeedback(`${t} ms — get ready…`)
          armRound()
        }
      } else {
        setMisses((m) => m + 1)
        setFeedback(`Wrong key! Hit ${targetKey}`)
      }
    }
  }

  // "Latest" refs so the stable window listener always calls fresh handlers.
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  const handleKeyRef = useRef(handleKey)
  useEffect(() => {
    handleKeyRef.current = handleKey
  })

  // Global keyboard listener: single source of truth for physical key presses.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return // held keys never count as separate reactions
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Let focused controls keep their own Enter/Space (e.g. button activation).
      const target = e.target as HTMLElement | null
      const inControl =
        target && typeof target.closest === "function"
          ? target.closest("button, a, input, textarea") !== null
          : false
      if (inControl && (e.key === "Enter" || e.key === " ")) {
        return
      }
      if (phaseRef.current === 'done') return
      const key = e.key.length === 1 ? e.key.toUpperCase() : ''
      if (key === '') return
      handleKeyRef.current(key)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (phase === 'done' && result) {
    return <ResultPanel result={result} onRestart={restart} />
  }

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
          <span className="hud-value">{lastTime !== null ? `${lastTime} ms` : '—'}</span>
          <span className="hud-label">Last</span>
        </div>
        <div className="hud-item">
          <span className="hud-value" style={{ color: misses > 0 ? 'var(--bad)' : undefined }}>
            {misses}
          </span>
          <span className="hud-label">Wrong keys</span>
        </div>
        <div className="hud-item">
          <span className="hud-value" style={{ color: fouls > 0 ? 'var(--bad)' : undefined }}>
            {fouls}
          </span>
          <span className="hud-label">Early</span>
        </div>
      </div>

      <div className="cta" style={{ flex: 1, padding: '1.4rem 0.5rem' }}>
        {phase === 'idle' ? (
          <>
            <Target size={40} className="cta-icon" aria-hidden="true" />
            <h2>{ROUNDS} rounds · one key each</h2>
            <p>A random letter flashes on screen — press that exact key as fast as you can.</p>
            <button className="btn btn-primary" onClick={armRound}>
              <Play size={15} aria-hidden="true" /> Start (or press any letter)
            </button>
          </>
        ) : phase === 'waiting' ? (
          <>
            <span style={{ fontSize: '3rem', opacity: 0.25 }} aria-hidden="true">
              ?
            </span>
            <p className="feedback bad" role="status" aria-live="polite">
              Wait for the target key…
            </p>
          </>
        ) : phase === 'early' ? (
          <>
            <span style={{ fontSize: '3rem', color: 'var(--bad)', opacity: 0.7 }} aria-hidden="true">
              ✕
            </span>
            <p className="feedback bad" role="status" aria-live="polite">
              {feedback}
            </p>
          </>
        ) : (
          <>
            <div className="key-target-display" aria-live="polite" role="status">
              {targetKey}
            </div>
            <p className={`feedback${feedback.startsWith('Wrong') ? ' bad' : ' dim'}`}>
              {feedback || 'Press it!'}
            </p>
          </>
        )}
      </div>

      <div
        className="keygrid"
        aria-label="On-screen keyboard — tap instead of pressing physical keys"
      >
        {KEYS.map((k) => (
          <button
            key={k}
            className={`kkey${phase === 'go' && k === targetKey ? ' target' : ''}`}
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return
              handleKey(k)
            }}
            tabIndex={-1}
            aria-label={`Key ${k}`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="round-dots" style={{ marginTop: '1rem' }} aria-hidden="true">
        {Array.from({ length: ROUNDS }, (_, i) => (
          <span key={i} className={`rdot${i < times.length ? ' filled' : ''}`} />
        ))}
      </div>
    </div>
  )
}
