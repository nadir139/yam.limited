import { day, eur, NONE } from '@/lib/format'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Anchor, BookOpen, Gauge, Pencil, Plane, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import VesselDetailsForm from '@/components/actions/VesselDetailsForm'
import { AssetCard } from '@/components/assets/AssetCard'
import {
  useProject,
  useWorkPackages,
  useInspections,
  useDefects,
  useChangeOrders,
  useApprovals,
  useDocuments,
  useTeam,
  usePermissions,
  useMyRole,
  useOpenInUse,
  useOpenTechLog,
  useOpenLogbook,
  useYardDays,
} from '@/lib/query-hooks'
import { useActiveProject } from '@/contexts/ProjectContext'
import { assetKindOf } from '@/lib/asset'

/** A measurement with its unit, or a dash when nobody has recorded it. */
const measure = (n: number | null | undefined, unit: string) => (n == null ? NONE : `${n}${unit}`)


function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2 border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border))' }}>
      <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
      <span className="text-sm font-medium text-right ml-4">{value}</span>
    </div>
  )
}

export default function ProjectOverview() {
  const navigate = useNavigate()
  const [editingVessel, setEditingVessel] = useState(false)
  const { can } = usePermissions()

  const { data: project, isLoading: projectLoading } = useProject()
  const { data: workPackages = [], isLoading: wpLoading } = useWorkPackages()
  const { data: inspections = [], isLoading: inspLoading } = useInspections()
  const { data: defects = [], isLoading: defectsLoading } = useDefects()
  const { data: changeOrders = [], isLoading: coLoading } = useChangeOrders()
  const { data: approvals = [], isLoading: approvalsLoading } = useApprovals()
  const { data: documents = [], isLoading: docsLoading } = useDocuments()
  const { data: team = [], isLoading: teamLoading } = useTeam()
  const { data: role = null } = useMyRole()
  const { projects, setActiveProjectId } = useActiveProject()
  const openLogbook = useOpenLogbook()
  const openInUse = useOpenInUse()
  const openTechLog = useOpenTechLog()
  const [logbookError, setLogbookError] = useState<string | null>(null)
  // Days the boat's crew logged in the yard for this refit (migration 037).
  const workOnVessel = !!project?.vessel_id && project.project_type !== 'OPERATIONS' && project.project_type !== 'PROPERTY'
  const { data: yardDays = [] } = useYardDays(workOnVessel)

  // Only the record itself gates the page.
  //
  // This used to wait on the supplementary lists too, which meant one slow or
  // stuck list query left the whole page on "Loading..." indefinitely -- with
  // the record already fetched and sitting in the cache, unreachable. The
  // sections below all default to an empty array, so they render as "nothing
  // linked" until their data arrives and fill in when it does.
  const isLoading = projectLoading

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
  }

  if (!project) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Project not found.</div>
  }

  const vessel = project.vessel

  // A boat's logbook (migration 032) is the boat in service: no yard, budget
  // or phases of work, so its overview is the vessel and the way into the log.
  const isOps = project.project_type === 'OPERATIONS'
  const logbookProject = project.vessel_id
    ? projects.find((p) => p.project_type === 'OPERATIONS' && p.vessel_id === project.vessel_id)
    : undefined
  const mayOpenLogbook = role === 'OWNER' || role === 'OWNERS_REP' || role === 'CAPTAIN'

  const assetKind = assetKindOf(project)
  const isBuilding = assetKind === 'BUILDING'
  const QUICK_LINKS = isOps && assetKind === 'AIRCRAFT' ? [
    { label: 'Tech log', count: null, path: '/app/tech-log', color: 'hsl(var(--primary))' },
    { label: 'Maintenance', count: null, path: '/app/maintenance', color: 'hsl(var(--accent))' },
    { label: 'Documents', count: documents.length, path: '/app/documents', color: 'hsl(var(--success))' },
    { label: 'Team Members', count: team.length, path: '/app/team', color: 'hsl(215 50% 50%)' },
  ] : isOps && isBuilding ? [
    { label: 'Maintenance', count: null, path: '/app/maintenance', color: 'hsl(var(--primary))' },
    { label: 'Parts', count: null, path: '/app/parts', color: 'hsl(var(--accent))' },
    { label: 'Documents', count: documents.length, path: '/app/documents', color: 'hsl(var(--success))' },
    { label: 'Team Members', count: team.length, path: '/app/team', color: 'hsl(215 50% 50%)' },
  ] : isOps ? [
    { label: 'Logbook', count: null, path: '/app/logbook', color: 'hsl(var(--primary))' },
    { label: 'Crew', count: null, path: '/app/crew', color: 'hsl(var(--accent))' },
    { label: 'Documents', count: documents.length, path: '/app/documents', color: 'hsl(var(--success))' },
    { label: 'Team Members', count: team.length, path: '/app/team', color: 'hsl(215 50% 50%)' },
  ] : [
    { label: 'Work Packages', count: workPackages.length, path: '/app/work-packages', color: 'hsl(var(--primary))' },
    { label: 'Inspections', count: inspections.length, path: '/app/inspections', color: 'hsl(var(--accent))' },
    { label: 'Defects / NCRs', count: defects.length, path: '/app/defects', color: 'hsl(var(--destructive))' },
    { label: 'Change Orders', count: changeOrders.length, path: '/app/change-orders', color: 'hsl(38 92% 50%)' },
    { label: 'Approvals', count: approvals.length, path: '/app/approvals', color: 'hsl(var(--warning))' },
    { label: 'Documents', count: documents.length, path: '/app/documents', color: 'hsl(var(--success))' },
    { label: 'Team Members', count: team.length, path: '/app/team', color: 'hsl(215 50% 50%)' },
  ]

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Project Overview</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {project.name}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* The asset: a building on a property project (migration 043), else the boat. */}
        {assetKind !== 'VESSEL' ? (
          <AssetCard kind={assetKind} asset={vessel ?? null} canEdit={can('action_set_project_asset')} />
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Vessel Details</CardTitle>
              {/* The Action refuses on a property and for roles without the
                  permission; the button follows the same rules. */}
              {can('action_set_project_vessel') && (
                <Button size="sm" variant="outline" onClick={() => setEditingVessel(true)}>
                  {vessel ? <Pencil size={13} className="mr-1.5" /> : <Plus size={13} className="mr-1.5" />}
                  {vessel ? 'Edit' : 'Add vessel'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {vessel && (
                <>
                  <div className="mb-4">
                    <div className="text-2xl font-bold">{vessel.name}</div>
                    <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {[vessel.vessel_type, vessel.year_built].filter(Boolean).join(' · ') || NONE}
                    </div>
                  </div>
                  <DetailRow label="Hull ID" value={vessel.hull_id ?? NONE} />
                  <DetailRow label="LOA" value={measure(vessel.loa, 'm')} />
                  <DetailRow label="Beam" value={measure(vessel.beam, 'm')} />
                  <DetailRow label="Draft" value={measure(vessel.draft, 'm')} />
                  <DetailRow label="Gross Tonnage" value={measure(vessel.gross_tonnage, ' GT')} />
                  <DetailRow label="Flag State" value={vessel.flag_state ?? NONE} />
                  <DetailRow
                    label="Class Society"
                    value={
                      vessel.class_society ? (
                        <span>
                          {vessel.class_society}{' '}
                          <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {vessel.class_number}
                          </span>
                        </span>
                      ) : (
                        NONE
                      )
                    }
                  />
                  <DetailRow label="Year Built" value={vessel.year_built ?? NONE} />
                  <DetailRow label="Build Yard" value={vessel.build_yard ?? NONE} />
                </>
              )}
              {!vessel && (
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {'No vessel recorded yet. Add the boat this project is about — a name is enough to start — or tell the agent.'}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={editingVessel} onOpenChange={setEditingVessel}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{vessel ? 'Edit vessel' : 'Add vessel'}</DialogTitle>
            </DialogHeader>
            {editingVessel && (
              <VesselDetailsForm vessel={vessel ?? null} onDone={() => setEditingVessel(false)} />
            )}
          </DialogContent>
        </Dialog>

        {/* The boat's logbook: one per vessel, shared by every project on her. */}
        {!isOps && vessel && (vessel.asset_kind ?? 'VESSEL') === 'VESSEL' && (logbookProject || mayOpenLogbook) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen size={16} /> The boat's logbook
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0 text-sm">
              <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                {vessel.name}'s days at sea, crew and log entries, kept by her captain and crew. It
                stays with the boat across every refit and owner.
              </p>
              {logbookProject ? (
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    setActiveProjectId(logbookProject.id)
                    navigate('/app/logbook')
                  }}
                >
                  Go to the logbook
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="self-start"
                  disabled={openLogbook.isPending}
                  onClick={() => {
                    setLogbookError(null)
                    openLogbook.mutate(
                      { fromProjectId: project.id },
                      { onSuccess: () => navigate('/app/logbook'), onError: (e) => setLogbookError(e.message) },
                    )
                  }}
                >
                  {openLogbook.isPending ? 'Opening…' : 'Open the logbook'}
                </Button>
              )}
              {logbookError && <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{logbookError}</p>}
            </CardContent>
          </Card>
        )}

        {/* An aircraft's tech log (migration 045): its flights, total time and maintenance. */}
        {!isOps && vessel?.asset_kind === 'AIRCRAFT' && (logbookProject || mayOpenLogbook) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plane size={16} /> The tech log
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0 text-sm">
              <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                {vessel.name}'s flights, total time and landings, and the maintenance they move. It stays with the aircraft across
                every check and owner.
              </p>
              {logbookProject ? (
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    setActiveProjectId(logbookProject.id)
                    navigate('/app/tech-log')
                  }}
                >
                  Go to the tech log
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="self-start"
                  disabled={openTechLog.isPending}
                  onClick={() => {
                    setLogbookError(null)
                    openTechLog.mutate(project.id, { onSuccess: () => navigate('/app/tech-log'), onError: (e) => setLogbookError(e.message) })
                  }}
                >
                  {openTechLog.isPending ? 'Opening…' : 'Open the tech log'}
                </Button>
              )}
              {logbookError && <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{logbookError}</p>}
            </CardContent>
          </Card>
        )}

        {/* A building in use (migration 044): its maintenance, parts and money between renovations. */}
        {!isOps && vessel?.asset_kind === 'BUILDING' && (logbookProject || role === 'OWNER' || role === 'OWNERS_REP') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge size={16} /> The building in use
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0 text-sm">
              <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                {vessel.name}'s maintenance (boiler, roof, alarms), parts and money between renovations. It stays with the
                building after this project ends.
              </p>
              {logbookProject ? (
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    setActiveProjectId(logbookProject.id)
                    navigate('/app/maintenance')
                  }}
                >
                  Go to the building in use
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="self-start"
                  disabled={openInUse.isPending}
                  onClick={() => {
                    setLogbookError(null)
                    openInUse.mutate(
                      { fromProjectId: project.id },
                      { onSuccess: () => navigate('/app/maintenance'), onError: (e) => setLogbookError(e.message) },
                    )
                  }}
                >
                  {openInUse.isPending ? 'Opening…' : 'Open the building in use'}
                </Button>
              )}
              {logbookError && <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{logbookError}</p>}
            </CardContent>
          </Card>
        )}

        {/* The real days in the yard, from the boat's own log, against the plan. */}
        {workOnVessel && yardDays.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Anchor size={16} /> Days in the yard, from the logbook
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-4 pb-4 pt-0 text-sm">
              <p>
                <span className="text-lg font-bold">{yardDays.length}</span> day{yardDays.length === 1 ? '' : 's'} logged in
                the yard by the crew, {day(yardDays[0].log_date)} to {day(yardDays[yardDays.length - 1].log_date)}
                {yardDays[yardDays.length - 1].port ? `, latest at ${yardDays[yardDays.length - 1].port}` : ''}.
              </p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Planned {project.planned_start ? day(project.planned_start) : NONE} to{' '}
                {project.planned_delivery ? day(project.planned_delivery) : NONE}. A day the crew log as yard while this
                project is under way counts here; the crew's notes stay in their log.
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer">Each day</summary>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {yardDays.map((d) => (
                    <li key={d.log_date}>
                      {day(d.log_date)}
                      {d.port ? ` · ${d.port}` : ''} · {d.crew_aboard} aboard
                      {d.recorded_by_name ? ` · logged by ${d.recorded_by_name}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            </CardContent>
          </Card>
        )}

        {/* Project details */}
        {!isOps && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge style={{ backgroundColor: 'hsl(var(--primary))', color: 'white', border: 'none' }}>
                {project.project_type.replace(/_/g, ' ')}
              </Badge>
              <Badge style={{ backgroundColor: 'hsl(var(--accent))', color: 'white', border: 'none' }}>
                {project.phase.replace(/_/g, ' ')}
              </Badge>
            </div>
            <DetailRow label="Yard" value={project.yard_name} />
            <DetailRow label="Location" value={project.yard_location} />
            <DetailRow label="Planned Start" value={day(project.planned_start)} />
            <DetailRow label="Planned Delivery" value={day(project.planned_delivery)} />
            <DetailRow label="Budget Locked" value={eur(project.budget_locked)} />
            <DetailRow label="Budget Spent" value={eur(project.budget_spent)} />
            <DetailRow label="Contingency" value={eur(project.budget_contingency)} />
            <DetailRow label="Class Society" value={project.class_society} />
            {project.survey_due_date && (
              <DetailRow
                label="Survey Due"
                value={
                  <span style={{ color: 'hsl(var(--warning))' }}>
                    {day(project.survey_due_date)}
                  </span>
                }
              />
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {/* Quick links grid */}
      <div>
        <h2 className="text-base font-semibold mb-3">Project Objects</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="text-left rounded-[var(--radius)] border p-4 transition-all hover:shadow-md"
              style={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
              }}
            >
              <div
                className="text-3xl font-bold mb-1"
                style={{ color: link.color }}
              >
                {link.count ?? "→"}
              </div>
              <div className="text-sm font-medium">{link.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
