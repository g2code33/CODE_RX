import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

/**
 * The wall between a broken render and a blank page.
 *
 * React unmounts the WHOLE tree when a render throws, which is exactly how a
 * module has gone white before. This boundary keeps the failure inside the one
 * workspace: the rest of the site still works, the message is honest, and the
 * way out is one button — reload, or go back to a known-good view.
 *
 * It deliberately does not try to "recover" by re-rendering the same broken
 * tree: the only safe moves are a clean reload or leaving the area.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string; onReset?: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console, never swallowed: this is what makes a report
    // actionable. No user data is logged.
    console.error('[code-rx] render failed', error?.message, info?.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const label = this.props.label || 'This workspace';
    return (
      <div className="cgm-shell" data-testid="code-rx-error-boundary">
        <div className="mx-auto mt-10 w-full max-w-lg rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
          <p className="flex items-center gap-2 text-sm font-black text-amber-900">
            <AlertTriangle className="h-4 w-4" /> {label} hit a problem
          </p>
          <p className="mt-2 text-sm font-medium text-amber-800">
            Something in this screen failed to draw. Your account, your session and your records are untouched —
            nothing was lost. Reload to carry on, or step back and try again.
          </p>
          <p className="mt-2 break-words rounded-lg bg-white/70 px-3 py-2 text-[11px] font-semibold text-amber-700">
            {String(this.state.error?.message || 'Unknown error').slice(0, 220)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="code-rx-error-reload"
              className="cgm-primary-button"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="mr-1.5 inline h-4 w-4" /> Reload
            </button>
            <button
              type="button"
              data-testid="code-rx-error-back"
              className="mini-button"
              onClick={this.reset}
            >
              <ArrowLeft className="mr-1 inline h-3.5 w-3.5" /> Try this screen again
            </button>
            <a href="/" className="mini-button">Go to the website</a>
          </div>
        </div>
      </div>
    );
  }
}
