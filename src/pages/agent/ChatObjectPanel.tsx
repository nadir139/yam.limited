import { eur } from '@/lib/format'
import { useNavigate } from 'react-router-dom'
import { X, ExternalLink, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useDefects,
  useChangeOrders,
  useApprovals,
  useWorkPackages,
  useInspections,
  useDocuments,
  useUpdateDefectStatus,
  useDecideApproval,
  useUpdateWorkPackage,
  usePermissions,
} from '@/lib/query-hooks'
import { typeColor } from '@/lib/ontology'
import InlineInspectionResult from './InlineInspectionResult'
import AmendDefectImpact from '@/components/actions/AmendDefectImpact'
import { Textarea } from '@/components/ui/textarea'
import type {
  DefectRecord,
  WorkPackageStatus,
} from '@/lib/types'
import { useState } from 'react'

// An object opened from inside the conversation.
//
// Following a link out of the chat loses the thread — you come back to a blank
// console and have to re-establish everything. Objects open here instead, as
// many at a time as you like, so reading a record and acting on it never costs
// you the conversation that led there.


const DEFECT_STATUSES: DefectRecord['status'][] = [
  'OPEN',
  'IN_PROGRESS',
  'PENDING_APPROVAL',
  'CLOSED',
  'DISPUTED',
]

const WP_STATUSES: WorkPackageStatus[] = [
  'DRAFT',
  'SCOPED',
  'ACTIVE',
  'EXPANDED',
  'ON_HOLD',
  'COMPLETE',
]

const selectClass =
  'h-7 rounded-md border px-2 text-xs shadow-sm disabled:opacity-50'
const selectStyle = {
  borderColor: 'hsl(var(--border))',
  backgroundColor: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: 'hsl(var(--muted-foreground))' }}
      >
        {label}
      </span>
      <span className="text-xs">{value ?? '—'}</span>
    </div>
  )
}

