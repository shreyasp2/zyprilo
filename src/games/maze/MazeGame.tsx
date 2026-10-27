import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from 'lucide-react'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { formatSeconds } from '../../lib/time'
import {
  EAST,
  generateMaze,
  isAtExit,
  move,
  NORTH,
  SOUTH,
  type Maze,
  type MazeCell,
  WEST,
} from './maze'

type Phase = 'idle' | 'running' | 'done'

const KEY_WALLS: Record<string, number> = {
  ArrowUp: NORTH,
  ArrowDown: SOUTH,
  ArrowLeft: WEST,
  ArrowRight: EAST,
  w: NORTH,
  s: SOUTH,
  a: WEST,
  d: EAST,
  W: NORTH,
  S: SOUTH,
  A: WEST,
  D: EAST,
}

const DIFFICULTY_LEVEL: Record<string, number> = { easy: 1, normal: 5, medium: 9, hard: 17 }

export default function MazeGame({ dailyConfig }: GameProps) {
  const [level, setLevel] = useState(() => {
    const d = dailyConfig?.difficulty
    return (d && DIFFICULTY_LEVEL[d]) || 1
  })
  const [maze, setMaze] = useState<Maze>(() =>
    generateMaze((dailyConfig?.difficulty && DIFFICULTY_LEVEL[dailyConfig.difficulty]) || 1),
  )
  const [pos, setPos] = useState<MazeCell>(maze.start)
  const [moves, setMoves] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const startedRef = useRef(false)
  const savedRef = useRef(false)

  useEffect(() => {
    if (phase !== 'running' || startedAt === null) return
    const iv = window.setInterval(() => setElapsed(Date.now() - startedAt), 100)
    return () => window.clearInterval(iv)
  }, [phase, startedAt])

  const finish = useCallback(() => {
    if (savedRef.current) return
    savedRef.current = true
    const totalMs = startedAt === null ? 0 : Date.now() - startedAt
    const res = createResult({
      gameId: 'maze',
      primaryLabel: `Time · Level ${maze.level}`,
      primaryValue: totalMs / 1000,
      primaryDisplay: formatSeconds(totalMs),
      better: 'lower',
      details: [
        { label: 'Moves', display: String(moves) },
        { label: 'Shortest path', display: String(maze.solutionLength) },
        { label: 'Maze', display: `${maze.cols}×${maze.rows}` },
      ],
    })
    saveResult(res)
    setResult(res)
    setPhase('done')
    setElapsed(totalMs)
  }, [maze.cols, maze.level, maze.rows, maze.solutionLength, moves, startedAt])

  const begin = useCallback(() => {
    if (!startedRef.current) {
      startedRef.current = true
      setStartedAt(Date.now())
      setPhase('running')
    }
  }, [])

  const step = useCallback(
    (wall: number) => {
      if (phase === 'done') return
      begin()
      setPos((cur) => {
        const next = move(maze, cur, wall)
        if (next === cur) return cur
        setMoves((m) => m + 1)
        if (isAtExit(maze, next)) finish()
        return next
      })
    },
    [begin, finish, maze, phase],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const wall = KEY_WALLS[e.key]
      if (wall === undefined) return
      e.preventDefault()
      step(wall)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const restart = useCallback(
    (nextLevel = level) => {
      const m = generateMaze(nextLevel)
      savedRef.current = false
      startedRef.current = false
      setLevel(nextLevel)
      setMaze(m)
      setPos(m.start)
      setMoves(0)
      setPhase('idle')
      setStartedAt(null)
      setElapsed(0)
      setResult(null)
    },
    [level],
  )

  const nextLevel = useCallback(() => restart(level + 1), [level, restart])

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={nextLevel}
        restartLabel="Next maze"
        share={{
          title: 'Zyprilo — Maze Infinite',
          text: `I escaped a Level ${maze.level} maze on Zyprilo in ${formatSeconds(elapsed)} with ${moves} moves. Play at Zyprilo!`,
        }}
      />
    )
  }

  const done = isAtExit(maze, pos)
  const cellPct = 100 / maze.cols
  const rowPct = 100 / maze.rows

  return (
    <>
      <div className="panel" style={{ padding: '1.1rem 1.35rem' }}>
        <div className="sudoku-topline">
          <span className="sudoku-level">Level {maze.level}</span>
          <span className="sudoku-clues">
            {maze.cols}×{maze.rows} maze · shortest path {maze.solutionLength}
          </span>
        </div>
        <div className="ws-wordlist" aria-label="Maze legend">
          <span className="ws-word">🟩 start</span>
          <span className="ws-word">🏁 exit</span>
          <span className="ws-word">🟦 you</span>
        </div>
      </div>

      <div className="arena panel maze-arena">
        <div className="hud" aria-live="off">
          <div className="hud-item">
            <span className="hud-value accent">{formatSeconds(elapsed)}</span>
            <span className="hud-label">Time</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{moves}</span>
            <span className="hud-label">Moves</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{maze.solutionLength}</span>
            <span className="hud-label">Optimal</span>
          </div>
          <div className="hud-item">
            <span className={`hud-value${done ? ' accent' : ''}`}>{done ? '🏁' : '—'}</span>
            <span className="hud-label">Exit</span>
          </div>
        </div>

        <div
          className="maze-grid"
          role="img"
          aria-label={`Maze, level ${maze.level}. You are at row ${pos.row + 1}, column ${pos.col + 1}.`}
          style={{
            gridTemplateColumns: `repeat(${maze.cols}, 1fr)`,
            gridTemplateRows: `repeat(${maze.rows}, 1fr)`,
          }}
        >
          {Array.from({ length: maze.rows * maze.cols }, (_, i) => {
            const r = Math.floor(i / maze.cols)
            const c = i % maze.cols
            const walls = maze.walls[r][c]
            const classes = ['maze-cell']
            if (r === maze.start.row && c === maze.start.col) classes.push('start')
            if (r === maze.exit.row && c === maze.exit.col) classes.push('exit')
            if (r === pos.row && c === pos.col) classes.push('player')
            if (!(walls & 1)) classes.push('open-n')
            if (!(walls & 2)) classes.push('open-e')
            if (!(walls & 4)) classes.push('open-s')
            if (!(walls & 8)) classes.push('open-w')
            return <span key={i} className={classes.join(' ')} style={{ width: `${cellPct}%`, height: `${rowPct}%` }} />
          })}
        </div>

        <div className="maze-pad">
          <span />
          <button type="button" className="maze-btn" onClick={() => step(NORTH)} aria-label="Move up">
            <ArrowUp size={20} aria-hidden="true" />
          </button>
          <span />
          <button type="button" className="maze-btn" onClick={() => step(WEST)} aria-label="Move left">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="maze-btn" onClick={() => step(SOUTH)} aria-label="Move down">
            <ArrowDown size={20} aria-hidden="true" />
          </button>
          <button type="button" className="maze-btn" onClick={() => step(EAST)} aria-label="Move right">
            <ArrowRight size={20} aria-hidden="true" />
          </button>
          <span />
          <button type="button" className="sudoku-tool maze-restart" onClick={() => restart()}>
            <RotateCcw size={15} aria-hidden="true" /> Restart maze
          </button>
        </div>
        <p className="feedback dim" style={{ textAlign: 'center' }}>
          {phase === 'idle'
            ? 'Arrows or WASD on desktop — tap the pad on mobile. The clock starts on your first move.'
            : done
              ? 'You reached the exit!'
              : `Reach the 🏁 — ${maze.solutionLength} moves is optimal.`}
        </p>
      </div>
    </>
  )
}
