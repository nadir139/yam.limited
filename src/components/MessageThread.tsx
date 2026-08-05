import React, { useMemo, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Send, AlertCircle, Compass, Gavel, Video, ArrowRightLeft, MessageSquare, AtSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  useObjectMessages,
  useProjectMessages,
  usePostMessage,
  usePermissions,
  useTeam,
  useObjectActionItems,
  useProjectActionItems,
} from '@/lib/query-hooks'
import { useAuth } from '@/contexts/AuthContext'
import MentionText from '@/components/MentionText'
import ActionItemCard from '@/components/ActionItemCard'
import type { ActionItem, Message, MessageKind, ObjectType, ProjectMember } from '@/lib/types'

// The project conversation, attached to the thing it is about.
//
// Chat normally sits outside the record: the reason a decision was taken lives
// in someone's inbox, and when they leave it goes with them. Here a message
// hangs off the object, so the "why" is stored next to the "what" and the agent
// can read both.
//
// Naming someone with @ goes one step further. "The varnishers need lunch on
// the 5th, one vegetarian, @Elena" is a request, and a request that only exists
// as prose is a request somebody has to remember. Mentioning a member creates
// an action item for them in the same transaction — assigned to who was named,
// about the object this thread hangs off, due on that object's own start date.
// The chef never opens a to-do list to put it there, and she cannot make it go
// away by ignoring it: it stays open until she answers, and her answer is
// posted back here.
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
  CREW: 'Crew',
}

function MessageRow({
  message,
  members,
  items,
  myEmail,
}: {
  message: Message
  members: ProjectMember[]
  items: ActionItem[]
  myEmail: string
}) {
  const meta = KIND_META[message.kind] ?? KIND_META.NOTE
  const isPlain = message.kind === 'NOTE'
  const raised = items.filter((i) => i.message_id === message.id)

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

      <MentionText body={message.body} mentions={message.mentions} members={members} />

      {/* The obligations this message created, right under it. Naming someone
          did something, and the something should be visible where it happened
          rather than only on a page they have to know to visit. */}
      {raised.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-2">
          {raised.map((item) => (
            <ActionItemCard
              key={item.id}
              item={item}
              mine={item.assignee_email.toLowerCase() === myEmail.toLowerCase()}
              showBody={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The token being typed after an "@", or null.
 *
 * Only looks backwards from the caret and stops at whitespace, so an email
 * address in the middle of a sentence does not open the picker and neither
 * does an "@" somebody typed and moved away from.
 */
function mentionQuery(text: string, caret: number): { query: string; at: number } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (/\n/.test(query)) return null
  // A name is at most a few words; anything longer is prose that happens to
  // follow an "@", not somebody being named.
  if (query.split(/\s+/).length > 3) return null
  return { query, at }
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

  // The items raised in this thread. The project-wide channel has no object to
  // hang them off, so its items are the ones linked to nothing — without this
  // branch, mentioning someone there would work but show nothing back.
  const { data: itemsForObject = [] } = useObjectActionItems(
    scoped ? objectType : undefined,
    scoped ? objectId : undefined,
  )
  const { data: allItems = [] } = useProjectActionItems()
  const items = scoped
    ? itemsForObject
    : allItems.filter((i) => i.linked_object_type === null)
  const { data: team = [] } = useTeam()
  const { user } = useAuth()

  const post = usePostMessage()
  const { can } = usePermissions()
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<MessageKind>('NOTE')
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ query: string; at: number } | null>(null)
  const [named, setNamed] = useState<ProjectMember[]>([])
  const textarea = useRef<HTMLTextAreaElement>(null)

  const messages = query.data ?? []
  const mayPost = can('action_post_message')

  // Someone who has left cannot be given new work. They stay on the team page
  // so everything they wrote keeps an author; they do not stay in this list.
  const mentionable = useMemo(
    () => team.filter((m) => m.status !== 'LEFT'),
    [team],
  )

  const suggestions = useMemo(() => {
    if (!picker) return []
    const q = picker.query.toLowerCase()
    return mentionable
      .filter(
        (m) =>
          !named.some((n) => n.id === m.id) &&
          (q === '' ||
            m.name.toLowerCase().includes(q) ||
            m.email.toLowerCase().startsWith(q) ||
            (m.company ?? '').toLowerCase().includes(q)),
      )
      .slice(0, 6)
  }, [picker, mentionable, named])

  const onBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value)
    setPicker(mentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length))
  }

  const choose = (member: ProjectMember) => {
    if (!picker) return
    const caret = textarea.current?.selectionStart ?? body.length
    const next = `${body.slice(0, picker.at)}@${member.name} ${body.slice(caret)}`
    setBody(next)
    setNamed((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]))
    setPicker(null)
    textarea.current?.focus()
  }

  // Deleting "@Elena" out of the text is how you take the request back before
  // sending it. The chip list is a convenience; the text is the truth.
  const stillNamed = useMemo(
    () => named.filter((m) => body.includes(`@${m.name}`)),
    [named, body],
  )

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
        mentions: stillNamed.map((m) => m.id),
      },
      {
        onSuccess: () => {
          setBody('')
          setKind('NOTE')
          setNamed([])
          setPicker(null)
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
            <MessageRow
              key={m.id}
              message={m}
              members={team}
              items={items}
              myEmail={user?.email ?? ''}
            />
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

          <div className="relative flex items-end gap-2">
            {picker && suggestions.length > 0 && (
              <ul
                className="absolute bottom-full left-0 z-20 mb-1 w-72 overflow-hidden rounded-[var(--radius)] border shadow-md"
                style={{
                  backgroundColor: 'hsl(var(--popover))',
                  borderColor: 'hsl(var(--border))',
                }}
              >
                {suggestions.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      // onMouseDown, not onClick: the textarea loses focus on
                      // blur before a click ever lands, which closes the picker
                      // and makes the option unselectable by mouse.
                      onMouseDown={(e) => {
                        e.preventDefault()
                        choose(m)
                      }}
                      className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-[hsl(var(--accent)/0.1)]"
                    >
                      <span className="text-sm font-medium">{m.name}</span>
                      <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {ROLE_LABEL[m.role] ?? m.role}
                        {m.company ? ` · ${m.company}` : ''}
                        {m.status === 'INVITED' ? ' · not signed in yet' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Textarea
              ref={textarea}
              value={body}
              onChange={onBodyChange}
              onBlur={() => setPicker(null)}
              placeholder="Say what happened, or why… @ someone to ask them for something"
              rows={2}
              className="flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Escape' && picker) {
                  e.preventDefault()
                  setPicker(null)
                  return
                }
                if (e.key === 'Enter' && picker && suggestions.length > 0) {
                  e.preventDefault()
                  choose(suggestions[0])
                  return
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
              }}
            />
            <Button type="submit" size="sm" disabled={post.isPending || !body.trim()}>
              <Send size={14} />
            </Button>
          </div>

          {stillNamed.length > 0 && (
            <p
              className="inline-flex flex-wrap items-center gap-1.5 text-[11px]"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              <AtSign size={12} />
              This asks {stillNamed.map((m) => m.name).join(', ')} for something.
              It lands on {stillNamed.length > 1 ? 'their lists' : 'their list'} and
              stays open until they answer.
            </p>
          )}

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
