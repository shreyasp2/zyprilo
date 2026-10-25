import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { getGame } from '../games/registry'
import { formatRelativeTime, personalBest, RESULT_EVENT } from '../lib/results'

/**
 * Small personal-best line shown while a game is idle, so the record to beat
 * is visible before every run. Renders nothing until a result exists.
 */
export default function PersonalBestBadge({ gameId }: { gameId: string }) {
  const [best, setBest] = useState<ReturnType<typeof personalBest>>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const refresh = () => {
      const game = getGame(gameId)
      setBest(game ? personalBest(gameId, game.better) : null)
      setNow(Date.now())
    }
    refresh()
    window.addEventListener(RESULT_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(RESULT_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [gameId])

  if (!best) return null

  return (
    <p className="pb-line">
      <Trophy size={13} aria-hidden="true" /> Personal best:{' '}
      <strong>{best.primaryDisplay}</strong>
      <span className="pb-when"> · {formatRelativeTime(best.playedAt, now)}</span>
    </p>
  )
}
