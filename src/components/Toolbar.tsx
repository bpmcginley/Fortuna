import { useRef } from 'react'
import { useStore } from '../state/store'
import { PRESETS, seedDefault } from '../state/scenario'
import type { Scenario } from '../engine/types'

export function Toolbar() {
  const { scenario, dispatch, saveCurrent, saved } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${scenario.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'fortuna'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Scenario
        if (!parsed.accounts || !Array.isArray(parsed.accounts)) throw new Error('not a Fortuna scenario')
        dispatch({ type: 'load', scenario: parsed })
      } catch (e) {
        alert(`Could not import: ${e instanceof Error ? e.message : e}`)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="toolbar">
      <div className="brand">
        <span className="logo">◈</span>
        <div>
          <div className="brand-name">Fortuna</div>
          <div className="brand-tag">financial future simulator</div>
        </div>
      </div>

      <div className="presets">
        <span className="presets-label">Start from:</span>
        {PRESETS.map((p) => (
          <button key={p.key} className="preset-btn" title={p.blurb} onClick={() => dispatch({ type: 'load', scenario: p.build() })}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="toolbar-actions">
        <button className="primary" onClick={saveCurrent} title="Snapshot this scenario to overlay on the chart">
          ★ Save to compare{saved.length ? ` (${saved.length})` : ''}
        </button>
        <button onClick={exportJson}>Export</button>
        <button onClick={() => fileRef.current?.click()}>Import</button>
        <button onClick={() => dispatch({ type: 'load', scenario: seedDefault() })}>Reset</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importJson(f)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
