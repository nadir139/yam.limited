import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { useWorkPackages } from '@/lib/query-hooks'
import type { Discipline, WorkPackageStatus } from '@/lib/types'

const eur = (amount: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount)

const DISCIPLINE_COLORS: Record<Discipline, { bg: string; text: string }> = {
  CLASS: { bg: 'hsl(215 50% 23% / 0.12)', text: 'hsl(var(--primary))' },
  HULL: { bg: 'hsl(185 60% 40% / 0.12)', text: 'hsl(var(--accent))' },
  MECHANICAL: { bg: 'hsl(38 92% 50% / 0.12)', text: 'hsl(38 92% 40%)' },
  ELECTRICAL: { bg: 'hsl(260 60% 50% / 0.12)', text: 'hsl(260 60% 45%)' },
  RIGGING: { bg: 'hsl(158 64% 40% / 0.12)', text: 'hsl(var(--success))' },
  INTERIOR: { bg: 'hsl(330 60% 50% / 0.12)', text: 'hsl(330 60% 45%)' },
  PAINT: { bg: 'hsl(20 80% 50% / 0.12)', text: 'hsl(20 80% 45%)' },
  STRUCTURAL: { bg: 'hsl(0 72% 51% / 0.12)', text: 'hsl(var(--destructive))' },
  SAFETY: { bg: 'hsl(45 93% 47% / 0.12)', text: 'hsl(45 80% 38%)' },
}

const STATUS_COLORS: Record<WorkPackageStatus, { bg: string; text: string }> = {
  DRAFT: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))' },
  SCOPED: { bg: 'hsl(215 50% 23% / 0.12)', text: 'hsl(var(--primary))' },
  ACTIVE: { bg: 'hsl(158 64% 40% / 0.15)', text: 'hsl(var(--success))' },
  EXPANDED: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 80% 38%)' },
  ON_HOLD: { bg: 'hsl(0 72% 51% / 0.12)', text: 'hsl(var(--destructive))' },
  COMPLETE: { bg: 'hsl(158 64% 40% / 0.2)', text: 'hsl(var(--success))' },
}

const DISCIPLINES: Discipline[] = ['STRUCTURAL', 'HULL', 'MECHANICAL', 'ELECTRICAL', 'RIGGING', 'INTERIOR', 'PAINT', 'CLASS', 'SAFETY']
const STATUSES: WorkPackageStatus[] = ['DRAFT', 'SCOPED', 'ACTIVE', 'EXPANDED', 'ON_HOLD', 'COMPLETE']

export default function WorkPackageList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [disciplineFilter, setDisciplineFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const { data: workPackages = [], isLoading } = useWorkPackages()

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
  }

  const filtered = workPackages.filter((wp) => {
    const matchesSearch =
      search === '' ||
      wp.title.toLowerCase().includes(search.toLowerCase()) ||
      wp.wp_number.toLowerCase().includes(search.toLowerCase())
    const matchesDiscipline = disciplineFilter === 'ALL' || wp.discipline === disciplineFilter
    const matchesStatus = statusFilter === 'ALL' || wp.status === statusFilter
    return matchesSearch && matchesDiscipline && matchesStatus
  })

  const selectStyle = {
    borderColor: 'hsl(var(--border))',
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    padding: '0.375rem 0.75rem',
    borderRadius: 'var(--radius)',
    border: '1px solid hsl(var(--border))',
    fontSize: '0.875rem',
    height: '2.25rem',
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Work Packages</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {workPackages.length} packages across {new Set(workPackages.map((w) => w.discipline)).size} disciplines
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={disciplineFilter} onChange={(e) => setDisciplineFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All Disciplines</option>
          {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <Input
          placeholder="Search work packages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>WP #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Discipline</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Planned Cost</TableHead>
              <TableHead>Hours Used</TableHead>
              <TableHead className="text-center">Class</TableHead>
              <TableHead>Contractor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((wp) => {
              const hoursPct = wp.planned_hours > 0
                ? Math.round((wp.actual_hours / wp.planned_hours) * 100)
                : 0
              const dc = DISCIPLINE_COLORS[wp.discipline]
              const sc = STATUS_COLORS[wp.status]
              return (
                <TableRow
                  key={wp.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/work-packages/${wp.id}`)}
                >
                  <TableCell className="font-mono text-xs font-medium">{wp.wp_number}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm max-w-xs truncate">{wp.title}</div>
                  </TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: dc.bg, color: dc.text, border: 'none', fontSize: '11px' }}>
                      {wp.discipline}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: sc.bg, color: sc.text, border: 'none', fontSize: '11px' }}>
                      {wp.status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{eur(wp.planned_cost)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <Progress value={hoursPct} className="h-1.5 flex-1" />
                      <span className="text-xs w-8 text-right" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {hoursPct}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {wp.is_class_item && (
                      <CheckCircle2 size={16} style={{ color: 'hsl(var(--accent))', margin: '0 auto' }} />
                    )}
                  </TableCell>
                  <TableCell className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {wp.trade_contractor || '—'}
                  </TableCell>
                </TableRow>
              )
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  No work packages match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
