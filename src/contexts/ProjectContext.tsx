import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMyProjects } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import type { Project } from '@/lib/types'

// Which project the app is looking at.
//
// Everything used to be Project ZERO: `PROJECT_ID` was a module constant in
// db.ts and eleven queries filtered on it. That made a second project
// impossible to add without touching every read, and — worse — the Actions had
// the same habit server-side, so an NCR raised while "on" a property would have
// been filed against the ketch with nothing looking wrong.
//
// The list comes from `projects`, whose read policy is already scoped to
// membership, so this cannot show a project the user does not belong to. The
// selection is persisted per user rather than globally: two accounts sharing a
// browser should not inherit each other's last project.

interface ProjectContextValue {
  projects: Project[]
  activeProjectId: string | null
  activeProject: Project | null
  setActiveProjectId: (id: string) => void
  isLoading: boolean
  /** Signed in, but a member of nothing — a real state, not an error. */
  hasNoProjects: boolean
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  activeProjectId: null,
  activeProject: null,
  setActiveProjectId: () => {},
  isLoading: true,
  hasNoProjects: false,
})

const storageKey = (email: string) => `yam.project.${email.toLowerCase()}`

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const email = user?.email ?? ''

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['my-projects', email],
    queryFn: fetchMyProjects,
    enabled: Boolean(email),
    staleTime: 5 * 60_000,
  })

  const [selected, setSelected] = useState<string | null>(null)

  // Restore on sign-in, and fall back rather than trapping the user on a
  // project they were removed from since they last looked.
  useEffect(() => {
    if (!email || projects.length === 0) return
    const stored = localStorage.getItem(storageKey(email))
    const valid = stored && projects.some((p) => p.id === stored) ? stored : projects[0].id
    setSelected((current) =>
      current && projects.some((p) => p.id === current) ? current : valid,
    )
  }, [email, projects])

  const setActiveProjectId = (id: string) => {
    setSelected(id)
    if (email) localStorage.setItem(storageKey(email), id)
  }

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      activeProjectId: selected,
      activeProject: projects.find((p) => p.id === selected) ?? null,
      setActiveProjectId,
      isLoading,
      hasNoProjects: !isLoading && Boolean(email) && projects.length === 0,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, selected, isLoading, email],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export const useActiveProject = () => useContext(ProjectContext)

/**
 * The active project's id for a query that cannot run without one.
 *
 * Returns '' while it is still resolving, which callers pass to `enabled` so a
 * query never fires against the wrong project during the first paint.
 */
export const useProjectId = () => useActiveProject().activeProjectId ?? ''
