import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, Pencil, UserPlus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { DateField } from '@/components/ui/date-field'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCrew, useCrewCertificates, useMyRole, usePermissions, useProject, useSeaTime, useSetCrew, useTeam } from '@/lib/query-hooks'
import { useAuth } from '@/contexts/AuthContext'
import { certState } from '@/lib/crew'
import CrewRecord from './CrewRecord'
import { day } from '@/lib/format'
import type { Crew, ProjectMember } from '@/lib/types'

// The boat's people (migration 032).
//
// A crew record exists whether or not the person ever signs in: the deckhand
// who left in 2019 is still in the log as aboard on those days. Giving someone
// an email and ticking "invite" also makes them a member of this boat's
// logbook, as crew or as captain and never anything else, so a captain can
// staff the boat without being able to add people to a refit.

const muted = { color: 'hsl(var(--muted-foreground))' }

function loginState(c: Crew, team: ProjectMember[]) {
  const m = c.member_id ? team.find((t) => t.id === c.member_id) : undefined
  if (!m) return null
  if (m.status === 'LEFT') return { label: 'Left the logbook', tone: 'secondary' as const }
  if (m.status === 'INVITED') return { label: 'Invited', tone: 'outline' as const }
  return { label: m.role === 'CAPTAIN' ? 'Captain' : 'Uses the logbook', tone: 'default' as const }
}

