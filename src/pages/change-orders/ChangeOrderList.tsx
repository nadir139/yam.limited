import React from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { GitBranch } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MOCK_CHANGE_ORDERS, MOCK_DEFECTS, MOCK_APPROVALS } from '@/lib/mock-data'

const TRIGGER_COLORS: Record<string, { bg: string; text: string }> = {
  CLASS_REQUIREMENT: { bg: 'hsl(215 50% 23% / 0.1)', text: 'hsl(var(--primary))' },
  OWNER_REQUEST: { bg: 'hsl(185 60% 40% / 0.12)', text: 'hsl(var(--accent))' },
  DEFECT_DISCOVERY: { bg: 'hsl(0 72% 51% / 0.1)', text: 'hsl(var(--destructive))' },
  SCOPE_GROWTH: { bg: 'hsl(38 92% 50% / 0.12)', text: 'hsl(38 80% 38%)' },
  REGULATORY: { bg: 'hsl(260 60% 50% / 0.1)', text: 'hsl(260 60% 45%)' },
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))' },
  PENDING_APPROVAL: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 80% 38%)' },
  APPROVED: { bg: 'hsl(158 64% 40% / 0.15)', text: 'hsl(var(--success))' },
  REJECTED: { bg: 'hsl(0 72% 51% / 0.1)', text: 'hsl(var(--destructive))' },
  IMPLEMENTED: { bg: 'hsl(215 50% 23% / 0.1)', text: 'hsl(var(--primary))' },
}

export default function ChangeOrderList() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Change Orders</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {MOCK_CHANGE_ORDERS.length} change order{MOCK_CHANGE_ORDERS.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {MOCK_CHANGE_ORDERS.map((co) => {
          const tc = TRIGGER_COLORS[co.trigger_type]
          const sc = STATUS_STYLES[co.status]
          const linkedDefect = co.defect_record_id
            ? MOCK_DEFECTS.find((d) => d.id === co.defect_record_id)
            : null
          const linkedApproval = co.approval_id
            ? MOCK_APPROVALS.find((a) => a.id === co.approval_id)
            : null

          return (
            <Card
              key={co.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/change-orders/${co.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GitBranch size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <span className="font-mono text-sm font-bold">{co.co_number}</span>
                  </div>
                  <Badge style={{ backgroundColor: sc.bg, color: sc.text, border: 'none' }}>
                    {co.status.replace(/_/g, ' ')}
                  </Badge>
                </div>

                <div className="font-semibold mb-2">{co.title}</div>
                <p className="text-sm mb-4 line-clamp-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {co.description}
                </p>

                <div className="flex flex-wrap gap-2 items-center">
                  <Badge style={{ backgroundColor: tc.bg, color: tc.text, border: 'none', fontSize: '11px' }}>
                    {co.trigger_type.replace(/_/g, ' ')}
                  </Badge>

                  <span
                    className="text-sm font-semibold"
                    style={{ color: co.cost_delta >= 0 ? 'hsl(var(--destructive))' : 'hsl(var(--success))' }}
                  >
                    {co.cost_delta >= 0 ? '+' : ''}
                    {new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(co.cost_delta)}
                  </span>

                  {co.schedule_delta_days !== 0 && (
                    <span
                      className="text-sm font-medium"
                      style={{ color: co.schedule_delta_days > 0 ? 'hsl(var(--warning))' : 'hsl(var(--success))' }}
                    >
                      {co.schedule_delta_days > 0 ? '+' : ''}{co.schedule_delta_days} days
                    </span>
                  )}

                  {linkedDefect && (
                    <Badge style={{ backgroundColor: 'hsl(0 72% 51% / 0.08)', color: 'hsl(var(--destructive))', border: 'none', fontSize: '11px' }}>
                      {linkedDefect.ncr_number}
                    </Badge>
                  )}

                  {linkedApproval && (
                    <Badge style={{ backgroundColor: 'hsl(38 92% 50% / 0.1)', color: 'hsl(38 80% 38%)', border: 'none', fontSize: '11px' }}>
                      {linkedApproval.approval_number} · {linkedApproval.status}
                    </Badge>
                  )}
                </div>

                <div className="text-xs mt-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Raised by {co.raised_by} on {format(new Date(co.raised_date), 'd MMM yyyy')}
                </div>
              </CardContent>
            </Card>
          )
        })}

        {MOCK_CHANGE_ORDERS.length === 0 && (
          <div className="text-center py-12" style={{ color: 'hsl(var(--muted-foreground))' }}>
            No change orders yet.
          </div>
        )}
      </div>
    </div>
  )
}
