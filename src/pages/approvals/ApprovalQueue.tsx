import React, { useState } from 'react'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { useApprovals, useChangeOrders, useUpdateApproval } from '@/lib/query-hooks'

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  TIER_1: { bg: 'hsl(158 64% 40% / 0.15)', text: 'hsl(var(--success))', label: 'Tier 1 (<€10k)' },
  TIER_2: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 80% 38%)', label: 'Tier 2 (€10k–€50k)' },
  TIER_3: { bg: 'hsl(0 72% 51% / 0.12)', text: 'hsl(var(--destructive))', label: 'Tier 3 (>€50k)' },
}

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

function DeadlineDisplay({ deadline }: { deadline: string | null }) {
  if (!deadline) return null
  const date = new Date(deadline)
  const overdue = isPast(date)
  return (
    <span
      className="text-xs font-medium"
      style={{ color: overdue ? 'hsl(var(--destructive))' : 'hsl(var(--warning))' }}
    >
      {overdue ? 'OVERDUE' : `${formatDistanceToNow(date)} remaining`}
    </span>
  )
}

export default function ApprovalQueue() {
  const { data: approvals = [], isLoading: approvalsLoading } = useApprovals()
  const { data: changeOrders = [], isLoading: coLoading } = useChangeOrders()
  const updateApproval = useUpdateApproval()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogAction, setDialogAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED')
  const [dialogApprovalId, setDialogApprovalId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const isLoading = approvalsLoading || coLoading

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
  }

  const pending = approvals
    .filter((a) => a.status === 'PENDING')
    .sort((a, b) => {
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    })

  const decided = approvals.filter((a) => a.status !== 'PENDING')

  const openDialog = (id: string, action: 'APPROVED' | 'REJECTED') => {
    setDialogApprovalId(id)
    setDialogAction(action)
    setNotes('')
    setDialogOpen(true)
  }

  const handleDecision = () => {
    if (!dialogApprovalId) return
    updateApproval.mutate(
      {
        id: dialogApprovalId,
        updates: {
          status: dialogAction,
          decision_date: new Date().toISOString().split('T')[0],
          decision_notes: notes || null,
          approver_name: 'Nadir',
        },
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          const msg = dialogAction === 'APPROVED' ? 'Approval confirmed.' : 'Approval rejected.'
          setToast(msg)
          setTimeout(() => setToast(null), 3000)
        },
      },
    )
  }

  const getApproval = (id: string) => approvals.find((a) => a.id === id)

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Approval Queue</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Owner-facing approval management
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-[var(--radius)] shadow-lg text-sm font-medium text-white"
          style={{ backgroundColor: 'hsl(var(--success))' }}
        >
          {toast}
        </div>
      )}

      {/* Pending */}
      <div>
        <h2 className="text-base font-semibold mb-3">
          Pending{' '}
          {pending.length > 0 && (
            <span
              className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'hsl(var(--warning)/0.15)', color: 'hsl(var(--warning))' }}
            >
              {pending.length}
            </span>
          )}
        </h2>

        {pending.length === 0 && (
          <div
            className="rounded-[var(--radius)] border border-dashed p-8 text-center text-sm"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
          >
            No pending approvals. All clear!
          </div>
        )}

        <div className="flex flex-col gap-4">
          {pending.map((approval) => {
            const tier = TIER_STYLES[approval.tier]
            const linkedCO = approval.change_order_id
              ? changeOrders.find((co) => co.id === approval.change_order_id)
              : null

            return (
              <Card key={approval.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {approval.approval_number}
                      </div>
                      <div className="font-semibold">{approval.title}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge style={{ backgroundColor: tier.bg, color: tier.text, border: 'none' }}>
                        {tier.label}
                      </Badge>
                      <span className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                        {eur(approval.cost_amount)}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {approval.description}
                  </p>

                  <div className="flex items-center gap-3 mb-4 text-xs">
                    {linkedCO && (
                      <Badge style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: 'none', fontSize: '11px' }}>
                        {linkedCO.co_number}
                      </Badge>
                    )}
                    {approval.deadline && <DeadlineDisplay deadline={approval.deadline} />}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => openDialog(approval.id, 'APPROVED')}
                      style={{ backgroundColor: 'hsl(var(--success))', color: 'white' }}
                    >
                      <CheckCircle size={14} className="mr-1.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDialog(approval.id, 'REJECTED')}
                      style={{ borderColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive))' }}
                    >
                      <XCircle size={14} className="mr-1.5" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* History */}
      {decided.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">History</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decided.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell className="font-mono text-xs">{approval.approval_number}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{approval.title}</TableCell>
                    <TableCell>
                      <Badge
                        style={{
                          backgroundColor:
                            approval.status === 'APPROVED'
                              ? 'hsl(158 64% 40% / 0.15)'
                              : 'hsl(0 72% 51% / 0.1)',
                          color:
                            approval.status === 'APPROVED'
                              ? 'hsl(var(--success))'
                              : 'hsl(var(--destructive))',
                          border: 'none',
                          fontSize: '11px',
                        }}
                      >
                        {approval.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {approval.decision_date
                        ? format(new Date(approval.decision_date), 'd MMM yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {approval.decision_notes || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Decision dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction === 'APPROVED' ? 'Confirm Approval' : 'Reject Approval'}
            </DialogTitle>
          </DialogHeader>
          {dialogApprovalId && (
            <div className="mb-2">
              <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {getApproval(dialogApprovalId)?.title}
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any decision notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDecision}
              disabled={updateApproval.isPending}
              style={{
                backgroundColor:
                  dialogAction === 'APPROVED' ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
                color: 'white',
              }}
            >
              {dialogAction === 'APPROVED' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
