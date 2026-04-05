import React, { useState } from 'react'
import { ClipboardCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useUpdateInspection } from '@/lib/query-hooks'
import RaiseDefectForm from './RaiseDefectForm'
import type { InspectionEvent, InspectionResult } from '@/lib/types'

const RESULT_OPTIONS: {
  value: InspectionResult
  label: string
  icon: React.ReactNode
  color: string
  bg: string
}[] = [
  {
    value: 'PASS',
    label: 'Pass',
    icon: <CheckCircle2 size={16} />,
    color: 'hsl(var(--success))',
    bg: 'hsl(158 64% 40% / 0.12)',
  },
  {
    value: 'CONDITIONAL_PASS',
    label: 'Conditional Pass',
    icon: <AlertTriangle size={16} />,
    color: 'hsl(38 80% 38%)',
    bg: 'hsl(38 92% 50% / 0.15)',
  },
  {
    value: 'FAIL',
    label: 'Fail',
    icon: <XCircle size={16} />,
    color: 'hsl(var(--destructive))',
    bg: 'hsl(0 72% 51% / 0.12)',
  },
]

interface Props {
  inspection: InspectionEvent
  onSuccess?: () => void
}

export default function RecordInspectionResult({ inspection, onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<InspectionResult>('PASS')
  const [notes, setNotes] = useState('')
  const [actualDate, setActualDate] = useState(new Date().toISOString().split('T')[0])

  const update = useUpdateInspection()

  const needsNCR = result === 'FAIL' || result === 'CONDITIONAL_PASS'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    update.mutate(
      {
        id: inspection.id,
        updates: { result, notes: notes || null, actual_date: actualDate },
      },
      {
        onSuccess: () => {
          setDone(true)
          onSuccess?.()
        },
      },
    )
  }

  const handleClose = () => {
    setOpen(false)
    setDone(false)
    setResult('PASS')
    setNotes('')
    setActualDate(new Date().toISOString().split('T')[0])
    update.reset()
  }

  const selectedOption = RESULT_OPTIONS.find((o) => o.value === result)!

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        style={{ borderColor: 'hsl(var(--accent))', color: 'hsl(var(--accent))' }}
      >
        <ClipboardCheck size={13} className="mr-1.5" />
        Record Result
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-md">
          {done ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span style={{ color: selectedOption.color }}>{selectedOption.icon}</span>
                  Result Recorded — {selectedOption.label}
                </DialogTitle>
              </DialogHeader>

              <div
                className="rounded-md p-3 text-sm"
                style={{ backgroundColor: selectedOption.bg, color: selectedOption.color }}
              >
                <span className="font-mono font-bold text-xs mr-2">{inspection.inspection_number}</span>
                {inspection.title}
              </div>

              {needsNCR ? (
                <div
                  className="rounded-md border p-4 flex flex-col gap-3"
                  style={{ borderColor: 'hsl(38 92% 50%)', backgroundColor: 'hsl(38 92% 50% / 0.06)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: 'hsl(38 80% 38%)' }}>
                    {result === 'FAIL' ? 'Inspection failed' : 'Conditional pass'} — raise an NCR?
                  </p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    This result typically requires a Non-Conformance Report to document the finding
                    and trigger the appropriate corrective action cascade.
                  </p>
                  <div className="flex gap-2">
                    <RaiseDefectForm
                      inspectionEventId={inspection.id}
                      workPackageId={inspection.work_package_id ?? undefined}
                      onSuccess={() => handleClose()}
                    />
                    <Button size="sm" variant="outline" onClick={handleClose}>
                      Skip for now
                    </Button>
                  </div>
                </div>
              ) : (
                <DialogFooter>
                  <Button onClick={handleClose}>Done</Button>
                </DialogFooter>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Record Inspection Result</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-4 mt-4">
                {/* Inspection header */}
                <div
                  className="rounded-md p-3 text-sm"
                  style={{ backgroundColor: 'hsl(var(--muted))' }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono font-bold text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {inspection.inspection_number}
                    </span>
                    {inspection.is_class_inspection && (
                      <Badge style={{ backgroundColor: 'hsl(var(--accent)/0.15)', color: 'hsl(var(--accent))', border: 'none', fontSize: '10px' }}>
                        Class
                      </Badge>
                    )}
                  </div>
                  <div className="font-medium text-sm">{inspection.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Inspector: {inspection.inspector_name}
                  </div>
                </div>

                {/* Result selector */}
                <div className="flex flex-col gap-2">
                  <Label>Result *</Label>
                  <div className="flex gap-2">
                    {RESULT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setResult(opt.value)}
                        className="flex-1 flex flex-col items-center gap-1.5 rounded-md border-2 p-3 text-xs font-semibold transition-all"
                        style={{
                          borderColor: result === opt.value ? opt.color : 'hsl(var(--border))',
                          backgroundColor: result === opt.value ? opt.bg : 'transparent',
                          color: result === opt.value ? opt.color : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        <span>{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="insp-date">Inspection Date *</Label>
                  <Input
                    id="insp-date"
                    type="date"
                    value={actualDate}
                    onChange={(e) => setActualDate(e.target.value)}
                    required
                  />
                </div>

                {/* Notes */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="insp-notes">
                    Notes {result !== 'PASS' ? '*' : '(optional)'}
                  </Label>
                  <Textarea
                    id="insp-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      result === 'FAIL'
                        ? 'Describe what failed and what action is required...'
                        : result === 'CONDITIONAL_PASS'
                        ? 'Describe the condition and what must be resolved...'
                        : 'Any observations or comments...'
                    }
                    rows={4}
                    required={result !== 'PASS'}
                  />
                </div>

                {needsNCR && (
                  <div
                    className="flex items-start gap-2 rounded-md p-3 text-xs"
                    style={{ backgroundColor: 'hsl(38 92% 50% / 0.1)', color: 'hsl(38 80% 38%)' }}
                  >
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>After saving, you'll be prompted to raise an NCR for this finding.</span>
                  </div>
                )}

                {update.isError && (
                  <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                    {(update.error as Error).message}
                  </p>
                )}
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={update.isPending}
                  style={{ backgroundColor: selectedOption.color, color: 'white' }}
                >
                  {update.isPending ? 'Saving…' : `Record ${selectedOption.label}`}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
