import { useState } from 'react'
import { CloudOff, CloudUpload, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useAuth } from '@/contexts/AuthContext'
import { useOnline, useOutbox } from '@/hooks/useOutbox'
import { removeFromOutbox, type OutboxItem } from '@/lib/outbox'
import { flushOutbox, retryOutboxItem } from '@/lib/sync'

// The outbox at the top of every page (offline mode): says when there is no
// signal and how many writes are kept on this device, and lists them. A
// write the server refused stays here with the reason until the person
// resends it (a day that has passed can be given its reason here) or
// discards it, which is the only way anything leaves without being sent.

const muted = { color: 'hsl(var(--muted-foreground))' }

export default function OutboxIndicator() {
  const online = useOnline()
  const { items } = useOutbox()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const failed = items.filter((i) => i.status === 'failed')

  // Hidden when there is nothing to say, unless the list is open: it stays
  // until closed, so the person sees it empty out.
  if (online && items.length === 0 && !open) return null

  const sendNow = async () => {
    if (!user?.email) return
    setSending(true)
    try {
      const r = await flushOutbox(user.email)
      if (r.waiting) toast.error('Still no answer from the server; they stay kept')
    } finally {
      setSending(false)
    }
  }
  const retry = async (item: OutboxItem) => {
    let payload: Record<string, unknown> | undefined
    // A day that has passed needs a reason to change: ask for it here.
    if (item.kind === 'log_day' && /say why/i.test(item.lastError ?? '')) {
      const reason = window.prompt('Why is this past day being changed?')
      if (!reason?.trim()) return
      payload = { ...item.payload, reason: reason.trim() }
    }
    await retryOutboxItem(item.id, payload)
    await sendNow()
  }
  const discard = async (item: OutboxItem) => {
    if (!window.confirm(`This never reached the server:\n\n${item.summary}\n\nDiscard it for good?`)) return
    await removeFromOutbox(item.id)
  }

  const label = !online
    ? items.length
      ? `Offline · ${items.length} kept`
      : 'Offline'
    : failed.length
      ? `${failed.length} refused`
      : `${items.length} to send`

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 gap-1 px-2 text-xs"
        style={{ color: failed.length ? 'hsl(var(--destructive))' : !online ? 'hsl(35 80% 35%)' : undefined }}
        aria-label={`Outbox: ${label}`}
      >
        {failed.length ? <AlertTriangle size={14} /> : !online ? <CloudOff size={14} /> : <CloudUpload size={14} />}
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{items.length || ''}</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetTitle>Kept on this device</SheetTitle>
          <p className="mt-1 text-sm" style={muted}>
            {online
              ? 'Back online. Kept writes are sent oldest first.'
              : 'No signal. What you write is kept here, survives closing the app, and is sent when you are back online.'}
          </p>
          {items.length === 0 ? (
            <p className="mt-4 text-sm">Nothing waiting.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {items.map((i) => (
                <li key={i.id} className="rounded-md border p-2 text-sm">
                  <div className="font-medium">{i.summary}</div>
                  <div className="text-xs" style={muted}>
                    Written {new Date(i.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    {i.attempts ? ` · ${i.attempts} attempt${i.attempts === 1 ? '' : 's'}` : ''}
                  </div>
                  {i.status === 'failed' && (
                    <div className="mt-1 text-xs" style={{ color: 'hsl(var(--destructive))' }}>Refused: {i.lastError}</div>
                  )}
                  <div className="mt-2 flex gap-2">
                    {i.status === 'failed' && (
                      <Button size="sm" variant="outline" onClick={() => retry(i)} disabled={!online || sending}>
                        Try again
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => discard(i)}>
                      Discard
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {online && items.some((i) => i.status === 'pending') && (
            <Button className="mt-4" onClick={sendNow} disabled={sending}>
              {sending ? 'Sending…' : 'Send now'}
            </Button>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
