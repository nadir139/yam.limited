import { useState } from 'react'
import { Check, ChevronsUpDown, Plus, Ship, Home, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useActiveProject } from '@/contexts/ProjectContext'
import { useTranslation } from '@/lib/i18n'
import CreateProjectForm from '@/components/actions/CreateProjectForm'
import type { Project } from '@/lib/types'

// Which project you are in, and how to leave it.
//
// The name in the top bar used to be the literal string "Project ZERO" with
// "55m Ketch · RINA" underneath it — true of the demo and of nothing else. It
// now names the project you are actually looking at, and the subtitle says what
// kind of thing it is, because "yard" means something different for a ketch at
// Pendennis than for a farmhouse outside Olbia.

function projectIcon(type: Project['project_type']) {
  if (type === 'PROPERTY') return Home
  if (type === 'FIVE_YEAR_SURVEY' || type === 'ANNUAL_SURVEY') return ClipboardCheck
  return Ship
}

export default function ProjectSwitcher() {
  const { projects, activeProject, setActiveProjectId, isLoading } = useActiveProject()
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)

  if (isLoading) {
    return (
      <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {t('common.loading')}
      </div>
    )
  }

  const Icon = activeProject ? projectIcon(activeProject.project_type) : Ship
  const subtitle = activeProject
    ? [
        t(`projectType.${activeProject.project_type}`),
        activeProject.yard_location || activeProject.yard_name,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted"
            aria-label={t('project.switch')}
          >
            <Icon size={16} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight">
                {activeProject?.name ?? t('project.none')}
              </span>
              {subtitle && (
                <span
                  className="block truncate text-[11px] leading-tight"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  {subtitle}
                </span>
              )}
            </span>
            <ChevronsUpDown size={13} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs font-normal" >
            {t('project.yours', { count: projects.length })}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.map((p) => {
            const P = projectIcon(p.project_type)
            const active = p.id === activeProject?.id
            return (
              <DropdownMenuItem
                key={p.id}
                onClick={() => setActiveProjectId(p.id)}
                className="gap-2"
              >
                <P size={14} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span
                    className="block truncate text-[11px]"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  >
                    {t(`projectType.${p.project_type}`)} · {t(`phase.${p.phase}`)}
                  </span>
                </span>
                {active && <Check size={14} style={{ flexShrink: 0 }} />}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)} className="gap-2">
            <Plus size={14} />
            {t('project.create')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('project.create')}</DialogTitle>
          </DialogHeader>
          <CreateProjectForm onDone={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The empty state: signed in, member of nothing. */
export function NoProjects() {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-lg font-semibold">{t('project.emptyTitle')}</h1>
      <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {t('project.emptyBody')}
      </p>
      <Button onClick={() => setCreating(true)} className="mt-2">
        <Plus size={14} className="mr-1.5" />
        {t('project.create')}
      </Button>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('project.create')}</DialogTitle>
          </DialogHeader>
          <CreateProjectForm onDone={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
