import { useState } from 'react'

export const REPO_URL = 'https://github.com/bpmcginley/Fortuna'
export const RELEASES_URL = `${REPO_URL}/releases/latest`

// Open a link in the user's real browser: through the opener plugin inside the
// Tauri shell (WebView2 ignores target=_blank), window.open on the web.
export async function openExternal(url: string) {
  if ('__TAURI_INTERNALS__' in window) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
      return
    } catch {
      /* fall through to clipboard-less noop; the URL is shown as text too */
    }
  }
  window.open(url, '_blank', 'noopener')
}

export function AboutButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>About</button>
      {open && <AboutModal onClose={() => setOpen(false)} />}
    </>
  )
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          <span className="logo" style={{ fontSize: 20 }}>◈</span> Fortuna <span className="muted">v{__APP_VERSION__}</span>
        </h3>
        <p className="hint" style={{ fontSize: 12.5 }}>
          A free, open-source financial future simulator. Build a plan, run thousands of possible
          lifetimes through it, and see the range of outcomes — then let the Coach quantify what
          would actually move the needle.
        </p>

        <div className="about-facts">
          <div><b>100% private.</b> Everything runs and stays on this device. No account, no cloud, no telemetry, no network calls. Your data lives only in this app's local storage and in files you export yourself.</div>
          <div><b>Open source.</b> MIT-licensed; the full model is auditable.{' '}
            <a href={REPO_URL} onClick={(e) => { e.preventDefault(); openExternal(REPO_URL) }}>github.com/bpmcginley/Fortuna</a>
          </div>
          <div><b>Updates.</b> New versions are published on the{' '}
            <a href={RELEASES_URL} onClick={(e) => { e.preventDefault(); openExternal(RELEASES_URL) }}>releases page</a>.
          </div>
        </div>

        <p className="hint">
          Fortuna is an educational model, <b>not financial advice</b>. Markets are not draws from
          the distribution you configure; taxes and fees are simplified. Treat every result as
          "what these assumptions imply," never as a prediction.
        </p>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
