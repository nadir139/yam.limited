import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { describeQueryError } from '@/lib/query-error'

// What a page shows when the data it needs could not be loaded.
//
// Before this, a failed query left the page on "Loading…", or rendered it as
// if the project were empty ("0 change orders", "Project not found"), which in
// a demo reads as lost data. ErrorBoundary catches render errors; this covers
// the other half: the request failed, the page itself is fine.

export function QueryError({
  error,
  onRetry,
  title = 'This page could not load its data',
}: {
  error: unknown
  onRetry: () => unknown
  title?: string
}) {
  const [retrying, setRetrying] = useState(false)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false

  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <AlertTriangle size={28} style={{ color: 'hsl(var(--destructive))' }} />
      <p className="text-lg font-medium">{title}</p>
      <p className="max-w-md text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {offline
          ? 'You are offline. Reconnect and try again.'
          : describeQueryError(error)}
      </p>
      <Button variant="outline" onClick={retry} disabled={retrying} className="mt-2 gap-2">
        <RefreshCw size={14} className={retrying ? 'animate-spin' : undefined} />
        {retrying ? 'Retrying…' : 'Try again'}
      </Button>
    </div>
  )
}
