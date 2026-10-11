import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { FileUp, Lock, Paperclip, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  useAllocateTransaction,
  useChangeOrders,
  useCreateFinanceAccount,
  useCrew,
  useDefects,
  useFinanceByObject,
  useFinanceLedger,
  useFinanceSummary,
  useImportTransactions,
  useLogDays,
  useMyRole,
  useOrbEntries,
  useParts,
  useProject,
  useRemoveAllocation,
  useWorkPackages,
} from '@/lib/query-hooks'
import { useProjectId } from '@/contexts/ProjectContext'
import { useQueryClient } from '@tanstack/react-query'
import { parseRevolutCsv, type ParseResult } from '@/lib/revolut-csv'
import { CATEGORY_LABEL, suggest, type Candidates, type FinanceCategory, type Suggestion } from '@/lib/finance-match'
import { receiptUrl, uploadReceipt } from '@/lib/finance-files-client'
import type { FinanceAccount, FinanceAllocation, FinanceReceipt, FinanceTransaction } from '@/lib/types'

// The money in the ontology (migration 040).
//
// The owner's bank account, one transaction per line, each put against what
// it paid for: a work package, a part, a bunkering in the Oil Record Book, a
// day in port. Statements come in as Revolut exports (or, later, straight
// from Revolut); nothing a bank sends is edited here, and an allocation that
// was wrong is removed with a reason and stays in the record. Kept by the
// owner, the owner's rep and the captain; nobody else sees any of it.

const muted = { color: 'hsl(var(--muted-foreground))' }
const FINANCE_ROLES = ['OWNER', 'OWNERS_REP', 'CAPTAIN']
const CATEGORIES = Object.keys(CATEGORY_LABEL) as FinanceCategory[]
const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)

type ObjectOption = { type: string; id: string; label: string }

