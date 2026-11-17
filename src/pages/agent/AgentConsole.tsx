import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, Wrench, AlertCircle, User, Trash2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useProjectId } from '@/lib/query-hooks'
import ChatObjectPanel from './ChatObjectPanel'
import AgentScheduleCard from '@/components/gantt/AgentScheduleCard'
import { CascadeChain, LinkedText } from '@/components/agent/AgentReply'
import { useAgentThread } from '@/components/agent/useAgentThread'
import { MAX_PROMPT_CHARS, isAction, prettyTool, type ObjectRef } from '@/components/agent/thread'

// The agent at full size. The conversation itself (storage, sending, cache
// refresh after an Action) lives in useAgentThread and is the same thread the
// dock beside every page uses; this page adds the trace, inline records and
// the schedule card.

/** Reading or changing any of these puts the schedule under the reply. */
const SCHEDULE_TOOLS = new Set([
  'get_schedule',
  'action_reschedule_work_package',
  'action_link_work_packages',
  'action_unlink_work_packages',
  'action_set_schedule_baseline',
])

const SUGGESTIONS = [
  'What needs my attention right now?',
  'Summarise the open NCRs by severity and total cost impact.',
  'Which change orders are waiting on an owner decision, and for how long?',
  // Was "Walk me through what NCR-2026-001 triggered" — a number that exists
  // on one project and nowhere else.
  'What changed on this project in the last week?',
]

export default function AgentConsole() {
  const projectId = useProjectId()
  const { turns, busy, progress, ask: send, stop, clear } = useAgentThread(projectId)
  const [prompt, setPrompt] = useState('')
  // Objects opened inline, keyed by the turn they were opened from, so a panel
  // appears where you clicked rather than somewhere you have to go looking.
  const [openPanels, setOpenPanels] = useState<Record<number, string[]>>({})
  const endRef = useRef<HTMLDivElement>(null)
  // A thread restored from storage (on arrival or on switching project) opens
  // on its latest message without animating down to it.
  const restored = useRef(turns.length > 0)
  const [panelsFor, setPanelsFor] = useState(projectId)

  // Switching project swaps in that project's own thread (the hook does that);
  // panels opened on the old one go with it.
  if (panelsFor !== projectId) {
    setPanelsFor(projectId)
    setOpenPanels({})
    restored.current = true
  }

  useEffect(() => {
    if (restored.current) {
      restored.current = false
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }))
      return
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, busy, progress.length])

  const togglePanel = (turnIndex: number) => (number: string, _target: ObjectRef) => {
    setOpenPanels((prev) => {
      const current = prev[turnIndex] ?? []
      return {
        ...prev,
        [turnIndex]: current.includes(number)
          ? current.filter((n) => n !== number)
          : [...current, number],
      }
    })
  }

  const clearConversation = () => {
    clear()
    setOpenPanels({})
  }

  const ask = (question: string) => {
    if (!question.trim() || busy) return
    setPrompt('')
    void send(question)
  }

  const tooLong = prompt.trim().length > MAX_PROMPT_CHARS

  return (
    // A chat: the conversation scrolls in its own area and the input is fixed
    // beneath it on a solid background, so nothing slides behind it.
    <div className="mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 sm:px-5 sm:pt-6">
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
        {turns.length === 0 && (
        <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }}>
          Ask about the project, or tell it what changed. It reads the live world
          model and acts through the same typed Actions you do — under your
          identity, with every change recorded against your name. Click any
          reference to open it here without leaving the conversation.
        </p>
        )}
        {turns.length > 0 && (
          <button
            onClick={clearConversation}
            className="mt-2 inline-flex items-center gap-1.5 text-xs hover:underline"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <Trash2 size={12} />
            Clear conversation
          </button>
        )}
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
                    <CascadeChain
                      changed={turn.changed}
                      openNumbers={openPanels[i] ?? []}
                      onToggle={togglePanel(i)}
                    />
                  )}

                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: turn.isError
                        ? 'hsl(var(--destructive))'
                        : 'hsl(var(--foreground))',
                    }}
                  >
                    <LinkedText
                      text={turn.text}
                      index={turn.index}
                      openNumbers={openPanels[i] ?? []}
                      onToggle={togglePanel(i)}
                    />
                  </div>

                  {turn.trace?.some((t) => SCHEDULE_TOOLS.has(t.tool)) && (
                    <AgentScheduleCard
                      focusIds={turn.changed
                        ?.filter((c) => c.type === 'WORK_PACKAGE')
                        .map((c) => c.id)}
                    />
                  )}

                  {/* Objects opened from this turn, inline. */}
                  {(openPanels[i] ?? []).map((number) => {
                    const ref = turn.index?.[number]
                    if (!ref) return null
                    return (
                      <ChatObjectPanel
                        key={number}
                        number={number}
                        objectType={ref.type}
                        objectId={ref.id}
                        onClose={() => togglePanel(i)(number, ref)}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                fontSize: 13,
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              <Sparkles size={14} className="animate-pulse" style={{ color: 'hsl(var(--accent))' }} />
              {progress.some((p) => isAction(p.tool))
                ? `Recording… ${progress.filter((p) => isAction(p.tool) && p.ok).length} done`
                : 'Reading the world model…'}
              <button
                type="button"
                onClick={stop}
                className="ml-2 inline-flex items-center gap-1 text-xs hover:underline"
              >
                <Square size={10} />
                Stop
              </button>
            </div>
            {progress.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 24 }}>
                {progress.map((call, j) => (
                  <span
                    key={j}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]"
                    style={{
                      color: call.ok ? 'hsl(var(--muted-foreground))' : 'hsl(var(--destructive))',
                    }}
                  >
                    <Wrench size={10} />
                    {prettyTool(call)}
                    {!call.ok && ' · failed'}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>
      </div>

      {/* Fixed under the conversation, on its own solid strip. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(prompt)
        }}
        className="shrink-0 border-t bg-background px-4 py-3 sm:px-5"
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
      >
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline.
            // Not while an IME is composing: Enter there confirms a character.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              ask(prompt)
            }
          }}
          placeholder="Ask about the project, or describe a finding to record…"
          disabled={busy}
          className="min-h-[52px] resize-none"
          style={{ flex: 1 }}
        />
        <Button type="submit" disabled={busy || !prompt.trim() || tooLong} size="lg" aria-label="Send">
          <Send size={15} />
        </Button>
        {tooLong && (
          <p style={{ flexBasis: '100%', fontSize: 12, color: 'hsl(var(--destructive))' }}>
            {prompt.trim().length} / {MAX_PROMPT_CHARS} characters — split it into two messages.
          </p>
        )}
      </form>
    </div>
  )
}
