import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Check, CircleHelp, Lock, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  useChangeOrders,
  useFinanceLedger,
  useInspections,
  useMyRole,
  usePaymentAction,
  usePaymentStatus,
  useProject,
  useWorkPackages,
} from '@/lib/query-hooks'
import * as db from '@/lib/db'
import type { CheckedCondition, PaymentAgreementView, PaymentCondition, PaymentMilestoneView } from '@/lib/db'
import { sameParty } from '@/lib/finance-match'

// Refit payments released against the model (migration 042).
//
// Each stage of the refit price carries the conditions the model can check:
// a work package complete, an inspection passed, no NCR open on it, a change
// order approved, a date. The yard asks for a stage; the owner side approves
// with the conditions in front of them (or overrides with a reason, kept);
// the owner pays from their own account and the payment, seen in the
// ledger, is matched to the stage. YAM never holds the money.

const muted = { color: 'hsl(var(--muted-foreground))' }
const OWNER_SIDE = ['OWNER', 'OWNERS_REP']
const READERS = ['OWNER', 'OWNERS_REP', 'CAPTAIN', 'YARD_PM']
const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Not yet asked',
  RELEASE_REQUESTED: 'Release asked',
  APPROVED: 'Approved, to pay',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  DRAFT: 'Draft',
  ACTIVE: 'Agreed',
  CLOSED: 'All paid',
}

export default function PaymentsPage() {
  const { data: project } = useProject()
  const { data: role = null, isLoading: roleLoading } = useMyRole()
  const allowed = role !== null && READERS.includes(role)
  const ownerSide = role !== null && OWNER_SIDE.includes(role)
  const { data: plans = [], isLoading } = usePaymentStatus(allowed)
  const [creating, setCreating] = useState(false)

  if (roleLoading) return null
  if (!allowed) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-6 text-sm">
          <Lock size={18} className="mt-0.5 shrink-0" style={muted} />
          Payments are seen by the owner, the owner's rep, the captain and the yard's project manager.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-sm" style={muted}>
            {project?.name} · each stage is released against the record of the work. The money stays in the owner's account until
            they pay it; this keeps what was agreed, what was checked and who approved.
          </p>
        </div>
        {ownerSide && !creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} className="mr-1" /> Payment plan
          </Button>
        )}
      </div>

      {creating && <AgreementForm onDone={() => setCreating(false)} />}
      {!isLoading && plans.length === 0 && !creating && (
        <Card>
          <CardContent className="p-6 text-sm" style={muted}>
            No payment plan yet.{ownerSide ? ' Write the refit price as stages, each with what has to be true before it is paid.' : ''}
          </CardContent>
        </Card>
      )}
      {plans.map((p) => (
        <AgreementCard key={p.agreement.id} plan={p} role={role} />
      ))}
    </div>
  )
}

