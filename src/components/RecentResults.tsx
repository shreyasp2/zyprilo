import { useEffect, useState } from 'react'
import type { GameResult } from '../lib/results'
import { clearResults, formatRelativeTime, RESULT_EVENT, resultsForGame } from '../lib/results'

interface RecentResultsProps {
  gameId: string
}

/** "Recent runs" list shown under each game; reads the shared localStorage store. */
export default function RecentResults({ gameId }: RecentResultsProps) {
  const [results, setResults] = useState<GameResult[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const refresh = () => {
      setResults(resultsForGame(gameId))
      setNow(Date.now())
    }
    refresh()
    // A fresh result was just saved by this tab.
    window.addEventListener(RESULT_EVENT, refresh)
    // Another tab wrote to storage.
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(RESULT_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [gameId])

  // Relative timestamps ("2m ago") go stale while the panel sits open.
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(iv)
  }, [])

  const handleClear = () => {
    clearResults(gameId)
    setResults([])
  }

  return (
    <section className="recent panel" aria-label="Recent runs for this game">
      <h2>
        Recent runs
        {results.length > 0 && (
          <button className="link-clear" onClick={handleClear}>
            Clear history
          </button>
        )}
      </h2>
      {results.length === 0 ? (
        <p className="recent-empty">No runs yet — your last five attempts will appear here.</p>
      ) : (
        <ul className="recent-list">
          {results.slice(0, 5).map((r) => (
            <li className="recent-item" key={r.id}>
              <span className="recent-value">{r.primaryDisplay}</span>
              <span style={{ color: 'var(--text-dim)' }}>
                {r.details.map((d) => d.display).slice(0, 2).join(' · ')}
              </span>
              <span className="recent-when">{formatRelativeTime(r.playedAt, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
