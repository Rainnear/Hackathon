import { Component, type ReactNode } from 'react'

/** Shows a message instead of a blank page if a screen crashes. Saved data is not touched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="wrap crash">
        <h2>Something went wrong on this screen</h2>
        <p className="sub">Your saved data is still on this device. Reload to try again, or go back to the Barangays step.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => location.reload()}>Reload</button>
          <a className="btn" href="#/barangays" onClick={() => this.setState({ error: null })}>Go to Barangays</a>
        </div>
        <pre className="note">{error.message}</pre>
      </div>
    )
  }
}