function AgreementForm({ onDone }: { onDone: () => void }) {
  const act = usePaymentAction()
  const [title, setTitle] = useState('Refit contract')
  const [payee, setPayee] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [rule, setRule] = useState<'ONE' | 'BOTH'>('ONE')
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-2 p-4 text-sm">
        <div>
          <Label htmlFor="pa-title">Plan</Label>
          <Input id="pa-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pa-payee">Paid to</Label>
          <Input id="pa-payee" value={payee} placeholder="The yard" onChange={(e) => setPayee(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pa-cur">Currency</Label>
          <Input id="pa-cur" className="w-20" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
        <div>
          <Label htmlFor="pa-rule">Released by</Label>
          <select id="pa-rule" className="h-9 rounded-md border bg-background px-2" value={rule} onChange={(e) => setRule(e.target.value as 'ONE' | 'BOTH')}>
            <option value="ONE">The owner or the owner's rep</option>
            <option value="BOTH">The owner and the owner's rep</option>
          </select>
        </div>
        <Button
          size="sm"
          disabled={act.isPending || title.trim().length < 3 || payee.trim().length < 2 || !/^[A-Z]{3}$/.test(currency)}
          onClick={() =>
            act.mutate((pid) => db.createPaymentAgreement(pid, { title: title.trim(), payee: payee.trim(), currency, approvalRule: rule }), {
              onSuccess: () => {
                toast.success('Plan started: add its stages')
                onDone()
              },
              onError: (e) => toast.error(e.message),
            })
          }
        >
          Create
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </CardContent>
    </Card>
  )
}

function AgreementCard({ plan, role }: { plan: PaymentAgreementView; role: string | null }) {
  const a = plan.agreement
  const ownerSide = role !== null && OWNER_SIDE.includes(role)
  const act = usePaymentAction()
  const [adding, setAdding] = useState(false)
  const live = plan.milestones.filter((m) => m.milestone.status !== 'CANCELLED')
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{a.title}</h2>
            <div className="text-xs" style={muted}>
              to {a.payee} · released by {a.approval_rule === 'BOTH' ? 'the owner and the owner\'s rep' : 'the owner or the owner\'s rep'} · money held in the
              owner's account
              {a.activated_by_name && ` · agreed by ${a.activated_by_name}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={a.status === 'ACTIVE' ? 'default' : 'outline'}>{STATUS_LABEL[a.status]}</Badge>
            <span className="font-mono text-xs">
              {money(plan.paid, a.currency)} of {money(plan.total, a.currency)} paid
            </span>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded bg-[hsl(var(--muted))]">
          <div className="h-full bg-[hsl(var(--primary))]" style={{ width: `${plan.total ? Math.min(100, (plan.paid / plan.total) * 100) : 0}%` }} />
        </div>

        <ol className="flex flex-col gap-2">
          {plan.milestones.map((m) => (
            <MilestoneRow key={m.milestone.id} view={m} plan={plan} role={role} />
          ))}
        </ol>

        {a.status === 'DRAFT' && ownerSide && (
          <div className="flex flex-wrap gap-2">
            {adding ? (
              <MilestoneForm agreementId={a.id} onDone={() => setAdding(false)} />
            ) : (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus size={14} className="mr-1" /> Stage
              </Button>
            )}
            {!adding && live.length > 0 && (
              <Button
                size="sm"
                disabled={act.isPending}
                onClick={() => {
                  if (!window.confirm('Agree this plan? Its stages, amounts and conditions are then fixed.')) return
                  act.mutate((pid) => db.activatePaymentAgreement(pid, a.id), { onSuccess: () => toast.success('Agreed'), onError: (e) => toast.error(e.message) })
                }}
              >
                Agree the plan
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ConditionChip({ c }: { c: CheckedCondition }) {
  const color = c.met === true ? 'hsl(142 60% 30%)' : c.met === false ? 'hsl(35 80% 35%)' : 'hsl(var(--muted-foreground))'
  const Icon = c.met === true ? Check : c.met === false ? X : CircleHelp
  return (
    <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]" style={{ color, borderColor: color }} title={c.detail ?? undefined}>
      <Icon size={11} /> {c.label}
      {c.detail && c.met !== true && <span style={muted}>({c.detail})</span>}
    </span>
  )
}

function MilestoneRow({ view, plan, role }: { view: PaymentMilestoneView; plan: PaymentAgreementView; role: string | null }) {
  const m = view.milestone
  const a = plan.agreement
  const ownerSide = role !== null && OWNER_SIDE.includes(role)
  const canAsk = role === 'YARD_PM' || role === 'OWNERS_REP'
  const act = usePaymentAction()
  const [paying, setPaying] = useState(false)
  const run = (fn: (pid: string) => Promise<unknown>, ok: string) =>
    act.mutate(fn, { onSuccess: () => toast.success(ok), onError: (e) => toast.error(e.message) })

  const approve = () => {
    let override = ''
    if (!view.all_met) {
      const unmet = view.conditions.filter((c) => c.met === false).map((c) => c.label).join('; ')
      override = window.prompt(`Not met yet: ${unmet}.\nApprove anyway? Say why (kept with the approval).`) ?? ''
      if (override.trim().length < 5) return
    }
    const manual = view.conditions.filter((c) => c.met === null)
    if (manual.length && !window.confirm(`You confirm: ${manual.map((c) => c.label).join('; ')}`)) return
    act.mutate((pid) => db.approveRelease(pid, m.id, '', override.trim()), {
      onSuccess: (r) => toast.success((r as { approved: boolean }).approved ? 'Approved: pay it from the account' : 'Approval recorded: the other approver is needed'),
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <li className={`flex flex-col gap-1.5 rounded-md border p-3 ${m.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs" style={muted}>{m.seq}</span>
        <span className="font-medium">{m.title}</span>
        <span className="font-mono">{money(Number(m.amount), a.currency)}</span>
        {m.due_date && <span className="text-xs" style={muted}>due {format(parseISO(m.due_date), 'd MMM yyyy')}</span>}
        <Badge variant={m.status === 'PAID' ? 'default' : 'outline'} className="ml-auto">{STATUS_LABEL[m.status]}</Badge>
      </div>
      {view.conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {view.conditions.map((c, k) => (
            <ConditionChip key={k} c={c} />
          ))}
        </div>
      )}
      <div className="text-xs" style={muted}>
        {m.requested_at && `Asked by ${m.requested_by_name} ${format(parseISO(m.requested_at), 'd MMM HH:mm')}${m.request_note ? `: "${m.request_note}"` : ''}. `}
        {m.approvals.map((x) => `Approved by ${x.name}${x.override ? ` overriding: "${x.override}"` : ''}. `).join('')}
        {m.rejected_at && m.status === 'PENDING' && `Last refused by ${m.rejected_by_name}: "${m.rejected_reason}". `}
        {m.paid_at && `Paid ${format(parseISO(m.paid_at), 'd MMM yyyy')}, recorded by ${m.paid_recorded_by_name}. `}
        {m.cancelled_reason && `Cancelled: ${m.cancelled_reason}`}
      </div>

      {a.status === 'ACTIVE' && (
        <div className="flex flex-wrap gap-2">
          {m.status === 'PENDING' && canAsk && (
            <Button
              size="sm"
              variant="outline"
              disabled={act.isPending}
              onClick={() => {
                const note = window.prompt('Note for the owner (optional)') ?? null
                if (note !== null) run((pid) => db.requestRelease(pid, m.id, note.trim()), 'Release asked')
              }}
            >
              Ask for release
            </Button>
          )}
          {m.status === 'RELEASE_REQUESTED' && ownerSide && (
            <>
              <Button size="sm" disabled={act.isPending} onClick={approve}>
                Approve release
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => {
                  const reason = window.prompt('Why not yet? The yard sees this.')
                  if (reason?.trim()) run((pid) => db.rejectRelease(pid, m.id, reason.trim()), 'Sent back')
                }}
              >
                Not yet
              </Button>
            </>
          )}
          {m.status === 'APPROVED' && ownerSide && !paying && (
            <Button size="sm" onClick={() => setPaying(true)}>Record the payment</Button>
          )}
          {['PENDING', 'RELEASE_REQUESTED', 'APPROVED'].includes(m.status) && ownerSide && (
            <button
              type="button"
              className="text-xs opacity-60 hover:opacity-100"
              onClick={() => {
                const reason = window.prompt('Why is this stage cancelled? It stays in the record.')
                if (reason?.trim()) run((pid) => db.cancelPaymentMilestone(pid, m.id, reason.trim()), 'Stage cancelled')
              }}
            >
              Cancel stage
            </button>
          )}
        </div>
      )}
      {paying && <PaymentPicker view={view} plan={plan} onDone={() => setPaying(false)} />}
    </li>
  )
}