export default function ChatObjectPanel({
  objectType,
  objectId,
  number,
  onClose,
}: {
  objectType: string
  objectId: string
  number: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // CLOSED and DISPUTED are refused by the Action without a reason, so the
  // select stages the change and asks for one rather than firing and failing.
  const [pendingStatus, setPendingStatus] = useState<DefectRecord['status'] | null>(null)
  const [reason, setReason] = useState('')
  const [amending, setAmending] = useState(false)

  // Everything comes from the lists React Query already holds, so opening a
  // panel costs no round trip and reflects any change made elsewhere.
  const { data: defects = [] } = useDefects()
  const { data: changeOrders = [] } = useChangeOrders()
  const { data: approvals = [] } = useApprovals()
  const { data: workPackages = [] } = useWorkPackages()
  const { data: inspections = [] } = useInspections()
  const { data: documents = [] } = useDocuments()

  const updateDefect = useUpdateDefectStatus()
  const decideApproval = useDecideApproval()
  const updateWp = useUpdateWorkPackage()
  const { can } = usePermissions()

  const run = <T,>(m: { mutate: (v: T, o: object) => void }, vars: T) => {
    setError(null)
    m.mutate(vars, { onError: (e: Error) => setError(e.message) })
  }

  let title = number
  let route: string | null = null
  let body: React.ReactNode = null
  let actions: React.ReactNode = null

  if (objectType === 'DEFECT_RECORD') {
    const d = defects.find((x) => x.id === objectId)
    if (d) {
      title = d.title
      route = `/app/defects/${d.id}`
      body = (
        <>
          <Field label="Severity" value={d.severity} />
          <Field label="Status" value={d.status.replace(/_/g, ' ')} />
          <Field label="Cost impact" value={eur(d.cost_impact)} />
          <Field label="Schedule" value={`${d.schedule_impact_days ?? 0} days`} />
          <Field label="Location" value={d.location_on_vessel} />
          <Field label="Class item" value={d.is_class_defect ? d.class_item_ref || 'Yes' : 'No'} />
        </>
      )
      const canAmend = can('action_amend_defect_impact')
      const commit = (status: DefectRecord['status'], note: string | null) => {
        run(updateDefect, {
          id: d.id,
          status,
          closedDate:
            status === 'CLOSED' ? new Date().toISOString().split('T')[0] : null,
          notes: note,
        })
        setPendingStatus(null)
        setReason('')
      }

      const canStatus = can('action_update_defect_status') && d.status !== 'CLOSED'
      actions = !canStatus && !canAmend ? null : (
        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {canStatus && (
              <select
                className={selectClass}
                style={selectStyle}
                value={pendingStatus ?? d.status}
                disabled={updateDefect.isPending}
                onChange={(e) => {
                  const next = e.target.value as DefectRecord['status']
                  if (next === d.status) return setPendingStatus(null)
                  // Everything else is a working state and needs no argument;
                  // these two end the matter, and the reason is the only part
                  // worth keeping.
                  if (next === 'CLOSED' || next === 'DISPUTED') {
                    setPendingStatus(next)
                    setError(null)
                  } else {
                    commit(next, null)
                  }
                }}
              >
                {DEFECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            )}
            {d.status === 'CLOSED' && (
              <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Closed{d.closed_date ? ` on ${d.closed_date}` : ''}
              </span>
            )}
            {canAmend && !amending && !pendingStatus && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setAmending(true)}
              >
                Correct impact
              </Button>
            )}
          </div>

          {pendingStatus && (
            <div className="flex flex-col gap-1.5">
              <Textarea
                rows={2}
                className="text-xs"
                autoFocus
                placeholder={
                  pendingStatus === 'CLOSED'
                    ? 'What was the real cause, and what was done about it?'
                    : 'What is disputed, and by whom?'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={updateDefect.isPending || reason.trim().length === 0}
                  onClick={() => commit(pendingStatus, reason)}
                >
                  Mark {pendingStatus.replace(/_/g, ' ').toLowerCase()}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setPendingStatus(null)
                    setReason('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {amending && (
            <AmendDefectImpact
              defect={d}
              compact
              onSaved={() => setAmending(false)}
              onCancel={() => setAmending(false)}
            />
          )}
        </div>
      )
    }
  } else if (objectType === 'CHANGE_ORDER') {
    const c = changeOrders.find((x) => x.id === objectId)
    if (c) {
      title = c.title
      route = `/app/change-orders/${c.id}`
      body = (
        <>
          <Field label="Status" value={c.status.replace(/_/g, ' ')} />
          <Field label="Cost" value={eur(c.cost_delta)} />
          <Field label="Schedule" value={`${c.schedule_delta_days} days`} />
          <Field label="Trigger" value={c.trigger_type.replace(/_/g, ' ')} />
          <Field label="Raised by" value={c.raised_by} />
          <Field label="Raised" value={c.raised_date} />
        </>
      )
      // A change order's status follows its approval; it is not set directly.
      actions = (
        <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Decided through its owner approval
        </span>
      )
    }
  } else if (objectType === 'OWNER_APPROVAL') {
    const a = approvals.find((x) => x.id === objectId)
    if (a) {
      title = a.title
      route = '/app/approvals'
      body = (
        <>
          <Field label="Tier" value={a.tier.replace('_', ' ')} />
          <Field label="Status" value={a.status} />
          <Field label="Amount" value={eur(a.cost_amount)} />
          <Field label="Deadline" value={a.deadline ?? '—'} />
          <Field label="Requested by" value={a.requested_by} />
          <Field label="Decided" value={a.decision_date ?? '—'} />
        </>
      )
      actions =
        a.status === 'PENDING' && can('action_decide_approval') ? (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={decideApproval.isPending}
              style={{ backgroundColor: 'hsl(var(--success))', color: 'white' }}
              onClick={() => run(decideApproval, { id: a.id, decision: 'APPROVED' as const })}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={decideApproval.isPending}
              style={{ borderColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive))' }}
              onClick={() => run(decideApproval, { id: a.id, decision: 'REJECTED' as const })}
            >
              Reject
            </Button>
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {a.status} on {a.decision_date ?? 'an unrecorded date'}
          </span>
        )
    }
  } else if (objectType === 'WORK_PACKAGE') {
    const w = workPackages.find((x) => x.id === objectId)
    if (w) {
      title = w.title
      route = `/app/work-packages/${w.id}`
      body = (
        <>
          <Field label="Discipline" value={w.discipline} />
          <Field label="Status" value={w.status.replace(/_/g, ' ')} />
          <Field label="Planned cost" value={eur(w.planned_cost)} />
          <Field label="Actual cost" value={eur(w.actual_cost)} />
          <Field label="Hours" value={`${w.actual_hours} / ${w.planned_hours}`} />
          <Field label="Contractor" value={w.trade_contractor ?? '—'} />
        </>
      )
      actions = !can('action_update_work_package') ? null : (
        <select
          className={selectClass}
          style={selectStyle}
          value={w.status}
          disabled={updateWp.isPending}
          onChange={(e) =>
            run(updateWp, {
              id: w.id,
              patch: { status: e.target.value as WorkPackageStatus },
            })
          }
        >
          {WP_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      )
    }
  } else if (objectType === 'INSPECTION_EVENT') {
    const i = inspections.find((x) => x.id === objectId)
    if (i) {
      title = i.title
      route = '/app/inspections'
      body = (
        <>
          <Field label="Result" value={i.result.replace(/_/g, ' ')} />
          <Field label="Inspector" value={i.inspector_role.replace(/_/g, ' ')} />
          <Field label="Name" value={i.inspector_name || '—'} />
          <Field label="Scheduled" value={i.scheduled_date ?? '—'} />
          <Field label="Actual" value={i.actual_date ?? '—'} />
          <Field label="Findings" value={i.defect_count} />
        </>
      )
      actions = <InlineInspectionResult inspection={i} />
    }
  } else if (objectType === 'DOCUMENT') {
    const doc = documents.find((x) => x.id === objectId)
    if (doc) {
      title = doc.title
      route = '/app/documents'
      body = (
        <>
          <Field label="Type" value={doc.doc_type.replace(/_/g, ' ')} />
          <Field label="Status" value={doc.status.replace(/_/g, ' ')} />
          <Field label="Uploaded by" value={doc.uploaded_by} />
          <Field label="Uploaded" value={doc.uploaded_date} />
        </>
      )
    }
  }

  return (
    <div
      className="mt-2 rounded-[var(--radius)] border"
      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted) / 0.35)' }}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span
          className={`${typeColor(objectType)} rounded border border-current/30 bg-current/[0.08] px-1.5 py-px font-mono text-[11px] font-semibold`}
        >
          {number}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
        {route && (
          <button
            onClick={() => navigate(route!)}
            title="Open the full record"
            className="rounded p-1 hover:bg-muted"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <ExternalLink size={13} />
          </button>
        )}
        <button
          onClick={onClose}
          title="Close"
          className="rounded p-1 hover:bg-muted"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          <X size={13} />
        </button>
      </div>

      {body ? (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2.5 sm:grid-cols-3">
            {body}
          </div>
          {actions && (
            <div
              className="flex flex-wrap items-center gap-2 border-t px-3 py-2"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              {actions}
            </div>
          )}
        </>
      ) : (
        <p className="px-3 py-2.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Not in the loaded set — open the full record.
        </p>
      )}

      {error && (
        <p
          className="flex items-start gap-1.5 border-t px-3 py-2 text-[11px]"
          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={12} className="mt-px flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
