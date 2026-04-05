import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { useTeam } from '@/lib/query-hooks'
import type { UserRole } from '@/lib/types'

const ROLE_STYLES: Record<UserRole, { bg: string; text: string; label: string }> = {
  OWNERS_REP: { bg: 'hsl(215 50% 23%)', text: 'white', label: "Owner's Rep" },
  OWNER: { bg: 'hsl(38 92% 50%)', text: 'white', label: 'Owner' },
  CAPTAIN: { bg: 'hsl(185 60% 40%)', text: 'white', label: 'Captain' },
  YARD_PM: { bg: 'hsl(260 60% 45%)', text: 'white', label: 'Yard PM' },
  CLASS_SURVEYOR: { bg: 'hsl(215 60% 50%)', text: 'white', label: 'Class Surveyor' },
  SUBCONTRACTOR: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))', label: 'Subcontractor' },
  NAVAL_ARCHITECT: { bg: 'hsl(158 64% 40%)', text: 'white', label: 'Naval Architect' },
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const PERMISSIONS: { role: UserRole; view: string[]; edit: string[] }[] = [
  {
    role: 'OWNERS_REP',
    view: ['All objects'],
    edit: ['All objects'],
  },
  {
    role: 'OWNER',
    view: ['Dashboard', 'Project Overview', 'Approvals'],
    edit: ['Approvals'],
  },
  {
    role: 'CAPTAIN',
    view: ['All objects'],
    edit: ['Defects', 'Inspections'],
  },
  {
    role: 'YARD_PM',
    view: ['Work Packages', 'Inspections', 'Documents', 'Change Orders'],
    edit: ['Work Packages', 'Inspections', 'Documents'],
  },
  {
    role: 'CLASS_SURVEYOR',
    view: ['Work Packages', 'Inspections', 'Defects', 'Documents'],
    edit: ['Inspections'],
  },
]

export default function TeamView() {
  const { data: members = [], isLoading } = useTeam()

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {members.length} project members
        </p>
      </div>

      {/* Member cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((member) => {
          const rs = ROLE_STYLES[member.role]
          return (
            <Card key={member.id}>
              <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                <Avatar className="h-14 w-14">
                  <AvatarFallback
                    className="text-lg"
                    style={{ backgroundColor: rs.bg, color: rs.text }}
                  >
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-bold text-base">{member.name}</div>
                  <Badge
                    className="mt-1"
                    style={{ backgroundColor: rs.bg, color: rs.text, border: 'none' }}
                  >
                    {rs.label}
                  </Badge>
                </div>
                {member.company && (
                  <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {member.company}
                  </div>
                )}
                <div className="text-sm" style={{ color: 'hsl(var(--accent))' }}>
                  {member.email}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Role permissions */}
      <div>
        <h2 className="text-base font-semibold mb-3">Role Permissions</h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Can View</TableHead>
                <TableHead>Can Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSIONS.map((p) => {
                const rs = ROLE_STYLES[p.role]
                return (
                  <TableRow key={p.role}>
                    <TableCell>
                      <Badge style={{ backgroundColor: rs.bg, color: rs.text, border: 'none' }}>
                        {rs.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{p.view.join(', ')}</TableCell>
                    <TableCell className="text-sm">{p.edit.join(', ')}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
