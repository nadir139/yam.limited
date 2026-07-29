import React, { useState } from 'react'
import { ClipboardCheck, CheckCircle2, AlertTriangle, XCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useRecordInspectionResult, usePermissions } from '@/lib/query-hooks'
import RaiseDefectForm from '@/components/actions/RaiseDefectForm'
import type { InspectionEvent, InspectionResult } from '@/lib/types'

// Recording an inspection result from inside the conversation.
//
// The other inline actions are a single control, but a result is three fields:
// the outcome, when it happened, and what was found. That needs a form, and
// putting it behind the full-page dialog would send the user out of the chat --
// which is the thing the inline panels exist to avoid. So it expands in place.

const OPTIONS: {
  value: InspectionResult
  label: string
  icon: React.ReactNode
  color: string
  bg: string
}[] = [
  {
    value: 'PASS',
    label: 'Pass',
    icon: <CheckCircle2 size={13} />,
    color: 'hsl(var(--success))',
    bg: 'hsl(158 64% 40% / 0.12)',
  },
  {
    value: 'CONDITIONAL_PASS',
    label: 'Conditional',
    icon: <AlertTriangle size={13} />,
    color: 'hsl(38 80% 38%)',
    bg: 'hsl(38 92% 50% / 0.15)',
  },
  {
    value: 'FAIL',
    label: 'Fail',
    icon: <XCircle size={13} />,
    color: 'hsl(var(--destructive))',
    bg: 'hsl(0 72% 51% / 0.12)',
  },
]

const today = () => new Date().toISOString().split('T')[0]

export default function InlineInspectionResult({
  inspection,
}: {
  inspection: InspectionEvent
}) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<InspectionResult>('PASS')
  const [notes, setNotes] = useState('')
  const [actualDate, setActualDate] = useState(today)
  const [justRecorded, setJustRecorded] = useState<InspectionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const record = useRecordInspectionResult()
  const { can } = usePermissions()
  const recorded = inspection.result !== 'PENDING'
  const selected = OPTIONS.find((o) => o.value === result)!

  // A failed or conditional attendance is a finding that belongs in the model,
  // not just a note on the inspection.
  const needsNCR = justRecorded === 'FAIL' || justRecorded === 'CONDITIONAL_PASS'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    record.mutate(
      { id: inspection.id, result, notes: notes || null, actualDate },
      {
        onSuccess: () => {
          setJustRecorded(result)
          setOpen(false)
          setNotes('')
        },
        onError: (err: Error) => setError(err.message),
      },
    )
  }

  if (!can('action_record_inspection_result')) return null

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            setJustRecorded(null)
            setActualDate(inspection.actual_date ?? today())
            setResult(recorded ? inspection.result : 'PASS')
            setOpen(true)
          }}
          style={{ borderColor: 'hsl(var(--accent))', color: 'hsl(var(--accent))' }}
        >
          <ClipboardCheck size={12} className="mr-1.5" />
          {recorded ? 'Amend result' : 'Record result'}
        </Button>

        {needsNCR && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px]" style={{ color: 'hsl(38 80% 38%)' }}>
              {justRecorded === 'FAIL' ? 'Failed' : 'Conditional'} — raise an NCR against it?
            </span>
            {/* A dialog, not a route change, so the conversation survives. */}
            <RaiseDefectForm
              inspectionEventId={inspection.id}
              workPackageId={inspection.work_package_id ?? undefined}
            />
          </div>
        )}

        {error && (
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: 'hsl(var(--destructive))' }}
          >
            <AlertCircle size={12} />
            {error}
          </span>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setResult(o.value)}
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold"
            style={{
              borderColor: result === o.value ? o.color : 'hsl(var(--border))',
              backgroundColor: result === o.value ? o.bg : 'transparent',
              color: result === o.value ? o.color : 'hsl(var(--muted-foreground))',
            }}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
        <Input
          type="date"
          value={actualDate}
          onChange={(e) => setActualDate(e.target.value)}
          required
          className="h-7 w-auto text-xs"
        />
      </div>

      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        required={result !== 'PASS'}
        placeholder={
          result === 'FAIL'
            ? 'What failed, and what has to happen…'
            : result === 'CONDITIONAL_PASS'
            ? 'What the pass is conditional on…'
            : 'Observations (optional)'
        }
        className="text-xs"
      />

      {error && (
        <p
          className="inline-flex items-start gap-1.5 text-[11px]"
          style={{ color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={12} className="mt-px flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          className="h-7 text-xs"
          disabled={record.isPending}
          style={{ backgroundColor: selected.color, color: 'white' }}
        >
          {record.isPending ? 'Saving…' : `Record ${selected.label.toLowerCase()}`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
