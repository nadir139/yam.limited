import React, { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Send, AlertCircle, Compass, Gavel, Video, ArrowRightLeft, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  useObjectMessages,
  useProjectMessages,
  usePostMessage,
  usePermissions,
} from '@/lib/query-hooks'
import type { Message, MessageKind, ObjectType } from '@/lib/types'

// The project conversation, attached to the thing it is about.
//
// Chat normally sits outside the record: the reason a decision was taken lives
// in someone's inbox, and when they leave it goes with them. Here a message
// hangs off the object, so the "why" is stored next to the "what" and the agent
// can read both.
//
// Nothing here edits or deletes. There is no Action for it and no grant behind
// it — a message is a statement someone made at a time, and unmaking it would
// make the record a worse witness than a notebook.

const KIND_META: Record<
  MessageKind,
  { label: string; icon: React.ReactNode; color: string; hint: string }
> = {
  NOTE: {
    label: 'Note',
    icon: <MessageSquare size={12} />,
    color: 'hsl(var(--muted-foreground))',
    hint: 'Anything worth saying.',
  },
  DECISION: {
    label: 'Decision',
    icon: <Gavel size={12} />,
    color: 'hsl(var(--accent))',
    hint: 'Something settled, so the reason survives the person who settled it.',
  },
  UNPLANNED_WORK: {
    label: 'Unplanned work',
    icon: <Compass size={12} />,
    color: 'hsl(38 80% 38%)',
    hint: 'Work done outside the agreed scope — what to learn from next time.',
  },
  MEETING_NOTE: {
    label: 'Meeting',
    icon: <Video size={12} />,
    color: 'hsl(var(--primary))',
    hint: 'What came out of a call, kept with the object it concerned.',
  },
  HANDOVER: {
    label: 'Handover',
    icon: <ArrowRightLeft size={12} />,
    color: 'hsl(var(--primary))',
    hint: 'What the next person needs to know.',
  },
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  OWNERS_REP: "Owner's rep",
  CAPTAIN: 'Captain',
  YARD_PM: 'Yard PM',
  CLASS_SURVEYOR: 'Class surveyor',
  NAVAL_ARCHITECT: 'Naval architect',
  SUBCONTRACTOR: 'Subcontractor',
}

function MessageRow({ message }: { message: Message }) {
  const meta = KIND_META[message.kind] ?? KIND_META.NOTE
  const isPlain = message.kind === 'NOTE'

  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold">{message.author_name}</span>
        {message.author_role && (
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {ROLE_LABEL[message.author_role] ?? message.author_role}
          </span>
        )}
        {!isPlain && (
          <span
            className="inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: meta.color, borderColor: meta.color }}
          >
            {meta.icon}
            {meta.label}
          </span>
        )}
        {message.source !== 'APP' && (
          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
            via {message.source.toLowerCase()}
            {message.meeting_ref ? ` · ${message.meeting_ref}` : ''}
          </span>
        )}
        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
    </div>
  )
}

export default function MessageThread({
  objectType,
  objectId,
  title = 'Conversation',
}: {
  /** Omit both to render the project-wide channel. */
  objectType?: ObjectType
  objectId?: string
  title?: string
}) {
  const scoped = Boolean(objectType && objectId)
  const objectQuery = useObjectMessages(objectType ?? 'PROJECT', scoped ? objectId : undefined)
  const projectQuery = useProjectMessages()
  const query = scoped ? objectQuery : projectQuery

  const post = usePostMessage()
  const { can } = usePermissions()
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<MessageKind>('NOTE')
  const [error, setError] = useState<string | null>(null)

  const messages = query.data ?? []
  const mayPost = can('action_post_message')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    post.mutate(
      {
        body,
        kind,
        linkedObjectType: scoped ? objectType : null,
        linkedObjectId: scoped ? objectId : null,
      },
      {
        onSuccess: () => {
          setBody('')
          setKind('NOTE')
        },
        onError: (err: Error) => setError(err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {title && <h3 className="text-base font-semibold">{title}</h3>}

      {query.isLoading ? (
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Loading…
        </p>
      ) : messages.length === 0 ? (
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Nothing said here yet. What gets written down is what the project
          remembers after everyone has moved on.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
        </div>
      )}

      {mayPost && (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(KIND_META) as MessageKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                title={KIND_META[k].hint}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium"
                style={{
                  borderColor: kind === k ? KIND_META[k].color : 'hsl(var(--border))',
                  color: kind === k ? KIND_META[k].color : 'hsl(var(--muted-foreground))',
                }}
              >
                {KIND_META[k].icon}
                {KIND_META[k].label}
              </button>
            ))}
          </div>

          <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {KIND_META[kind].hint}
          </p>

          <div className="flex items-end gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Say what happened, or why…"
              rows={2}
              className="flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
              }}
            />
            <Button type="submit" size="sm" disabled={post.isPending || !body.trim()}>
              <Send size={14} />
            </Button>
          </div>

          {error && (
            <p
              className="inline-flex items-start gap-1.5 text-xs"
              style={{ color: 'hsl(var(--destructive))' }}
            >
              <AlertCircle size={12} className="mt-px flex-shrink-0" />
              {error}
            </p>
          )}

          <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Messages cannot be edited or deleted, by anyone.
          </p>
        </form>
      )}
    </div>
  )
}
