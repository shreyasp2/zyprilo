import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, ChevronRight, Sparkles, Trophy } from 'lucide-react'
import { GAMES, getGame } from '../games/registry'
import useDocumentMeta from '../hooks/useDocumentMeta'
import { SITE } from '../site'
import {
  dailyConfig,
  dailyGameId,
  DAILY_VERSION,
  getDailyCompletion,
  localDateKey,
} from '../lib/daily'
import { loadResults, personalBest, RESULT_EVENT } from '../lib/results'

export default function Home() {
  // Homepage metadata; game screens set their own via GameScreen.
  const homeJsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE.name,
      description: SITE.description,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
      browserRequirements: 'Requires JavaScript',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    }),
    [],
  )
  useDocumentMeta({
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    jsonLd: homeJsonLd,
  })

  // Recompute summaries whenever a result is saved (this tab) or on return visit.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    window.addEventListener(RESULT_EVENT, bump)
    window.addEventListener('storage', bump)
    return () => {
      window.removeEventListener(RESULT_EVENT, bump)
      window.removeEventListener('storage', bump)
    }
  }, [])

  // The featured challenge is fixed for the local calendar date; captured at
  // mount so it never changes halfway through a visit.
  const [dateKey] = useState(() => localDateKey())
  const dailyId = useMemo(() => dailyGameId(dateKey), [dateKey])
  const dailyMeta = getGame(dailyId)
  const dailyCfg = useMemo(
    () => dailyConfig(dailyId, dateKey),
    [dailyId, dateKey],
  )
  const dailyDone = useMemo(
    () => getDailyCompletion(dateKey),
    // Refresh when results change so a fresh official attempt shows up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateKey, tick],
  )

  const bests = useMemo(
    () => GAMES.map((g) => personalBest(g.id, g.better)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  )
  const totalRuns = useMemo(() => loadResults().length, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="page">
      <section className="hero panel">
        <span className="hero-kicker">
          <Sparkles size={13} aria-hidden="true" /> {GAMES.length} tests · all local
        </span>
        <h1>
          Train your <em>reflexes</em>, measure your speed.
        </h1>
        <p>
          Fourteen focused mini-tests for typing, clicking, memory, color perception and reacting.
          Pick a card, set a record, beat it. Everything runs locally — your results never leave
          this browser.
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-value">{GAMES.length}</span>
            <span className="hero-stat-label">Games</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">{totalRuns}</span>
            <span className="hero-stat-label">Runs played</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">0 ms</span>
            <span className="hero-stat-label">Server latency</span>
          </div>
        </div>
      </section>

      {dailyMeta && (
        <section
          className="panel daily-card"
          style={{ '--card-accent': dailyMeta.accent } as React.CSSProperties}
          aria-label="Daily challenge"
        >
          <div className="daily-card-main">
            <span className="hero-kicker" style={{ marginBottom: 0 }}>
              <CalendarCheck size={13} aria-hidden="true" /> Daily Challenge · {dateKey}
            </span>
            <div className="daily-card-title">
              <span className="game-card-icon" aria-hidden="true">
                <dailyMeta.icon size={22} strokeWidth={2.1} />
              </span>
              <div>
                <h3 style={{ margin: 0 }}>{dailyMeta.name}</h3>
                <p className="tagline" style={{ margin: 0 }}>
                  {dailyCfg?.label || 'Standard mode'} · challenge v{DAILY_VERSION}
                </p>
              </div>
            </div>
            <p className="daily-card-desc">{dailyMeta.description}</p>
            <p className="daily-card-note">
              Everyone gets this same featured game today. Your official attempt is the first run
              you start here; practice runs from the game cards below never count.
            </p>
          </div>
          <div className="daily-card-side">
            {dailyDone ? (
              <div className="daily-done" role="status">
                <Trophy size={16} aria-hidden="true" />
                <div>
                  <strong>Completed today</strong>
                  <div>
                    {dailyDone.gameId === dailyId
                      ? `Your score: ${dailyDone.primaryDisplay}`
                      : `Recorded from an earlier challenge (${dailyDone.gameId})`}
                  </div>
                </div>
              </div>
            ) : (
              <a className="btn btn-primary" href={`#/game/${dailyId}?daily=1`}>
                <CalendarCheck size={15} aria-hidden="true" /> Start Challenge
              </a>
            )}
            {dailyDone && (
              <a className="btn btn-ghost" href={`#/game/${dailyId}?daily=1`}>
                View challenge
              </a>
            )}
          </div>
        </section>
      )}

      <h2
        style={{
          fontSize: '0.78rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--text-faint)',
          margin: '1.4rem 0 0.9rem',
        }}
      >
        Choose your test
      </h2>
      <div className="grid-games">
        {GAMES.map((game, i) => {
          const Icon = game.icon
          const best = bests[i]
          return (
            <a
              key={game.id}
              className="game-card"
              style={{ '--card-accent': game.accent } as React.CSSProperties}
              href={`#/game/${game.id}`}
            >
              <div className="game-card-top">
                <span className="game-card-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={2.1} />
                </span>
                {best && (
                  <span className="pill">
                    <Trophy size={11} aria-hidden="true" /> {best.primaryDisplay}
                  </span>
                )}
              </div>
              <div>
                <h3>{game.name}</h3>
                <p className="tagline">{game.tagline}</p>
              </div>
              <p className="desc">{game.description}</p>
              <div className="game-card-bottom">
                <span className="pill pill-accent">Play</span>
                <ChevronRight size={18} color="var(--text-faint)" aria-hidden="true" />
              </div>
            </a>
          )
        })}
      </div>
    </main>
  )
}