export default function CrewPage() {
  const { data: project } = useProject()
  const { data: crew = [], isLoading } = useCrew()
  const { data: team = [] } = useTeam()
  const { can } = usePermissions()
  const canEdit = can('action_set_crew')
  const [editing, setEditing] = useState<Crew | 'new' | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const { user } = useAuth()
  const { data: role = null } = useMyRole()
  const { data: certificates = [] } = useCrewCertificates()

  const today = new Date().toISOString().slice(0, 10)
  const { data: seaAll = [] } = useSeaTime()
  const { data: seaYear = [] } = useSeaTime(`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`)
  const current = crew.filter((c) => !c.left_on || c.left_on >= today)
  const former = crew.filter((c) => c.left_on && c.left_on < today)
  // Certificates of the crew aboard that have lapsed or lapse within 90 days.
  const currentIds = new Set(current.map((c) => c.id))
  const flagged = certificates.filter((c) => !c.retired_at && currentIds.has(c.crew_id) && ['EXPIRED', 'EXPIRING'].includes(certState(c, today)))
  const myMemberIds = new Set(team.filter((m) => user?.email && m.email?.toLowerCase() === user.email.toLowerCase()).map((m) => m.id))
  // Who may keep a crew member's certificates: themselves, or those who run the crew list.
  const canKeep = (c: Crew) =>
    can('action_set_crew_certificate') &&
    (role === 'CAPTAIN' || role === 'OWNER' || role === 'OWNERS_REP' || (c.member_id !== null && myMemberIds.has(c.member_id)))

  const row = (c: Crew) => {
    const login = loginState(c, team)
    return (
      <li key={c.id}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-1 text-left"
          onClick={() => setOpen((o) => (o === c.id ? null : c.id))}
          aria-expanded={open === c.id}
        >
          {open === c.id ? <ChevronDown size={14} className="mt-1 shrink-0" /> : <ChevronRight size={14} className="mt-1 shrink-0" />}
          <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {c.first_name} {c.last_name}
            {flagged.some((f) => f.crew_id === c.id) && (
              <span className="ml-2 text-[11px] font-normal" style={{ color: '#d97706' }}>certificate due</span>
            )}
          </div>
          <div className="truncate text-xs" style={muted}>
            {[c.position, c.department].filter(Boolean).join(' · ')}
            {c.joined_on ? ` · since ${day(c.joined_on)}` : ''}
            {c.left_on ? ` · left ${day(c.left_on)}` : ''}
          </div>
          </div>
        </button>
        {login && <Badge variant={login.tone} className="shrink-0 text-[10px]">{login.label}</Badge>}
        {canEdit && (
          <Button size="icon" variant="ghost" aria-label={`Edit ${c.first_name}`} onClick={() => setEditing(c)}>
            <Pencil size={14} />
          </Button>
        )}
      </div>
      {open === c.id && (
        <CrewRecord
          crew={c}
          certificates={certificates.filter((x) => x.crew_id === c.id)}
          seaAll={seaAll.find((t) => t.crew_id === c.id)}
          seaYear={seaYear.find((t) => t.crew_id === c.id)}
          canKeep={canKeep(c)}
        />
      )}
      </li>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Crew</h1>
          <p className="text-sm" style={muted}>
            {project?.vessel?.name ?? 'This boat'}: {current.length} aboard{former.length ? `, ${former.length} former` : ''}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setEditing('new')}>
            <UserPlus size={14} className="mr-1.5" /> Add crew member
          </Button>
        )}
      </div>

      {flagged.length > 0 && (
        <Card>
          <CardContent className="flex items-start gap-2 p-3 text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: '#d97706' }} />
            <div>
              {flagged.length} certificate{flagged.length === 1 ? '' : 's'} expired or expiring within 90 days:{' '}
              {flagged
                .map((f) => {
                  const who = crew.find((c) => c.id === f.crew_id)
                  return `${who?.first_name ?? ''} ${who?.last_name ?? ''}`.trim() + ` (${f.title}, ${day(f.expires_on!)})`
                })
                .join('; ')}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm" style={muted}>Loading…</p>
          ) : current.length === 0 ? (
            <p className="p-4 text-sm" style={muted}>
              No crew recorded yet.{canEdit ? ' Add the people aboard, and invite those who should keep the log.' : ''}
            </p>
          ) : (
            <ul className="divide-y">{current.map(row)}</ul>
          )}
        </CardContent>
      </Card>

      {former.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold" style={muted}>Former crew</h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">{former.map(row)}</ul>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add crew member' : 'Edit crew member'}</DialogTitle>
          </DialogHeader>
          {editing !== null && (
            <CrewForm
              crew={editing === 'new' ? null : editing}
              linked={editing !== 'new' && !!editing.member_id}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CrewForm({ crew, linked, onDone }: { crew: Crew | null; linked: boolean; onDone: () => void }) {
  const save = useSetCrew()
  const [f, setF] = useState({
    firstName: crew?.first_name ?? '',
    lastName: crew?.last_name ?? '',
    position: crew?.position ?? '',
    department: crew?.department ?? '',
    email: crew?.email ?? '',
    phone: crew?.phone ?? '',
    joinedOn: crew?.joined_on ?? '',
    leftOn: crew?.left_on ?? '',
    emergencyContactName: crew?.emergency_contact_name ?? '',
    emergencyContactPhone: crew?.emergency_contact_phone ?? '',
    holidays: crew?.holidays_allocated != null ? String(crew.holidays_allocated) : '',
    flights: crew?.flights_allocated != null ? String(crew.flights_allocated) : '',
    notes: crew?.notes ?? '',
  })
  const [invite, setInvite] = useState(false)
  const [memberRole, setMemberRole] = useState<'CREW' | 'CAPTAIN'>('CREW')
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const valid = f.firstName.trim() && f.position.trim() && (!invite || f.email.trim())

  const submit = () => {
    setError(null)
    save.mutate(
      {
        crewId: crew?.id ?? null,
        firstName: f.firstName,
        lastName: f.lastName,
        position: f.position,
        department: f.department,
        email: f.email,
        phone: f.phone,
        joinedOn: f.joinedOn || null,
        leftOn: f.leftOn || null,
        emergencyContactName: f.emergencyContactName,
        emergencyContactPhone: f.emergencyContactPhone,
        holidaysAllocated: num(f.holidays),
        flightsAllocated: num(f.flights),
        notes: f.notes,
        invite,
        memberRole,
      },
      { onSuccess: onDone, onError: (e) => setError(e.message) },
    )
  }

  const field = (k: keyof typeof f, label: string, props: Record<string, unknown> = {}) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`crew-${k}`} className="text-xs">{label}</Label>
      <Input id={`crew-${k}`} value={f[k]} onChange={(e) => set(k)(e.target.value)} {...props} />
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {field('firstName', 'First name (required)', { autoFocus: true })}
        {field('lastName', 'Last name')}
        {field('position', 'Position (required)', { placeholder: 'Deckhand, Chief engineer…' })}
        {field('department', 'Department', { placeholder: 'Deck, Engineering, Interior…' })}
        {field('email', 'Email', { type: 'email', inputMode: 'email' })}
        {field('phone', 'Phone', { inputMode: 'tel' })}
        <div className="flex flex-col gap-1">
          <Label htmlFor="crew-joined" className="text-xs">Joined</Label>
          <DateField id="crew-joined" value={f.joinedOn} onChange={set('joinedOn')} clearable />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="crew-left" className="text-xs">Left</Label>
          <DateField id="crew-left" value={f.leftOn} onChange={set('leftOn')} clearable />
        </div>
        {field('emergencyContactName', 'Emergency contact')}
        {field('emergencyContactPhone', 'Emergency phone', { inputMode: 'tel' })}
        {field('holidays', 'Holiday days a year', { type: 'number', min: 0 })}
        {field('flights', 'Flights a year', { type: 'number', min: 0 })}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="crew-notes" className="text-xs">Notes</Label>
        <Textarea id="crew-notes" rows={2} value={f.notes} onChange={(e) => set('notes')(e.target.value)} />
      </div>

      {!linked && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
            Invite them to keep the logbook
          </label>
          {invite && (
            <div className="flex items-center gap-2 text-sm">
              <span style={muted}>as</span>
              <select
                aria-label="Logbook role"
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value as 'CREW' | 'CAPTAIN')}
              >
                <option value="CREW">Crew</option>
                <option value="CAPTAIN">Captain</option>
              </select>
              <span className="text-xs" style={muted}>They sign in with this email; this boat only.</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs" style={{ color: 'hsl(var(--destructive))' }}>
          <AlertCircle size={13} className="mt-px flex-shrink-0" /> {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button disabled={!valid || save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : crew ? 'Save' : 'Add'}
        </Button>
      </div>
    </div>
  )
}