/** The owner's payment, picked from the ledger: outgoing, same currency, room for the stage's amount. */
function PaymentPicker({ view, plan, onDone }: { view: PaymentMilestoneView; plan: PaymentAgreementView; onDone: () => void }) {
  const { data: ledger } = useFinanceLedger(true)
  const act = usePaymentAction()
  const amount = Number(view.milestone.amount)
  const candidates = useMemo(() => {
    if (!ledger) return []
    const taken = (id: string) =>
      ledger.allocations.filter((x) => x.transaction_id === id && !x.removed_at).reduce((s, x) => s + Number(x.amount), 0)
    return ledger.transactions
      .filter((t) => t.currency === plan.agreement.currency && Number(t.amount) < 0 && !['DECLINED', 'FAILED', 'REVERTED'].includes(t.state))
      .filter((t) => Math.abs(Number(t.amount)) - taken(t.id) >= amount - 0.004)
      .map((t) => ({ t, score: (sameParty(plan.agreement.payee, `${t.counterparty ?? ''} ${t.description ?? ''}`) ? 0 : 1) + Math.abs(Math.abs(Number(t.amount)) - amount) / amount }))
      .sort((x, y) => x.score - y.score)
      .slice(0, 8)
  }, [ledger, plan.agreement.currency, plan.agreement.payee, amount])
  return (
    <div className="flex flex-col gap-1 rounded border p-2 text-xs">
      <div className="flex items-center justify-between">
        <span>Which payment from the account paid this stage?</span>
        <button type="button" onClick={onDone} aria-label="Close"><X size={12} /></button>
      </div>
      {candidates.length === 0 && <span style={muted}>No outgoing payment of at least {money(amount, plan.agreement.currency)} yet. Import or sync the statement first.</span>}
      {candidates.map(({ t }) => (
        <button
          key={t.id}
          type="button"
          className="flex justify-between gap-2 rounded px-2 py-1 text-left hover:bg-[hsl(var(--muted))]"
          disabled={act.isPending}
          onClick={() =>
            act.mutate((pid) => db.recordMilestonePayment(pid, view.milestone.id, t.id), {
              onSuccess: () => {
                toast.success('Paid: put against the stage in the ledger')
                onDone()
              },
              onError: (e) => toast.error(e.message),
            })
          }
        >
          <span>{format(parseISO(t.booked_at), 'd MMM yyyy')} · {t.counterparty ?? t.description ?? '—'}</span>
          <span className="font-mono">{money(Number(t.amount), t.currency)}</span>
        </button>
      ))}
    </div>
  )
}

