import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, ArrowRight, GitBranch } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MOCK_DEFECTS, MOCK_CHANGE_ORDERS, MOCK_APPROVALS } from '@/lib/mock-data'
import type { DefectSeverity } from '@/lib/types'

const SEVERITY_STYLES: Record<DefectSeverity, { bg: string; text: string }> = {
  CRITICAL: { bg: 'hsl(0 72% 51% / 0.12)', text: 'hsl(var(--destructive))' },
  HIGH: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 80% 38%)' },
  MEDIUM: { bg: 'hsl(45 93% 47% / 0.15)', text: 'hsl(45 80% 35%)' },
  LOW: { bg: 'hsl(185 60% 40% / 0.12)', text: 'hsl(var(--accent))' },
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: 'hsl(0 72% 51% / 0.1)', text: 'hsl(var(--destructive))' },
  IN_PROGRESS: { bg: 'hsl(38 92% 50% / 0.1)', text: 'hsl(38 80% 38%)' },
  PENDING_APPROVAL: { bg: 'hsl(215 50% 23% / 0.1)', text: 'hsl(var(--primary))' },
  CLOSED: { bg: 'hsl(158 64% 40% / 0.12)', text: 'hsl(var(--success))' },
  DISPUTED: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))' },
}

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

function PropRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs mb-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}

function CascadeCard({
  type,
  number,
  title,
  status,
  statusBg,
  statusText,
}: {
  type: string
  number: string
  title: string
  status: string
  statusBg: string
  statusText: string
}) {
  return (
    <div
      className="rounded-[var(--radius)] border p-3 min-w-[180px]"
      style={{
        backgroundColor: 'hsl(var(--card))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      <div className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{type}</div>
      <div className="font-mono text-xs font-bold mb-1">{number}</div>
      <div className="text-xs mb-2 line-clamp-2">{title}</div>
      <Badge style={{ backgroundColor: statusBg, color: statusText, border: 'none', fontSize: '10px' }}>
        {status.replace(/_/g, ' ')}
      </Badge>
    </div>
  )
}

export default function DefectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const defect = MOCK_DEFECTS.find((d) => d.id === id)

  if (!defect) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg font-medium">Defect not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/defects')}>
          Back to Defects
        </Button>
      </div>
    )
  }

  const ss = SEVERITY_STYLES[defect.severity]
  const st = STATUS_STYLES[defect.status]

  const linkedCO = defect.change_order_id
    ? MOCK_CHANGE_ORDERS.find((co) => co.id === defect.change_order_id)
    : null
  const linkedApproval = linkedCO?.approval_id
    ? MOCK_APPROVALS.find((a) => a.id === linkedCO.approval_id)
    : null

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/defects')}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {defect.ncr_number}
            </span>
            <Badge style={{ backgroundColor: ss.bg, color: ss.text, border: 'none' }}>
              {defect.severity}
            </Badge>
            <Badge style={{ backgroundColor: st.bg, color: st.text, border: 'none' }}>
              {defect.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <h1 className="text-xl font-bold">{defect.title}</h1>
        </div>
      </div>

      {/* Description */}
      <Card>
        <CardContent className="p-5">
          <p className="text-sm leading-relaxed mb-4">{defect.description}</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <PropRow label="Location" value={defect.location_on_vessel} />
            <PropRow label="Discovered By" value={defect.discovered_by} />
            <PropRow
              label="Discovered Date"
              value={format(new Date(defect.discovered_date), 'd MMM yyyy')}
            />
            <PropRow label="Root Cause" value={defect.root_cause.replace(/_/g, ' ')} />
            <PropRow label="Disposition" value={defect.disposition.replace(/_/g, ' ')} />
            <PropRow
              label="Class Defect"
              value={
                defect.is_class_defect ? (
                  <span style={{ color: 'hsl(var(--accent))' }}>
                    Yes {defect.class_item_ref && `(${defect.class_item_ref})`}
                  </span>
                ) : (
                  'No'
                )
              }
            />
            {defect.cost_impact != null && (
              <PropRow
                label="Cost Impact"
                value={
                  <span style={{ color: 'hsl(var(--destructive))' }}>
                    {eur(defect.cost_impact)}
                  </span>
                }
              />
            )}
            {defect.schedule_impact_days != null && (
              <PropRow
                label="Schedule Impact"
                value={
                  <span style={{ color: 'hsl(var(--warning))' }}>
                    +{defect.schedule_impact_days} days
                  </span>
                }
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cascade section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch size={16} />
            Cascade Chain
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {linkedCO ? (
            <div className="flex items-center gap-3 flex-wrap">
              {/* NCR */}
              <CascadeCard
                type="Defect Record"
                number={defect.ncr_number}
                title={defect.title}
                status={defect.status}
                statusBg={st.bg}
                statusText={st.text}
              />

              <div className="flex flex-col items-center gap-1">
                <ArrowRight size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  triggered
                </span>
              </div>

              {/* CO */}
              <CascadeCard
                type="Change Order"
                number={linkedCO.co_number}
                title={linkedCO.title}
                status={linkedCO.status}
                statusBg="hsl(215 50% 23% / 0.1)"
                statusText="hsl(var(--primary))"
              />

              {linkedApproval && (
                <>
                  <div className="flex flex-col items-center gap-1">
                    <ArrowRight size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      requires
                    </span>
                  </div>

                  {/* Approval */}
                  <CascadeCard
                    type="Owner Approval"
                    number={linkedApproval.approval_number}
                    title={linkedApproval.title}
                    status={linkedApproval.status}
                    statusBg="hsl(38 92% 50% / 0.15)"
                    statusText="hsl(38 80% 38%)"
                  />
                </>
              )}
            </div>
          ) : (
            <div
              className="rounded-[var(--radius)] border border-dashed p-5 flex flex-col items-center gap-3 text-center"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                No cascade triggered. Severity{' '}
                <span style={{ color: ss.text, fontWeight: 600 }}>{defect.severity}</span> — consider
                raising a Change Order.
              </div>
              <Button
                size="sm"
                style={{ backgroundColor: 'hsl(var(--accent))', color: 'white' }}
                onClick={() => navigate('/change-orders')}
              >
                <GitBranch size={14} className="mr-2" />
                Raise Change Order
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
