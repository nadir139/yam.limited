import React from 'react'
import { format } from 'date-fns'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MOCK_INSPECTIONS, MOCK_WORK_PACKAGES } from '@/lib/mock-data'
import type { InspectionResult } from '@/lib/types'

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

export default function InspectionList() {
  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Inspections</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {MOCK_INSPECTIONS.length} inspection events scheduled
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MOCK_INSPECTIONS.map((insp) => {
          const rs = RESULT_STYLES[insp.result]
          const linkedWP = insp.work_package_id
            ? MOCK_WORK_PACKAGES.find((w) => w.id === insp.work_package_id)
            : null

          return (
            <Card key={insp.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {insp.inspection_number}
                    </div>
                    <div className="font-semibold text-sm">{insp.title}</div>
                  </div>
                  <Badge style={{ backgroundColor: rs.bg, color: rs.text, border: 'none', fontSize: '11px' }}>
                    {insp.result}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge
                    style={{
                      backgroundColor: 'hsl(var(--primary)/0.1)',
                      color: 'hsl(var(--primary))',
                      border: 'none',
                      fontSize: '11px',
                    }}
                  >
                    {ROLE_LABELS[insp.inspector_role] || insp.inspector_role}
                  </Badge>
                  {insp.is_class_inspection && (
                    <Badge
                      style={{
                        backgroundColor: 'hsl(var(--accent)/0.15)',
                        color: 'hsl(var(--accent))',
                        border: 'none',
                        fontSize: '11px',
                      }}
                    >
                      <CheckCircle2 size={10} className="mr-1" /> Class
                    </Badge>
                  )}
                  {linkedWP && (
                    <Badge
                      style={{
                        backgroundColor: 'hsl(var(--muted))',
                        color: 'hsl(var(--muted-foreground))',
                        border: 'none',
                        fontSize: '11px',
                      }}
                    >
                      {linkedWP.wp_number}
                    </Badge>
                  )}
                </div>

                <div className="text-xs flex justify-between" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <span>{insp.inspector_name}</span>
                  <span>
                    Scheduled: {format(new Date(insp.scheduled_date), 'd MMM yyyy')}
                  </span>
                </div>

                {insp.defect_count > 0 && (
                  <div className="mt-2 text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                    {insp.defect_count} defect{insp.defect_count !== 1 ? 's' : ''} recorded
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
