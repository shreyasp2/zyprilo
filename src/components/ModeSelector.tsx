interface ModeSelectorProps<T extends string | number> {
  label: string
  modes: readonly T[]
  format: (mode: T) => string
  selected: T
  onSelect: (mode: T) => void
  disabled?: boolean
}

/** Pill row used to pick duration / difficulty before a run. */
export default function ModeSelector<T extends string | number>({
  label,
  modes,
  format,
  selected,
  onSelect,
  disabled = false,
}: ModeSelectorProps<T>) {
  return (
    <div className="mode-selector" role="group" aria-label={label}>
      <span className="mode-label">{label}</span>
      {modes.map((mode) => (
        <button
          key={String(mode)}
          className={`mode-btn${mode === selected ? ' active' : ''}`}
          onClick={() => onSelect(mode)}
          disabled={disabled}
          aria-pressed={mode === selected}
        >
          {format(mode)}
        </button>
      ))}
    </div>
  )
}
