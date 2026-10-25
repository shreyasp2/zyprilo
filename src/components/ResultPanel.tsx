import { useMemo, useState, type ReactNode } from 'react'
import { Home, RotateCcw, Share2, Trophy } from 'lucide-react'
import type { GameResult } from '../lib/results'
import { formatRelativeTime, resultsForGame } from '../lib/results'
import { goHome } from '../router'

interface ResultPanelProps {
  result: GameResult
  onRestart: () => void
  /** Label for the primary action; defaults to "Play again". */
  restartLabel?: string
  /** Optional extra content rendered under the detail grid (e.g. a graph). */
  extra?: ReactNode
  /** When provided, shows a Share action for this exact result. */
  share?: { title: string; text: string }
  /** Badge text for official daily attempts. */
  dailyBadge?: string
}

/**
 * Consistent result screen shared by all games: primary metric, detail grid,
 * personal-best comparison with improvement delta, optional graph, share and
 * restart actions. Results are frozen once shown; only the explicit restart
 * button starts a new run.
 */
export default function ResultPanel({
  result,
  onRestart,
  restartLabel = 'Play again',
  extra,
  share,
  dailyBadge,
}: ResultPanelProps) {
  // Computed synchronously from storage per result id — no cascading renders.
  const bestBefore = useMemo(() => {
    const prior = resultsForGame(result.gameId).filter((r) => r.id !== result.id)
    return prior.reduce<GameResult | null>((acc, r) => {
      if (!acc) return r
      const rBetter =
        result.better === 'higher'
          ? r.primaryValue > acc.primaryValue
          : r.primaryValue < acc.primaryValue
      return rBetter ? r : acc
    }, null)
    // Storage was written before this panel mounts; result.id pins the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.id])

  const isPersonalBest =
    !bestBefore ||
    (result.better === 'higher'
      ? result.primaryValue >= bestBefore.primaryValue
      : result.primaryValue <= bestBefore.primaryValue)
  const beatRecord =
    !!bestBefore &&
    (result.better === 'higher'
      ? result.primaryValue > bestBefore.primaryValue
      : result.primaryValue < bestBefore.primaryValue)

  // Signed delta in the metric's own units; positive always means improvement.
  const delta =
    bestBefore === null
      ? null
      : result.better === 'higher'
        ? result.primaryValue - bestBefore.primaryValue
        : bestBefore.primaryValue - result.primaryValue
  const deltaAbs = delta === null ? 0 : Math.abs(delta)
  const deltaText =
    delta === null || deltaAbs < 1e-9
      ? 'matches previous best'
      : `${delta > 0 ? '▲' : '▼'} ${delta > 0 ? '+' : '−'}${Number(deltaAbs.toFixed(2))} vs previous best`

  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyViaExecCommand = (text: string) => {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      document.execCommand('copy')
    } catch {
      // Ignore — the caller reports the failure.
    }
    document.body.removeChild(area)
  }
  const handleShare = async () => {
    if (!share) return
    const text = `${share.title}\n${share.text}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: share.title, text: share.text })
        setShareState('copied')
        return
      }
      await navigator.clipboard.writeText(text)
      setShareState('copied')
    } catch {
      try {
        await navigator.clipboard.writeText(text)
        setShareState('copied')
      } catch {
        copyViaExecCommand(text)
        setShareState('copied')
      }
    }
    window.setTimeout(() => setShareState('idle'), 2500)
  }

  return (
    <section className="result-panel panel" role="status" aria-live="polite">
      {dailyBadge && (
        <span className="result-badge daily-badge" style={{ marginBottom: '-0.6rem' }}>
          {dailyBadge}
        </span>
      )}
      <span className={`result-badge${beatRecord ? ' new-best' : ''}`}>
        {beatRecord ? (
          <>
            <Trophy size={13} aria-hidden="true" /> New personal best
          </>
        ) : isPersonalBest ? (
          'First result recorded'
        ) : (
          'Run complete'
        )}
      </span>
      <div>
        <div className="result-primary-value">{result.primaryDisplay}</div>
        <div className="result-primary-label">{result.primaryLabel}</div>
      </div>
      {result.details.length > 0 && (
        <div className="result-details">
          {result.details.map((d) => (
            <div className="result-detail" key={d.label}>
              <span className="result-detail-value">{d.display}</span>
              <span className="result-detail-label">{d.label}</span>
            </div>
          ))}
          {bestBefore && (
            <div className="result-detail">
              <span className="result-detail-value">{bestBefore.primaryDisplay}</span>
              <span className="result-detail-label">
                Previous best · {formatRelativeTime(bestBefore.playedAt)}
              </span>
              <span className={`result-delta ${delta !== null && delta > 0 ? 'up' : delta !== null && delta < 0 ? 'down' : ''}`}>
                {deltaText}
              </span>
            </div>
          )}
        </div>
      )}
      {extra}
      <div className="result-actions">
        <button className="btn btn-primary" onClick={onRestart}>
          <RotateCcw size={15} aria-hidden="true" /> {restartLabel}
        </button>
        <button className="btn" onClick={goHome}>
          <Home size={15} aria-hidden="true" /> All games
        </button>
        {share && (
          <button className="btn btn-ghost" onClick={handleShare}>
            <Share2 size={15} aria-hidden="true" />
            {shareState === 'copied' ? 'Copied!' : shareState === 'failed' ? 'Copy failed' : 'Share'}
          </button>
        )}
      </div>
    </section>
  )
}
