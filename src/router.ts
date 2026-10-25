import { useEffect, useState } from 'react'

/**
 * Minimal hash router. Routes:
 *   #/                      -> home
 *   #/game/<id>             -> game screen
 *   #/game/<id>?daily=1     -> game screen as the official daily attempt
 * No dependency, survives refresh, works from a static file server.
 */

export type Route =
  | { name: 'home' }
  | { name: 'game'; gameId: string; daily: boolean }

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const [path, query] = clean.split('?')
  const parts = path.split('/').filter(Boolean)
  if (parts.length >= 2 && parts[0] === 'game') {
    const daily = new URLSearchParams(query ?? '').get('daily') === '1'
    return { name: 'game', gameId: parts[1], daily }
  }
  return { name: 'home' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export function navigate(to: '' | `game/${string}`): void {
  const next = to === '' ? '#/' : `#/${to}`
  if (window.location.hash === next) {
    // Same-target navigation still needs to trigger a re-render (e.g. restart).
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = next
  }
}

export function goHome(): void {
  navigate('')
}

export function openGame(gameId: string, opts?: { daily?: boolean }): void {
  navigate(`game/${gameId}${opts?.daily ? '?daily=1' : ''}`)
}
