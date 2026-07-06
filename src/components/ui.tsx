import { useEffect, useRef, useState, type ReactNode } from 'react'

// --- Collapsible section -----------------------------------------------------
export function Section({
  title,
  subtitle,
  right,
  defaultOpen = true,
  children,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section">
      <div className="section-head" onClick={() => setOpen((o) => !o)}>
        <span className={`chev ${open ? 'open' : ''}`}>▸</span>
        <div className="section-title">
          {title}
          {subtitle && <span className="section-sub">{subtitle}</span>}
        </div>
        <div className="section-right" onClick={(e) => e.stopPropagation()}>
          {right}
        </div>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

// --- Labelled number field ---------------------------------------------------
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  width,
}: {
  label?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  prefix?: string
  suffix?: string
  width?: number
}) {
  // Keep a local text buffer so the user can clear/retype without the value
  // snapping back mid-edit.
  const [buf, setBuf] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setBuf(String(value))
  }, [value])

  return (
    <label className="field" style={width ? { width } : undefined}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-input">
        {prefix && <span className="affix">{prefix}</span>}
        <input
          type="number"
          value={buf}
          min={min}
          max={max}
          step={step}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false
            let n = parseFloat(buf)
            if (isNaN(n)) n = value
            if (min !== undefined) n = Math.max(min, n)
            if (max !== undefined) n = Math.min(max, n)
            setBuf(String(n))
            onChange(n)
          }}
          onChange={(e) => {
            setBuf(e.target.value)
            const n = parseFloat(e.target.value)
            if (!isNaN(n)) onChange(n)
          }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </span>
    </label>
  )
}

// --- Slider with a live numeric readout --------------------------------------
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  format: (v: number) => string
}) {
  return (
    <label className="field slider-field">
      <span className="field-label">
        {label}
        <span className="slider-val">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  width,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  width?: number
}) {
  return (
    <label className="field" style={width ? { width } : undefined}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-input">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  width,
}: {
  label?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  width?: number
}) {
  return (
    <label className="field" style={width ? { width } : undefined}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-input">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}

export function IconButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button className="icon-btn" title={title} onClick={onClick} type="button">
      {children}
    </button>
  )
}
