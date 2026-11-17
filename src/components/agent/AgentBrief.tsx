import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Mail, MessageSquarePlus, RefreshCw, Sparkles } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/AuthContext'
import { fetchBriefEmail, setBriefEmail, todaysBrief, useAgentNotes } from './notes'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { callAgent, type AgentStep } from '@/lib/agent-client'
import { useProjectId } from '@/lib/query-hooks'
import { LinkedText } from './AgentReply'
import { prettyTool, type ObjectRef } from './thread'
import { openAgent, routeForObject } from './page-context'

// The agent speaks first.
//
// The dashboard and the logbook open on a short brief the agent wrote by
// reading the record: what needs attention, most urgent first, with every
// record it names one tap away. The morning run (agent-watch, 05:30 UTC)
// writes one per project for everyone; when there is none yet today, this
// device asks the agent itself, once a day. Refresh asks again. The same brief
// can come by email each morning (the switch at the bottom).

const BRIEF_PROMPT =
  'Brief me for today. In 3 to 5 short bullets, most urgent first: what needs my attention on this project, ' +
  'and end with the one thing I should do next. Reference records by their number. No preamble, no headings.'

interface Brief {
  text: string
  index?: Record<string, ObjectRef>
  at: string
  error?: boolean
}

const today = () => new Date().toLocaleDateString('en-CA') // yyyy-mm-dd, local
const keyFor = (projectId: string) => `yam.agent.brief.${projectId}.${today()}`

function readCached(projectId: string): Brief | null {
  try {
    const raw = localStorage.getItem(keyFor(projectId))
    return raw ? (JSON.parse(raw) as Brief) : null
  } catch {
    return null
  }
}

// One request per project at a time, across remounts (StrictMode, revisits).
const inFlight = new Map<string, Promise<Brief>>()

function fetchBrief(projectId: string, onStep: (s: AgentStep) => void): Promise<Brief> {
  const running = inFlight.get(projectId)
  if (running) return running
  const p = callAgent({
    prompt: BRIEF_PROMPT,
    history: [],
    projectId,
    context: 'the daily brief on the home page',
    signal: new AbortController().signal,
    onStep,
  })
    .then((r): Brief => ({ text: r.error ?? r.reply ?? '', index: r.index, at: new Date().toISOString(), error: Boolean(r.error) }))
    .catch((e): Brief => ({ text: e instanceof Error ? e.message : 'Could not reach the agent.', at: new Date().toISOString(), error: true }))
    .then((b) => {
      // Only a good brief is kept for the day; a failure is retried next visit.
      if (!b.error) {
        try {
          localStorage.setItem(keyFor(projectId), JSON.stringify(b))
        } catch {
          // Storage full: the brief still shows, it just is not cached.
        }
      }
      inFlight.delete(projectId)
      return b
    })
  inFlight.set(projectId, p)
  return p
}

export default function AgentBrief() {
  const projectId = useProjectId()
  const navigate = useNavigate()
  const [brief, setBrief] = useState<Brief | null>(() => (projectId ? readCached(projectId) : null))
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [loading, setLoading] = useState(false)
  const qc = useQueryClient()
  const { user } = useAuth()
  const notesQ = useAgentNotes(projectId)
  const serverBrief = todaysBrief(notesQ.data)
  const email = user?.email ?? ''
  const emailQ = useQuery({
    queryKey: ['agent-brief-email', projectId, email],
    queryFn: () => fetchBriefEmail(projectId, email),
    enabled: !!projectId && !!email,
  })
  const [savingEmail, setSavingEmail] = useState(false)
  const toggleEmail = async (on: boolean) => {
    setSavingEmail(true)
    try {
      await setBriefEmail(projectId, on)
      qc.setQueryData(['agent-brief-email', projectId, email], on)
    } catch (e) {
      console.error('Could not change the morning email', e)
    } finally {
      setSavingEmail(false)
    }
  }

  const run = (force = false) => {
    if (!projectId) return
    if (!force) {
      const cached = readCached(projectId)
      if (cached) {
        setBrief(cached)
        return
      }
    }
    if (force) {
      try {
        localStorage.removeItem(keyFor(projectId))
      } catch {
        // ignore
      }
    }
    let alive = true
    setLoading(true)
    setSteps([])
    fetchBrief(projectId, (s) => alive && setSteps((p) => [...p, s])).then((b) => {
      if (!alive) return
      setBrief(b)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }

  // On arrival (and on switching project): today's brief from the morning run
  // if there is one, else this device's cached one, else ask.
  useEffect(() => {
    setBrief(null)
    if (!projectId || notesQ.isLoading) return
    if (serverBrief) {
      setBrief({ text: serverBrief.body, index: serverBrief.refs, at: serverBrief.created_at })
      return
    }
    return run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, notesQ.isLoading, serverBrief?.id])

  const openObject = (_n: string, target: ObjectRef) => {
    const to = routeForObject(target.type, target.id)
    if (to) navigate(to)
  }

  const muted = { color: 'hsl(var(--muted-foreground))' }

  return (
    <Card className="overflow-hidden border-accent/30 print:hidden">
      <div className="h-0.5 bg-gradient-to-r from-accent/0 via-accent/70 to-accent/0" />
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15">
            <Sparkles size={14} className="text-accent" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Today's brief</p>
            <p className="text-[11px] leading-tight" style={muted}>
              {loading
                ? 'The agent is reading the record…'
                : brief && !brief.error
                  ? `Written by the agent at ${new Date(brief.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'From the agent'}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" disabled={loading} onClick={() => run(true)}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {loading && (
          <div className="space-y-1.5 text-xs" style={muted}>
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              {steps.length === 0 ? 'Starting…' : `Read ${steps.length} part${steps.length === 1 ? '' : 's'} of the record`}
            </div>
            {steps.slice(-3).map((s, i) => (
              <div key={i} className="truncate pl-5">
                Reading · {prettyTool(s)}
              </div>
            ))}
          </div>
        )}

        {!loading && brief && (
          <div className={`space-y-1 text-sm leading-relaxed ${brief.error ? 'text-destructive' : ''}`}>
            <LinkedText text={brief.text} index={brief.index} openNumbers={[]} onToggle={openObject} />
          </div>
        )}

        {!loading && brief && !brief.error && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs" style={muted}>
              <Switch
                checked={emailQ.data ?? false}
                disabled={!emailQ.isSuccess || savingEmail}
                onCheckedChange={(on) => void toggleEmail(on)}
                aria-label="Email me this brief every morning"
              />
              <Mail size={12} />
              Email me this every morning
            </label>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openAgent()}>
              <MessageSquarePlus size={13} />
              Ask a follow-up
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
