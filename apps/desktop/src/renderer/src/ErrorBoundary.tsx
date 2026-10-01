import React from 'react';

const LAST_ERROR_KEY = 'amberflow.lastRenderError';

interface State {
  error: Error | null;
}

// Top-level safety net: without this, any uncaught render error unmounts
// the whole React tree and leaves a blank/white window with nothing in the
// UI to explain why (this is what was happening on the Admin Panel — a
// runtime error with no stack trace visible outside DevTools). This catches
// that, shows a visible message + the actual error instead of blank, and
// writes the error to localStorage so it can be retrieved later (e.g. via
// the browser devtools Application tab, or by reading it back out
// programmatically) without needing to catch DevTools open at the moment
// it happens.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      localStorage.setItem(
        LAST_ERROR_KEY,
        JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
          at: new Date().toISOString(),
        })
      );
    } catch {
      /* best-effort */
    }
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            background: '#0b0b10',
            color: '#f1f1f3',
            fontFamily: 'Inter, system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#9aa0ad', fontSize: 13, marginBottom: 16, maxWidth: 560 }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <pre
            style={{
              background: 'rgba(255,255,255,0.05)',
              padding: 12,
              borderRadius: 8,
              fontSize: 11,
              color: '#9aa0ad',
              maxWidth: 700,
              maxHeight: 240,
              overflow: 'auto',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              marginBottom: 20,
            }}
          >
            {this.state.error.stack}
          </pre>
          <button
            onClick={this.handleReload}
            style={{
              background: '#ff7a18',
              color: '#1a0d00',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
