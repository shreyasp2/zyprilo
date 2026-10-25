import { useEffect } from 'react'
import { Zap } from 'lucide-react'
import Home from './components/Home'
import GameScreen from './components/GameScreen'
import { goHome, useRoute } from './router'

export default function App() {
  const route = useRoute()

  // Hash navigation swaps the page content while the window keeps its old
  // scroll offset; the browser clamps that offset to the new (shorter) page,
  // landing game screens partway down. Reset to the top after the new screen
  // has committed — the passive effect below runs post-render, pre-paint.
  const routeKey = route.name === 'home' ? 'home' : `${route.gameId}:${route.daily ? 1 : 0}`
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [routeKey])

  // Keep the browser's hash-history restoration from racing the explicit
  // scroll above on back/forward navigation.
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  return (
    <>
      <header className="page" style={{ paddingBottom: 0, marginBottom: 0 }}>
        <div className="topbar">
          <button className="brand" onClick={goHome} aria-label="Zyprilo home">
            <span className="brand-mark" aria-hidden="true">
              <Zap size={19} strokeWidth={2.4} />
            </span>
            <span className="brand-text">
              <span className="brand-name">
                Zypr<span className="brand-accent">ilo</span>
              </span>
              <span className="brand-sub">Test your speed. Beat your best.</span>
            </span>
          </button>
        </div>
      </header>
      {route.name === 'home' ? (
        <Home />
      ) : (
        <GameScreen key={route.gameId} gameId={route.gameId} daily={route.daily} />
      )}
      <footer className="site-footer">
        Zyprilo — fourteen free speed &amp; reflex tests, no accounts, results stored only in your
        browser.
      </footer>
    </>
  )
}
