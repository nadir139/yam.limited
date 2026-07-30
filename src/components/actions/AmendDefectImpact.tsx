import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAmendDefectImpact } from '@/lib/query-hooks'
import type { DefectRecord, RootCause } from '@/lib/types'

// Correcting what a job actually cost.
//
// The figures on an NCR are a guess made in its first five minutes, and the
// truth only arrives once someone has done the work. Before this there was
// nowhere to put that truth: an NCR raised at €30 and a day stayed €30 and a
// day even after it turned out to be a €50 switch over three, and the agent,
// reading the record faithfully, reported the guess.
//
// The correction is not an edit. The old numbers go into the event's
// before_state, the reason is required, and the change is posted to the NCR's
// thread — so what was first believed stays recoverable alongside what turned
// out to be true. That distinction is the whole point of keeping an ontology
// rather than a spreadsheet.

const ROOT_CAUSES: RootCause[] = [
  'WEAR',
  'CORROSION',
  'IMPACT',
  'FATIGUE',
  'INSTALLATION_ERROR',
  'DESIGN_DEFICIENCY',
  'MOISTURE_INGRESS',
  'OTHER',
]

/** Empty string means "leave it alone" — this form cannot clear a value. */
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s))

export default function AmendDefectImpact({
  defect,
  compact = false,
  onSaved,
  onCancel,
}: {
  defect: DefectRecord
  /** Tighter spacing for the chat panel. */
  compact?: boolean
  onSaved?: () => void
  onCancel?: () => void
}) {
  const amend = useAmendDefectImpact()
  const [reason, setReason] = useState('')
  const [cost, setCost] = useState('')
  const [days, setDays] = useState('')
  const [rootCause, setRootCause] = useState<RootCause | ''>('')
  const [error, setError] = useState<string | null>(null)

  const changed =
    cost.trim() !== '' || days.trim() !== '' || rootCause !== ''
  const ready = reason.trim().length > 0 && changed

  const submit = () => {
    setError(null)
    amend.mutate(
      {
        id: defect.id,
        patch: {
          reason,
          cost_impact: numOrNull(cost),
          schedule_impact_days: numOrNull(days),
          root_cause: rootCause || null,
        },
      },
      {
        onSuccess: () => {
          setReason('')
          setCost('')
          setDays('')
          setRootCause('')
          onSaved?.()
        },
        onError: (e) => setError(e.message),
      },
    )
  }

  const gap = compact ? 'gap-2' : 'gap-3'
  const text = compact ? 'text-xs' : 'text-sm'

  return (
    <div className={`flex w-full flex-col ${gap}`}>
      {!compact && (
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Recorded now as {defect.cost_impact == null ? 'no cost' : `€${defect.cost_impact}`}
          {' and '}
          {defect.schedule_impact_days ?? 0} days. Leave a field blank to keep it.
          The previous figures stay on the record.
        </p>
      )}

      <div className={`grid grid-cols-3 ${gap}`}>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]" htmlFor={`amend-cost-${defect.id}`}>
            Actual cost (€)
          </Label>
          <Input
            id={`amend-cost-${defect.id}`}
            type="number"
            min={0}
            inputMode="decimal"
            className={compact ? 'h-7 text-xs' : ''}
            placeholder={defect.cost_impact?.toString() ?? '—'}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]" htmlFor={`amend-days-${defect.id}`}>
            Actual days
          </Label>
          <Input
            id={`amend-days-${defect.id}`}
            type="number"
            min={0}
            inputMode="numeric"
            className={compact ? 'h-7 text-xs' : ''}
            placeholder={(defect.schedule_impact_days ?? 0).toString()}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]" htmlFor={`amend-cause-${defect.id}`}>
            Real cause
          </Label>
          <select
            id={`amend-cause-${defect.id}`}
            className={`rounded-md border px-2 shadow-sm ${compact ? 'h-7 text-xs' : 'h-10 text-sm'}`}
            style={{
              borderColor: 'hsl(var(--border))',
              backgroundColor: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
            }}
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value as RootCause | '')}
          >
            <option value="">Unchanged ({defect.root_cause.replace(/_/g, ' ')})</option>
            {ROOT_CAUSES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[11px]" htmlFor={`amend-reason-${defect.id}`}>
          What did you learn? (required)
        </Label>
        <Textarea
          id={`amend-reason-${defect.id}`}
          rows={compact ? 2 : 3}
          className={compact ? 'text-xs' : ''}
          placeholder="It was the switch, not the fitting — new switch and two hours of chasing the circuit."
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            setError(null)
          }}
        />
      </div>

      {error && (
        <p
          className="flex items-start gap-1.5 text-[11px]"
          style={{ color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={12} className="mt-px flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size={compact ? 'sm' : 'default'}
          className={compact ? 'h-7 text-xs' : ''}
          disabled={!ready || amend.isPending}
          onClick={submit}
        >
          {amend.isPending ? 'Correcting…' : 'Correct the record'}
        </Button>
        {onCancel && (
          <Button
            size={compact ? 'sm' : 'default'}
            variant="outline"
            className={compact ? 'h-7 text-xs' : ''}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        {!ready && (
          <span className={`${text} `} style={{ color: 'hsl(var(--muted-foreground))' }}>
            {changed ? 'Say what you learned.' : 'Change a figure to correct it.'}
          </span>
        )}
      </div>
    </div>
  )
}
