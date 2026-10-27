import { useEffect, useState } from 'react'
import { Award, Lock, Trophy } from 'lucide-react'
import { PROGRESSION_EVENT, snapshotProgression, type ProgressionSnapshot } from '../lib/progression'
import { RESULT_EVENT } from '../lib/results'

/** Unified XP / level / achievements view shown on the home page. */
export default function ProgressPanel() {
  const [snap, setSnap] = useState<ProgressionSnapshot>(() => snapshotProgression())

  useEffect(() => {
    const refresh = () => setSnap(snapshotProgression())
    window.addEventListener(PROGRESSION_EVENT, refresh)
    window.addEventListener(RESULT_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(PROGRESSION_EVENT, refresh)
      window.removeEventListener(RESULT_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const pct = Math.min(100, Math.round((snap.intoLevel / snap.levelSpan) * 100))

  return (
    <section className="panel progress-panel" aria-label="Player progression">
      <div className="progress-head">
        <div className="progress-title">
          <Trophy size={17} aria-hidden="true" />
          <span>
            Level {snap.level} · {snap.rank}
          </span>
        </div>
        <span className="progress-xp">{snap.state.xp} XP</span>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Level progress: ${snap.intoLevel} of ${snap.levelSpan} XP`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-next">
        {snap.intoLevel} / {snap.levelSpan} XP to level {snap.level + 1} · {snap.totalRuns} run
        {snap.totalRuns === 1 ? '' : 's'} played
      </p>

      <div className="achievement-grid">
        {[...snap.unlocked, ...snap.locked].map((a) => {
          const isUnlocked = snap.unlocked.includes(a)
          return (
            <div key={a.id} className={`achievement${isUnlocked ? ' unlocked' : ''}`} title={a.description}>
              <span className="achievement-icon">
                {isUnlocked ? <Award size={15} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}
              </span>
              <span className="achievement-text">
                <strong>{a.name}</strong>
                <em>{a.description}</em>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
