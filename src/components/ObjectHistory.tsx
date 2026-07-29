import { format } from 'date-fns'
import { CornerDownRight, Dot } from 'lucide-react'
import { useObjectEvents } from '@/lib/query-hooks'
import type { ObjectType, WorldModelEvent } from '@/lib/types'

// The recorded history of one object.
//
// Nothing in this system is overwritten silently: every Action writes a
// world_model_events row in the same transaction as its mutation, carrying the
// before and after state. So this is not a changelog someone remembered to
// keep — it is the complete record, and it cannot drift from what actually
// happened to the object.

const EVENT_LABELS: Record<string, string> = {
  WORK_PACKAGE_CREATED: 'Created',
  WORK_PACKAGE_STATUS_CHANGED: 'Updated',
  DEFECT_CREATED: 'Raised',
  DEFECT_RAISED: 'Raised',
  DEFECT_STATUS_CHANGED: 'Status changed',
  DEFECT_RELINKED: 'Re-attached',
  CHANGE_ORDER_CREATED: 'Raised',
  CHANGE_ORDER_APPROVED: 'Approved',
  APPROVAL_REQUESTED: 'Requested',
  APPROVAL_DECISION: 'Decided',
  INSPECTION_SCHEDULED: 'Scheduled',
  INSPECTION_COMPLETED: 'Result recorded',
  DOCUMENT_UPLOADED: 'Uploaded',
  PROJECT_CREATED: 'Created',
}

/** Field names as they read to a person rather than as they read to Postgres. */
const FIELD_LABELS: Record<string, string> = {
  wp_number: 'Number',
  ncr_number: 'Number',
  co_number: 'Number',
  approval_number: 'Number',
  inspection_number: 'Number',
  doc_number: 'Number',
  planned_cost: 'Planned cost',
  actual_cost: 'Actual cost',
  planned_hours: 'Planned hours',
  actual_hours: 'Actual hours',
  cost_impact: 'Cost impact',
  schedule_impact_days: 'Schedule impact',
  work_package_id: 'Work package',
  is_class_defect: 'Class defect',
  is_class_document: 'Class document',
  is_class_inspection: 'Class attendance',
  scheduled_date: 'Scheduled',
  inspector_role: 'Inspector',
  linked_object_type: 'Linked to',
  cost_amount: 'Amount',
}

/** UUIDs mean nothing to a reader; the event carries the number alongside. */
const HIDDEN_FIELDS = new Set([
  'work_package_id',
  'linked_object_id',
  'change_order_id',
  'defect_record_id',
])

const label = (k: string) =>
  FIELD_LABELS[k] ?? k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return String(v)
  return String(v).replace(/_/g, ' ')
}

type State = Record<string, unknown> | null

/** Only the fields that actually moved, so a reader sees the change not the row. */
function changedFields(before: State, after: State) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  const out: { key: string; from: unknown; to: unknown }[] = []
  for (const key of keys) {
    if (HIDDEN_FIELDS.has(key)) continue
    const from = before?.[key]
    const to = after?.[key]
    if (JSON.stringify(from) === JSON.stringify(to)) continue
    out.push({ key, from, to })
  }
  return out
}

function EventRow({ event, isLast }: { event: WorldModelEvent; isLast: boolean }) {
  const before = event.before_state as State
  const after = event.after_state as State
  const fields = changedFields(before, after)
  const isCreation = !before
  const isCascade = Boolean(event.cascade_from_event_id)

  return (
    <div className="flex gap-3">
      {/* Rail */}
      <div className="flex flex-col items-center">
        <div
          className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{
            backgroundColor: isCascade ? 'hsl(var(--accent))' : 'hsl(var(--primary))',
          }}
        />
        {!isLast && (
          <div className="w-px flex-1" style={{ backgroundColor: 'hsl(var(--border))' }} />
        )}
      </div>

      <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-5'}`}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">
            {EVENT_LABELS[event.event_type] ?? event.event_type.replace(/_/g, ' ')}
          </span>
          {isCascade && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: 'hsl(var(--accent) / 0.12)',
                color: 'hsl(var(--accent))',
              }}
            >
              <CornerDownRight size={10} />
              Cascade
            </span>
          )}
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {event.triggered_by_name}
          </span>
          <Dot size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {format(new Date(event.triggered_at), 'd MMM yyyy, HH:mm')}
          </span>
        </div>

        {fields.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1">
            {fields.map(({ key, from, to }) => (
              <div key={key} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>{label(key)}</span>
                {!isCreation && (
                  <>
                    <code
                      className="rounded px-1 py-px font-mono"
                      style={{
                        backgroundColor: 'hsl(var(--muted))',
                        color: 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {renderValue(from)}
                    </code>
                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>→</span>
                  </>
                )}
                <code
                  className="rounded px-1 py-px font-mono font-semibold"
                  style={{
                    backgroundColor: 'hsl(var(--accent) / 0.1)',
                    color: 'hsl(var(--accent))',
                  }}
                >
                  {renderValue(to)}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ObjectHistory({
  objectType,
  objectId,
}: {
  objectType: ObjectType
  objectId: string
}) {
  const { data: events = [], isLoading } = useObjectEvents(objectType, objectId)

  if (isLoading) {
    return (
      <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Loading history…
      </p>
    )
  }

  if (events.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        No recorded changes. Objects from the original project set-up predate the
        event log; everything done since is recorded here.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {events.map((e, i) => (
        <EventRow key={e.id} event={e} isLast={i === events.length - 1} />
      ))}
    </div>
  )
}
