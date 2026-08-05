import { useMemo, useState } from 'react'
import { UserPlus, AlertCircle, Circle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  useTeam,
  useInviteMember,
  useRemoveMember,
  useChangeMemberRole,
  usePermissions,
  useActionPermissions,
  PRESENCE_WINDOW_MS,
} from '@/lib/query-hooks'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation, useRelativeTime, useDuration } from '@/lib/i18n'
import type { ProjectMember, UserRole } from '@/lib/types'

// Who is on this project, and how they got here.
//
// The page used to be a grid of cards over a hardcoded permissions table. Two
// things were wrong with that: there was no way to add anybody — the only
// Action that wrote to project_members enrolled the creator and nothing else —
// and the permissions table was prose that had drifted from the matrix the
// database actually enforces. It did not even list two of the seven roles.
//
// Membership is now a lifecycle. Someone invited appears immediately, before
// they have ever signed in, because the gap between the invitation and their
// first visit is worth having: "I sent you the link a week ago and you still
// have not opened it" is a sentence an owner's rep needs, and it cannot be
// reconstructed after the fact.

const ROLES: UserRole[] = [
  'OWNER',
  'OWNERS_REP',
  'CAPTAIN',
  'YARD_PM',
  'CLASS_SURVEYOR',
  'NAVAL_ARCHITECT',
  'SUBCONTRACTOR',
  // The chef is not the captain. Before CREW existed the only way to put a
  // cook, a stewardess or an engineer on a project was to hand them one of the
  // decision-making roles, which was wrong on the org chart and wrong on
  // permissions -- and it is exactly the person you most want to be able to
  // name in a conversation.
  'CREW',
]

const ROLE_COLOR: Record<UserRole, string> = {
  OWNERS_REP: 'hsl(215 50% 23%)',
  OWNER: 'hsl(38 92% 50%)',
  CAPTAIN: 'hsl(185 60% 40%)',
  YARD_PM: 'hsl(260 60% 45%)',
  CLASS_SURVEYOR: 'hsl(215 60% 50%)',
  NAVAL_ARCHITECT: 'hsl(158 64% 40%)',
  SUBCONTRACTOR: 'hsl(215 15% 45%)',
  CREW: 'hsl(25 55% 45%)',
}

const initials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

/** Derived from the heartbeat, not a socket — see `useProjectPresence`. */
const isHereNow = (m: ProjectMember) =>
  Boolean(m.last_seen_at) &&
  Date.now() - new Date(m.last_seen_at!).getTime() < PRESENCE_WINDOW_MS

const selectStyle = {
  borderColor: 'hsl(var(--border))',
  backgroundColor: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
}

