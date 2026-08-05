import React, { useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useUpdateInspection } from '@/lib/query-hooks'
import RaiseDefectForm from './RaiseDefectForm'
import type { InspectionEvent, InspectionResult } from '@/lib/types'

interface Props {
  inspection: InspectionEvent
  onSuccess?: () => void
}

const OPTS = [
  { value: 'PASS' as InspectionResult,             label: 'Pass',             icon: CheckCircle2, border: 'hsl(158 64% 40%)', bg: 'hsl(158 64% 40% / 0.1)',  text: 'hsl(158 64% 30%)' },
  { value: 'CONDITIONAL_PASS' as InspectionResult, label: 'Conditional Pass', icon: AlertCircle,  border: 'hsl(38 92% 50%)',  bg: 'hsl(38 92% 50% / 0.1)',   text: 'hsl(38 80% 34%)' },
  { value: 'FAIL' as InspectionResult,             label: 'Fail',             icon: XCircle,      border: 'hsl(var(--destructive))', bg: 'hsl(var(--destructive) / 0.08)', text: 'hsl(var(--destructive))' },
]

export default function RecordInspectionResult({ inspection, onSuccess }: Props) {
  const [open, setOpen]         = useState(false)
  const [result, setResult]     = useState<InspectionResult>('PASS')
  const [notes, setNotes]       = useState('')
  const [actualDate, setDate]   = useState(new Date().toISOString().split('T')[0])
  const [done, setDone]         = useState(false)
  const [recorded, setRecorded] = useState<InspectionResult | null>(null)
  const mutation = useUpdateInspection()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (result !== 'PASS' && !notes.trim()) return
    mutation.mutate(
      { id: inspection.id, updates: { result, actual_date: actualDate, notes: notes.trim() || null } },
      { onSuccess: () => { setRecorded(result); setDone(true); onSuccess?.() } },
    )
  }

  const handleClose = () => {
    setOpen(false); setDone(false); setRecorded(null)
    setResult('PASS'); setNotes(''); setDate(new Date().toISOString().split('T')[0])
    mutation.reset()
  }

  const needsNcr = recorded === 'FAIL' || recorded === 'CONDITIONAL_PASS'

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} style={{ fontSize: '12px' }}>
        <ClipboardCheck size={13} className="mr-1.5" /> Record Result
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-md">
          {done ? (
            <div className="flex flex-col gap-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {recorded === 'PASS'
                    ? <CheckCircle2 size={18} style={{ color: 'hsl(158 64% 40%)' }} />
                    : recorded === 'CONDITIONAL_PASS'
                    ? <AlertCircle size={18} style={{ color: 'hsl(38 92% 50%)' }} />
                    : <XCircle size={18} style={{ color: 'hsl(var(--destructive))' }} />}
                  Result Recorded
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <span className="font-mono font-bold" style={{ color: 'hsl(var(--foreground))' }}>{inspection.inspection_number}</span>
                {' '}{inspection.title}
              </p>
              {needsNcr && (
                <div className="rounded-md border p-4 flex flex-col gap-3"
                  style={{ borderColor: 'hsl(var(--destructive) / 0.3)', backgroundColor: 'hsl(var(--destructive) / 0.05)' }}>
                  <p className="text-sm font-medium" style={{ color: 'hsl(var(--destructive))' }}>
                    {recorded === 'FAIL'
                      ? 'Inspection failed — raise an NCR to document the defect.'
                      : 'Conditional pass — consider raising an NCR for the outstanding item.'}
                  </p>
                  <RaiseDefectForm inspectionEventId={inspection.id} workPackageId={inspection.work_package_id ?? undefined} onSuccess={handleClose} />
                </div>
              )}
              <DialogFooter><Button onClick={handleClose}>Done</Button></DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <DialogHeader><DialogTitle>Record Inspection Result</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-5 mt-4">
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <span className="font-mono font-bold" style={{ color: 'hsl(var(--foreground))' }}>{inspection.inspection_number}</span>
                  {' '}{inspection.title}
                </p>

                <div className="flex flex-col gap-2">
                  <Label>Result *</Label>
                  <div className="flex gap-2">
                    {OPTS.map((opt) => {
                      const Icon = opt.icon
                      const sel = result === opt.value
                      return (
                        <button key={opt.value} type="button" onClick={() => setResult(opt.value)}
                          className="flex-1 flex flex-col items-center gap-1.5 rounded-md border py-3 px-2 text-xs font-medium transition-colors"
                          style={{
                            backgroundColor: sel ? opt.bg : 'transparent',
                            color: sel ? opt.text : 'hsl(var(--muted-foreground))',
                            borderColor: sel ? opt.border : 'hsl(var(--border))',
                            boxShadow: sel ? `0 0 0 1px ${opt.border}` : 'none',
                          }}>
                          <Icon size={16} />{opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ri-date">Inspection Date *</Label>
                  <input id="ri-date" type="date" value={actualDate} onChange={(e) => setDate(e.target.value)} required
                    className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
                    style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ri-notes">Notes {result !== 'PASS' ? '*' : '(optional)'}</Label>
                  <Textarea id="ri-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    required={result !== 'PASS'}
                    placeholder={result === 'FAIL' ? 'Describe the failure — what was found, location...' : result === 'CONDITIONAL_PASS' ? 'Describe the outstanding item and conditions for full pass...' : 'Optional observations...'} />
                </div>

                {mutation.isError && (
                  <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{(mutation.error as Error).message}</p>
                )}
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending || (result !== 'PASS' && !notes.trim())}
                  style={{ backgroundColor: result === 'PASS' ? 'hsl(158 64% 40%)' : result === 'CONDITIONAL_PASS' ? 'hsl(38 80% 42%)' : 'hsl(var(--destructive))', color: 'white' }}>
                  {mutation.isPending ? 'Saving…' : 'Save Result'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
