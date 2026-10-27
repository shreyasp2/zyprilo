import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, Lightbulb, RotateCcw, Undo2 } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { formatSeconds } from '../../lib/time'
import {
  clueTargetForLevel,
  generateSudoku,
  isSolved,
  type SudokuGrid,
  type SudokuPuzzle,
} from './sudoku'

type Phase = 'idle' | 'running' | 'done'

interface UndoEntry {
  cell: number
  prevValue: number
  prevNotes: number[]
}

const DIFFICULTY_LEVEL: Record<string, number> = { easy: 1, normal: 4, medium: 6, hard: 12 }

export default function SudokuGame({ dailyConfig }: GameProps) {
  const [level, setLevel] = useState(() => {
    const d = dailyConfig?.difficulty
    return (d && DIFFICULTY_LEVEL[d]) || 1
  })
  const [puzzle, setPuzzle] = useState<SudokuPuzzle>(() =>
    generateSudoku((dailyConfig?.difficulty && DIFFICULTY_LEVEL[dailyConfig.difficulty]) || 1),
  )
  const [values, setValues] = useState<SudokuGrid>(puzzle.grid.slice())
  const [notes, setNotes] = useState<number[][]>(() => Array.from({ length: 81 }, () => []))
  const [selected, setSelected] = useState<number | null>(null)
  const [noteMode, setNoteMode] = useState(false)
  const [mistakes, setMistakes] = useState(0)
  const [hints, setHints] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const savedRef = useRef(false)

  const given = useMemo(() => puzzle.grid.map((v) => v !== 0), [puzzle])
  const wrong = useMemo(() => {
    const set = new Set<number>()
    for (let i = 0; i < 81; i++) {
      if (values[i] !== 0 && values[i] !== puzzle.solution[i]) set.add(i)
    }
    return set
  }, [values, puzzle.solution])

  // Countdown while running.
  useEffect(() => {
    if (phase !== 'running' || startedAt === null) return
    const iv = window.setInterval(() => setElapsed(Date.now() - startedAt), 100)
    return () => window.clearInterval(iv)
  }, [phase, startedAt])

  const finish = useCallback(
    (finalValues: SudokuGrid) => {
      if (savedRef.current) return
      savedRef.current = true
      const totalMs = startedAt === null ? 0 : Date.now() - startedAt
      const res = createResult({
        gameId: 'sudoku',
        primaryLabel: `Time · Level ${puzzle.level}`,
        primaryValue: totalMs / 1000,
        primaryDisplay: formatSeconds(totalMs),
        better: 'lower',
        details: [
          { label: 'Mistakes', display: String(mistakes) },
          { label: 'Hints', display: String(hints) },
          { label: 'Clues', display: String(puzzle.clues) },
        ],
      })
      saveResult(res)
      setResult(res)
      setPhase('done')
      setElapsed(totalMs)
      void finalValues
    },
    [hints, mistakes, puzzle.clues, puzzle.level, startedAt],
  )

  const begin = useCallback(() => {
    if (phase === 'idle') {
      setStartedAt(Date.now())
      setPhase('running')
    }
  }, [phase])

  const place = useCallback(
    (cell: number, value: number) => {
      if (given[cell] || phase === 'done') return
      begin()
      if (noteMode && value !== 0) {
        setNotes((prev) => {
          const next = prev.map((n) => n.slice())
          const cur = next[cell]
          next[cell] = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value].sort()
          setUndoStack((stack) => [...stack, { cell, prevValue: values[cell], prevNotes: cur }])
          return next
        })
        return
      }
      setUndoStack((stack) => [...stack, { cell, prevValue: values[cell], prevNotes: notes[cell] }])
      if (value !== 0 && value !== puzzle.solution[cell] && values[cell] !== value) {
        setMistakes((m) => m + 1)
      }
      setValues((prev) => {
        const next = prev.slice()
        next[cell] = value
        if (isSolved(next, puzzle.solution)) finish(next)
        return next
      })
    },
    [begin, finish, given, noteMode, notes, phase, puzzle.solution, values],
  )

  const erase = useCallback(
    (cell: number) => {
      if (given[cell] || phase === 'done' || values[cell] === 0) return
      setUndoStack((stack) => [...stack, { cell, prevValue: values[cell], prevNotes: notes[cell] }])
      setValues((prev) => {
        const next = prev.slice()
        next[cell] = 0
        return next
      })
    },
    [given, notes, phase, values],
  )

  const undo = useCallback(() => {
    const entry = undoStack[undoStack.length - 1]
    if (!entry) return
    setUndoStack((stack) => stack.slice(0, -1))
    setValues((prev) => {
      const next = prev.slice()
      next[entry.cell] = entry.prevValue
      return next
    })
    setNotes((prev) => {
      const next = prev.map((n) => n.slice())
      next[entry.cell] = entry.prevNotes
      return next
    })
  }, [undoStack])

  const hint = useCallback(() => {
    if (phase === 'done') return
    begin()
    const empties: number[] = []
    for (let i = 0; i < 81; i++) {
      if (!given[i] && values[i] !== puzzle.solution[i]) empties.push(i)
    }
    if (empties.length === 0) return
    const cell = empties[Math.floor(Math.random() * empties.length)]
    setHints((h) => h + 1)
    setUndoStack((stack) => [...stack, { cell, prevValue: values[cell], prevNotes: notes[cell] }])
    setValues((prev) => {
      const next = prev.slice()
      next[cell] = puzzle.solution[cell]
      if (isSolved(next, puzzle.solution)) finish(next)
      return next
    })
  }, [begin, finish, given, notes, phase, puzzle.solution, values])

  const nextPuzzle = useCallback(
    (nextLevel: number) => {
      const p = generateSudoku(nextLevel)
      setUndoStack([])
      savedRef.current = false
      setLevel(nextLevel)
      setPuzzle(p)
      setValues(p.grid.slice())
      setNotes(Array.from({ length: 81 }, () => []))
      setSelected(null)
      setMistakes(0)
      setHints(0)
      setPhase('idle')
      setStartedAt(null)
      setElapsed(0)
      setResult(null)
    },
    [],
  )

  const restart = useCallback(() => nextPuzzle(level), [level, nextPuzzle])

  // Keyboard: arrows move, digits place, 0/Backspace erase, U undo, H hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'done') return
      const arrow = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key]
      if (arrow !== undefined) {
        e.preventDefault()
        setSelected((cur) => {
          const from = cur ?? 40
          const target = from + arrow
          if (target < 0 || target > 80) return from
          if ((arrow === -1 || arrow === 1) && Math.floor(target / 9) !== Math.floor(from / 9)) return from
          return target
        })
        return
      }
      if (e.key >= '1' && e.key <= '9') {
        if (selected !== null) place(selected, Number(e.key))
        return
      }
      if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
        if (selected !== null) erase(selected)
        return
      }
      if (e.key === 'u' || e.key === 'U') undo()
      if (e.key === 'h' || e.key === 'H') hint()
      if (e.key === 'n' || e.key === 'N') setNoteMode((n) => !n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [erase, hint, phase, place, selected, undo])

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={() => nextPuzzle(level + 1)}
        restartLabel="Next puzzle"
        share={{
          title: 'Zyprilo — Sudoku Infinite',
          text: `I solved a Level ${puzzle.level} Sudoku on Zyprilo in ${formatSeconds(elapsed)} with ${mistakes} mistakes. Play at Zyprilo!`,
        }}
      />
    )
  }

  const selRow = selected !== null ? Math.floor(selected / 9) : -1
  const selCol = selected !== null ? selected % 9 : -1
  const selValue = selected !== null ? values[selected] : 0
  const cluesLabel = `${puzzle.clues} clues · target ${clueTargetForLevel(level)}`

  return (
    <>
      <div className="panel" style={{ padding: '1.1rem 1.35rem' }}>
        <div className="sudoku-topline">
          <span className="sudoku-level">Level {level}</span>
          <span className="sudoku-clues">{cluesLabel}</span>
        </div>
        <ModeSelector
          label="Difficulty"
          modes={['warm-up', 'classic', 'tough', 'expert']}
          format={(m) => m}
          selected={
            level <= 2 ? 'warm-up' : level <= 6 ? 'classic' : level <= 14 ? 'tough' : 'expert'
          }
          onSelect={(m) => {
            const map: Record<string, number> = { 'warm-up': 1, classic: 4, tough: 10, expert: 20 }
            nextPuzzle(map[m] ?? level)
          }}
          disabled={phase === 'running'}
        />
      </div>

      <div className="arena panel sudoku-arena">
        <div className="hud" aria-live="off">
          <div className="hud-item">
            <span className="hud-value accent">{formatSeconds(elapsed)}</span>
            <span className="hud-label">Time</span>
          </div>
          <div className="hud-item">
            <span className={`hud-value${mistakes > 0 ? ' accent' : ''}`}>{mistakes}</span>
            <span className="hud-label">Mistakes</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{hints}</span>
            <span className="hud-label">Hints</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{noteMode ? 'on' : 'off'}</span>
            <span className="hud-label">Notes</span>
          </div>
        </div>

        <div className="sudoku-board" role="grid" aria-label="Sudoku board">
          {values.map((value, i) => {
            const row = Math.floor(i / 9)
            const col = i % 9
            const classes = ['sudoku-cell']
            if (given[i]) classes.push('given')
            if (selected === i) classes.push('selected')
            if (wrong.has(i)) classes.push('wrong')
            if (value === 0 && notes[i].length > 0) classes.push('notes')
            if (selRow === Math.floor(i / 9) || selCol === i % 9) classes.push('peer')
            if (
              selValue !== 0 &&
              value === selValue &&
              selected !== i
            )
              classes.push('same')
            if (col % 3 === 0) classes.push('block-left')
            if (row % 3 === 0) classes.push('block-top')
            return (
              <button
                type="button"
                key={i}
                className={classes.join(' ')}
                onClick={() => setSelected(i)}
                aria-label={`Row ${row + 1} column ${col + 1}${value ? `, ${value}` : ', empty'}`}
              >
                {value !== 0 ? (
                  <span>{value}</span>
                ) : notes[i].length > 0 ? (
                  <span className="sudoku-notes">
                    {Array.from({ length: 9 }, (_, n) => (
                      <i key={n}>{notes[i].includes(n + 1) ? n + 1 : ''}</i>
                    ))}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="sudoku-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              type="button"
              key={n}
              className="sudoku-num"
              onClick={() => selected !== null && place(selected, n)}
              disabled={selected === null}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="sudoku-tools">
          <button
            type="button"
            className="sudoku-tool"
            onClick={() => setNoteMode(!noteMode)}
            aria-pressed={noteMode}
          >
            {noteMode ? 'Notes: ON' : 'Notes: OFF'}
          </button>
          <button type="button" className="sudoku-tool" onClick={undo} disabled={undoStack.length === 0}>
            <Undo2 size={15} aria-hidden="true" /> Undo
          </button>
          <button type="button" className="sudoku-tool" onClick={() => selected !== null && erase(selected)} disabled={selected === null}>
            <Eraser size={15} aria-hidden="true" /> Erase
          </button>
          <button type="button" className="sudoku-tool" onClick={hint}>
            <Lightbulb size={15} aria-hidden="true" /> Hint
          </button>
          <button type="button" className="sudoku-tool" onClick={restart}>
            <RotateCcw size={15} aria-hidden="true" /> Restart
          </button>
        </div>
        <p className="feedback dim" style={{ textAlign: 'center' }}>
          {phase === 'idle'
            ? 'Tap a cell, then a number. The clock starts on your first entry.'
            : `Level ${level} — fill the grid. Wrong entries turn red and count as mistakes.`}
        </p>
      </div>
    </>
  )
}
