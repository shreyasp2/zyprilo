import { useEffect, useRef, useState } from 'react'
import { Keyboard } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameResult } from '../../lib/results'
import { newResultId, saveResult } from '../../lib/results'
import { elapsedMs, now } from '../../lib/time'

type Phase = 'idle' | 'running' | 'done'
type Mode = 5 | 10 | 30

const MODES: readonly Mode[] = [5, 10, 30]

export default function SpacebarGame() {
  const [mode, setMode] = useState<Mode>(10)
  const [phase, setPhase] = useState<Phase>('idle')
  const [presses, setPresses] = useState(0)
  const [remaining, setRemaining] = useState(mode * 1000)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)

  const startedAtRef = useRef<number | null>(null)
  const pressesRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const savedRef = useRef(false)

  const restart = (nextMode: Mode = mode) => {
    setMode(nextMode)
    setPhase('idle')
    setPresses(0)
    pressesRef.current = 0
    startedAtRef.current = null
    setRemaining(nextMode * 1000)
    setElapsed(0)
    setResult(null)
    savedRef.current = false
  }

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true
    const total = pressesRef.current
    const rate = total / mode
    const res: GameResult = {
      id: newResultId(),
      gameId: 'spacebar',
      playedAt: Date.now(),
      primaryLabel: `Presses · ${mode}s`,
      primaryValue: total,
      primaryDisplay: String(total),
      better: 'higher',
      details: [
        { label: 'Presses / sec', display: rate.toFixed(2) },
        { label: 'Duration', display: `${mode}s` },
        {
          label: 'Avg interval',
          display:
            total > 0 ? `${(elapsedMs(startedAtRef.current ?? now()) / total).toFixed(0)} ms` : '—',
        },
      ],
    }
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  // Mirror phase into a ref for the stable global keydown listener.
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // End-of-run timer. Exactly one interval while running.
  useEffect(() => {
    if (phase !== 'running' || startedAtRef.current === null) return
    const endTime = startedAtRef.current + mode * 1000
    const iv = window.setInterval(() => {
      const left = endTime - now()
      if (left <= 0) {
        setRemaining(0)
        finish()
      } else {
        setRemaining(left)
        setElapsed(mode * 1000 - left)
      }
    }, 50)
    return () => window.clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode])

  const registerPress = () => {
    if (phaseRef.current === 'idle') {
      startedAtRef.current = now()
      pressesRef.current = 1
      setPresses(1)
      setPhase('running')
    } else if (phaseRef.current === 'running') {
      pressesRef.current += 1
      setPresses(pressesRef.current)
    }
  }

  // "Latest" ref so the stable listener always calls the freshest handler.
  const pressRef = useRef(registerPress)
  useEffect(() => {
    pressRef.current = registerPress
  })

  // Global spacebar listener. preventDefault stops the page from scrolling;
  // e.repeat is ignored so held-key auto-repeats never count as presses.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (phaseRef.current !== 'done') {
        e.preventDefault()
        // Don't swallow space typed into real text fields elsewhere on the page.
        const target = e.target as HTMLElement | null
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      } else {
        return
      }
      if (e.repeat) return
      pressRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (phase === 'done' && result) {
    return <ResultPanel result={result} onRestart={() => restart()} />
  }

  const elapsedSec = elapsed / 1000
  const liveRate = elapsedSec > 0.15 ? presses / Math.min(elapsedSec, mode) : 0
  const pct = Math.max(0, Math.min(1, remaining / (mode * 1000)))

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
      </div>

      <div className="arena panel">
        <div className="hud" aria-live="off">
          <div className="hud-item">
            <span className="hud-value accent">{presses}</span>
            <span className="hud-label">Presses</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{liveRate.toFixed(1)}</span>
            <span className="hud-label">Presses / sec</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{(remaining / 1000).toFixed(1)}s</span>
            <span className="hud-label">Time left</span>
          </div>
        </div>

        <button
          className={`pad${phase === 'running' ? ' pad-live' : ''}`}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return
            registerPress()
          }}
          aria-label="Spacebar pad — press space or tap here"
        >
          {phase === 'idle' ? (
            <>
              <Keyboard size={40} className="cta-icon" aria-hidden="true" />
              <h2>Press space to start</h2>
              <p>
                The clock starts on your first press. Keyboard spacebar or this pad — both count
                (touch users, tap away).
              </p>
            </>
          ) : (
            <>
              <span className="pad-count">{presses}</span>
              <p className="feedback dim">{(remaining / 1000).toFixed(1)}s remaining</p>
            </>
          )}
        </button>

        <div className="progress-track" style={{ marginTop: '1rem' }} aria-hidden="true">
          <div className="progress-fill" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
    </>
  )
}
