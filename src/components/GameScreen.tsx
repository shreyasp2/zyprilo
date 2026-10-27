import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { CalendarCheck, ChevronLeft, RotateCcw } from 'lucide-react'
import { getGame, type GameId } from '../games/registry'
import useDocumentMeta from '../hooks/useDocumentMeta'
import { SITE } from '../site'
import { dailyConfig, localDateKey, recordDailyCompletion, type DailyGameConfig } from '../lib/daily'
import { RESULT_EVENT } from '../lib/results'
import { goHome } from '../router'
import PersonalBestBadge from './PersonalBestBadge'
import RecentResults from './RecentResults'
import TypingGame from '../games/typing/TypingGame'
import CpsGame from '../games/cps/CpsGame'
import SpacebarGame from '../games/spacebar/SpacebarGame'
import TypeTo100Game from '../games/oneToHundred/TypeTo100Game'
import ScrollGame from '../games/scroll/ScrollGame'
import ReactionGame from '../games/reaction/ReactionGame'
import KeyReactionGame from '../games/keyReaction/KeyReactionGame'
import MouseAccuracyGame from '../games/mouseAccuracy/MouseAccuracyGame'
import NumberMemoryGame from '../games/numberMemory/NumberMemoryGame'
import VisualMemoryGame from '../games/visualMemory/VisualMemoryGame'
import SequenceMemoryGame from '../games/sequenceMemory/SequenceMemoryGame'
import ColorReactionGame from '../games/colorReaction/ColorReactionGame'
import WordUnscrambleGame from '../games/wordUnscramble/WordUnscrambleGame'
import TypingAccuracyGame from '../games/typingAccuracy/TypingAccuracyGame'
import SudokuGame from '../games/sudoku/SudokuGame'
import WordSearchGame from '../games/wordSearch/WordSearchGame'
import MazeGame from '../games/maze/MazeGame'

export interface GameProps {
  /** Present when the run was entered as the official daily attempt. */
  dailyConfig?: DailyGameConfig & { date: string }
}

const GAME_COMPONENTS: Record<GameId, ComponentType<GameProps>> = {
  typing: TypingGame,
  cps: CpsGame,
  spacebar: SpacebarGame,
  'one-to-hundred': TypeTo100Game,
  scroll: ScrollGame,
  reaction: ReactionGame,
  'key-reaction': KeyReactionGame,
  'mouse-accuracy': MouseAccuracyGame,
  'number-memory': NumberMemoryGame,
  'visual-memory': VisualMemoryGame,
  'sequence-memory': SequenceMemoryGame,
  'color-reaction': ColorReactionGame,
  'word-unscramble': WordUnscrambleGame,
  'typing-accuracy': TypingAccuracyGame,
  sudoku: SudokuGame,
  'word-search': WordSearchGame,
  maze: MazeGame,
}

/**
 * Shared chrome for every game screen: header, accent theming, the game
 * itself, instructions and recent results. Owns the restart signal so the
 * header Restart button and each game's own restart stay in sync.
 */
export default function GameScreen({
  gameId,
  daily = false,
}: {
  gameId: string
  daily?: boolean
}) {
  const [resetSignal, setResetSignal] = useState(0)
  const game = getGame(gameId)

  // Unique per-game title/description + accurate structured data. The JSON-LD
  // object is memoized per game so the meta effect doesn't re-run on renders.
  const gameJsonLd = useMemo(
    () =>
      game
        ? {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: game.name,
            description: game.description,
            applicationCategory: 'GameApplication',
            operatingSystem: 'Web',
            browserRequirements: 'Requires JavaScript',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          }
        : undefined,
    [game],
  )
  useDocumentMeta({
    title: game ? `${game.name} — Free Online Game | ${SITE.name}` : SITE.name,
    description: game ? game.description : SITE.description,
    jsonLd: gameJsonLd,
  })

  // The daily configuration is captured when the screen mounts and never
  // changes mid-attempt, even if the calendar date rolls over.
  const dateKey = localDateKey()
  const dailyCfg = useMemo(() => {
    if (!daily || !game) return undefined
    const cfg = dailyConfig(game.id, dateKey)
    return cfg ? { ...cfg, date: dateKey } : undefined
    // Re-computed only when the route changes; dateKey is pinned per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, gameId])

  // An official daily attempt records the FIRST result saved during the run —
  // practice runs (entered without ?daily=1) never reach this listener.
  useEffect(() => {
    if (!dailyCfg) return
    const onResult = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && detail.gameId === gameId) {
        recordDailyCompletion({
          date: dailyCfg.date,
          gameId,
          resultId: String(detail.id),
          primaryDisplay: String(detail.primaryDisplay),
        })
      }
    }
    window.addEventListener(RESULT_EVENT, onResult)
    return () => window.removeEventListener(RESULT_EVENT, onResult)
  }, [dailyCfg, gameId])

  // Header Restart remounts the game without a route change; the fresh screen
  // should also start at the top, like a fresh navigation.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [resetSignal])

  if (!game) {
    return (
      <main className="page">
        <div className="arena panel">
          <div className="cta">
            <h2>Game not found</h2>
            <p>No game lives at this address. Head back home and pick a test.</p>
            <button className="btn btn-primary" onClick={goHome}>
              Back to home
            </button>
          </div>
        </div>
      </main>
    )
  }

  const Game = GAME_COMPONENTS[game.id]
  const Icon = game.icon

  return (
    <main
      className="page"
      style={
        {
          '--accent': game.accent,
          '--accent-soft': `color-mix(in srgb, ${game.accent} 14%, transparent)`,
          '--accent-glow': `color-mix(in srgb, ${game.accent} 35%, transparent)`,
        } as React.CSSProperties
      }
    >
      {dailyCfg && (
        <div className="daily-banner" role="note">
          <CalendarCheck size={16} aria-hidden="true" />
          <span>
            <strong>Daily Challenge</strong> · {dailyCfg.date}
            {dailyCfg.label ? ` · ${dailyCfg.label}` : ''} — this run counts as your official
            attempt. Practice runs are available from the game cards.
          </span>
        </div>
      )}
      <div className="game-head">
        <span className="game-head-icon" aria-hidden="true">
          <Icon size={24} strokeWidth={2.1} />
        </span>
        <div>
          <h1>{game.name}</h1>
          <p className="tagline">{game.tagline}</p>
        </div>
        <div className="game-head-actions">
          <button
            className="btn btn-ghost"
            onClick={() => setResetSignal((s) => s + 1)}
            title="Restart this test"
          >
            <RotateCcw size={15} aria-hidden="true" /> Restart
          </button>
          <button className="btn btn-ghost" onClick={goHome}>
            <ChevronLeft size={15} aria-hidden="true" /> Home
          </button>
        </div>
      </div>

      <PersonalBestBadge gameId={game.id} />

      <div className="game-body">
        <Game key={`${game.id}-${resetSignal}`} dailyConfig={dailyCfg} />
        <section className="howto panel" aria-label="How to play">
          <h2>How to play</h2>
          <ol>
            {game.howTo.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </section>
        <RecentResults gameId={game.id} />
      </div>
    </main>
  )
}