export default function FinancePage() {
  const { data: project } = useProject()
  const { data: role = null, isLoading: roleLoading } = useMyRole()
  const allowed = role !== null && FINANCE_ROLES.includes(role)
  const { data: ledger, isLoading } = useFinanceLedger(allowed)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [openTx, setOpenTx] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const { data: summary = [] } = useFinanceSummary(`${year}-01-01`, `${year}-12-31`, allowed)
  const { data: byObject = [] } = useFinanceByObject(allowed)
  const objects = useObjectOptions(year)

  if (roleLoading) return null
  if (!allowed) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-6 text-sm">
          <Lock size={18} className="mt-0.5 shrink-0" style={muted} />
          The money of this {project?.vessel_id ? 'boat' : 'property'} is kept by the owner, the owner's rep and the captain.
        </CardContent>
      </Card>
    )
  }

  const accounts = ledger?.accounts ?? []
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0] ?? null
  const allocated = (t: FinanceTransaction) =>
    (ledger?.allocations ?? []).filter((a) => a.transaction_id === t.id && !a.removed_at).reduce((s, a) => s + Number(a.amount), 0)
  const txs = (ledger?.transactions ?? []).filter(
    (t) => (!account || t.account_id === account.id) && parseISO(t.booked_at).getFullYear() === year,
  )
  const open = (t: FinanceTransaction) =>
    !['DECLINED', 'FAILED', 'REVERTED'].includes(t.state) && Math.abs(Number(t.amount)) - allocated(t) > 0.004
  const shown = onlyOpen ? txs.filter(open) : txs
  const selected = (ledger?.transactions ?? []).find((t) => t.id === openTx) ?? null
  const currency = account?.currency ?? 'EUR'
  const rows = summary.filter((r) => r.currency === currency)
  const totalOut = rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0)
  const totalIn = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const byCategory = new Map<string, number>()
  rows.forEach((r) => byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount))

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Finance</h1>
          <p className="text-sm" style={muted}>
            {project?.vessel?.name ?? project?.name} · kept by the owner, the owner's rep and the captain; nobody else sees it
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 0 && (
            <select aria-label="Account" className="h-9 rounded-md border bg-background px-2 text-sm" value={account?.id ?? ''} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          )}
          <select aria-label="Year" className="h-9 rounded-md border bg-background px-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[0, 1, 2, 3].map((k) => new Date().getFullYear() - k).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus size={14} className="mr-1" /> Account
          </Button>
          {accounts.length > 0 && (
            <Button size="sm" onClick={() => setImporting(true)}>
              <FileUp size={14} className="mr-1" /> Import Revolut statement
            </Button>
          )}
        </div>
      </div>

      {adding && <AccountForm onDone={() => setAdding(false)} />}
      {importing && <ImportPanel accounts={accounts} onDone={() => setImporting(false)} />}

      {!isLoading && accounts.length === 0 && !adding && (
        <Card>
          <CardContent className="p-6 text-sm">
            Add the account the {project?.vessel_id ? 'boat' : 'property'} is run from (your Revolut Business account, for
            example), then import its statement. Every transaction can then be put against what it paid for, with the receipt.
          </CardContent>
        </Card>
      )}

      {account && (
        <>
          <div className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
            <Card>
              <CardContent className="flex flex-col gap-2 p-4 text-sm">
                <h2 className="text-base font-semibold">{year}</h2>
                <div className="flex justify-between"><span>Money out</span><span className="font-mono">{money(totalOut, currency)}</span></div>
                <div className="flex justify-between"><span>Money in</span><span className="font-mono">{money(totalIn, currency)}</span></div>
                <div className="mt-2 flex flex-col gap-1 border-t pt-2">
                  {[...byCategory.entries()]
                    .sort((a, b) => a[1] - b[1])
                    .map(([cat, amt]) => (
                      <div key={cat} className="flex justify-between text-xs">
                        <span style={cat.startsWith('UNALLOCATED') ? { color: 'hsl(35 80% 35%)' } : undefined}>
                          {cat === 'UNALLOCATED_OUT' ? 'Not yet put against anything (out)' : cat === 'UNALLOCATED_IN' ? 'Not yet put against anything (in)' : CATEGORY_LABEL[cat as FinanceCategory] ?? cat}
                        </span>
                        <span className="font-mono">{money(amt, currency)}</span>
                      </div>
                    ))}
                  {byCategory.size === 0 && <p className="text-xs" style={muted}>No transactions in {year}.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b px-3 py-2 text-xs" style={muted}>
                  <span>{txs.length} transactions · {txs.filter(open).length} to put against something</span>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Only those
                  </label>
                </div>
                {isLoading ? (
                  <p className="p-4 text-sm" style={muted}>Loading…</p>
                ) : (
                  <ul className="max-h-[60vh] divide-y overflow-y-auto">
                    {shown.map((t) => {
                      const amt = Number(t.amount)
                      const left = Math.abs(amt) - allocated(t)
                      const receipts = (ledger?.receipts ?? []).filter((r) => r.transaction_id === t.id && !r.removed_at).length
                      return (
                        <li key={t.id}>
                          <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))]" onClick={() => setOpenTx(t.id)}>
                            <span className="w-14 shrink-0 font-mono text-xs" style={muted}>{format(parseISO(t.booked_at), 'd MMM')}</span>
                            <span className="min-w-0 flex-1 truncate">{t.counterparty ?? t.description ?? '—'}</span>
                            {receipts > 0 && <Paperclip size={12} style={muted} aria-label="has a receipt" />}
                            {t.state !== 'COMPLETED' && <Badge variant="outline" className="text-[10px]">{t.state.toLowerCase()}</Badge>}
                            {open(t) && left < Math.abs(amt) && <Badge variant="outline" className="text-[10px]">part</Badge>}
                            {open(t) && left === Math.abs(amt) && <span className="h-2 w-2 rounded-full" style={{ background: 'hsl(35 80% 50%)' }} aria-label="not yet put against anything" />}
                            <span className="w-28 shrink-0 text-right font-mono" style={{ color: amt < 0 ? undefined : 'hsl(142 60% 30%)' }}>{money(amt, t.currency)}</span>
                          </button>
                        </li>
                      )
                    })}
                    {shown.length === 0 && <li className="p-4 text-sm" style={muted}>Nothing here.</li>}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <CostByObject rows={byObject.filter((r) => r.currency === currency)} objects={objects.options} currency={currency} />
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setOpenTx(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <TransactionPanel
              tx={selected}
              allocations={(ledger?.allocations ?? []).filter((a) => a.transaction_id === selected.id)}
              receipts={(ledger?.receipts ?? []).filter((r) => r.transaction_id === selected.id)}
              objects={objects.options}
              candidates={objects.candidates}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** The things money can be put against, and the hints for suggestions. */
function useObjectOptions(year: number): { options: ObjectOption[]; candidates: Candidates } {
  const { data: project } = useProject()
  const { data: wps = [] } = useWorkPackages()
  const { data: cos = [] } = useChangeOrders()
  const { data: defects = [] } = useDefects()
  const { data: parts = [] } = useParts()
  const { data: crew = [] } = useCrew()
  const { data: orb = [] } = useOrbEntries()
  const { data: days = [] } = useLogDays(`${year}-01-01`, `${year}-12-31`)
  return useMemo(() => {
    const options: ObjectOption[] = [
      ...(project ? [{ type: 'PROJECT', id: project.id, label: `${project.name} (the whole project)` }] : []),
      ...wps.map((w) => ({ type: 'WORK_PACKAGE', id: w.id, label: `${w.wp_number} ${w.title}` })),
      ...cos.map((c) => ({ type: 'CHANGE_ORDER', id: c.id, label: `${c.co_number} ${c.title}` })),
      ...defects.map((d) => ({ type: 'DEFECT_RECORD', id: d.id, label: `${d.ncr_number} ${d.title}` })),
      ...parts.filter((p) => !p.removed_at).map((p) => ({ type: 'PART', id: p.id, label: p.name })),
      ...orb.filter((e) => !e.struck_at).map((e) => ({ type: 'ORB_ENTRY', id: e.id, label: `Oil Record Book #${e.entry_no} ${e.code} ${format(parseISO(e.occurred_at), 'd MMM')}` })),
      ...days.map((d) => ({ type: 'LOG_DAY', id: d.id, label: `Log ${d.log_date}${d.port_to ? ` ${d.port_to}` : ''}` })),
      ...crew.map((c) => ({ type: 'CREW', id: c.id, label: `${c.first_name} ${c.last_name}` })),
    ]
    const candidates: Candidates = {
      bunkerings: orb
        .filter((e) => e.code === 'H' && !e.struck_at)
        .map((e) => ({ id: e.id, occurred_at: e.occurred_at, label: `Oil Record Book #${e.entry_no} bunkering${e.quantity ? ` ${e.quantity} ${e.unit}` : ''}` })),
      workPackages: wps.map((w) => ({ id: w.id, label: `${w.wp_number} ${w.title}`, contractor: w.trade_contractor })),
      changeOrders: cos.map((c) => ({ id: c.id, label: `${c.co_number} ${c.title}`, cost: c.cost_delta == null ? null : Number(c.cost_delta) })),
      logDays: days.map((d) => ({ id: d.id, date: d.log_date, port: d.port_to ?? d.port_from })),
    }
    return { options, candidates }
  }, [project, wps, cos, defects, parts, crew, orb, days])
}

const TYPE_LABEL: Record<string, string> = {
  PROJECT: 'Project', WORK_PACKAGE: 'Work package', CHANGE_ORDER: 'Change order', DEFECT_RECORD: 'NCR', PART: 'Part',
  ORB_ENTRY: 'Oil Record Book', LOG_DAY: 'Log day', CREW: 'Crew', SERVICE_RECORD: 'Service', INSPECTION_EVENT: 'Inspection',
}

function TransactionPanel({
  tx,
  allocations,
  receipts,
  objects,
  candidates,
}: {
  tx: FinanceTransaction
  allocations: FinanceAllocation[]
  receipts: FinanceReceipt[]
  objects: ObjectOption[]
  candidates: Candidates
}) {
  const projectId = useProjectId()
  const qc = useQueryClient()
  const allocate = useAllocateTransaction()
  const remove = useRemoveAllocation()
  const live = allocations.filter((a) => !a.removed_at)
  const left = Math.round((Math.abs(Number(tx.amount)) - live.reduce((s, a) => s + Number(a.amount), 0)) * 100) / 100
  const moved = !['DECLINED', 'FAILED', 'REVERTED'].includes(tx.state)
  const [category, setCategory] = useState<FinanceCategory>(Number(tx.amount) > 0 ? 'TRANSFER' : 'OTHER')
  const [objectKey, setObjectKey] = useState('')
  const [amount, setAmount] = useState(String(left))
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const suggestions = moved && left > 0 ? suggest({ ...tx, amount: Number(tx.amount) }, candidates) : []
  const labelOf = (type: string | null, id: string | null) =>
    type && id ? objects.find((o) => o.type === type && o.id === id)?.label ?? TYPE_LABEL[type] ?? type : null

  const doAllocate = (s?: Suggestion) => {
    const [type, id] = s ? [s.objectType, s.objectId] : objectKey ? objectKey.split(':') : [null, null]
    const amt = s ? left : Number(amount.replace(',', '.'))
    allocate.mutate(
      { transactionId: tx.id, amount: amt, category: s?.category ?? category, objectType: type, objectId: id, note: s ? `Suggested: ${s.why}` : note },
      {
        onSuccess: () => {
          // The form starts again from what is still left, so a second part
          // is not sent with the first part's amount.
          setAmount(String(Math.max(0, Math.round((left - amt) * 100) / 100)))
          setObjectKey('')
          setNote('')
          toast.success('Put against it')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }
  const doRemove = (a: FinanceAllocation) => {
    const reason = window.prompt('Why is this allocation wrong? It stays in the record, crossed through.')
    if (!reason?.trim()) return
    remove.mutate({ id: a.id, reason: reason.trim() }, { onError: (e) => toast.error(e.message) })
  }
  const doUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      await uploadReceipt(projectId, tx.id, file)
      qc.invalidateQueries({ queryKey: ['finance', projectId] })
      toast.success('Receipt attached')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not attach the receipt')
    } finally {
      setUploading(false)
    }
  }
  const doOpen = async (r: FinanceReceipt) => {
    try {
      window.open(await receiptUrl(r.id), '_blank', 'noopener')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open the receipt')
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <SheetTitle>{tx.counterparty ?? tx.description ?? 'Transaction'}</SheetTitle>
        <div className="mt-1 font-mono text-lg">{money(Number(tx.amount), tx.currency)}</div>
        <div className="text-xs" style={muted}>
          {format(parseISO(tx.booked_at), 'd MMM yyyy HH:mm')} · {tx.state.toLowerCase()}
          {tx.original_currency && ` · ${tx.original_amount} ${tx.original_currency}`}
          {tx.fee ? ` · fee ${tx.fee}` : ''}
          {tx.bank_category ? ` · ${tx.bank_category}` : ''}
        </div>
        {tx.description && tx.description !== tx.counterparty && <div className="text-xs">{tx.description}</div>}
        {tx.reference && <div className="text-xs">Reference: {tx.reference}</div>}
      </div>

      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">What it paid for</h3>
        {live.length === 0 && <p className="text-xs" style={muted}>Not yet put against anything.</p>}
        {allocations.map((a) => (
          <div key={a.id} className={`flex items-start gap-2 text-xs ${a.removed_at ? 'line-through opacity-60' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className="font-mono">{money(Number(a.amount), tx.currency)}</span> · {CATEGORY_LABEL[a.category as FinanceCategory] ?? a.category}
              {labelOf(a.object_type, a.object_id) && ` · ${labelOf(a.object_type, a.object_id)}`}
              {a.note && <span style={muted}> · {a.note}</span>}
              <span style={muted}> · {a.created_by_name}</span>
              {a.removed_at && <span className="block no-underline" style={{ color: 'hsl(var(--destructive))' }}>removed: {a.removed_reason}</span>}
            </span>
            {!a.removed_at && (
              <button type="button" aria-label="Remove allocation" className="opacity-60 hover:opacity-100" onClick={() => doRemove(a)}>
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </section>

      {moved && left > 0 && (
        <section className="flex flex-col gap-2 rounded-md border p-3">
          <h3 className="text-sm font-semibold">Put {money(left, tx.currency)} against…</h3>
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-1">
              {suggestions.map((s, k) => (
                <button key={k} type="button" className="rounded border px-2 py-1 text-left text-xs hover:bg-[hsl(var(--muted))]" onClick={() => doAllocate(s)} disabled={allocate.isPending}>
                  <span className="font-medium">{CATEGORY_LABEL[s.category]}</span>
                  {s.objectId && ` · ${s.label}`}
                  <span style={muted}> · {s.why}</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="fin-cat">Category</Label>
              <select id="fin-cat" className="h-9 w-full rounded-md border bg-background px-2" value={category} onChange={(e) => setCategory(e.target.value as FinanceCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="fin-amount">Amount</Label>
              <Input id="fin-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="fin-object">For (optional)</Label>
            <select id="fin-object" className="h-9 w-full rounded-md border bg-background px-2" value={objectKey} onChange={(e) => setObjectKey(e.target.value)}>
              <option value="">Only the category</option>
              {objects.map((o) => (
                <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>{TYPE_LABEL[o.type] ?? o.type}: {o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="fin-note">Note</Label>
            <Input id="fin-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button size="sm" className="self-start" onClick={() => doAllocate()} disabled={allocate.isPending || !(Number(amount.replace(',', '.')) > 0)}>
            Put it against this
          </Button>
        </section>
      )}

      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Receipts</h3>
        {receipts.filter((r) => !r.removed_at).map((r) => (
          <button key={r.id} type="button" className="flex items-center gap-1 text-left text-xs hover:underline" onClick={() => doOpen(r)}>
            <Paperclip size={12} /> {r.file_name} <span style={muted}>· {r.created_by_name}</span>
          </button>
        ))}
        <label className="mt-1 inline-flex cursor-pointer items-center gap-1 self-start rounded-md border px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]">
          <FileUp size={12} /> {uploading ? 'Attaching…' : 'Attach a receipt (PDF or photo)'}
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/webp" className="hidden" disabled={uploading} onChange={(e) => doUpload(e.target.files?.[0])} />
        </label>
        <p className="text-[11px]" style={muted}>Stored privately with its fingerprint, so it can be shown to be the one attached.</p>
      </section>
    </div>
  )
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const create = useCreateFinanceAccount()
  const [name, setName] = useState('Revolut Business EUR')
  const [provider, setProvider] = useState('REVOLUT')
  const [currency, setCurrency] = useState('EUR')
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-2 p-4 text-sm">
        <div>
          <Label htmlFor="acc-name">Account</Label>
          <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="acc-provider">Kind</Label>
          <select id="acc-provider" className="h-9 rounded-md border bg-background px-2" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="REVOLUT">Revolut</option>
            <option value="BANK">Other bank</option>
            <option value="CARD">Card</option>
            <option value="CASH">Cash</option>
          </select>
        </div>
        <div>
          <Label htmlFor="acc-currency">Currency</Label>
          <Input id="acc-currency" className="w-20" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
        <Button
          size="sm"
          disabled={create.isPending || name.trim().length < 2 || !/^[A-Z]{3}$/.test(currency)}
          onClick={() =>
            create.mutate(
              { name: name.trim(), provider, currency },
              { onSuccess: () => { toast.success('Account added'); onDone() }, onError: (e) => toast.error(e.message) },
            )
          }
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <p className="w-full text-xs" style={muted}>One account per currency: a Revolut Business account with EUR and GBP is two accounts here.</p>
      </CardContent>
    </Card>
  )
}

function ImportPanel({ accounts, onDone }: { accounts: FinanceAccount[]; onDone: () => void }) {
  const run = useImportTransactions()
  const [parsed, setParsed] = useState<(ParseResult & { fileName: string }) | null>(null)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const account = accounts.find((a) => a.id === accountId)
  const forAccount = parsed?.rows.filter((r) => r.currency === account?.currency) ?? []
  const otherCurrencies = [...new Set(parsed?.rows.filter((r) => r.currency !== account?.currency).map((r) => r.currency) ?? [])]

  const read = async (file: File | undefined) => {
    if (!file) return
    const result = await parseRevolutCsv(await file.text())
    if (result.format === 'UNKNOWN') toast.error('This does not look like a Revolut statement export (CSV)')
    setParsed({ ...result, fileName: file.name })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Import a Revolut statement</h2>
          <Button size="sm" variant="ghost" onClick={onDone}>Close</Button>
        </div>
        <p className="text-xs" style={muted}>
          In Revolut Business: Transactions, then Statement, then Excel or CSV. Importing the same statement twice adds nothing; a
          transaction that was pending and has since completed is updated, and the change is kept.
        </p>
        <input type="file" accept=".csv,text/csv" aria-label="Statement file" onChange={(e) => read(e.target.files?.[0])} />
        {parsed && (
          <>
            <div className="text-xs">
              {parsed.fileName}: {parsed.rows.length} transactions read
              {parsed.skipped.length > 0 && `, ${parsed.skipped.length} lines not read`}
            </div>
            {parsed.skipped.length > 0 && (
              <ul className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                {parsed.skipped.slice(0, 5).map((s) => (
                  <li key={s.line}>Line {s.line}: {s.reason}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="imp-account">Into</Label>
                <select id="imp-account" className="h-9 rounded-md border bg-background px-2" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                disabled={!account || forAccount.length === 0 || run.isPending}
                onClick={() =>
                  run.mutate(
                    { accountId, source: 'REVOLUT_CSV', rows: forAccount, fileName: parsed.fileName },
                    {
                      onSuccess: (r) => {
                        toast.success(`${r.new_count} new, ${r.changed_count} updated by the bank, ${r.unchanged_count} already there`)
                        onDone()
                      },
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                {run.isPending ? 'Importing…' : `Import ${forAccount.length} in ${account?.currency ?? ''}`}
              </Button>
            </div>
            {otherCurrencies.length > 0 && (
              <p className="text-xs" style={muted}>
                Also in this file: {otherCurrencies.join(', ')}. Add an account in that currency and import the same file into it.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CostByObject({ rows, objects, currency }: { rows: Array<{ object_type: string; object_id: string; spent: number; received: number; transactions: number }>; objects: ObjectOption[]; currency: string }) {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => Number(b.spent) - Number(a.spent))
  return (
    <Card>
      <CardContent className="p-4 text-sm">
        <h2 className="mb-2 text-base font-semibold">What things have cost (all years)</h2>
        <ul className="flex flex-col gap-1">
          {sorted.slice(0, 30).map((r) => (
            <li key={`${r.object_type}:${r.object_id}`} className="flex justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">
                <span style={muted}>{TYPE_LABEL[r.object_type] ?? r.object_type}: </span>
                {objects.find((o) => o.type === r.object_type && o.id === r.object_id)?.label ?? 'on another project of this boat'}
              </span>
              <span className="shrink-0 font-mono">{money(Number(r.spent), currency)} · {r.transactions} tx</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
