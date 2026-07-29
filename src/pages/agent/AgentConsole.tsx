import { useState, useRef, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Send, Wrench, AlertCircle, User, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/lib/query-hooks'
import { typeColor } from '@/lib/ontology'

interface ToolCall {
  tool: string
  input: { object_type?: string } & Record<string, unknown>
  ok: boolean
}

/** An object the agent read, keyed in the response by its human number. */
interface ObjectRef {
  type: string
  id: string
  label: string
}

interface ChangedRef extends ObjectRef {
  number: string
  via: string
  /** False for the Action's own target, true for what the cascade produced. */
  cascaded: boolean
}

interface Turn {
  role: 'user' | 'agent'
  text: string
  trace?: ToolCall[]
  index?: Record<string, ObjectRef>
  changed?: ChangedRef[]
  isError?: boolean
}

const SUGGESTIONS = [
  'What needs my attention right now?',
  'Summarise the open NCRs by severity and total cost impact.',
  'Which change orders are waiting on an owner decision, and for how long?',
  'Walk me through what NCR-2026-001 triggered.',
]

/** How many prior turns to replay. The function bounds this again server-side. */
const HISTORY_TURNS = 12

/** Where each object type opens. Types without a page render as a plain chip. */
const ROUTE_FOR: Record<string, (id: string) => string> = {
  DEFECT_RECORD: (id) => `/app/defects/${id}`,
  WORK_PACKAGE: (id) => `/app/work-packages/${id}`,
  CHANGE_ORDER: () => '/app/change-orders',
  OWNER_APPROVAL: () => '/app/approvals',
  INSPECTION_EVENT: () => '/app/inspections',
  DOCUMENT: () => '/app/documents',
  PROJECT: () => '/app/project',
  VESSEL: () => '/app/project',
  SUBCONTRACTOR: () => '/app/team',
}

/** Actions mutate the world model; reads don't. Only the former need a label. */
const isAction = (tool: string) => tool.startsWith('action_')

const prettyTool = (call: ToolCall) => {
  const base = call.tool.replace(/^action_/, '').replace(/_/g, ' ')
  // "list objects" five times in a row says nothing; "list objects · defect
  // record" says what the agent actually looked at.
  const subject = call.input?.object_type
  return subject ? `${base} · ${String(subject).replace(/_/g, ' ').toLowerCase()}` : base
}

/** Object numbers look like NCR-2026-001, WP-MECH-004, APPR-2026-005. */
const NUMBER_SHAPE = /^[A-Z]{2,6}-[A-Z0-9-]+$/
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const chipClass = (type: string) =>
  `${typeColor(type)} inline-flex items-center whitespace-nowrap rounded ` +
  `border border-current/30 bg-current/[0.08] px-1.5 py-px align-baseline ` +
  `font-mono text-[12px] font-semibold`

function ObjectChip({
  number,
  target,
  onOpen,
}: {
  number: string
  target: ObjectRef
  onOpen: (r: ObjectRef) => void
}) {
  if (!ROUTE_FOR[target.type]) return <span className={chipClass(target.type)}>{number}</span>
  return (
    <button
      type="button"
      onClick={() => onOpen(target)}
      title={target.label}
      className={`${chipClass(target.type)} cursor-pointer hover:bg-current/[0.18]`}
    >
      {number}
    </button>
  )
}

/**
 * Turns object numbers in the reply into links to the record.
 *
 * The agent is told to reference objects by number rather than describe them,
 * and this is what makes that instruction pay off — the reader clicks through
 * instead of reading a paragraph reconstructing what the object is. The index
 * is built from ids the database returned, so a link can never point at
 * something that does not exist.
 */
function LinkedText({
  text,
  index,
  onOpen,
}: {
  text: string
  index?: Record<string, ObjectRef>
  onOpen: (r: ObjectRef) => void
}) {
  const keys = Object.keys(index ?? {}).filter((k) => NUMBER_SHAPE.test(k))
  if (!index || keys.length === 0) return <>{text}</>

  // Longest first, so CO-2026-0011 is not eaten by CO-2026-001.
  const pattern = keys.sort((a, b) => b.length - a.length).map(escapeRe).join('|')
  const parts = text.split(new RegExp(`(${pattern})`, 'g'))

  return (
    <>
      {parts.map((part, i) =>
        index[part] ? (
          <ObjectChip key={i} number={part} target={index[part]} onOpen={onOpen} />
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * The propagation, drawn.
 *
 * When an Action cascades, prose has to spell out that recording one thing
 * created two others. Showing the chain as connected nodes makes the shape
 * legible at a glance — which is the whole argument for a world model over a
 * task list, so it should not be buried in a paragraph.
 */
function CascadeChain({
  changed,
  onOpen,
}: {
  changed: ChangedRef[]
  onOpen: (r: ObjectRef) => void
}) {
  if (changed.length === 0) return null

  return (
    <div className="mb-3 rounded-[var(--radius)] border border-accent/30 bg-accent/[0.04] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {changed.length === 1 ? 'Recorded' : 'Recorded, and what followed'}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {changed.map((c, i) => (
          // Arrow and the node it points at wrap together, so a line break can
          // never leave an arrow dangling at the end of a row.
          <span key={c.id} className="inline-flex items-center gap-1.5">
            {i > 0 && (
              <ArrowRight
                className="h-3.5 w-3.5 flex-shrink-0 text-accent"
                aria-label="which created"
              />
            )}
            <button
              type="button"
              onClick={() => onOpen(c)}
              title={c.label}
              disabled={!ROUTE_FOR[c.type]}
              className={`${typeColor(c.type)} inline-flex min-w-0 items-center gap-1.5 ` +
                'rounded-md border border-current/40 bg-current/[0.1] px-2 py-1 text-xs ' +
                'enabled:hover:bg-current/[0.2]'}
            >
              {/* The number must never break across lines — a half-rendered
                  NCR-2026-\n012 reads as a different object. */}
              <span className="whitespace-nowrap font-mono font-semibold">{c.number}</span>
              <span className="max-w-[130px] truncate text-muted-foreground">{c.label}</span>
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AgentConsole() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, busy])

  const openObject = (r: ObjectRef) => {
    const href = ROUTE_FOR[r.type]?.(r.id)
    if (href) navigate(href)
  }

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return

    // Captured before the optimistic user turn is appended, so what goes up is
    // exactly the exchange that preceded this question. Error bubbles are
    // dropped — "could not reach the agent" is not something to reason over.
    const history = turns
      .filter((t) => !t.isError)
      .slice(-HISTORY_TURNS)
      .map((t) => ({ role: t.role, text: t.text }))

    setTurns((t) => [...t, { role: 'user', text }])
    setPrompt('')
    setBusy(true)

    try {
      const { data, error } = await supabase.functions.invoke('agent', {
        body: { prompt: text, history },
      })
      if (error) throw error

      setTurns((t) => [
        ...t,
        {
          role: 'agent',
          text: data?.error ?? data?.reply ?? '(no reply)',
          trace: data?.trace,
          index: data?.index,
          changed: data?.changed,
          isError: Boolean(data?.error),
        },
      ])

      // An Action ran, so any cached view of the world model may now be stale.
      if ((data?.changed as ChangedRef[] | undefined)?.length) {
        Object.values(QUERY_KEYS).forEach((key) => {
          if (Array.isArray(key)) qc.invalidateQueries({ queryKey: key })
        })
      }
    } catch (err) {
      console.error('Agent request failed', err)
      setTurns((t) => [
        ...t,
        {
          role: 'agent',
          text:
            err instanceof Error
              ? `Could not reach the agent: ${err.message}`
              : 'Could not reach the agent.',
          isError: true,
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 40px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 4,
          }}
        >
          <Sparkles size={22} style={{ color: 'hsl(var(--accent))' }} />
          World Model Agent
        </h1>
        <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }}>
          Ask about the project, or tell it what changed. It reads the live world
          model and acts through the same typed Actions you do — under your
          identity, with every change recorded against your name.
        </p>
      </div>

      {turns.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              style={{
                textAlign: 'left',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid hsl(var(--border))',
                background: 'transparent',
                fontSize: 14,
                cursor: 'pointer',
                color: 'hsl(var(--foreground))',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        {turns.map((turn, i) => (
          <div key={i}>
            {turn.role === 'user' ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: 'hsl(var(--muted))',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <User size={14} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, paddingTop: 3 }}>{turn.text}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: turn.isError
                      ? 'hsl(0 72% 51% / 0.12)'
                      : 'hsl(185 60% 40% / 0.14)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {turn.isError ? (
                    <AlertCircle size={14} style={{ color: 'hsl(var(--destructive))' }} />
                  ) : (
                    <Sparkles size={14} style={{ color: 'hsl(var(--accent))' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {turn.trace && turn.trace.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      {turn.trace.map((call, j) => (
                        <span
                          key={j}
                          title={JSON.stringify(call.input, null, 2)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 11,
                            fontFamily: 'ui-monospace, monospace',
                            padding: '3px 8px',
                            borderRadius: 999,
                            border: '1px solid hsl(var(--border))',
                            color: call.ok
                              ? 'hsl(var(--muted-foreground))'
                              : 'hsl(var(--destructive))',
                            background: isAction(call.tool)
                              ? 'hsl(185 60% 40% / 0.08)'
                              : 'transparent',
                          }}
                        >
                          <Wrench size={10} />
                          {prettyTool(call)}
                          {!call.ok && ' · failed'}
                        </span>
                      ))}
                    </div>
                  )}

                  {turn.changed && turn.changed.length > 0 && (
                    <CascadeChain changed={turn.changed} onOpen={openObject} />
                  )}

                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      color: turn.isError
                        ? 'hsl(var(--destructive))'
                        : 'hsl(var(--foreground))',
                    }}
                  >
                    <LinkedText text={turn.text} index={turn.index} onOpen={openObject} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontSize: 13,
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            <Sparkles size={14} style={{ color: 'hsl(var(--accent))' }} />
            Reading the world model…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(prompt)
        }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
      >
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ask(prompt)
            }
          }}
          placeholder="Ask about the project, or describe a finding to record…"
          disabled={busy}
          className="min-h-[52px] resize-none"
          style={{ flex: 1 }}
        />
        <Button type="submit" disabled={busy || !prompt.trim()} size="lg">
          <Send size={15} />
        </Button>
      </form>
    </div>
  )
}
