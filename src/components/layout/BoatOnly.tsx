import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useProject } from '@/lib/query-hooks'
import { homeFor } from './nav'

// The log, crew, hours of rest and Oil Record Book are a boat's (migrations
// 032-039). On a building's record (migration 044) the address can still be
// typed or bookmarked; it goes to that project's home instead of showing a
// boat's page for a house.
export function BoatOnly({ children }: { children: ReactNode }) {
  const { data: project } = useProject()
  const kind = project?.vessel?.asset_kind
  if (kind && kind !== 'VESSEL') return <Navigate to={homeFor(project?.project_type, kind)} replace />
  return <>{children}</>
}
