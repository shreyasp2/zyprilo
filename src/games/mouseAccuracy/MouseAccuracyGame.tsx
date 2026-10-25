import { useEffect, useRef, useState } from 'react'
import { Crosshair, Play } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { formatClock, now } from '../../lib/time'

type Phase = 'idle' | 'running' | 'done'
type Mode = 15 | 30 | 60
type Difficulty = 'easy' | 'medium' | 'hard'

const MODES: readonly Mode[] = [15, 30, 60]
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

/** Base target sizes per difficulty tier, shrinking as the run progresses. */
const SIZES: Record<Difficulty, [number, number]> = {
  easy: [66, 50],
  medium: [50, 34],
  hard: [40, 26],
}
/** Moving-target probability on Hard only. */
const MOVE_CHANCE: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0.35 }
/** Drift amplitude in px — small enough to stay fair. */
const MOVE_AMPLITUDE = 46

interface TargetSpec {
  id: number
  xPct: number
  yPct: number
  sizePx: number
  move?: { dx: number; dy: number; dur: number }
}

/** Module-level so randomness never runs inside the component body. */
function spawnSpec(
  index: number,
  difficulty: Difficulty,
  progress: number,
  runId: number,
): TargetSpec {
  const [maxSize, minSize] = SIZES[difficulty]
  const size = Math.round(maxSize - (maxSize - minSize) * Math.min(1, progress))
  // Inset keeps the circle (plus drift) fully inside the arena.
  const inset = Math.min(45, Math.round(size / 2 / 4.2) + (difficulty === 'hard' ? 8 : 5))
  const spec: TargetSpec = {
    id: runId * 1000 + index,
    xPct: inset + Math.random() * (100 - inset * 2),
    yPct: inset + Math.random() * (100 - inset * 2),
    sizePx: size,
  }
  if (Math.random() < MOVE_CHANCE[difficulty]) {
    const angle = Math.random() * Math.PI * 2
    const dist = (MOVE_AMPLITUDE * Math.random()) / 2
    spec.move = {
      dx: Math.round(Math.cos(angle) * dist),
      dy: Math.round(Math.sin(angle) * dist),
      dur: 2600 + Math.round(Math.random() * 1600),
    }
  }
  return spec
}

