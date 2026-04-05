import React from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  useProject,
  useWorkPackages,
  useInspections,
  useDefects,
  useChangeOrders,
  useApprovals,
  useDocuments,
  useTeam,
} from '@/lib/query-hooks'

const eur = (amount: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount)

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

  const { data: project, isLoading: projectLoading } = useProject()
  const { data: workPackages = [], isLoading: wpLoading } = useWorkPackages()
  const { data: inspections = [], isLoading: inspLoading } = useInspections()
  const { data: defects = [], isLoading: defectsLoading } = useDefects()
  const { data: changeOrders = [], isLoading: coLoading } = useChangeOrders()
  const { data: approvals = [], isLoading: approvalsLoading } = useApprovals()
  const { data: documents = [], isLoading: docsLoading } = useDocuments()
  const { data: team = [], isLoading: teamLoading } = useTeam()

  const isLoading =
    projectLoading || wpLoading || inspLoading || defectsLoading ||
    coLoading || approvalsLoading || docsLoading || teamLoading

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
  }

  if (!project) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Project not found.</div>
  }

  const vessel = project.vessel

  const QUICK_LINKS = [
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
        {/* Vessel details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vessel Details</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {vessel && (
              <>
                <div className="mb-4">
                  <div className="text-2xl font-bold">{vessel.name}</div>
                  <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {vessel.vessel_type}
                  </div>
                </div>
                <DetailRow label="Hull ID" value={vessel.hull_id} />
                <DetailRow label="LOA" value={`${vessel.loa}m`} />
                <DetailRow label="Beam" value={`${vessel.beam}m`} />
                <DetailRow label="Draft" value={`${vessel.draft}m`} />
                <DetailRow label="Gross Tonnage" value={`${vessel.gross_tonnage} GT`} />
                <DetailRow label="Flag State" value={vessel.flag_state} />
                <DetailRow
                  label="Class Society"
                  value={
                    <span>
                      {vessel.class_society}{' '}
                      <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {vessel.class_number}
                      </span>
                    </span>
                  }
                />
                <DetailRow label="Year Built" value={String(vessel.year_built)} />
                <DetailRow label="Build Yard" value={vessel.build_yard} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Project details */}
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
            <DetailRow label="Planned Start" value={format(new Date(project.planned_start), 'd MMM yyyy')} />
            <DetailRow label="Planned Delivery" value={format(new Date(project.planned_delivery), 'd MMM yyyy')} />
            <DetailRow label="Budget Locked" value={eur(project.budget_locked)} />
            <DetailRow label="Budget Spent" value={eur(project.budget_spent)} />
            <DetailRow label="Contingency" value={eur(project.budget_contingency)} />
            <DetailRow label="Class Society" value={project.class_society} />
            {project.survey_due_date && (
              <DetailRow
                label="Survey Due"
                value={
                  <span style={{ color: 'hsl(var(--warning))' }}>
                    {format(new Date(project.survey_due_date), 'd MMM yyyy')}
                  </span>
                }
              />
            )}
          </CardContent>
        </Card>
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
                {link.count}
              </div>
              <div className="text-sm font-medium">{link.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
