import React, { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useUpdateInspection } from '@/lib/query-hooks'
import { useAuth } from '@/contexts/AuthContext'
import type { InspectionEvent, InspectionResult } from '@/lib/types'
import RaiseDefectForm from './RaiseDefectForm'

interface Props {
  inspection: InspectionEvent
  onSuccess?: () => void
}

const RESULT_OPTIONS: { value: InspectionResult; label: string; color: string }[] = [
  { value: 'PASS', label: 'PASS', color: 'hsl(var(--success))' },
  { value: 'CONDITIONAL_PASS', label: 'CONDITIONAL PASS', color: 'hsl(38 80% 38%)' },
  { value: 'FAIL', label: 'FAIL', color: 'hsl(var(--destructive))' },
]

export default function RecordInspectionResult({ inspection, onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<InspectionResult>('PASS')
  const [notes, setNotes] = useState('')
  const [actualDate, setActualDate] = useState(new Date().toISOString().split('T')[0])
  const [done, setDone] = useState(false)

  const { user } = useAuth()
  const updateInspection = useUpdateInspection()

  // Don't show button for already-completed inspections
  if (inspection.result !== 'PENDING') return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateInspection.mutate(
      {
        id: inspection.id,
        updates: {
          result,
          actual_date: actualDate,
          notes: notes || null,
          inspector_name: inspection.inspector_name || user?.name || 'Unknown',
        },
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
  }

  const needsNCR = done && (result === 'CONDITIONAL_PASS' || result === 'FAIL')

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        style={{ borderColor: 'hsl(var(--accent))', color: 'hsl(var(--accent))' }}
      >
        <ClipboardCheck size={14} className="mr-1.5" />
        Record Result
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-md">
          {done ? (
            /* ── Completion screen ── */
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Result Recorded</DialogTitle>
              </DialogHeader>
              <div
                className="rounded-md p-4 text-center"
                style={{
                  backgroundColor:
                    result === 'PASS'
                      ? 'hsl(158 64% 40% / 0.1)'
                      : result === 'CONDITIONAL_PASS'
                      ? 'hsl(38 92% 50% / 0.1)'
                      : 'hsl(0 72% 51% / 0.08)',
                }}
              >
                <div
                  className="text-2xl font-black mb-1"
                  style={{
                    color:
                      result === 'PASS'
                        ? 'hsl(var(--success))'
                        : result === 'CONDITIONAL_PASS'
                        ? 'hsl(38 80% 38%)'
                        : 'hsl(var(--destructive))',
                  }}
                >
                  {result.replace(/_/g, ' ')}
                </div>
                <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {inspection.inspection_number} — {inspection.title}
                </div>
              </div>

              {needsNCR && (
                <div
                  className="rounded-md border p-3 text-sm"
                  style={{ borderColor: 'hsl(var(--destructive)/0.3)', backgroundColor: 'hsl(0 72% 51% / 0.05)' }}
                >
                  <p className="font-medium mb-2" style={{ color: 'hsl(var(--destructive))' }}>
                    Deficiencies found — raise an NCR?
                  </p>
                  <p className="text-xs mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {result === 'FAIL'
                      ? 'This inspection FAILED. One or more NCRs should be raised to track corrective action.'
                      : 'Conditional pass — raise an NCR for each condition to be resolved.'}
                  </p>
                  <RaiseDefectForm
                    inspectionEventId={inspection.id}
                    workPackageId={inspection.work_package_id ?? undefined}
                    onSuccess={() => handleClose()}
                  />
                </div>
              )}

              <DialogFooter>
                <Button onClick={handleClose}>
                  {needsNCR ? 'Done without NCR' : 'Done'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Form ── */
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Record Inspection Result</DialogTitle>
              </DialogHeader>
              <div className="mt-1 mb-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {inspection.inspection_number} — {inspection.title}
              </div>

              <div className="flex flex-col gap-4">
                {/* Result selector */}
                <div className="flex flex-col gap-2">
                  <Label>Result *</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {RESULT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setResult(opt.value)}
                        className="rounded-md border py-2.5 text-xs font-bold transition-all"
                        style={{
                          borderColor: result === opt.value ? opt.color : 'hsl(var(--border))',
                          backgroundColor: result === opt.value ? `${opt.color}15` : 'transparent',
                          color: result === opt.value ? opt.color : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actual date */}
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
                    Notes {result !== 'PASS' && <span style={{ color: 'hsl(var(--destructive))' }}>*</span>}
                  </Label>
                  <Textarea
                    id="insp-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      result === 'PASS'
                        ? 'Optional observations...'
                        : 'Describe the deficiencies found (required for non-pass results)'
                    }
                    rows={4}
                    required={result !== 'PASS'}
                  />
                </div>

                {updateInspection.isError && (
                  <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                    {(updateInspection.error as Error).message}
                  </p>
                )}
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateInspection.isPending}
                  style={{
                    backgroundColor:
                      result === 'PASS'
                        ? 'hsl(var(--success))'
                        : result === 'CONDITIONAL_PASS'
                        ? 'hsl(38 80% 38%)'
                        : 'hsl(var(--destructive))',
                    color: 'white',
                  }}
                >
                  {updateInspection.isPending ? 'Saving…' : `Record ${result.replace(/_/g, ' ')}`}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
