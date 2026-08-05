import React, { useState } from 'react'
import { AlertCircle, Check, CircleDot, Clock, Hand, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { day, sinceNow } from '@/lib/format'
import {
  useAcknowledgeItem,
  useCompleteItem,
  useDeclineItem,
} from '@/lib/query-hooks'
import type { ActionItem, ActionItemStatus } from '@/lib/types'

// One obligation, and the two things you can do about it.
//
// The card is deliberately the same in the thread and on the job list. What the
// chef sees under WP-PAINT-002 and what she sees on "My items" is one component
// reading one row, because they are the same fact — and if they were two
// components they would drift, which is how "I ticked it off somewhere else"
// happens.

const STATUS_META: Record<
  ActionItemStatus,
  { label: string; icon: React.ReactNode; color: string }
> = {
  OPEN: {
    label: 'Waiting on you',
    icon: <CircleDot size={12} />,
    color: 'hsl(38 92% 40%)',
  },
  ACKNOWLEDGED: {
    label: 'Accepted',
    icon: <Hand size={12} />,
    color: 'hsl(var(--primary))',
  },
  DONE: {
    label: 'Done',
    icon: <Check size={12} />,
    color: 'hsl(var(--success))',
  },
  DECLINED: {
    label: 'Declined',
    icon: <X size={12} />,
    color: 'hsl(var(--destructive))',
  },
}

/** Where a date nobody typed came from. Shown so it can be argued with. */
const DUE_SOURCE_LABEL: Record<string, string> = {
  WORK_PACKAGE_PLANNED_START: 'the work package starts',
  INSPECTION_SCHEDULED_DATE: 'the inspection is scheduled',
  APPROVAL_DEADLINE: 'the approval is due',
}

function StatusChip({ status, mine }: { status: ActionItemStatus; mine: boolean }) {
  const meta = STATUS_META[status]
  const label = status === 'OPEN' && !mine ? 'Waiting' : meta.label
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: meta.color, borderColor: meta.color }}
    >
      {meta.icon}
      {label}
    </span>
  )
}

export default function ActionItemCard({
  item,
  mine,
  showContext = false,
  showBody = true,
}: {
  item: ActionItem
  /** Whether the signed-in person is the one who was named. */
  mine: boolean
  /** Name the object this came off — on the job list, where there is no thread. */
  showContext?: boolean
  /** Off inside the thread, where the message right above already says it. */
  showBody?: boolean
}) {
  const acknowledge = useAcknowledgeItem()
  const decline = useDeclineItem()
  const complete = useCompleteItem()

  const [reply, setReply] = useState('')
  const [declining, setDeclining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = item.status === 'OPEN'
  const busy = acknowledge.isPending || decline.isPending || complete.isPending
  const fail = (err: Error) => setError(err.message)

  return (
    <div
      className="rounded-[var(--radius)] border p-3"
      style={{
        borderColor: open && mine ? 'hsl(38 92% 45%)' : 'hsl(var(--border))',
        backgroundColor: 'hsl(var(--card))',
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <StatusChip status={item.status} mine={mine} />
        <span className="text-sm font-semibold">
          {mine ? 'You' : item.assignee_name}
        </span>
        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          asked by {item.raised_by_name} · {sinceNow(item.created_at)}
        </span>
      </div>

      {showContext && item.context_label && (
        <p className="mt-1 text-xs font-medium" style={{ color: 'hsl(var(--primary))' }}>
          {item.context_label}
        </p>
      )}

      {showBody && (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{item.body}</p>
      )}

      {item.due_date && (
        <p
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          <Clock size={12} />
          {day(item.due_date)}
          {item.due_date_source && DUE_SOURCE_LABEL[item.due_date_source] && (
            <span>— when {DUE_SOURCE_LABEL[item.due_date_source]}</span>
          )}
        </p>
      )}

      {item.response && (
        <p
          className="mt-2 border-l-2 pl-2 text-sm"
          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
        >
          {mine ? 'You said' : `${item.assignee_name} said`}: {item.response}
        </p>
      )}

      {item.completion_note && (
        <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {item.completion_note}
        </p>
      )}

      {/* Only the person who was named can answer. Not a UI convention — the
          database refuses everyone else, so hiding it here is honesty, not a
          permission check. */}
      {mine && open && (
        <div className="mt-2.5 flex flex-col gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            className="text-sm"
            placeholder={
              declining ? 'Why can this not be done?' : 'Answer — "yes, will do" is enough'
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            {!declining && (
              <Button
                size="sm"
                disabled={busy || !reply.trim()}
                onClick={() => {
                  setError(null)
                  acknowledge.mutate(
                    { itemId: item.id, response: reply },
                    { onSuccess: () => setReply(''), onError: fail },
                  )
                }}
              >
                Accept
              </Button>
            )}
            {declining && (
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || !reply.trim()}
                onClick={() => {
                  setError(null)
                  decline.mutate(
                    { itemId: item.id, reason: reply },
                    { onSuccess: () => setReply(''), onError: fail },
                  )
                }}
              >
                Decline
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDeclining((d) => !d)
                setError(null)
              }}
            >
              {declining ? 'Actually, accept' : "I can't do this"}
            </Button>
          </div>
          <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Whatever you write is posted into the thread this came from, so the
            person who asked sees it where they asked.
          </p>
        </div>
      )}

      {mine && item.status === 'ACKNOWLEDGED' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError(null)
              complete.mutate({ itemId: item.id }, { onError: fail })
            }}
          >
            <Check size={14} className="mr-1" />
            Done
          </Button>
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Accepted {sinceNow(item.acknowledged_at)}
          </span>
        </div>
      )}

      {item.status === 'DONE' && item.completed_at && (
        <p className="mt-1.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Done {sinceNow(item.completed_at)}
        </p>
      )}

      {error && (
        <p
          className="mt-2 inline-flex items-start gap-1.5 text-xs"
          style={{ color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={12} className="mt-px flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
