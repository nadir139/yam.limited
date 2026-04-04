import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { LayoutGrid, List } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { MOCK_DEFECTS } from '@/lib/mock-data'
import type { DefectSeverity, DefectStatus, Discipline } from '@/lib/types'

const SEVERITY_STYLES: Record<DefectSeverity, { bg: string; text: string }> = {
  CRITICAL: { bg: 'hsl(0 72% 51% / 0.12)', text: 'hsl(var(--destructive))' },
  HIGH: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 80% 38%)' },
  MEDIUM: { bg: 'hsl(45 93% 47% / 0.15)', text: 'hsl(45 80% 35%)' },
  LOW: { bg: 'hsl(185 60% 40% / 0.12)', text: 'hsl(var(--accent))' },
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: 'hsl(0 72% 51% / 0.1)', text: 'hsl(var(--destructive))' },
  IN_PROGRESS: { bg: 'hsl(38 92% 50% / 0.1)', text: 'hsl(38 80% 38%)' },
  PENDING_APPROVAL: { bg: 'hsl(215 50% 23% / 0.1)', text: 'hsl(var(--primary))' },
  CLOSED: { bg: 'hsl(158 64% 40% / 0.12)', text: 'hsl(var(--success))' },
  DISPUTED: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))' },
}

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const SEVERITIES: DefectSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const STATUSES: DefectStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED', 'DISPUTED']

export default function DefectList() {
  const navigate = useNavigate()
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const filtered = MOCK_DEFECTS.filter((d) => {
    const matchesSearch =
      search === '' ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.ncr_number.toLowerCase().includes(search.toLowerCase())
    const matchesSeverity = severityFilter === 'ALL' || d.severity === severityFilter
    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter
    return matchesSearch && matchesSeverity && matchesStatus
  })

  const selectStyle: React.CSSProperties = {
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
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Defect Records</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {MOCK_DEFECTS.filter((d) => d.status !== 'CLOSED').length} open NCRs
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All Severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <Input
          placeholder="Search NCRs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <div className="ml-auto flex gap-1">
          <Button
            variant={view === 'table' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('table')}
          >
            <List size={14} />
          </Button>
          <Button
            variant={view === 'cards' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('cards')}
          >
            <LayoutGrid size={14} />
          </Button>
        </div>
      </div>

      {view === 'table' ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NCR #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Discovered</TableHead>
                <TableHead>Cost Impact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const ss = SEVERITY_STYLES[d.severity]
                const st = STATUS_STYLES[d.status]
                return (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/defects/${d.id}`)}
                  >
                    <TableCell className="font-mono text-xs font-medium">{d.ncr_number}</TableCell>
                    <TableCell className="text-sm max-w-xs">
                      <div className="truncate font-medium">{d.title}</div>
                    </TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: ss.bg, color: ss.text, border: 'none', fontSize: '11px' }}>
                        {d.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: st.bg, color: st.text, border: 'none', fontSize: '11px' }}>
                        {d.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {d.location_on_vessel}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(d.discovered_date), 'd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.cost_impact != null ? eur(d.cost_impact) : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    No defects match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((d) => {
            const ss = SEVERITY_STYLES[d.severity]
            const st = STATUS_STYLES[d.status]
            return (
              <Card
                key={d.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/defects/${d.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-mono text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {d.ncr_number}
                    </span>
                    <div className="flex gap-1.5">
                      <Badge style={{ backgroundColor: ss.bg, color: ss.text, border: 'none', fontSize: '11px' }}>
                        {d.severity}
                      </Badge>
                      <Badge style={{ backgroundColor: st.bg, color: st.text, border: 'none', fontSize: '11px' }}>
                        {d.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                  <div className="font-semibold text-sm mb-1">{d.title}</div>
                  <div className="text-xs mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {d.location_on_vessel}
                  </div>
                  <div className="flex justify-between text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <span>Discovered {format(new Date(d.discovered_date), 'd MMM yyyy')}</span>
                    {d.cost_impact != null && (
                      <span style={{ color: 'hsl(var(--destructive))' }}>{eur(d.cost_impact)}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-12" style={{ color: 'hsl(var(--muted-foreground))' }}>
              No defects match the current filters.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