const CONDITION_TYPES: Array<[PaymentCondition['type'], string]> = [
  ['WORK_PACKAGE_COMPLETE', 'Work package complete'],
  ['NO_OPEN_NCR', 'No open NCR on a work package'],
  ['INSPECTION_PASSED', 'Inspection passed'],
  ['CHANGE_ORDER_APPROVED', 'Change order approved'],
  ['DATE', 'On or after a date'],
  ['MANUAL', 'Something the approver confirms'],
]

function MilestoneForm({ agreementId, onDone }: { agreementId: string; onDone: () => void }) {
  const act = usePaymentAction()
  const { data: wps = [] } = useWorkPackages()
  const { data: inspections = [] } = useInspections()
  const { data: cos = [] } = useChangeOrders()
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState('')
  const [conditions, setConditions] = useState<PaymentCondition[]>([])
  const [type, setType] = useState<PaymentCondition['type']>('WORK_PACKAGE_COMPLETE')
  const [ref, setRef] = useState('')

  const options: Array<{ id: string; label: string }> =
    type === 'WORK_PACKAGE_COMPLETE' || type === 'NO_OPEN_NCR'
      ? wps.map((w) => ({ id: w.id, label: `${w.wp_number} ${w.title}` }))
      : type === 'INSPECTION_PASSED'
        ? inspections.map((i) => ({ id: i.id, label: `${i.inspection_number ?? ''} ${i.title}`.trim() }))
        : type === 'CHANGE_ORDER_APPROVED'
          ? cos.map((c) => ({ id: c.id, label: `${c.co_number} ${c.title}` }))
          : []
  const label = (c: PaymentCondition) => {
    const name = [...wps.map((w) => [w.id, w.wp_number]), ...inspections.map((i) => [i.id, i.title]), ...cos.map((c2) => [c2.id, c2.co_number])].find(([id]) => id === c.id)?.[1]
    return `${CONDITION_TYPES.find(([t]) => t === c.type)?.[1]}${name ? `: ${name}` : c.on ? `: ${c.on}` : c.text ? `: ${c.text}` : ''}`
  }
  const addCondition = () => {
    if (!ref.trim()) return
    const c: PaymentCondition = type === 'DATE' ? { type, on: ref } : type === 'MANUAL' ? { type, text: ref.trim() } : { type, id: ref }
    setConditions((cs) => [...cs, c])
    setRef('')
  }
  const n = Number(amount.replace(',', '.'))

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label htmlFor="ms-title">Stage</Label>
          <Input id="ms-title" value={title} placeholder="Hull and antifouling complete" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ms-amount">Amount</Label>
          <Input id="ms-amount" className="w-32" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ms-due">Due (optional)</Label>
          <Input id="ms-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="ms-ctype">Paid when</Label>
          <select id="ms-ctype" className="h-9 rounded-md border bg-background px-2" value={type} onChange={(e) => { setType(e.target.value as PaymentCondition['type']); setRef('') }}>
            {CONDITION_TYPES.map(([t, l]) => (
              <option key={t} value={t}>{l}</option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <Label htmlFor="ms-cref">Which</Label>
          {type === 'DATE' ? (
            <Input id="ms-cref" type="date" value={ref} onChange={(e) => setRef(e.target.value)} />
          ) : type === 'MANUAL' ? (
            <Input id="ms-cref" value={ref} placeholder="Sea trials signed off by the captain" onChange={(e) => setRef(e.target.value)} />
          ) : (
            <select id="ms-cref" className="h-9 w-full rounded-md border bg-background px-2" value={ref} onChange={(e) => setRef(e.target.value)}>
              <option value="">Choose…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
        <Button size="sm" variant="outline" disabled={!ref.trim()} onClick={addCondition}>Add condition</Button>
      </div>
      {conditions.length > 0 && (
        <ul className="flex flex-wrap gap-1 text-xs">
          {conditions.map((c, k) => (
            <li key={k} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5">
              {label(c)}
              <button type="button" aria-label="Remove condition" onClick={() => setConditions((cs) => cs.filter((_, j) => j !== k))}><X size={10} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={act.isPending || title.trim().length < 3 || !(n > 0)}
          onClick={() =>
            act.mutate((pid) => db.addPaymentMilestone(pid, { agreementId, title: title.trim(), amount: n, conditions, dueDate: due || null }), {
              onSuccess: () => {
                toast.success('Stage added')
                onDone()
              },
              onError: (e) => toast.error(e.message),
            })
          }
        >
          Add stage
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  )
}
