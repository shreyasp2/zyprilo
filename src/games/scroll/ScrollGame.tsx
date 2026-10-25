import { useEffect, useRef, useState } from 'react'
import { ArrowDown, Flag, Play } from 'lucide-react'
import ResultPanel from '../../components/ResultPanel'
import type { GameResult } from '../../lib/results'
import { newResultId, saveResult } from '../../lib/results'
import { elapsedMs, formatSeconds, now } from '../../lib/time'

type Phase = 'idle' | 'armed' | 'running' | 'done'

/** Total scrollable distance of the gauntlet, excluding the banners. */
const TRACK_PX = 10000
/** Tolerance for "at the bottom" — absorbs sub-pixel rounding on zoomed/HiDPI rendering. */
const FINISH_EPSILON_PX = 4

export default function ScrollGame() {
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  // Phase is mirrored into a ref SYNCHRONOUSLY (never via an effect) so scroll
  // events — which can fire between a state commit and its effects — always see
  // the current run's phase. Every handler reads refs only: no stale closures.
  const phaseRef = useRef<Phase>('idle')
  const runIdRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const finishedRunRef = useRef<number | null>(null)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }

  const resetTrackToTop = () => {
    const vp = viewportRef.current
    if (!vp) return // result screen is showing; the arena remounts at the top anyway
    vp.style.scrollBehavior = 'auto'
    vp.scrollTop = 0
    vp.style.scrollBehavior = ''
  }

  const restart = () => {
    runIdRef.current += 1 // invalidate any in-flight run
    startedAtRef.current = null
    setProgress(0)
    setElapsed(0)
    setResult(null)
    setPhase('idle')
    resetTrackToTop()
  }

  const arm = () => {
    runIdRef.current += 1
    startedAtRef.current = null
    setProgress(0)
    setElapsed(0)
    setResult(null)
    setPhase('armed')
    // Snap to the top after arming. In a real browser this programmatic
    // scroll fires a scroll event reporting top=0, which the start guard in
    // handleScroll ignores — only a real user scroll (top > 0) starts the clock.
    resetTrackToTop()
  }

  const finish = (distance: number) => {
    const runId = runIdRef.current
    if (finishedRunRef.current === runId) return // this run already completed
    if (startedAtRef.current === null) return // clock never started — no result
    finishedRunRef.current = runId
    const totalMs = Math.max(100, elapsedMs(startedAtRef.current)) // sane floor: nobody finishes <0.1s
    const speed = distance / (totalMs / 1000)
    const res: GameResult = {
      id: newResultId(),
      gameId: 'scroll',
      playedAt: Date.now(),
      primaryLabel: 'Scroll time',
      primaryValue: Number((totalMs / 1000).toFixed(2)),
      primaryDisplay: formatSeconds(totalMs),
      better: 'lower',
      details: [
        { label: 'Avg speed', display: `${Math.round(speed).toLocaleString()} px/s` },
        { label: 'Distance', display: `${distance.toLocaleString()} px` },
      ],
    }
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  // Live clock — exactly one interval per run; cleaned up on phase change and unmount.
  useEffect(() => {
    if (phase !== 'running' || startedAtRef.current === null) return
    const startedAt = startedAtRef.current
    const iv = window.setInterval(() => {
      setElapsed(elapsedMs(startedAt))
    }, 50)
    return () => window.clearInterval(iv)
  }, [phase])

  // Keep the progress readout honest when the viewport resizes mid-run
  // (finish detection re-reads the geometry on every scroll event regardless).
  useEffect(() => {
    const onResize = () => {
      const vp = viewportRef.current
      if (!vp) return
      const max = vp.scrollHeight - vp.clientHeight
      if (max <= 0) return
      setProgress(Math.max(0, Math.min(1, vp.scrollTop / max)))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Attached via React's onScroll, which follows the viewport across the
  // unmount/remount caused by the result screen. Reads refs only.
  const handleScroll = () => {
    const vp = viewportRef.current
    if (!vp) return
    const max = vp.scrollHeight - vp.clientHeight
    if (max <= 0) return
    const top = vp.scrollTop
    setProgress(Math.max(0, Math.min(1, top / max)))

    const current = phaseRef.current
    if (current !== 'armed' && current !== 'running') return
    const runId = runIdRef.current

    // Start the clock on the first ACTUAL user scroll. The arming reset lands
    // at exactly top=0 and must never start it.
    if (startedAtRef.current === null) {
      if (top <= 0) return
      startedAtRef.current = now()
      setPhase('running')
    }
    // Exactly one completion per run; stale events from older runs are dropped
    // by the phase check above, coalesced trailing events by this guard.
    if (finishedRunRef.current === runId) return
    if (top >= max - FINISH_EPSILON_PX) {
      finish(max)
    }
  }

  if (phase === 'done' && result) {
    return <ResultPanel result={result} onRestart={restart} />
  }

  const hudText =
    phase === 'idle'
      ? 'Press Start to arm the track'
      : phase === 'armed'
        ? 'Scroll to start the clock ⚡'
        : `${formatSeconds(elapsed)} · ${Math.floor(progress * 100)}%`

  return (
    <div className="arena panel">
      <div className="hud" aria-live="off">
        <div className="hud-item">
          <span className="hud-value accent">{formatSeconds(elapsed)}</span>
          <span className="hud-label">Time</span>
        </div>
        <div className="hud-item">
          <span className="hud-value">{Math.floor(progress * 100)}%</span>
          <span className="hud-label">Progress</span>
        </div>
        <div className="hud-item">
          <span className="hud-value">{TRACK_PX.toLocaleString()}</span>
          <span className="hud-label">Pixels</span>
        </div>
      </div>

      <div className="scroll-stage" style={{ marginTop: '1rem' }}>
        <div
          ref={viewportRef}
          className="scroll-viewport"
          onScroll={handleScroll}
          tabIndex={0}
          role="application"
          aria-label={`Scroll gauntlet — ${TRACK_PX} pixels. Scroll to the finish line.`}
        >
          <div className="scroll-track">
            <div className="scroll-hud">
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: phase === 'armed' ? 'var(--accent)' : 'var(--text)',
                }}
                role="status"
                aria-live="polite"
              >
                {hudText}
              </span>
            </div>

            <div className="scroll-banner">
              <ArrowDown size={16} style={{ verticalAlign: '-3px' }} aria-hidden="true" /> Start —
              your first scroll begins the timer
            </div>

            <div style={{ position: 'relative', height: TRACK_PX }}>
              {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((pct) => (
                <div className="scroll-mark" key={pct} style={{ top: `${pct}%` }}>
                  ··· {pct}% ···
                </div>
              ))}
            </div>

            <div className="scroll-banner finish">
              <Flag size={16} style={{ verticalAlign: '-3px' }} aria-hidden="true" /> Finish line
            </div>
          </div>
        </div>
      </div>

      {phase === 'idle' ? (
        <div className="cta" style={{ padding: '1.2rem 0 0' }}>
          <button className="btn btn-primary" onClick={arm}>
            <Play size={15} aria-hidden="true" /> Start challenge
          </button>
          <p>Mouse wheel, trackpad, scrollbar or thumb — get to the bottom as fast as you can.</p>
        </div>
      ) : (
        <div
          style={{ display: 'flex', gap: '0.7rem', marginTop: '1rem', justifyContent: 'center' }}
        >
          <button className="btn btn-ghost" onClick={restart}>
            Reset track
          </button>
        </div>
      )}
    </div>
  )
}
