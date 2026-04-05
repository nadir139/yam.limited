import React, { useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useInspections, useWorkPackages } from '@/lib/query-hooks'
import type { InspectionResult } from '@/lib/types'
import RecordInspectionResult from '@/components/actions/RecordInspectionResult'

const RESULT_STYLES: Record<InspectionResult, { bg: string; text: string }> = {
  PASS: { bg: 'hsl(158 64% 40% / 0.15)', text: 'hsl(var(--success))' },
  CONDITIONAL_PASS: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 80% 38%)' },
  FAIL: { bg: 'hsl(0 72% 51% / 0.12)', text: 'hsl(var(--destructive))' },
  PENDING: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))' },
}

const ROLE_LABELS: Record<string, string> = {
  CLASS_SURVEYOR: 'Class Surveyor',
  OWNERS_REP: "Owner's Rep",
  YARD_QC: 'Yard QC',
  FLAG_STATE: 'Flag State',
}

const RESULT_FILTERS: (InspectionResult | 'ALL')[] = ['ALL', 'PENDING', 'PASS', 'CONDITIONAL_PASS', 'FAIL']

export default function InspectionList() {
  const { data: inspections = [], isLoading: inspLoading } = useInspections()
  const { data: workPackages = [], isLoading: wpLoading } = useWorkPackages()
  const [search, setSearch] = useState('')
  const [resultFilter, setResultFilter] = useState<string>('ALL')

  const isLoading = inspLoading || wpLoading

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
  }

  const filtered = inspections.filter((i) => {
    const matchesSearch =
      search === '' ||
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.inspection_number.toLowerCase().includes(search.toLowerCase())
    const matchesResult = resultFilter === 'ALL' || i.result === resultFilter
    return matchesSearch && matchesResult
  })

  const pending = filtered.filter((i) => i.result === 'PENDING').length
  const classCount = filtered.filter((i) => i.is_class_inspection).length

  const selectStyle: React.CSSProperties = {
    borderColor: 'hsl(var(--border))',
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    padding: '0.375rem 0.75rem',
    borderRadius: 'var(--radius)',
    border: '1px solid hsl(var(--border))',
    fontSize: '0.875rem',
    height: '2.25rem',
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Inspections</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {inspections.length} events · {pending} pending · {classCount} class items
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} style={selectStyle}>
          {RESULT_FILTERS.map((r) => (
            <option key={r} value={r}>{r === 'ALL' ? 'All Results' : r.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <Input
          placeholder="Search inspections..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <div className="ml-auto text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {filtered.length} of {inspections.length} shown
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((insp) => {
          const rs = RESULT_STYLES[insp.result]
          const linkedWP = insp.work_package_id
            ? workPackages.find((w) => w.id === insp.work_package_id)
            : null

          return (
            <Card key={insp.id} style={{
              borderLeft: insp.result === 'FAIL'
                ? '3px solid hsl(var(--destructive))'
                : insp.result === 'CONDITIONAL_PASS'
                ? '3px solid hsl(38 92% 50%)'
                : undefined,
            }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {insp.inspection_number}
                    </div>
                    <div className="font-semibold text-sm leading-tight">{insp.title}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge style={{ backgroundColor: rs.bg, color: rs.text, border: 'none', fontSize: '11px' }}>
                      {insp.result.replace(/_/g, ' ')}
                    </Badge>
                    <RecordInspectionResult inspection={insp} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <Badge style={{ backgroundColor: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))', border: 'none', fontSize: '11px' }}>
                    {ROLE_LABELS[insp.inspector_role] || insp.inspector_role}
                  </Badge>
                  {insp.is_class_inspection && (
                    <Badge style={{ backgroundColor: 'hsl(var(--accent)/0.15)', color: 'hsl(var(--accent))', border: 'none', fontSize: '11px' }}>
                      <CheckCircle2 size={10} className="mr-1" /> Class
                    </Badge>
                  )}
                  {linkedWP && (
                    <Badge style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: 'none', fontSize: '11px' }}>
                      {linkedWP.wp_number}
                    </Badge>
                  )}
                </div>

                <div className="text-xs flex justify-between" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <span>{insp.inspector_name}</span>
                  <span>
                    {insp.actual_date
                      ? `Completed ${format(new Date(insp.actual_date), 'd MMM yyyy')}`
                      : `Scheduled ${format(new Date(insp.scheduled_date), 'd MMM yyyy')}`}
                  </span>
                </div>

                {insp.notes && (
                  <div
                    className="mt-2 text-xs rounded p-2 line-clamp-2"
                    style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                  >
                    {insp.notes}
                  </div>
                )}

                {insp.defect_count > 0 && (
                  <div className="mt-2 text-xs font-medium" style={{ color: 'hsl(var(--destructive))' }}>
                    {insp.defect_count} defect{insp.defect_count !== 1 ? 's' : ''} recorded
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <div
            className="col-span-2 text-center py-16 rounded-lg border border-dashed"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
          >
            No inspections match the current filters.
          </div>
        )}
      </div>
    </div>
  )
}
