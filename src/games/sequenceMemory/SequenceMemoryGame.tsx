import { useEffect, useRef, useState } from 'react'
import { ListOrdered, Play } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { randomInt } from '../../lib/time'

type Phase = 'idle' | 'showing' | 'input' | 'done'
type GridSize = 3 | 4 | 5 | 6

const GRIDS: readonly GridSize[] = [3, 4, 5, 6]
/** Level 1 plays a 3-step sequence; each cleared round adds one step. */
const seqLenForLevel = (level: number) => level + 2
/** Playback speeds up slightly as levels climb. */
const litMsFor = (level: number) => Math.max(200, 340 - level * 15)
const GAP_MS = 170

export default function SequenceMemoryGame({ dailyConfig }: GameProps) {
  const [grid, setGrid] = useState<GridSize>(
    dailyConfig?.grid === 3 || dailyConfig?.grid === 5 || dailyConfig?.grid === 6
      ? dailyConfig.grid
      : dailyConfig?.grid === 4
        ? 4
        : 3,
  )
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [level, setLevel] = useState(1)
  const [activePad, setActivePad] = useState<number | null>(null)
  const [inputStep, setInputStep] = useState(0)
  const [wrongPad, setWrongPad] = useState<number | null>(null)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)

  const phaseRef = useRef<Phase>('idle')
  const gridRef = useRef<GridSize>(grid)
  const levelRef = useRef(1)
  const seqRef = useRef<number[]>([])
  const inputStepRef = useRef(0)
  const streakRef = useRef(0)
  const bestStreakRef = useRef(0)
  const padsClickedRef = useRef(0)
  // Every playback timeout lives in this list so restart/unmount can sweep them.
  const timeoutsRef = useRef<number[]>([])
  const savedRef = useRef(false)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }

  const clearTimeouts = () => {
    for (const t of timeoutsRef.current) window.clearTimeout(t)
    timeoutsRef.current = []
  }

  const restart = (nextGrid: GridSize = gridRef.current) => {
    clearTimeouts()
    savedRef.current = false
    gridRef.current = nextGrid
    setGrid(nextGrid)
    levelRef.current = 1
    seqRef.current = []
    inputStepRef.current = 0
    streakRef.current = 0
    bestStreakRef.current = 0
    padsClickedRef.current = 0
    setLevel(1)
    setActivePad(null)
    setInputStep(0)
    setWrongPad(null)
    setStreak(0)
    setBestStreak(0)
    setResult(null)
    setPhase('idle')
  }

  // Release pending playback timeouts when leaving the game.
  useEffect(() => () => clearTimeouts(), [])

  const finish = (finalWrongPad: number | null) => {
    if (savedRef.current) return
    savedRef.current = true
    clearTimeouts()
    setActivePad(null)
    setWrongPad(finalWrongPad)
    const longestCompleted = seqLenForLevel(levelRef.current - 1) // levels fully cleared
    const res = createResult({
      gameId: 'sequence-memory',
      primaryLabel: `Longest sequence · ${gridRef.current}×${gridRef.current}`,
      primaryValue: longestCompleted,
      primaryDisplay: `${longestCompleted} steps`,
      better: 'higher',
      details: [
        { label: 'Level reached', display: String(levelRef.current) },
        { label: 'Best streak', display: String(bestStreakRef.current) },
        { label: 'Pads pressed', display: String(padsClickedRef.current) },
      ],
    })
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  const playSequence = () => {
    const litMs = litMsFor(levelRef.current)
    const seq = seqRef.current
    setPhase('showing')
    setInputStep(0)
    inputStepRef.current = 0
    seq.forEach((pad, i) => {
      const onAt = i * (litMs + GAP_MS)
      timeoutsRef.current.push(
        window.setTimeout(() => setActivePad(pad), onAt),
        window.setTimeout(() => setActivePad(null), onAt + litMs),
      )
    })
    timeoutsRef.current.push(
      window.setTimeout(() => {
        setPhase('input')
      }, seq.length * (litMs + GAP_MS)),
    )
  }

  const start = () => {
    savedRef.current = false
    levelRef.current = 1
    streakRef.current = 0
    bestStreakRef.current = 0
    padsClickedRef.current = 0
    setStreak(0)
    setBestStreak(0)
    // Level 1 plays a full 3-step sequence; later rounds extend it by one.
    seqRef.current = Array.from({ length: seqLenForLevel(1) }, () =>
      randomInt(0, gridRef.current * gridRef.current - 1),
    )
    setLevel(1)
    playSequence()
  }

  const nextLevel = () => {
    // The sequence grows by one step each round; earlier steps stay identical.
    seqRef.current = [...seqRef.current, randomInt(0, gridRef.current * gridRef.current - 1)]
    playSequence()
  }

  const clickPad = (pad: number) => {
    if (phaseRef.current !== 'input') return
    padsClickedRef.current += 1
    if (pad === seqRef.current[inputStepRef.current]) {
      // Streak counts consecutive correct pads within the run.
      streakRef.current += 1
      if (streakRef.current > bestStreakRef.current) bestStreakRef.current = streakRef.current
      setStreak(streakRef.current)
      setBestStreak(bestStreakRef.current)
      inputStepRef.current += 1
      setInputStep(inputStepRef.current)
      if (inputStepRef.current === seqRef.current.length) {
        levelRef.current += 1
        setLevel(levelRef.current)
        nextLevel()
      }
    } else {
      streakRef.current = 0
      setStreak(0)
      finish(pad)
    }
  }

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={() => restart()}
        share={{
          title: 'Zyprilo — Sequence Memory',
          text: `I completed a ${result.primaryDisplay} sequence in Sequence Memory (${grid}×${grid}) on ${new Date().toLocaleDateString()} — level ${level} reached. Play at Zyprilo!`,
        }}
      />
    )
  }

  const seqLen = seqLenForLevel(level)

  return (
    <>
      <div className="panel" style={{ padding: '1.1rem 1.35rem' }}>
        <ModeSelector
          label="Grid size"
          modes={GRIDS}
          format={(g) => `${g}×${g}`}
          selected={grid}
          onSelect={(g) => restart(g)}
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
            <span className="hud-value">
              {phase === 'input' ? `${inputStep}/${seqLen}` : seqLen}
            </span>
            <span className="hud-label">Steps</span>
          </div>
          <div className="hud-item">
            <span className="hud-value combo">{streak}</span>
            <span className="hud-label">Streak</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{bestStreak}</span>
            <span className="hud-label">Best streak</span>
          </div>
        </div>

        <div className="cta" style={{ flex: 1 }}>
          {phase === 'idle' ? (
            <>
              <ListOrdered size={40} className="cta-icon" aria-hidden="true" />
              <h2>Watch, remember, repeat</h2>
              <p>
                The {grid}×{grid} grid flashes a sequence that grows by one step every round. One
                wrong pad ends the run.
              </p>
              <button className="btn btn-primary" onClick={start}>
                <Play size={15} aria-hidden="true" /> Start
              </button>
            </>
          ) : (
            <>
              <p className="feedback dim" role="status" aria-live="polite">
                {phase === 'showing'
                  ? 'Watch the sequence…'
                  : wrongPad !== null
                    ? 'Wrong pad!'
                    : `Repeat it — step ${inputStep + 1} of ${seqLen}`}
              </p>
              <div
                className="mem-grid"
                style={{ gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))` }}
                role="application"
                aria-label={`Sequence pads on a ${grid} by ${grid} grid — repeat the flashing order`}
              >
                {Array.from({ length: grid * grid }, (_, i) => (
                  <button
                    key={i}
                    className={`mem-cell seq-pad${activePad === i ? ' lit' : ''}${
                      wrongPad === i ? ' wrong' : ''
                    }`}
                    onClick={() => clickPad(i)}
                    tabIndex={-1}
                    aria-label={`Pad ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
