import { useEffect, useRef, useState } from 'react'
import { Palette, Play } from 'lucide-react'
import ModeSelector from '../../components/ModeSelector'
import ResultPanel from '../../components/ResultPanel'
import type { GameProps } from '../../components/GameScreen'
import type { GameResult } from '../../lib/results'
import { createResult, saveResult } from '../../lib/results'
import { formatClock, now, randomInt } from '../../lib/time'

type Phase = 'idle' | 'running' | 'done'
type Mode = 15 | 30 | 60
type Difficulty = 'easy' | 'medium' | 'hard'

const MODES: readonly Mode[] = [15, 30, 60]
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']
const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

interface ColorDef {
  name: string
  hex: string
  /** WCAG-safe dark text for accessible chips. */
  symbol: string
}
const EASY_COLORS: ColorDef[] = [
  { name: 'RED', hex: '#f87171', symbol: '■' },
  { name: 'GREEN', hex: '#4ade80', symbol: '▲' },
  { name: 'BLUE', hex: '#60a5fa', symbol: '●' },
  { name: 'YELLOW', hex: '#facc15', symbol: '◆' },
]
const MEDIUM_COLORS = EASY_COLORS
const HARD_COLORS: ColorDef[] = [
  ...EASY_COLORS,
  { name: 'PURPLE', hex: '#a78bfa', symbol: '★' },
  { name: 'ORANGE', hex: '#fb923c', symbol: '⬟' },
]

type Rule = 'ink' | 'word'

interface Prompt {
  wordIdx: number
  inkIdx: number
  rule: Rule
  answerIdx: number
}

/** Module-level so randomness never runs inside the component body. */
function buildPrompt(
  colors: ColorDef[],
  difficulty: Difficulty,
): Prompt {
  const wordIdx = randomInt(0, colors.length - 1)
  let inkIdx = randomInt(0, colors.length - 1)
  const mismatchChance = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 0.5 : 0.85
  if (difficulty !== 'easy' && inkIdx === wordIdx && Math.random() < mismatchChance) {
    inkIdx = (inkIdx + 1 + randomInt(0, colors.length - 2)) % colors.length
  }
  // Hard occasionally inverts the rule — always announced explicitly.
  const rule: Rule =
    difficulty === 'hard' && Math.random() < 0.25 ? 'word' : 'ink'
  return { wordIdx, inkIdx, rule, answerIdx: rule === 'ink' ? inkIdx : wordIdx }
}

