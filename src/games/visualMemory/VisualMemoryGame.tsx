import { useEffect, useRef, useState } from 'react'
import { LayoutGrid, Play } from 'lucide-react'
import ResultPanel from '../../components/ResultPanel'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { randomInt } from '../../lib/time'

type Phase = 'idle' | 'showing' | 'recall' | 'done'

const MAX_LIVES = 3
/** Pattern density grows with the level; the grid grows every two levels. */
const tilesForLevel = (level: number) => level + 2
const gridForLevel = (level: number) => Math.min(3 + Math.floor((level - 1) / 2), 7)
const showMsFor = (tiles: number) => 1200 + tiles * 220

function randomPattern(grid: number, tiles: number): number[] {
  const total = grid * grid
  const indices = Array.from({ length: total }, (_, i) => i)
  for (let i = total - 1; i > 0; i--) {
    const j = randomInt(0, i)
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices.slice(0, Math.min(tiles, total)).sort((a, b) => a - b)
}

export default function VisualMemoryGame() {
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(MAX_LIVES)
  const [grid, setGrid] = useState(3)
  const [pattern, setPattern] = useState<number[]>([])
  const [found, setFound] = useState<number[]>([])
  const [wrongCell, setWrongCell] = useState<number | null>(null)
  const [result, setResult] = useState<GameResult | null>(null)

  const phaseRef = useRef<Phase>('idle')
  const levelRef = useRef(1)
  const livesRef = useRef(MAX_LIVES)
  const patternRef = useRef<number[]>([])
  const foundRef = useRef<Set<number>>(new Set())
  const tilesClearedRef = useRef(0)
  const showTimeoutRef = useRef<number | null>(null)
  const wrongTimeoutRef = useRef<number | null>(null)
  const savedRef = useRef(false)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }

  const clearTimers = () => {
    if (showTimeoutRef.current !== null) {
      window.clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    if (wrongTimeoutRef.current !== null) {
      window.clearTimeout(wrongTimeoutRef.current)
      wrongTimeoutRef.current = null
    }
  }

  const restart = () => {
    clearTimers()
    savedRef.current = false
    levelRef.current = 1
    livesRef.current = MAX_LIVES
    patternRef.current = []
    foundRef.current = new Set()
    tilesClearedRef.current = 0
    setLevel(1)
    setLives(MAX_LIVES)
    setPattern([])
    setFound([])
    setWrongCell(null)
    setResult(null)
    setPhase('idle')
  }

  // Release pending timers when leaving the game.
  useEffect(() => () => clearTimers(), [])

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true
    clearTimers()
    const cleared = levelRef.current - 1
    const res = createResult({
      gameId: 'visual-memory',
      primaryLabel: 'Levels cleared',
      primaryValue: cleared,
      primaryDisplay: String(cleared),
      better: 'higher',
      details: [
        { label: 'Tiles recalled', display: String(tilesClearedRef.current) },
        {
          label: 'Grid reached',
          display: `${gridForLevel(levelRef.current)}×${gridForLevel(levelRef.current)}`,
        },
        { label: 'Lives left', display: '0' },
      ],
    })
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  const beginLevel = () => {
    const size = gridForLevel(levelRef.current)
    const tiles = tilesForLevel(levelRef.current)
    const pat = randomPattern(size, tiles)
    patternRef.current = pat
    foundRef.current = new Set()
    setGrid(size)
    setPattern(pat)
    setFound([])
    setWrongCell(null)
    setPhase('showing')
    clearTimers()
    showTimeoutRef.current = window.setTimeout(() => {
      setPhase('recall')
    }, showMsFor(tiles))
  }

  const start = () => {
    savedRef.current = false
    beginLevel()
  }

  const clickCell = (index: number) => {
    if (phaseRef.current !== 'recall') return
    if (patternRef.current.includes(index)) {
      if (foundRef.current.has(index)) return
      foundRef.current.add(index)
      tilesClearedRef.current += 1
      setFound([...foundRef.current].sort((a, b) => a - b))
      if (foundRef.current.size === patternRef.current.length) {
        levelRef.current += 1
        setLevel(levelRef.current)
        beginLevel()
      }
    } else {
      livesRef.current -= 1
      setLives(livesRef.current)
      setWrongCell(index)
      clearTimers()
      wrongTimeoutRef.current = window.setTimeout(() => setWrongCell(null), 380)
      if (livesRef.current <= 0) {
        finish()
      }
    }
  }

  if (phase === 'done' && result) {
    return <ResultPanel result={result} onRestart={restart} />
  }

  const tilesNeeded = tilesForLevel(level)

  return (
    <div className="arena panel">
      <div className="hud" aria-live="off">
        <div className="hud-item">
          <span className="hud-value accent">{level}</span>
          <span className="hud-label">Level</span>
        </div>
        <div className="hud-item">
          <span className="hud-value">
            {found.length}/{tilesNeeded}
          </span>
          <span className="hud-label">Tiles</span>
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
            <LayoutGrid size={40} className="cta-icon" aria-hidden="true" />
            <h2>Memorize the pattern</h2>
            <p>
              Tiles light up, then hide. Click them all from memory — grids grow every two levels,
              three lives total.
            </p>
            <button className="btn btn-primary" onClick={start}>
              <Play size={15} aria-hidden="true" /> Start
            </button>
          </>
        ) : (
          <>
            <p className="feedback dim" role="status" aria-live="polite">
              {phase === 'showing'
                ? `Memorize ${tilesNeeded} tiles…`
                : `Click the ${tilesNeeded - found.length} remaining tiles`}
            </p>
            <div
              className="mem-grid"
              style={{ gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))` }}
              role="application"
              aria-label={`Visual memory grid ${grid} by ${grid}`}
            >
              {Array.from({ length: grid * grid }, (_, i) => {
                const isPattern = pattern.includes(i)
                const isFound = found.includes(i)
                const isWrong = wrongCell === i
                const lit = phase === 'showing' && isPattern
                return (
                  <button
                    key={i}
                    className={`mem-cell${lit ? ' lit' : ''}${isFound ? ' found' : ''}${
                      isWrong ? ' wrong' : ''
                    }`}
                    onClick={() => clickCell(i)}
                    tabIndex={-1}
                    aria-label={`Cell ${i + 1}`}
                  />
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
