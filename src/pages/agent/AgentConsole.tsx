import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, Wrench, AlertCircle, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/lib/query-hooks'

interface ToolCall {
  tool: string
  input: unknown
  ok: boolean
}

interface Turn {
  role: 'user' | 'agent'
  text: string
  trace?: ToolCall[]
  isError?: boolean
}

const SUGGESTIONS = [
  'What needs my attention right now?',
  'Summarise the open NCRs by severity and total cost impact.',
  'Which change orders are waiting on an owner decision, and for how long?',
  'Walk me through what NCR-2026-001 triggered.',
]

/** Actions mutate the world model; reads don't. Only the former need a label. */
const isAction = (tool: string) => tool.startsWith('action_')

const prettyTool = (tool: string) =>
  tool.replace(/^action_/, '').replace(/_/g, ' ')

export default function AgentConsole() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, busy])

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return

    setTurns((t) => [...t, { role: 'user', text }])
    setPrompt('')
    setBusy(true)

    try {
      const { data, error } = await supabase.functions.invoke('agent', {
        body: { prompt: text },
      })
      if (error) throw error

      if (data?.error) {
        setTurns((t) => [
          ...t,
          { role: 'agent', text: data.error, trace: data.trace, isError: true },
        ])
      } else {
        setTurns((t) => [
          ...t,
          { role: 'agent', text: data.reply ?? '(no reply)', trace: data.trace },
        ])
      }

      // The agent may have mutated the world model through an Action, so any
      // cached view could now be stale.
      if ((data?.trace as ToolCall[] | undefined)?.some((c) => isAction(c.tool))) {
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
                          {prettyTool(call.tool)}
                          {!call.ok && ' · failed'}
                        </span>
                      ))}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      color: turn.isError
                        ? 'hsl(var(--destructive))'
                        : 'hsl(var(--foreground))',
                    }}
                  >
                    {turn.text}
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
