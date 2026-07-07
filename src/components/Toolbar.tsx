import { useRef } from 'react'
import { useStore } from '../state/store'
import { PRESETS, seedDefault } from '../state/scenario'
import type { Scenario } from '../engine/types'

export function Toolbar() {
  const { scenario, dispatch, saveCurrent, saved } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  // Inside the Tauri shell, WebView2 ignores <a download> blob links, so
  // export/import go through native save/open dialogs there; the blob and
  // <input type=file> paths remain the browser dev-mode fallback.
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  const fileStem = () => scenario.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'fortuna'

  const exportJson = async () => {
    const json = JSON.stringify(scenario, null, 2)
    if (isTauri) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const path = await save({
          defaultPath: `${fileStem()}.json`,
          filters: [{ name: 'Fortuna scenario', extensions: ['json'] }],
        })
        if (!path) return // user cancelled
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        await writeTextFile(path, json)
      } catch (e) {
        alert(`Could not export: ${e instanceof Error ? e.message : e}`)
      }
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileStem()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadParsed = (text: string) => {
    try {
      const parsed = JSON.parse(text) as Scenario
      if (!parsed.accounts || !Array.isArray(parsed.accounts)) throw new Error('not a Fortuna scenario')
      dispatch({ type: 'load', scenario: parsed })
    } catch (e) {
      alert(`Could not import: ${e instanceof Error ? e.message : e}`)
    }
  }

  const importClick = async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const path = await open({
          multiple: false,
          directory: false,
          filters: [{ name: 'Fortuna scenario', extensions: ['json'] }],
        })
        if (typeof path !== 'string') return // cancelled
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        loadParsed(await readTextFile(path))
      } catch (e) {
        alert(`Could not import: ${e instanceof Error ? e.message : e}`)
      }
      return
    }
    fileRef.current?.click()
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => loadParsed(String(reader.result))
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
        <button onClick={importClick}>Import</button>
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
