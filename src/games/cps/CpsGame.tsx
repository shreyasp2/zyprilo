import { useEffect, useRef, useState } from 'react'
import { MousePointerClick } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameResult } from '../../lib/results'
import { newResultId, saveResult } from '../../lib/results'
import { now } from '../../lib/time'

type Phase = 'idle' | 'running' | 'done'
type Mode = 1 | 2 | 5 | 10

const MODES: readonly Mode[] = [1, 2, 5, 10]

export default function CpsGame() {
  const [mode, setMode] = useState<Mode>(5)
  const [phase, setPhase] = useState<Phase>('idle')
  const [clicks, setClicks] = useState(0)
  const [remaining, setRemaining] = useState(mode * 1000)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)

  const startedAtRef = useRef<number | null>(null)
  const clicksRef = useRef(0)
  const savedRef = useRef(false)

  const restart = (nextMode: Mode = mode) => {
    setMode(nextMode)
    setPhase('idle')
    setClicks(0)
    clicksRef.current = 0
    startedAtRef.current = null
    setRemaining(nextMode * 1000)
    setElapsed(0)
    setResult(null)
    savedRef.current = false
  }

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true
    const total = clicksRef.current
    const cps = total / mode
    const res: GameResult = {
      id: newResultId(),
      gameId: 'cps',
      playedAt: Date.now(),
      primaryLabel: `Clicks / sec · ${mode}s`,
      primaryValue: Number(cps.toFixed(2)),
      primaryDisplay: cps.toFixed(2),
      better: 'higher',
      details: [
        { label: 'Total clicks', display: String(total) },
        { label: 'Duration', display: `${mode}s` },
        { label: 'Clicks / sec', display: cps.toFixed(2) },
      ],
    }
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

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

  const handlePress = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return // primary button only
    if (phase === 'idle') {
      startedAtRef.current = now()
      clicksRef.current = 1
      setClicks(1)
      setPhase('running')
    } else if (phase === 'running') {
      clicksRef.current += 1
      setClicks(clicksRef.current)
    }
  }

  if (phase === 'done' && result) {
    return <ResultPanel result={result} onRestart={() => restart()} />
  }

  const elapsedSec = elapsed / 1000
  const liveCps = elapsedSec > 0.15 ? clicks / Math.min(elapsedSec, mode) : 0
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
            <span className="hud-value accent">{clicks}</span>
            <span className="hud-label">Clicks</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{liveCps.toFixed(1)}</span>
            <span className="hud-label">Live CPS</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{(remaining / 1000).toFixed(1)}s</span>
            <span className="hud-label">Time left</span>
          </div>
        </div>

        <button
          className={`pad${phase === 'running' ? ' pad-live' : ''}`}
          onPointerDown={handlePress}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Click pad — first click starts the timer"
          style={
            phase === 'running'
              ? ({
                  '--accent': '#4ade80',
                  '--accent-glow': 'rgba(74,222,128,.3)',
                } as React.CSSProperties)
              : undefined
          }
        >
          {phase === 'idle' ? (
            <>
              <MousePointerClick size={40} className="cta-icon" aria-hidden="true" />
              <h2>Click to start</h2>
              <p>Your first click starts the {mode}-second clock. Keep mashing!</p>
            </>
          ) : (
            <>
              <span className="pad-count">{clicks}</span>
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
