export interface WpmSample {
  /** Seconds since the run started. */
  t: number
  wpm: number
}

/**
 * Small, readable WPM-over-time sparkline for the typing result screen.
 * Renders only with enough samples to be meaningful.
 */
export default function WpmGraph({ samples }: { samples: WpmSample[] }) {
  if (samples.length < 3) return null

  const width = 100
  const height = 38
  const pad = 2
  const maxT = Math.max(...samples.map((s) => s.t), 1)
  const maxW = Math.max(...samples.map((s) => s.wpm), 10)
  const minW = Math.min(...samples.map((s) => s.wpm), 0)
  const spanW = Math.max(1, maxW - minW)

  const pts = samples.map((s) => {
    const x = pad + (s.t / maxT) * (width - pad * 2)
    const y = height - pad - ((s.wpm - minW) / spanW) * (height - pad * 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <figure className="wpm-graph" aria-label="WPM over time">
      <figcaption>WPM over time</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-hidden="true"
      >
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="wpm-graph-axis">
        <span>{Math.round(minW)} WPM</span>
        <span>{Math.round(maxW)} WPM</span>
      </div>
    </figure>
  )
}
