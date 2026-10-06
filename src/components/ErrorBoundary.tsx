import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// One page failing must not take the app with it.
//
// Without a boundary, React unmounts the whole tree on an uncaught render
// error: a single bad row on the project page left a blank white window, with
// the sidebar, the project switcher and the way out all gone with it. This
// catches the error where it happened, keeps the shell around it, and offers
// a retry.
//
// It also handles the one error that is not a bug: after a deploy, a tab that
// was open before it still asks for the old route chunks, which no longer
// exist. That is fixed by loading the new build, so it reloads once, by itself.

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i
const RELOAD_FLAG = 'yam.chunk-reload'

interface Props {
  children: ReactNode
  /** When any of these change (a new route, another project), the error is cleared. */
  resetKeys?: unknown[]
  /** Full-screen fallback for errors outside the app shell. */
  fullScreen?: boolean
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to render', error, info.componentStack)

    if (CHUNK_ERROR.test(error.message)) {
      try {
        // Once per tab session: if the reload does not fix it, show the error
        // rather than loop.
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1')
          window.location.reload()
        }
      } catch {
        // Storage unavailable: fall through to the manual reload button.
      }
    }
  }

  componentDidUpdate(prev: Props) {
    if (!this.state.error) return
    const a = prev.resetKeys ?? []
    const b = this.props.resetKeys ?? []
    if (a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const staleBuild = CHUNK_ERROR.test(error.message)

    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-3 px-4 text-center ${
          this.props.fullScreen ? 'min-h-screen' : 'py-20'
        }`}
      >
        <AlertTriangle size={28} style={{ color: 'hsl(var(--destructive))' }} />
        <h2 className="text-lg font-semibold">
          {staleBuild ? 'A new version is available' : 'This page could not be shown'}
        </h2>
        <p className="max-w-md text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {staleBuild
            ? 'The app was updated while this tab was open. Reload to continue.'
            : 'Something on this page failed. The rest of the app still works, and nothing you saved is affected.'}
        </p>
        {!staleBuild && (
          <code
            className="max-w-md truncate rounded px-2 py-1 text-xs"
            style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
            title={error.message}
          >
            {error.message}
          </code>
        )}
        <div className="mt-2 flex gap-2">
          {!staleBuild && (
            <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          )}
          <Button size="sm" onClick={() => window.location.reload()}>
            <RefreshCw size={13} className="mr-1.5" />
            Reload
          </Button>
        </div>
      </div>
    )
  }
}
