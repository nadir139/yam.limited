import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  useChangeOrders,
  useDefects,
  useApprovals,
} from '@/lib/query-hooks'
import ObjectHistory from '@/components/ObjectHistory'

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))' },
  PENDING_APPROVAL: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 80% 38%)' },
  APPROVED: { bg: 'hsl(158 64% 40% / 0.15)', text: 'hsl(var(--success))' },
  REJECTED: { bg: 'hsl(0 72% 51% / 0.12)', text: 'hsl(var(--destructive))' },
  IMPLEMENTED: { bg: 'hsl(185 60% 40% / 0.15)', text: 'hsl(var(--accent))' },
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex items-start justify-between border-b py-2 last:border-b-0"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {label}
      </span>
      <span className="ml-4 text-right text-sm font-medium">{value}</span>
    </div>
  )
}

export default function ChangeOrderDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  // Read from the already-cached lists rather than adding a per-object fetch —
  // the change-order set is small and almost always in cache from the queue.
  const { data: changeOrders = [], isLoading } = useChangeOrders()
  const { data: defects = [] } = useDefects()
  const { data: approvals = [] } = useApprovals()

  const co = changeOrders.find((c) => c.id === id)

  if (isLoading) {
    return (
      <div className="p-8 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Loading…
      </div>
    )
  }

  if (!co) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          No change order with that reference.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate('/app/change-orders')}
        >
          Back to change orders
        </Button>
      </div>
    )
  }

  const defect = co.defect_record_id
    ? defects.find((d) => d.id === co.defect_record_id)
    : null
  const approval = co.approval_id
    ? approvals.find((a) => a.id === co.approval_id)
    : null
  const status = STATUS_COLORS[co.status] ?? STATUS_COLORS.DRAFT

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/app/change-orders')}
        >
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        <div>
          <span
            className="font-mono text-sm"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            {co.co_number}
          </span>
          <h1 className="text-xl font-bold">{co.title}</h1>
        </div>
        <Badge
          className="ml-auto"
          style={{ backgroundColor: status.bg, color: status.text, border: 'none' }}
        >
          {co.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-5">
          <p className="mb-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {co.description}
          </p>
          <div className="grid gap-x-8 sm:grid-cols-2">
            <Row label="Cost impact" value={eur(co.cost_delta)} />
            <Row
              label="Schedule impact"
              value={`${co.schedule_delta_days} ${co.schedule_delta_days === 1 ? 'day' : 'days'}`}
            />
            <Row label="Trigger" value={co.trigger_type.replace(/_/g, ' ')} />
            <Row label="Raised by" value={co.raised_by} />
            <Row
              label="Raised"
              value={format(new Date(co.raised_date), 'd MMM yyyy')}
            />
          </div>
        </CardContent>
      </Card>

      {/* The chain this change order sits in. It exists because something was
          found, and it is gated by someone's decision — showing it as a chain
          is the point of holding these as linked objects. */}
      {(defect || approval) && (
        <Card>
          <CardContent className="p-5">
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              Why this exists
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {defect && (
                <button
                  onClick={() => navigate(`/app/defects/${defect.id}`)}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <AlertTriangle size={14} style={{ color: 'hsl(var(--destructive))' }} />
                  <span className="font-mono text-xs font-semibold">
                    {defect.ncr_number}
                  </span>
                  <span
                    className="max-w-[220px] truncate"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  >
                    {defect.title}
                  </span>
                </button>
              )}
              {defect && approval && (
                <ArrowRight size={16} style={{ color: 'hsl(var(--accent))' }} />
              )}
              {approval && (
                <button
                  onClick={() => navigate('/app/approvals')}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <CheckCircle2 size={14} style={{ color: 'hsl(var(--accent))' }} />
                  <span className="font-mono text-xs font-semibold">
                    {approval.approval_number}
                  </span>
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {approval.tier.replace('_', ' ')} · {approval.status}
                  </span>
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <Card>
            <CardContent className="p-5">
              <ObjectHistory objectType="CHANGE_ORDER" objectId={co.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
