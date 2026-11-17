import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowUpRight, Loader2, Send, Sparkles, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useProjectId } from '@/lib/query-hooks'
import { CascadeChain, LinkedText, MAX_PROMPT_CHARS, prettyTool, type ObjectRef } from '@/pages/agent/AgentConsole'
import { pageContext, routeForObject } from './page-context'
import { useAgentThread } from './useAgentThread'

// The agent beside every page. Loaded lazily the first time the dock opens,
// so the shell stays light for people who never ask.

export default function AgentDockPanel({
  initialPrompt,
  onClose,
}: {
  /** Asked as soon as the panel opens (a brief's follow-up, a page button). */
  initialPrompt?: string
  onClose: () => void
}) {
  const projectId = useProjectId()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const page = pageContext(pathname)
  const { turns, busy, progress, ask, stop, clear } = useAgentThread(projectId)
  const [prompt, setPrompt] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const askedInitial = useRef<string | undefined>()

  useEffect(() => {
    if (initialPrompt && askedInitial.current !== initialPrompt) {
      askedInitial.current = initialPrompt
      void ask(initialPrompt, page.context)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, busy, progress.length])

  /** A chip in a reply opens its record; the dock stays open beside it. */
  const openObject = (_number: string, target: ObjectRef) => {
    const to = routeForObject(target.type, target.id)
    if (to) navigate(to)
  }

  const send = (text: string) => {
    if (!text.trim() || busy) return
    setPrompt('')
    void ask(text, page.context)
  }

  const tooLong = prompt.trim().length > MAX_PROMPT_CHARS
  const muted = { color: 'hsl(var(--muted-foreground))' }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: who, and where it thinks you are */}
      <div className="flex items-center gap-3 border-b py-3 pl-4 pr-12">
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-accent/15">
          <Sparkles size={16} className="text-accent" />
          <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${busy ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">YAM agent</p>
          <p className="truncate text-[11px] leading-tight" style={muted}>
            {busy ? 'Working in the record…' : page.label}
          </p>
        </div>
        {turns.length > 0 && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clear} title="Clear the conversation">
            <Trash2 size={14} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Open the full console"
          onClick={() => {
            onClose()
            navigate('/app/agent')
          }}
        >
          <ArrowUpRight size={15} />
        </Button>
      </div>

      {/* Conversation */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 text-sm">
        {turns.length === 0 && !busy && (
          <div className="space-y-3">
            <p style={muted}>
              I read and write the same record you do. Ask about {page.label.replace(/^On /, '')}, or tell me what to record.
            </p>
            <div className="flex flex-col items-start gap-2">
              {page.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border px-3 py-1.5 text-left text-xs transition-colors hover:border-accent/50 hover:bg-accent/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) =>
          t.role === 'user' ? (
            <div key={i} className="ml-8 rounded-lg bg-muted px-3 py-2">
              {t.text}
            </div>
          ) : (
            <div key={i} className={t.isError ? 'flex gap-2 text-destructive' : ''}>
              {t.isError && <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
              <div className="min-w-0 space-y-1 leading-relaxed">
                {t.changed && t.changed.length > 0 && (
                  <CascadeChain changed={t.changed} openNumbers={[]} onToggle={openObject} />
                )}
                <LinkedText text={t.text} index={t.index} openNumbers={[]} onToggle={openObject} />
              </div>
            </div>
          ),
        )}

        {/* Live: what it is reading or writing right now */}
        {busy && (
          <div className="space-y-1.5 rounded-lg border border-dashed px-3 py-2 text-xs" style={muted}>
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              {progress.length === 0 ? 'Reading the world model…' : `${progress.length} step${progress.length === 1 ? '' : 's'}`}
            </div>
            {progress.slice(-4).map((p, i) => (
              <div key={i} className={`truncate pl-5 ${p.tool.startsWith('action_') ? 'text-accent' : ''}`}>
                {p.tool.startsWith('action_') ? 'Recording · ' : 'Reading · '}
                {prettyTool(p)}
              </div>
            ))}
          </div>
        )}

        {/* Once the thread has started, the page's suggestions stay one tap away */}
        {turns.length > 0 && !busy && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {page.suggestions.slice(0, 2).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:border-accent/50"
                style={muted}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(prompt)
              }
            }}
            placeholder={busy ? 'Working…' : 'Ask, or tell it what to record'}
            rows={1}
            className="max-h-32 min-h-[40px] resize-none text-sm"
            autoFocus
          />
          {busy ? (
            <Button size="icon" variant="outline" onClick={stop} title="Stop">
              <Square size={14} />
            </Button>
          ) : (
            <Button size="icon" onClick={() => send(prompt)} disabled={!prompt.trim() || tooLong} title="Send">
              <Send size={14} />
            </Button>
          )}
        </div>
        {tooLong && <p className="mt-1 text-[11px] text-destructive">Keep it under {MAX_PROMPT_CHARS} characters.</p>}
      </div>
    </div>
  )
}
