import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  useWorkPackage,
  useInspections,
  useDefects,
  useDocuments,
} from '@/lib/query-hooks'
import RaiseDefectForm from '@/components/actions/RaiseDefectForm'
import UploadDocumentForm from '@/components/actions/UploadDocumentForm'

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2 border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border))' }}>
      <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
      <span className="text-sm font-medium text-right ml-4">{value}</span>
    </div>
  )
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'hsl(var(--destructive))',
  HIGH: 'hsl(38 92% 50%)',
  MEDIUM: 'hsl(45 93% 47%)',
  LOW: 'hsl(var(--accent))',
}

const RESULT_STYLES: Record<string, { bg: string; text: string }> = {
  PASS: { bg: 'hsl(158 64% 40% / 0.15)', text: 'hsl(var(--success))' },
  CONDITIONAL_PASS: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 80% 38%)' },
  FAIL: { bg: 'hsl(0 72% 51% / 0.12)', text: 'hsl(var(--destructive))' },
  PENDING: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))' },
}

export default function WorkPackageDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: wp, isLoading: wpLoading } = useWorkPackage(id ?? '')
  const { data: allInspections = [], isLoading: inspLoading } = useInspections()
  const { data: allDefects = [], isLoading: defectsLoading } = useDefects()
  const { data: allDocuments = [], isLoading: docsLoading } = useDocuments()

  const isLoading = wpLoading || inspLoading || defectsLoading || docsLoading

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
  }

  if (!wp) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg font-medium">Work package not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/app/work-packages')}>
          Back to Work Packages
        </Button>
      </div>
    )
  }

  const inspections = allInspections.filter((i) => i.work_package_id === wp.id)
  const defects = allDefects.filter((d) => d.work_package_id === wp.id)
  const documents = allDocuments.filter(
    (d) => d.linked_object_type === 'WORK_PACKAGE' && d.linked_object_id === wp.id,
  )

  const hoursPct = wp.planned_hours > 0 ? Math.round((wp.actual_hours / wp.planned_hours) * 100) : 0
  const costPct = wp.planned_cost > 0 ? Math.round((wp.actual_cost / wp.planned_cost) * 100) : 0

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/app/work-packages')}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {wp.wp_number}
            </span>
            {wp.is_class_item && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--accent))' }}>
                <CheckCircle2 size={12} /> Class Item
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold">{wp.title}</h1>
        </div>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {wp.description}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge style={{ backgroundColor: 'hsl(var(--primary)/0.12)', color: 'hsl(var(--primary))', border: 'none' }}>
                  {wp.discipline}
                </Badge>
                <Badge style={{ backgroundColor: 'hsl(var(--accent)/0.15)', color: 'hsl(var(--accent))', border: 'none' }}>
                  {wp.status.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>Hours</span>
                  <span>{wp.actual_hours} / {wp.planned_hours}h ({hoursPct}%)</span>
                </div>
                <Progress value={hoursPct} className="h-1.5" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>Cost</span>
                  <span>{eur(wp.actual_cost)} / {eur(wp.planned_cost)} ({costPct}%)</span>
                </div>
                <Progress value={costPct} className="h-1.5" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border-t pt-4" style={{ borderColor: 'hsl(var(--border))' }}>
            <div>
              <div style={{ color: 'hsl(var(--muted-foreground))' }}>Contractor</div>
              <div className="font-medium">{wp.trade_contractor || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'hsl(var(--muted-foreground))' }}>Planned Start</div>
              <div className="font-medium">{format(new Date(wp.planned_start), 'd MMM yyyy')}</div>
            </div>
            <div>
              <div style={{ color: 'hsl(var(--muted-foreground))' }}>Planned End</div>
              <div className="font-medium">{format(new Date(wp.planned_end), 'd MMM yyyy')}</div>
            </div>
            {wp.class_item_ref && (
              <div>
                <div style={{ color: 'hsl(var(--muted-foreground))' }}>Class Ref</div>
                <div className="font-medium font-mono text-xs">{wp.class_item_ref}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="inspections">
        <TabsList>
          <TabsTrigger value="inspections">
            Inspections ({inspections.length})
          </TabsTrigger>
          <TabsTrigger value="defects">
            Defects ({defects.length})
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents ({documents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inspections">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inspection #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Inspector</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6" style={{ color: 'hsl(var(--muted-foreground))' }}>No inspections linked.</TableCell></TableRow>
                ) : inspections.map((i) => {
                  const rs = RESULT_STYLES[i.result]
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.inspection_number}</TableCell>
                      <TableCell className="text-sm">{i.title}</TableCell>
                      <TableCell className="text-sm">{i.inspector_name}</TableCell>
                      <TableCell className="text-sm">{format(new Date(i.scheduled_date), 'd MMM yyyy')}</TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: rs.bg, color: rs.text, border: 'none', fontSize: '11px' }}>
                          {i.result}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="defects">
          <div className="flex justify-end mb-3">
            <RaiseDefectForm workPackageId={wp.id} />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NCR #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Discovered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defects.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6" style={{ color: 'hsl(var(--muted-foreground))' }}>No defects linked.</TableCell></TableRow>
                ) : defects.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.ncr_number}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{d.title}</TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: SEVERITY_COLORS[d.severity] + '22', color: SEVERITY_COLORS[d.severity], border: 'none', fontSize: '11px' }}>
                        {d.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{d.status.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-sm">{format(new Date(d.discovered_date), 'd MMM yyyy')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <div className="flex justify-end mb-3">
            <UploadDocumentForm
              linkedObjectType="WORK_PACKAGE"
              linkedObjectId={wp.id}
              defaultDocType="SPECIFICATION"
            />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6" style={{ color: 'hsl(var(--muted-foreground))' }}>No documents linked.</TableCell></TableRow>
                ) : documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-mono text-xs">{doc.doc_number}</TableCell>
                    <TableCell className="text-sm">{doc.title}</TableCell>
                    <TableCell className="text-sm">{doc.doc_type.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-sm">{doc.status.replace(/_/g, ' ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