function MemberCard({
  m,
  isSelf,
  canChangeRole,
  canRemove,
  onChangeRole,
  onRemove,
  changingRole,
}: {
  m: ProjectMember
  isSelf: boolean
  canChangeRole: boolean
  canRemove: boolean
  onChangeRole: (role: UserRole) => void
  onRemove: () => void
  changingRole: boolean
}) {
  const { t } = useTranslation()
  const ago = useRelativeTime()
  const duration = useDuration()

  const here = isHereNow(m)
  const arrival = duration(m.invited_at, m.first_seen_at)

  return (
    <Card style={{ opacity: m.status === 'LEFT' ? 0.6 : 1 }}>
      <CardContent className="flex gap-3 p-4">
        <div className="relative h-11 w-11 flex-shrink-0">
          <Avatar className="h-11 w-11">
            <AvatarFallback
              style={{ backgroundColor: ROLE_COLOR[m.role], color: 'white' }}
              className="text-sm"
            >
              {initials(m.name)}
            </AvatarFallback>
          </Avatar>
          {here && (
            <span
              className="absolute -bottom-0.5 -right-0.5 rounded-full p-px"
              style={{ background: 'hsl(var(--background))' }}
              title={t('team.hereNow')}
            >
              <Circle size={11} fill="hsl(var(--success))" strokeWidth={0} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold">{m.name}</span>
            {isSelf && (
              <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                ({t('team.you')})
              </span>
            )}
          </div>

          <Badge
            className="mt-1"
            style={{ backgroundColor: ROLE_COLOR[m.role], color: 'white', border: 'none' }}
          >
            {t(`role.${m.role}`)}
          </Badge>

          <div className="mt-1.5 truncate text-xs" style={{ color: 'hsl(var(--accent))' }}>
            {m.email}
          </div>
          {m.company && (
            <div className="truncate text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {m.company}
            </div>
          )}

          {/* The arc: invited → arrived → last here → left. */}
          <div
            className="mt-2 flex flex-col gap-0.5 text-[11px]"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            {m.status === 'INVITED' && (
              <span style={{ color: 'hsl(38 80% 38%)' }}>
                {t('team.neverOpened', { when: ago(m.invited_at) })}
              </span>
            )}
            {m.status !== 'INVITED' && arrival && (
              <span>{t('team.arrivedAfter', { duration: arrival })}</span>
            )}
            {m.status === 'ACTIVE' && here && (
              <span style={{ color: 'hsl(var(--success))' }}>{t('team.hereNow')}</span>
            )}
            {m.status === 'ACTIVE' && !here && m.last_seen_at && (
              <span>{t('team.lastSeen', { when: ago(m.last_seen_at) })}</span>
            )}
            {m.invited_by_name && <span>{t('team.invitedBy', { who: m.invited_by_name })}</span>}
            {m.status === 'LEFT' && (
              <>
                <span>{t('team.leftWhen', { when: ago(m.left_at) })}</span>
                {m.left_reason && <span className="italic">“{m.left_reason}”</span>}
              </>
            )}
          </div>

          {m.status !== 'LEFT' && (canChangeRole || (canRemove && !isSelf)) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {canChangeRole && (
                <select
                  className="h-7 rounded-md border px-1.5 text-[11px] shadow-sm"
                  style={selectStyle}
                  value={m.role}
                  disabled={changingRole}
                  aria-label={t('team.changeRole')}
                  onChange={(e) => onChangeRole(e.target.value as UserRole)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`role.${r}`)}
                    </option>
                  ))}
                </select>
              )}
              {canRemove && !isSelf && (
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onRemove}>
                  {t('team.remove')}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function TeamView() {
  const { data: members = [], isLoading } = useTeam()
  const { data: matrix = [] } = useActionPermissions()
  const { can } = usePermissions()
  const { user } = useAuth()
  const { t } = useTranslation()

  const invite = useInviteMember()
  const remove = useRemoveMember()
  const changeRole = useChangeMemberRole()

  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState<UserRole>('SUBCONTRACTOR')
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [removing, setRemoving] = useState<ProjectMember | null>(null)
  const [removeReason, setRemoveReason] = useState('')
  const [removeError, setRemoveError] = useState<string | null>(null)

  const groups = useMemo(
    () => ({
      // People who are here right now float to the top of their group.
      active: members
        .filter((m) => m.status === 'ACTIVE')
        .sort(
          (a, b) => Number(isHereNow(b)) - Number(isHereNow(a)) || a.name.localeCompare(b.name),
        ),
      pending: members.filter((m) => m.status === 'INVITED'),
      left: members.filter((m) => m.status === 'LEFT'),
    }),
    [members],
  )

  // What each role may do, derived from the same table the Actions check, so it
  // cannot drift from what is actually enforced.
  const byRole = useMemo(() => {
    const out = new Map<UserRole, string[]>()
    for (const r of ROLES) {
      out.set(
        r,
        matrix
          .filter((p) => p.role === r)
          .map((p) => p.action_key.replace(/^action_/, '').replace(/_/g, ' '))
          .sort(),
      )
    }
    return out
  }, [matrix])

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>
        {t('common.loading')}
      </div>
    )
  }

  const submitInvite = () => {
    setInviteError(null)
    invite.mutate(
      { email, role, name, company },
      {
        onSuccess: () => {
          setInviting(false)
          setEmail('')
          setName('')
          setCompany('')
        },
        onError: (e) => setInviteError(e.message),
      },
    )
  }

  const submitRemove = () => {
    if (!removing) return
    setRemoveError(null)
    remove.mutate(
      { memberId: removing.id, reason: removeReason },
      {
        onSuccess: () => {
          setRemoving(null)
          setRemoveReason('')
        },
        onError: (e) => setRemoveError(e.message),
      },
    )
  }

  const Group = ({ label, list }: { label: string; list: ProjectMember[] }) =>
    list.length === 0 ? null : (
      <div>
        <h2
          className="mb-2 text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          {label} · {list.length}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <MemberCard
              key={m.id}
              m={m}
              isSelf={user?.email?.toLowerCase() === m.email.toLowerCase()}
              canChangeRole={can('action_change_member_role')}
              canRemove={can('action_remove_member')}
              changingRole={changeRole.isPending}
              onChangeRole={(r) => changeRole.mutate({ memberId: m.id, role: r })}
              onRemove={() => {
                setRemoving(m)
                setRemoveReason('')
                setRemoveError(null)
              }}
            />
          ))}
        </div>
      </div>
    )

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('team.title')}</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('team.subtitle', {
              active: groups.active.length,
              pending: groups.pending.length,
            })}
          </p>
        </div>
        {can('action_invite_member') && (
          <Button onClick={() => setInviting(true)}>
            <UserPlus size={15} className="mr-1.5" />
            {t('team.invite')}
          </Button>
        )}
      </div>

      <Group label={t('team.groupActive')} list={groups.active} />
      <Group label={t('team.groupPending')} list={groups.pending} />
      <Group label={t('team.groupLeft')} list={groups.left} />

      {members.length === 0 && (
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {t('team.noneYet')}
        </p>
      )}

      <div>
        <h2 className="mb-1 text-base font-semibold">{t('team.permissionsTitle')}</h2>
        <p className="mb-3 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {t('team.permissionsIntro')}
        </p>
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">{t('team.role')}</TableHead>
                  <TableHead>{t('team.permissionsTitle')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROLES.map((r) => (
                  <TableRow key={r}>
                    <TableCell>
                      <Badge
                        style={{ backgroundColor: ROLE_COLOR[r], color: 'white', border: 'none' }}
                      >
                        {t(`role.${r}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {byRole.get(r)?.length ? byRole.get(r)!.join(', ') : t('common.none')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Invite */}
      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('team.inviteTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('team.inviteBlurb')}
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-email">{t('team.email')}</Label>
              <Input
                id="inv-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setInviteError(null)
                }}
                placeholder="geom.sanna@studiosanna.it"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-role">{t('team.role')}</Label>
                <select
                  id="inv-role"
                  className="h-10 w-full rounded-md border px-3 text-sm shadow-sm"
                  style={selectStyle}
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`role.${r}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-name">
                  {t('team.name')} ({t('common.optional')})
                </Label>
                <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-company">
                {t('team.company')} ({t('common.optional')})
              </Label>
              <Input
                id="inv-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            {inviteError && (
              <p
                className="flex items-start gap-1.5 text-xs"
                style={{ color: 'hsl(var(--destructive))' }}
              >
                <AlertCircle size={13} className="mt-px flex-shrink-0" />
                {inviteError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviting(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={email.trim().length === 0 || invite.isPending} onClick={submitInvite}>
              {t('team.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('team.removeTitle', { name: removing?.name ?? '' })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('team.removeBlurb')}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rm-reason">{t('team.removeReason')}</Label>
            <Textarea
              id="rm-reason"
              rows={2}
              value={removeReason}
              onChange={(e) => {
                setRemoveReason(e.target.value)
                setRemoveError(null)
              }}
            />
            {removeError && (
              <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                {removeError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={removeReason.trim().length === 0 || remove.isPending}
              onClick={submitRemove}
              style={{ backgroundColor: 'hsl(var(--destructive))', color: 'white' }}
            >
              {t('team.confirmRemove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
