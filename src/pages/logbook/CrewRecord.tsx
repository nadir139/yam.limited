import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRetireCrewCertificate, useSetCrewCertificate } from '@/lib/query-hooks'
import { CERT_STATE_META, certState, daysUntil } from '@/lib/crew'
import { day } from '@/lib/format'
import type { Crew, CrewCertificate, SeaTime } from '@/lib/types'

// One crew member's record beyond the crew list (migration 037): days at sea
// worked out from the log, and the certificates they hold with expiries.
// A certificate is corrected with the before kept in the event log, or
// retired with a reason (renewed, lapsed); it is never deleted.

const muted = { color: 'hsl(var(--muted-foreground))' }

function SeaTimeLine({ label, t }: { label: string; t: SeaTime | undefined }) {
  if (!t || t.days_aboard === 0) return <div className="text-xs" style={muted}>{label}: nothing logged aboard</div>
  return (
    <div className="text-xs">
      <span className="font-medium">{label}:</span> {t.days_aboard} day{t.days_aboard === 1 ? '' : 's'} aboard · {t.sea_service_days} at sea
      {t.watchkeeping_days ? ` (${t.watchkeeping_days} watchkeeping)` : ''} · {t.standby_days} standby · {t.yard_days} in the yard
      {Number(t.nautical_miles) > 0 && ` · ${Number(t.nautical_miles).toLocaleString('en-GB')} nm`}
    </div>
  )
}

export default function CrewRecord({
  crew,
  certificates,
  seaAll,
  seaYear,
  canKeep,
}: {
  crew: Crew
  certificates: CrewCertificate[]
  seaAll: SeaTime | undefined
  seaYear: SeaTime | undefined
  canKeep: boolean
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [editing, setEditing] = useState<CrewCertificate | 'new' | null>(null)
  const retire = useRetireCrewCertificate()
  const current = certificates.filter((c) => !c.retired_at)
  const retired = certificates.filter((c) => c.retired_at)

  const doRetire = (c: CrewCertificate) => {
    const reason = window.prompt(`Why is "${c.title}" retired? (renewed, lapsed, entered in error; it is kept)`)
    if (!reason?.trim()) return
    retire.mutate({ id: c.id, reason: reason.trim() }, { onError: (e) => toast.error(e.message) })
  }

  return (
    <div className="flex flex-col gap-3 px-3 pb-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <SeaTimeLine label="All time on this boat" t={seaAll} />
        <SeaTimeLine label={`In ${today.slice(0, 4)}`} t={seaYear} />
        {seaAll?.first_day && (
          <div className="text-xs" style={muted}>
            Logged aboard from {day(seaAll.first_day)} to {day(seaAll.last_day!)}. Worked out from the log, so it changes only when the log does.
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Certificates</h3>
          {canKeep && editing === null && (
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
              Add certificate
            </Button>
          )}
        </div>
        {editing !== null && (
          <CertificateForm crew={crew} certificate={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
        {current.length === 0 ? (
          <p className="text-xs" style={muted}>None recorded.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {current.map((c) => {
              const state = certState(c, today)
              const meta = CERT_STATE_META[state]
              const left = c.expires_on ? daysUntil(c.expires_on, today) : null
              return (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: meta.colour }} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{c.title}</span>
                    {c.number && <span className="font-mono"> · {c.number}</span>}
                    {c.issued_by && <span style={muted}> · {c.issued_by}</span>}
                    <span className="block" style={{ color: state === 'VALID' || state === 'NO_EXPIRY' ? 'hsl(var(--muted-foreground))' : meta.colour }}>
                      {c.issued_on ? `Issued ${day(c.issued_on)}` : ''}
                      {c.issued_on && c.expires_on ? ' · ' : ''}
                      {c.expires_on
                        ? left! < 0
                          ? `expired ${day(c.expires_on)}`
                          : `expires ${day(c.expires_on)} (${left} day${left === 1 ? '' : 's'})`
                        : c.issued_on
                          ? ''
                          : 'no dates recorded'}
                    </span>
                  </span>
                  {canKeep && (
                    <span className="flex shrink-0 gap-2">
                      <button type="button" className="hover:underline" onClick={() => setEditing(c)}>Correct</button>
                      <button type="button" className="hover:underline" onClick={() => doRetire(c)}>Retire</button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {retired.length > 0 && (
          <details className="mt-1 text-xs" style={muted}>
            <summary className="cursor-pointer">{retired.length} retired</summary>
            <ul className="mt-1 flex flex-col gap-0.5">
              {retired.map((c) => (
                <li key={c.id}>
                  <span className="line-through">{c.title}{c.expires_on ? ` (to ${day(c.expires_on)})` : ''}</span> · {c.retired_reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}

function CertificateForm({ crew, certificate, onDone }: { crew: Crew; certificate: CrewCertificate | null; onDone: () => void }) {
  const save = useSetCrewCertificate()
  const [title, setTitle] = useState(certificate?.title ?? '')
  const [number, setNumber] = useState(certificate?.number ?? '')
  const [issuedBy, setIssuedBy] = useState(certificate?.issued_by ?? '')
  const [issuedOn, setIssuedOn] = useState(certificate?.issued_on ?? '')
  const [expiresOn, setExpiresOn] = useState(certificate?.expires_on ?? '')
  const [reason, setReason] = useState('')
  const valid = title.trim().length >= 2 && (!issuedOn || !expiresOn || expiresOn >= issuedOn)
  const id = certificate?.id ?? 'new'

  const submit = () =>
    save.mutate(
      {
        certificateId: certificate?.id ?? null,
        crewId: crew.id,
        title: title.trim(),
        number,
        issuedBy,
        issuedOn: issuedOn || null,
        expiresOn: expiresOn || null,
        reason,
      },
      {
        onSuccess: () => {
          toast.success(certificate ? 'Certificate corrected' : 'Certificate recorded')
          onDone()
        },
        onError: (e) => toast.error(e.message),
      },
    )

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border p-2">
      <div>
        <Label htmlFor={`cert-title-${id}`}>Certificate</Label>
        <Input id={`cert-title-${id}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="STCW Basic Safety Training" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`cert-number-${id}`}>Number</Label>
          <Input id={`cert-number-${id}`} value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`cert-issuer-${id}`}>Issued by</Label>
          <Input id={`cert-issuer-${id}`} value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="MCA" />
        </div>
        <div>
          <Label htmlFor={`cert-issued-${id}`}>Issued on</Label>
          <Input id={`cert-issued-${id}`} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`cert-expires-${id}`}>Expires on</Label>
          <Input id={`cert-expires-${id}`} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </div>
      </div>
      {certificate && (
        <div>
          <Label htmlFor={`cert-reason-${id}`}>What was wrong (kept with the change)</Label>
          <Input id={`cert-reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Expiry date mistyped" />
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={!valid || save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : certificate ? 'Save correction' : 'Record certificate'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  )
}
