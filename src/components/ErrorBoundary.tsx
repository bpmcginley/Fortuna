import { Component, type ErrorInfo, type ReactNode } from 'react'
import { REPO_URL, openExternal } from './About'

interface State {
  error: Error | null
}

// Last line of defense: a render crash shows a recovery screen instead of a
// blank window. "Start fresh" clears only Fortuna's own storage keys.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fortuna crashed:', error, info.componentStack)
  }

  private resetData = () => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('fortuna:')) localStorage.removeItem(k)
    } catch {
      /* storage unavailable — reload alone may still recover */
    }
    location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <div className="crash-card">
          <h2>◈ Something went wrong</h2>
          <p>
            Fortuna hit an unexpected error. Reloading usually fixes it. If it keeps happening,
            your saved data may be corrupted — "Start fresh" clears Fortuna's local data (profiles
            and snapshots) and restarts. Consider exporting anything important first next time.
          </p>
          <pre className="crash-msg">{String(this.state.error.message || this.state.error)}</pre>
          <div className="crash-actions">
            <button className="primary" onClick={() => location.reload()}>Reload</button>
            <button onClick={this.resetData}>Start fresh (clear saved data)</button>
            <button onClick={() => openExternal(`${REPO_URL}/issues`)}>Report a bug</button>
          </div>
        </div>
      </div>
    )
  }
}
