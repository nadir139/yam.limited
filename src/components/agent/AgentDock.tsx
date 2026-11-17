import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useActiveProject } from '@/contexts/ProjectContext'
import { MOBILE_NAV_HEIGHT } from '@/components/layout/MobileNav'
import { AGENT_OPEN_EVENT, openAgent } from './page-context'
import { lastSeen, markSeen, noticesOf, useAgentNotes, useAgentNotesLive } from './notes'

const AgentDockPanel = lazy(() => import('./AgentDockPanel'))

// The agent, one tap away on every page.
//
// A floating button bottom-right (above the tab bar on a phone), ⌘J / Ctrl+J
// from the keyboard, or openAgent() from any component. Not shown on the full
// console, which is the same conversation at full size.

export default function AgentDock({ isMobile }: { isMobile: boolean }) {
  const { pathname } = useLocation()
  const { activeProjectId, hasNoProjects } = useActiveProject()
  const [open, setOpen] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>()
  const hidden = pathname === '/app/agent' || !activeProjectId || hasNoProjects
  const projectId = activeProjectId ?? ''

  // What the agent noticed since you last opened it: a dot on the button.
  const { data: notes } = useAgentNotes(projectId)
  const [seenAt, setSeenAt] = useState(() => lastSeen(projectId))
  useEffect(() => setSeenAt(lastSeen(projectId)), [projectId])
  const unseen = noticesOf(notes).filter((n) => n.created_at > seenAt).length

  // A notice written while you are here arrives as it is written.
  useAgentNotesLive(projectId, (n) => {
    toast(n.title, {
      description: n.body.length > 160 ? `${n.body.slice(0, 157)}…` : n.body,
      icon: <Sparkles size={14} className="text-accent" />,
      duration: 12_000,
      action: n.suggestion ? { label: 'Ask', onClick: () => openAgent(n.suggestion ?? undefined) } : undefined,
    })
  })

  // Opening the dock counts as having seen what was there.
  useEffect(() => {
    if (open && projectId) {
      markSeen(projectId)
      setSeenAt(new Date().toISOString())
    }
  }, [open, projectId, notes])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt
      setInitialPrompt(prompt)
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(AGENT_OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(AGENT_OPEN_EVENT, onOpen)
    }
  }, [])

  // On the console itself the dock steps aside.
  useEffect(() => {
    if (hidden) setOpen(false)
  }, [hidden])

  if (hidden) return null

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setInitialPrompt(undefined)
            setOpen(true)
          }}
          className="group fixed right-4 z-30 flex items-center gap-2 rounded-full border border-accent/30 bg-background/95 py-2.5 pl-3 pr-4 text-sm font-medium shadow-lg backdrop-blur transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-xl print:hidden md:right-6"
          style={{ bottom: isMobile ? `calc(${MOBILE_NAV_HEIGHT + 12}px + env(safe-area-inset-bottom))` : 24 }}
          aria-label="Ask the YAM agent"
        >
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-accent/15">
            <Sparkles size={14} className="text-accent" />
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/20 [animation-duration:3s]" />
          </span>
          Ask YAM
          {unseen > 0 && (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground"
              aria-label={`${unseen} new from the agent`}
            >
              {unseen}
            </span>
          )}
          <kbd className="ml-1 hidden rounded border px-1 font-mono text-[10px] text-muted-foreground md:inline">⌘J</kbd>
        </button>
      )}
      <Sheet open={open} onOpenChange={setOpen} modal={false}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
          // Non-modal: the page stays usable beside the agent, and a chip in a
          // reply can open its record without closing the conversation.
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SheetTitle className="sr-only">YAM agent</SheetTitle>
          {open && (
            <Suspense fallback={null}>
              <AgentDockPanel initialPrompt={initialPrompt} onClose={() => setOpen(false)} />
            </Suspense>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
