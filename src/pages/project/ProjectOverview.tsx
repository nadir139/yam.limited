import React from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  MOCK_VESSEL,
  MOCK_PROJECT,
  MOCK_WORK_PACKAGES,
  MOCK_INSPECTIONS,
  MOCK_DEFECTS,
  MOCK_CHANGE_ORDERS,
  MOCK_APPROVALS,
  MOCK_DOCUMENTS,
  MOCK_MEMBERS,
} from '@/lib/mock-data'

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

const QUICK_LINKS = [
  { label: 'Work Packages', count: MOCK_WORK_PACKAGES.length, path: '/work-packages', color: 'hsl(var(--primary))' },
  { label: 'Inspections', count: MOCK_INSPECTIONS.length, path: '/inspections', color: 'hsl(var(--accent))' },
  { label: 'Defects / NCRs', count: MOCK_DEFECTS.length, path: '/defects', color: 'hsl(var(--destructive))' },
  { label: 'Change Orders', count: MOCK_CHANGE_ORDERS.length, path: '/change-orders', color: 'hsl(38 92% 50%)' },
  { label: 'Approvals', count: MOCK_APPROVALS.length, path: '/approvals', color: 'hsl(var(--warning))' },
  { label: 'Documents', count: MOCK_DOCUMENTS.length, path: '/documents', color: 'hsl(var(--success))' },
  { label: 'Team Members', count: MOCK_MEMBERS.length, path: '/team', color: 'hsl(215 50% 50%)' },
]

export default function ProjectOverview() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Project Overview</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {MOCK_PROJECT.name}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vessel details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vessel Details</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="mb-4">
              <div className="text-2xl font-bold">{MOCK_VESSEL.name}</div>
              <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {MOCK_VESSEL.vessel_type}
              </div>
            </div>
            <DetailRow label="Hull ID" value={MOCK_VESSEL.hull_id} />
            <DetailRow label="LOA" value={`${MOCK_VESSEL.loa}m`} />
            <DetailRow label="Beam" value={`${MOCK_VESSEL.beam}m`} />
            <DetailRow label="Draft" value={`${MOCK_VESSEL.draft}m`} />
            <DetailRow label="Gross Tonnage" value={`${MOCK_VESSEL.gross_tonnage} GT`} />
            <DetailRow label="Flag State" value={MOCK_VESSEL.flag_state} />
            <DetailRow
              label="Class Society"
              value={
                <span>
                  {MOCK_VESSEL.class_society}{' '}
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {MOCK_VESSEL.class_number}
                  </span>
                </span>
              }
            />
            <DetailRow label="Year Built" value={String(MOCK_VESSEL.year_built)} />
            <DetailRow label="Build Yard" value={MOCK_VESSEL.build_yard} />
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
                {MOCK_PROJECT.project_type.replace(/_/g, ' ')}
              </Badge>
              <Badge style={{ backgroundColor: 'hsl(var(--accent))', color: 'white', border: 'none' }}>
                {MOCK_PROJECT.phase.replace(/_/g, ' ')}
              </Badge>
            </div>
            <DetailRow label="Yard" value={MOCK_PROJECT.yard_name} />
            <DetailRow label="Location" value={MOCK_PROJECT.yard_location} />
            <DetailRow label="Planned Start" value={format(new Date(MOCK_PROJECT.planned_start), 'd MMM yyyy')} />
            <DetailRow label="Planned Delivery" value={format(new Date(MOCK_PROJECT.planned_delivery), 'd MMM yyyy')} />
            <DetailRow label="Budget Locked" value={eur(MOCK_PROJECT.budget_locked)} />
            <DetailRow label="Budget Spent" value={eur(MOCK_PROJECT.budget_spent)} />
            <DetailRow label="Contingency" value={eur(MOCK_PROJECT.budget_contingency)} />
            <DetailRow label="Class Society" value={MOCK_PROJECT.class_society} />
            {MOCK_PROJECT.survey_due_date && (
              <DetailRow
                label="Survey Due"
                value={
                  <span style={{ color: 'hsl(var(--warning))' }}>
                    {format(new Date(MOCK_PROJECT.survey_due_date), 'd MMM yyyy')}
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