export default function ColorReactionGame({ dailyConfig }: GameProps) {
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
  const [accessible, setAccessible] = useState(false)
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [remaining, setRemaining] = useState(mode * 1000)
  const [correct, setCorrect] = useState(0)
  const [errors, setErrors] = useState(0)
  const [streak, setStreak] = useState(0)
  const [lastFeedback, setLastFeedback] = useState<'good' | 'bad' | null>(null)
  const [result, setResult] = useState<GameResult | null>(null)

  const phaseRef = useRef<Phase>('idle')
  const accessibleRef = useRef(accessible)
  const modeRef = useRef<Mode>(mode)
  const difficultyRef = useRef<Difficulty>(difficulty)
  const promptRef = useRef<Prompt | null>(null)
  const shownAtRef = useRef<number | null>(null)
  const deadlineRef = useRef<number | null>(null)
  const correctRtSumRef = useRef(0)
  const correctCountRef = useRef(0)
  const fastestRef = useRef<number | null>(null)
  const errorsRef = useRef(0)
  const streakRef = useRef(0)
  const bestStreakRef = useRef(0)
  const savedRef = useRef(false)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }

  const restart = (
    nextMode: Mode = modeRef.current,
    nextDifficulty: Difficulty = difficultyRef.current,
    nextAccessible = accessibleRef.current,
  ) => {
    savedRef.current = false
    modeRef.current = nextMode
    difficultyRef.current = nextDifficulty
    accessibleRef.current = nextAccessible
    setMode(nextMode)
    setDifficulty(nextDifficulty)
    setAccessible(nextAccessible)
    deadlineRef.current = null
    shownAtRef.current = null
    promptRef.current = null
    correctRtSumRef.current = 0
    correctCountRef.current = 0
    fastestRef.current = null
    errorsRef.current = 0
    streakRef.current = 0
    bestStreakRef.current = 0
    setPrompt(null)
    setRemaining(nextMode * 1000)
    setCorrect(0)
    setErrors(0)
    setStreak(0)
    setLastFeedback(null)
    setResult(null)
    setPhase('idle')
  }

  const colors =
    difficulty === 'hard' ? HARD_COLORS : difficulty === 'medium' ? MEDIUM_COLORS : EASY_COLORS

  const finish = () => {
    if (savedRef.current) return
    savedRef.current = true
    const totalCorrect = correctCountRef.current
    const avg = totalCorrect > 0 ? Math.round(correctRtSumRef.current / totalCorrect) : 0
    const attempts = totalCorrect + errorsRef.current
    const accuracy = attempts === 0 ? 100 : Math.round((totalCorrect / attempts) * 100)
    const res = createResult({
      gameId: 'color-reaction',
      primaryLabel: `Avg correct response · ${mode}s ${DIFF_LABEL[difficultyRef.current]}`,
      primaryValue: avg,
      primaryDisplay: `${avg} ms`,
      better: 'lower',
      details: [
        { label: 'Accuracy', display: `${accuracy}%` },
        { label: 'Correct', display: String(totalCorrect) },
        { label: 'Wrong answers', display: String(errorsRef.current) },
        { label: 'Best streak', display: String(bestStreakRef.current) },
        { label: 'Fastest', display: fastestRef.current !== null ? `${fastestRef.current} ms` : '—' },
      ],
    })
    saveResult(res)
    setResult(res)
    setPhase('done')
  }

  // Countdown starts the moment the run begins; ends scoring at zero.
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

  const nextPrompt = () => {
    const p = buildPrompt(colors, difficultyRef.current)
    promptRef.current = p
    setPrompt(p)
    shownAtRef.current = now()
    setLastFeedback(null)
  }

  const start = () => {
    if (savedRef.current) {
      // Coming from a finished run: full reset, then begin immediately.
      savedRef.current = false
      correctRtSumRef.current = 0
      correctCountRef.current = 0
      fastestRef.current = null
      errorsRef.current = 0
      streakRef.current = 0
      bestStreakRef.current = 0
      setCorrect(0)
      setErrors(0)
      setStreak(0)
      setResult(null)
    }
    deadlineRef.current = now() + modeRef.current * 1000
    setRemaining(modeRef.current * 1000)
    setPhase('running')
    nextPrompt()
  }

  const answer = (idx: number) => {
    if (phaseRef.current !== 'running' || shownAtRef.current === null || promptRef.current === null)
      return
    const rt = Math.max(0, Math.round(now() - shownAtRef.current))
    if (idx === promptRef.current.answerIdx) {
      correctCountRef.current += 1
      correctRtSumRef.current += rt
      if (fastestRef.current === null || rt < fastestRef.current) fastestRef.current = rt
      streakRef.current += 1
      if (streakRef.current > bestStreakRef.current) bestStreakRef.current = streakRef.current
      setCorrect(correctCountRef.current)
      setStreak(streakRef.current)
      setLastFeedback('good')
    } else {
      errorsRef.current += 1
      streakRef.current = 0
      setErrors(errorsRef.current)
      setStreak(0)
      setLastFeedback('bad')
    }
    if (deadlineRef.current !== null && now() >= deadlineRef.current) {
      finish()
    } else {
      nextPrompt()
    }
  }

  // Keyboard: number keys answer the chips in order.
  const answerRef = useRef(answer)
  useEffect(() => {
    answerRef.current = answer
  })
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (phaseRef.current !== 'running') return
      const n = Number(e.key)
      const maxKey = difficultyRef.current === 'hard' ? 6 : 4
      if (n >= 1 && n <= maxKey) {
        e.preventDefault()
        answerRef.current(n - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (phase === 'done' && result) {
    return (
      <ResultPanel
        result={result}
        onRestart={() => restart()}
        share={{
          title: 'Zyprilo — Color Reaction',
          text: `I averaged ${result.primaryDisplay} in Color Reaction (${mode}s, ${DIFF_LABEL[difficulty]}) on ${new Date().toLocaleDateString()} — ${correct} correct, ${errors} wrong. Play at Zyprilo!`,
        }}
      />
    )
  }

  const activeColors = colors
  const pct = Math.max(0, Math.min(1, remaining / (mode * 1000)))
  const attempts = correct + errors
  const liveAccuracy = attempts === 0 ? 100 : Math.round((correct / attempts) * 100)

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
        <ModeSelector
          label="Accessible"
          modes={['off', 'on'] as const}
          format={(v) => (v === 'on' ? 'High contrast' : 'Standard')}
          selected={accessible ? 'on' : 'off'}
          onSelect={(v) => restart(modeRef.current, difficultyRef.current, v === 'on')}
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
            <span className="hud-value">{correct}</span>
            <span className="hud-label">Correct</span>
          </div>
          <div className="hud-item">
            <span className="hud-value" style={{ color: errors > 0 ? 'var(--bad)' : undefined }}>
              {errors}
            </span>
            <span className="hud-label">Wrong</span>
          </div>
          <div className="hud-item">
            <span className="hud-value">{liveAccuracy}%</span>
            <span className="hud-label">Accuracy</span>
          </div>
          <div className="hud-item">
            <span className="hud-value combo">{streak}</span>
            <span className="hud-label">Streak</span>
          </div>
        </div>

        <div className="cta" style={{ flex: 1 }}>
          {phase === 'idle' ? (
            <>
              <Palette size={40} className="cta-icon" aria-hidden="true" />
              <h2>
                {mode}s · {DIFF_LABEL[difficulty]}
              </h2>
              <p>
                {difficulty === 'easy'
                  ? 'A color appears — click the matching button. The word always matches the swatch.'
                  : difficulty === 'medium'
                    ? 'Ignore the word — click the COLOR it is printed in.'
                    : 'Stroop with six colors, heavy word/ink conflicts — and watch for MATCH THE WORD prompts that invert the rule.'}
                {accessible
                  ? ' Accessible mode: high-contrast labeled chips with symbols.'
                  : ' Every chip is also text-labeled.'}
              </p>
              <button className="btn btn-primary" onClick={start}>
                <Play size={15} aria-hidden="true" /> Start
              </button>
            </>
          ) : (
            prompt && (
              <>
                <p
                  className={`rule-chip ${prompt.rule === 'word' ? 'rule-invert' : ''}`}
                  role="status"
                  aria-live="polite"
                >
                  {prompt.rule === 'word'
                    ? 'MATCH THE WORD (not the ink!)'
                    : 'MATCH THE INK COLOR'}
                </p>
                {difficulty === 'easy' ? (
                  <div
                    className="easy-swatch"
                    style={{
                      background: activeColors[prompt.inkIdx].hex,
                      boxShadow: `0 0 44px ${activeColors[prompt.inkIdx].hex}55`,
                    }}
                    role="img"
                    aria-label={`Select ${activeColors[prompt.inkIdx].name}`}
                  />
                ) : (
                  <div
                    className="stroop-word"
                    style={{
                      color: activeColors[prompt.inkIdx].hex,
                      textShadow: `0 0 44px ${activeColors[prompt.inkIdx].hex}55`,
                    }}
                    role="status"
                    aria-live="polite"
                    aria-label={`Word ${activeColors[prompt.wordIdx].name} printed in ${activeColors[prompt.inkIdx].name}`}
                  >
                    {activeColors[prompt.wordIdx].name}
                  </div>
                )}
                <p
                  className={`feedback ${lastFeedback === 'bad' ? 'bad' : lastFeedback === 'good' ? 'good' : 'dim'}`}
                  style={{ minHeight: '1.4em' }}
                >
                  {lastFeedback === 'bad'
                    ? 'Wrong color!'
                    : lastFeedback === 'good'
                      ? 'Correct!'
                      : difficulty === 'easy'
                        ? 'Click the matching color below'
                        : 'Click the ink color below'}
                </p>
                <div
                  className={`color-answers${accessible ? ' a11y-contrast' : ''}`}
                  role="group"
                  aria-label="Color answers"
                >
                  {activeColors.map((c, i) => (
                    <button
                      key={c.name}
                      className="color-btn"
                      style={{ background: c.hex, boxShadow: `0 4px 22px ${c.hex}44` }}
                      onClick={() => answer(i)}
                      aria-label={`${c.name} (key ${i + 1})`}
                    >
                      <span aria-hidden="true">{c.symbol}</span> {c.name}
                      <span className="color-btn-key">{i + 1}</span>
                    </button>
                  ))}
                </div>
              </>
            )
          )}
        </div>

        {phase === 'running' && (
          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${pct * 100}%` }} />
          </div>
        )}
      </div>
    </>
  )
}