export default function MouseAccuracyGame({ dailyConfig }: GameProps) {
  const [mode, setMode] = useState<Mode>(
    dailyConfig?.duration === 15 || dailyConfig?.duration === 30 || dailyConfig?.duration === 60
      ? dailyConfig.duration
      : 30,
  )
  const [difficulty, setDifficulty] = useState<Difficulty>(
    dailyConfig?.difficulty === 'easy' || dailyConfig?.difficulty === 'hard'
      ? dailyConfig.difficulty
      : 'medium',
  )
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [target, setTarget] = useState<TargetSpec | null>(null)
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [remaining, setRemaining] = useState(mode * 1000)
  const [result, setResult] = useState<GameResult | null>(null)

  // Phase mirrored synchronously so click handlers can never act on a stale run.
  const phaseRef = useRef<Phase>('idle')
  const modeRef = useRef<Mode>(mode)
  const difficultyRef = useRef<Difficulty>(difficulty)
  const spawnedRef = useRef(0)
  const hitsRef = useRef(0)
  const missesRef = useRef(0)
  const spawnAtRef = useRef<number | null>(null)
  const reactionSumRef = useRef(0)
  const deadlineRef = useRef<number | null>(null)
  const savedRef = useRef(false)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }

  const restart = (
    nextMode: Mode = modeRef.current,
    nextDifficulty: Difficulty = difficultyRef.current,
    clearResult = true,
  ) => {
    modeRef.current = nextMode
    difficultyRef.current = nextDifficulty
    setMode(nextMode)
    setDifficulty(nextDifficulty)
    spawnedRef.current = 0
    hitsRef.current = 0
    missesRef.current = 0
    reactionSumRef.current = 0
    deadlineRef.current = null
    spawnAtRef.current = null
    savedRef.current = false
    setHits(0)
    setMisses(0)
    setTarget(null)
    setRemaining(nextMode * 1000)
    if (clearResult) setResult(null)
    setPhase('idle')
  }

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true
    const totalHits = hitsRef.current
    const totalMisses = missesRef.current
    const attempts = totalHits + totalMisses
    const accuracy = attempts === 0 ? 100 : Math.round((totalHits / attempts) * 100)
    const avgMs = totalHits > 0 ? Math.round(reactionSumRef.current / totalHits) : 0
    const res = createResult({
      gameId: 'mouse-accuracy',
      primaryLabel: `Accuracy · ${mode}s ${DIFF_LABEL[difficulty]}`,
      primaryValue: accuracy,
      primaryDisplay: `${accuracy}%`,
      better: 'higher',
      details: [
        { label: 'Targets hit', display: String(totalHits) },
        { label: 'Misses', display: String(totalMisses) },
        { label: 'Avg time / target', display: `${avgMs} ms` },
        { label: 'Difficulty', display: DIFF_LABEL[difficulty] },
      ],
    })
    saveResult(res)
    setResult(res)
    setPhase('done')
    setTarget(null)
  }

  // Countdown — starts the moment the run begins; ends the run at zero.
  useEffect(() => {
    if (phase !== 'running' || deadlineRef.current === null) return
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
  }, [phase, mode, difficulty])

  const start = () => {
    if (savedRef.current) {
      // Coming from a finished run: fully reset, then begin immediately.
      savedRef.current = false
      spawnedRef.current = 0
      hitsRef.current = 0
      missesRef.current = 0
      reactionSumRef.current = 0
      setHits(0)
      setMisses(0)
        setResult(null)
    }
    deadlineRef.current = now() + mode * 1000
    setRemaining(mode * 1000)
    setPhase('running')
    spawnNext()
  }

  const spawnNext = () => {
    if (deadlineRef.current === null) return
    const progress = 1 - Math.max(0, deadlineRef.current - now()) / (modeRef.current * 1000)
    spawnedRef.current += 1
    setTarget(spawnSpec(spawnedRef.current, difficulty, progress, 1))
    spawnAtRef.current = now()
  }

  const handleTargetHit = () => {
    if (phaseRef.current !== 'running' || spawnAtRef.current === null || target === null) return
    reactionSumRef.current += Math.max(0, now() - spawnAtRef.current)
    hitsRef.current += 1
    setHits(hitsRef.current)
    spawnNext()
  }

  const handleArenaMiss = () => {
    if (phaseRef.current !== 'running' || target === null) return
    missesRef.current += 1
    setMisses(missesRef.current)
  }

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={() => restart()}
        share={{
          title: 'Zyprilo — Mouse Accuracy',
          text: `I scored ${result.primaryDisplay} in Mouse Accuracy (${mode}s, ${DIFF_LABEL[difficulty]}) on ${new Date().toLocaleDateString()} — ${hits} targets hit, ${misses} misses. Play at Zyprilo!`,
        }}
      />
    )
  }

  const attempts = hits + misses
  const liveAccuracy = attempts === 0 ? 100 : Math.round((hits / attempts) * 100)
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
        <ModeSelector
          label="Difficulty"
          modes={DIFFICULTIES}
          format={(d) => DIFF_LABEL[d]}
          selected={difficulty}
          onSelect={(d) => restart(modeRef.current, d)}
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
            <span className="hud-value">{hits}</span>
            <span className="hud-label">Hits</span>
          </div>
          <div className="hud-item">
            <span className="hud-value" style={{ color: misses > 0 ? 'var(--bad)' : undefined }}>
              {misses}
            </span>
            <span className="hud-label">Misses</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{liveAccuracy}%</span>
            <span className="hud-label">Accuracy</span>
          </div>
        </div>

        <div
          className="aim-arena"
          onClick={handleArenaMiss}
          role="application"
          aria-label="Aim arena — click the highlighted targets, misses count against accuracy"
        >
          {phase === 'idle' ? (
            <div className="cta">
              <Crosshair size={40} className="cta-icon" aria-hidden="true" />
              <h2>
                {mode}s of target practice · {DIFF_LABEL[difficulty]}
              </h2>
              <p>
                The countdown starts when you press Start. Click every circle — arena clicks count
                as misses.{' '}
                {difficulty === 'hard' ? 'Hard mode: some targets drift.' : 'Targets shrink over time.'}
              </p>
              <button className="btn btn-primary" onClick={start}>
                <Play size={15} aria-hidden="true" /> Start
              </button>
            </div>
          ) : (
            target !== null && (
              <button
                key={target.id}
                className={`aim-target${target.move ? ' aim-moving' : ''}`}
                style={
                  {
                    left: `${target.xPct}%`,
                    top: `${target.yPct}%`,
                    width: target.sizePx,
                    height: target.sizePx,
                    ...(target.move
                      ? {
                          '--drift-x': `${target.move.dx}px`,
                          '--drift-y': `${target.move.dy}px`,
                          '--drift-dur': `${target.move.dur}ms`,
                        }
                      : {}),
                  } as React.CSSProperties}
                onClick={(e) => {
                  e.stopPropagation()
                  handleTargetHit()
                }}
                aria-label="Target"
              />
            )
          )}
        </div>

        <div className="progress-track" style={{ marginTop: '1rem' }} aria-hidden="true">
          <div className="progress-fill" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
    </>
  )
}
