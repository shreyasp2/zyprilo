import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Lightbulb, RotateCcw } from 'lucide-react'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { formatSeconds } from '../../lib/time'
import {
  findSelectionMatch,
  generateWordSearch,
  gridSizeForLevel,
  isStraightLine,
  placementCells,
  type Cell,
  type WordSearchPuzzle,
} from './wordSearch'
import { pickPack } from './wordPacks'

type Phase = 'idle' | 'running' | 'done'

const DIFFICULTY_LEVEL: Record<string, number> = { easy: 1, normal: 4, medium: 7, hard: 14 }

export default function WordSearchGame({ dailyConfig }: GameProps) {
  const [level, setLevel] = useState(() => {
    const d = dailyConfig?.difficulty
    return (d && DIFFICULTY_LEVEL[d]) || 1
  })
  const [puzzle, setPuzzle] = useState<WordSearchPuzzle>(() =>
    generateWordSearch(
      (dailyConfig?.difficulty && DIFFICULTY_LEVEL[dailyConfig.difficulty]) || 1,
      pickPack((dailyConfig?.difficulty && DIFFICULTY_LEVEL[dailyConfig.difficulty]) || 1).words,
      pickPack((dailyConfig?.difficulty && DIFFICULTY_LEVEL[dailyConfig.difficulty]) || 1).name,
    ),
  )
  const [found, setFound] = useState<string[]>([])
  const [hints, setHints] = useState(0)
  const [hintCells, setHintCells] = useState<Cell[]>([])
  const [dragStart, setDragStart] = useState<Cell | null>(null)
  const [dragEnd, setDragEnd] = useState<Cell | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const draggingRef = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const savedRef = useRef(false)

  useEffect(() => {
    if (phase !== 'running' || startedAt === null) return
    const iv = window.setInterval(() => setElapsed(Date.now() - startedAt), 100)
    return () => window.clearInterval(iv)
  }, [phase, startedAt])

  const foundCells = useMemo(() => {
    const cells = new Set<string>()
    for (const label of found) {
      const placement = puzzle.placements.find((p) => p.label === label)
      if (!placement) continue
      for (const c of placementCells(placement)) cells.add(`${c.row}:${c.col}`)
    }
    return cells
  }, [found, puzzle.placements])

  const finish = useCallback(
    (finalFound: string[]) => {
      if (savedRef.current) return
      savedRef.current = true
      const totalMs = startedAt === null ? 0 : Date.now() - startedAt
      const res = createResult({
        gameId: 'word-search',
        primaryLabel: `Time · Level ${puzzle.level}`,
        primaryValue: totalMs / 1000,
        primaryDisplay: formatSeconds(totalMs),
        better: 'lower',
        details: [
          { label: 'Words', display: String(finalFound.length) },
          { label: 'Grid', display: `${puzzle.size}×${puzzle.size}` },
          { label: 'Pack', display: puzzle.pack },
          { label: 'Hints', display: String(hints) },
        ],
      })
      saveResult(res)
      setResult(res)
      setPhase('done')
      setElapsed(totalMs)
    },
    [hints, puzzle.level, puzzle.pack, puzzle.size, startedAt],
  )

  const begin = useCallback(() => {
    if (phase === 'idle') {
      setStartedAt(Date.now())
      setPhase('running')
    }
  }, [phase])

  const cellFromEvent = useCallback(
    (x: number, y: number): Cell | null => {
      const board = gridRef.current
      if (!board) return null
      const el = document.elementFromPoint(x, y)
      if (!el || !board.contains(el)) return null
      const idx = (el as HTMLElement).dataset.cell
      if (idx === undefined) return null
      const [row, col] = idx.split(':').map(Number)
      return { row, col }
    },
    [],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phase === 'done') return
      const cell = cellFromEvent(e.clientX, e.clientY)
      if (!cell) return
      begin()
      draggingRef.current = true
      setDragStart(cell)
      setDragEnd(cell)
    },
    [begin, cellFromEvent, phase],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || !dragStart || phase === 'done') return
      const cell = cellFromEvent(e.clientX, e.clientY)
      if (cell && isStraightLine(dragStart, cell)) setDragEnd(cell)
    },
    [cellFromEvent, dragStart, phase],
  )

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current || !dragStart || !dragEnd || phase === 'done') {
      draggingRef.current = false
      setDragStart(null)
      setDragEnd(null)
      return
    }
    draggingRef.current = false
    const match = findSelectionMatch(puzzle, dragStart, dragEnd)
    setDragStart(null)
    setDragEnd(null)
    if (match && !found.includes(match.label)) {
      const next = [...found, match.label]
      setFound(next)
      if (next.length === puzzle.placements.length) finish(next)
    }
  }, [dragEnd, dragStart, finish, found, phase, puzzle])

  const hint = useCallback(() => {
    if (phase === 'done') return
    begin()
    const remaining = puzzle.placements.filter((p) => !found.includes(p.label))
    if (remaining.length === 0) return
    const placement = remaining[Math.floor(Math.random() * remaining.length)]
    const cells = placementCells(placement)
    setHintCells(cells.slice(0, Math.max(2, Math.ceil(cells.length / 3))))
    setHints((h) => h + 1)
    window.setTimeout(() => setHintCells([]), 2000)
  }, [begin, phase, puzzle.placements, found])

  const nextPuzzle = useCallback(
    (nextLevel: number) => {
      const pack = pickPack(nextLevel)
      const p = generateWordSearch(nextLevel, pack.words, pack.name)
      savedRef.current = false
      setLevel(nextLevel)
      setPuzzle(p)
      setFound([])
      setHints(0)
      setHintCells([])
      setDragStart(null)
      setDragEnd(null)
      setPhase('idle')
      setStartedAt(null)
      setElapsed(0)
      setResult(null)
    },
    [],
  )

  const restart = useCallback(() => nextPuzzle(level), [level, nextPuzzle])

  const selectionCells = (() => {
    if (!dragStart || !dragEnd || !isStraightLine(dragStart, dragEnd)) return new Set<string>()
    const cells = new Set<string>()
    const dr = Math.sign(dragEnd.row - dragStart.row)
    const dc = Math.sign(dragEnd.col - dragStart.col)
    const len = Math.max(Math.abs(dragEnd.row - dragStart.row), Math.abs(dragEnd.col - dragStart.col)) + 1
    for (let i = 0; i < len; i++) {
      cells.add(`${dragStart.row + dr * i}:${dragStart.col + dc * i}`)
    }
    return cells
  })()

  const hintCellSet = new Set(hintCells.map((c) => `${c.row}:${c.col}`))

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={() => nextPuzzle(level + 1)}
        restartLabel="Next puzzle"
        share={{
          title: 'Zyprilo — Word Search Infinite',
          text: `I completed a Level ${puzzle.level} ${puzzle.size}×${puzzle.size} Word Search (${puzzle.pack} pack) on Zyprilo in ${formatSeconds(elapsed)}. Play at Zyprilo!`,
        }}
      />
    )
  }

  const remaining = puzzle.placements.length - found.length
  const levelLabel = `Level ${level} · ${gridSizeForLevel(level)}×${gridSizeForLevel(level)} · ${puzzle.pack}`

  return (
    <>
      <div className="panel" style={{ padding: '1.1rem 1.35rem' }}>
        <div className="sudoku-topline">
          <span className="sudoku-level">{levelLabel}</span>
        </div>
        <div className="ws-wordlist" aria-label="Words to find">
          {puzzle.targets.map((label) => {
            const isFound = found.includes(label)
            return (
              <span key={label} className={`ws-word${isFound ? ' found' : ''}`}>
                {label}
              </span>
            )
          })}
        </div>
      </div>

      <div className="arena panel ws-arena">
        <div className="hud" aria-live="off">
          <div className="hud-item">
            <span className="hud-value accent">{formatSeconds(elapsed)}</span>
            <span className="hud-label">Time</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{found.length}</span>
            <span className="hud-label">Found</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{remaining}</span>
            <span className="hud-label">Remaining</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{hints}</span>
            <span className="hud-label">Hints</span>
          </div>
        </div>

        <div
          ref={gridRef}
          className="ws-grid"
          style={{ '--ws-size': puzzle.size } as React.CSSProperties}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {puzzle.grid.map((row, r) =>
            row.map((letter, c) => {
              const key = `${r}:${c}`
              const classes = ['ws-cell']
              if (foundCells.has(key)) classes.push('found')
              if (hintCellSet.has(key)) classes.push('hint')
              if (selectionCells.has(key)) classes.push('selecting')
              return (
                <span key={key} className={classes.join(' ')} data-cell={key} role="gridcell">
                  {letter}
                </span>
              )
            }),
          )}
        </div>

        <div className="sudoku-tools">
          <button type="button" className="sudoku-tool" onClick={hint}>
            <Lightbulb size={15} aria-hidden="true" /> Hint
          </button>
          <button type="button" className="sudoku-tool" onClick={restart}>
            <RotateCcw size={15} aria-hidden="true" /> Restart
          </button>
        </div>
        <p className="feedback dim" style={{ textAlign: 'center' }}>
          {phase === 'idle'
            ? 'Drag across the letters to mark a word. The clock starts on your first drag.'
            : `${remaining} word${remaining === 1 ? '' : 's'} to go — drag in any straight direction.`}
        </p>
      </div>
    </>
  )
}
