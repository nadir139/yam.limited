import React, { useState } from 'react'
import { format } from 'date-fns'
import { Download, ExternalLink, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { useDocuments } from '@/lib/query-hooks'
import UploadDocumentForm from '@/components/actions/UploadDocumentForm'

const DOC_TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  SURVEY_REPORT:    { bg: 'hsl(215 50% 23% / 0.1)',  text: 'hsl(var(--primary))' },
  CLASS_CERTIFICATE:{ bg: 'hsl(185 60% 40% / 0.12)', text: 'hsl(var(--accent))' },
  DRAWING:          { bg: 'hsl(260 60% 50% / 0.1)',  text: 'hsl(260 60% 45%)' },
  SPECIFICATION:    { bg: 'hsl(158 64% 40% / 0.12)', text: 'hsl(var(--success))' },
  NCR:              { bg: 'hsl(0 72% 51% / 0.1)',    text: 'hsl(var(--destructive))' },
  CHANGE_ORDER:     { bg: 'hsl(38 92% 50% / 0.12)',  text: 'hsl(38 80% 38%)' },
  APPROVAL:         { bg: 'hsl(38 92% 50% / 0.08)',  text: 'hsl(38 80% 38%)' },
  CORRESPONDENCE:   { bg: 'hsl(var(--muted))',        text: 'hsl(var(--muted-foreground))' },
  PHOTO:            { bg: 'hsl(330 60% 50% / 0.1)',  text: 'hsl(330 60% 45%)' },
  OTHER:            { bg: 'hsl(var(--muted))',        text: 'hsl(var(--muted-foreground))' },
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  DRAFT:        { bg: 'hsl(var(--muted))',        text: 'hsl(var(--muted-foreground))' },
  UNDER_REVIEW: { bg: 'hsl(38 92% 50% / 0.12)',  text: 'hsl(38 80% 38%)' },
  APPROVED:     { bg: 'hsl(158 64% 40% / 0.15)', text: 'hsl(var(--success))' },
  SUPERSEDED:   { bg: 'hsl(var(--muted))',        text: 'hsl(var(--muted-foreground))' },
}

const DOC_TYPES = [
  'SURVEY_REPORT', 'CLASS_CERTIFICATE', 'DRAWING', 'SPECIFICATION',
  'NCR', 'CHANGE_ORDER', 'APPROVAL', 'CORRESPONDENCE', 'PHOTO', 'OTHER',
] as const

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentLibrary() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const { data: docs = [], isLoading } = useDocuments()

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
  }

  const filtered = docs.filter((d) => {
    const matchesSearch =
      search === '' ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.doc_number.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'ALL' || d.doc_type === typeFilter
    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter
    return matchesSearch && matchesType && matchesStatus
  })

  const classCount = docs.filter((d) => d.is_class_document).length

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Document Library</h1>
          <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {docs.length} documents · {classCount} class-required
          </p>
        </div>
        <UploadDocumentForm />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All Types</option>
          {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="SUPERSEDED">Superseded</option>
        </select>
        <Input
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <div className="ml-auto text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {filtered.length} of {docs.length}
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doc #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Rev</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Linked To</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Size</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((doc) => {
              const dt = DOC_TYPE_STYLES[doc.doc_type]
              const ds = STATUS_STYLES[doc.status]
              return (
                <TableRow key={doc.id}>
                  <TableCell className="font-mono text-xs font-medium">{doc.doc_number}</TableCell>
                  <TableCell className="text-sm font-medium max-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{doc.title}</span>
                      {doc.is_class_document && (
                        <CheckCircle2 size={12} style={{ color: 'hsl(var(--accent))', flexShrink: 0 }} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: dt.bg, color: dt.text, border: 'none', fontSize: '11px' }}>
                      {doc.doc_type.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{doc.revision}</TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: ds.bg, color: ds.text, border: 'none', fontSize: '11px' }}>
                      {doc.status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {doc.linked_object_type
                      ? doc.linked_object_type.replace(/_/g, ' ')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(doc.uploaded_date), 'd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {formatBytes(doc.file_size)}
                  </TableCell>
                  <TableCell>
                    {doc.file_url ? (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs hover:underline"
                        style={{ color: 'hsl(var(--accent))' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download size={12} />
                        Open
                      </a>
                    ) : (
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  No documents match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
