import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Loader2, RotateCcw, Square, Upload, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  useDocuments,
  usePartImport,
  useParts,
  useProject,
  useSavePartImport,
  useSpaces,
  useUploadDocument,
} from '@/lib/query-hooks'
import { buildProposal, planChunks, type Chunk, type DocumentMap, type Proposal } from '@/lib/proposal'
import { mapDocuments, readPages } from '@/lib/extract-client'
import ImportReview from './ImportReview'

// From a boat's documents to her parts.
//
// Choose the PDFs (or upload them), and the reader maps the set, then reads it
// a few pages at a time, three passes at once. The passes are merged into one
// proposal and saved as a draft, which opens for review. Nothing reaches the
// record until someone applies it.

const CONCURRENCY = 3

type PassStatus = 'queued' | 'running' | 'done' | 'failed'
interface Pass {
  id: string
  documentIndex: number
  pages: number[]
  status: PassStatus
  error?: string
  found?: number
}

export default function PartsImportPage() {
  const { importId } = useParams<{ importId: string }>()
  if (importId) return <ImportReviewLoader importId={importId} />
  return <ImportReader />
}

function ImportReviewLoader({ importId }: { importId: string }) {
  const { data: imp, isLoading, error } = usePartImport(importId)
  if (isLoading) return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
  if (error || !imp) {
    return (
      <div className="p-8 text-sm">
        This import could not be found. <Link to="/app/parts" className="underline">Back to parts</Link>
      </div>
    )
  }
  return <ImportReview imp={imp} />
}

function ImportReader() {
  const navigate = useNavigate()
  const { data: project } = useProject()
  const { data: documents = [] } = useDocuments()
  const { data: parts = [] } = useParts()
  const { data: spaces = [] } = useSpaces()
  const upload = useUploadDocument()
  const save = useSavePartImport()
  const [selected, setSelected] = useState<string[]>([])
  const [phase, setPhase] = useState<'select' | 'reading' | 'merging'>('select')
  const [mapStatus, setMapStatus] = useState<PassStatus>('queued')
  const [mapError, setMapError] = useState<string | null>(null)
  const [passes, setPasses] = useState<Pass[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pdfs = useMemo(
    () => documents.filter((d) => (d.mime_type ?? '').includes('pdf') || /\.pdf$/i.test(d.title)),
    [documents],
  )

  useEffect(() => () => abortRef.current?.abort(), [])

  const onUpload = async (files: FileList | null) => {
    if (!files?.length || !project) return
    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf') {
        toast.error(`${file.name} is not a PDF`)
        continue
      }
      try {
        const doc = await upload.mutateAsync({
          file,
          title: file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '),
          docType: 'DRAWING',
          linkedObjectType: 'PROJECT',
          linkedObjectId: project.id,
          isClassDocument: false,
        })
        setSelected((s) => [...s, doc.id])
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not upload ${file.name}`)
      }
    }
  }

  const start = async () => {
    if (!project || selected.length === 0) return
    const controller = new AbortController()
    abortRef.current = controller
    const documentIds = [...selected]
    setPhase('reading')
    setMapStatus('running')
    setMapError(null)
    setPasses([])

    let map: DocumentMap
    try {
      map = await mapDocuments(project.id, documentIds, controller.signal)
      setMapStatus('done')
    } catch (e) {
      setMapStatus('failed')
      setMapError(e instanceof Error ? e.message : String(e))
      return
    }

    const plan: Pass[] = planChunks(map, documentIds.length).map((p, i) => ({
      id: `p${i}`,
      documentIndex: p.documentIndex,
      pages: p.pages,
      status: 'queued',
    }))
    setPasses(plan)

    const sheetsFor = (documentIndex: number) =>
      Object.fromEntries(map.pages.filter((p) => p.doc === documentIndex).map((p) => [p.page, p.sheet]))
    const chunks: Chunk[] = []
    const failures: string[] = []
    const update = (id: string, patch: Partial<Pass>) =>
      setPasses((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))

    // A pass that fails is retried a page at a time: a dense sheet that is too
    // much for one pass is usually fine on its own.
    const runPass = async (pass: Pass, allowSplit: boolean): Promise<void> => {
      update(pass.id, { status: 'running', error: undefined })
      try {
        const result = await readPages(project.id, documentIds, pass.documentIndex, pass.pages, map, controller.signal)
        chunks.push({ documentId: documentIds[pass.documentIndex], sheets: sheetsFor(pass.documentIndex), result })
        update(pass.id, { status: 'done', found: result.parts.length })
      } catch (e) {
        if (controller.signal.aborted) {
          update(pass.id, { status: 'failed', error: 'Stopped' })
          return
        }
        if (allowSplit && pass.pages.length > 1) {
          update(pass.id, { status: 'running', error: 'Retrying a page at a time' })
          let found = 0
          let failed = 0
          for (const page of pass.pages) {
            try {
              const result = await readPages(project.id, documentIds, pass.documentIndex, [page], map, controller.signal)
              chunks.push({ documentId: documentIds[pass.documentIndex], sheets: sheetsFor(pass.documentIndex), result })
              found += result.parts.length
            } catch {
              failed++
              failures.push(`${titleOf(documentIds[pass.documentIndex])}, page ${page}`)
            }
          }
          update(pass.id, failed ? { status: 'failed', error: `${failed} page(s) could not be read`, found } : { status: 'done', found })
          return
        }
        failures.push(`${titleOf(documentIds[pass.documentIndex])}, pages ${pass.pages.join(', ')}`)
        update(pass.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
      }
    }

    const queue = [...plan]
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length && !controller.signal.aborted) await runPass(queue.shift()!, true)
      }),
    )
    if (controller.signal.aborted) return

    setPhase('merging')
    const proposal: Proposal = buildProposal({ documentIds, map, chunks, existing: { parts, spaces } })
    for (const f of failures) proposal.warnings.unshift(`Not read: ${f}. Re-run the import for these pages, or add what they show by hand.`)
    for (const n of map.notes ?? []) proposal.warnings.push(n)
    try {
      const saved = await save.mutateAsync({ proposal, documentIds, importId: null })
      navigate(`/app/parts/import/${saved.id}`, { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the proposal')
      setPhase('reading')
    }
  }

  const titleOf = (id: string) => documents.find((d) => d.id === id)?.title ?? 'document'

  const stop = () => {
    abortRef.current?.abort()
    setPhase('select')
  }

  const done = passes.filter((p) => p.status === 'done').length
  const isProperty = project?.project_type === 'PROPERTY'

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/parts')} className="-ml-2">
          <ArrowLeft size={14} className="mr-1" /> Parts
        </Button>
        <h1 className="mt-1 text-2xl font-bold">Import parts from documents</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Give it the {isProperty ? "building's" : "boat's"} manual and drawings. It reads them page by page and proposes the
          systems, the spaces, every component it can find, how they connect and where each one is drawn. You review
          the proposal before anything is recorded.
        </p>
      </div>

      {phase === 'select' && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Documents</h2>
              <input ref={fileRef} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => void onUpload(e.target.files)} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Upload size={14} className="mr-1" />}
                Upload PDFs
              </Button>
            </div>
            {pdfs.length === 0 ? (
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                No PDFs on this project yet. Upload the manual and the schematics.
              </p>
            ) : (
              <div className="flex flex-col divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                {pdfs.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id)))}
                    />
                    <FileText size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <span className="flex-1 truncate">{d.title}</span>
                    <span className="font-mono text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{d.doc_number}</span>
                    {d.file_size ? (
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{(d.file_size / 1024 / 1024).toFixed(1)} MB</span>
                    ) : null}
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: 'hsl(var(--border))' }}>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Reading takes a few minutes for a manual and a set of drawings. Keep this tab open while it runs.
              </p>
              <Button onClick={() => void start()} disabled={selected.length === 0}>
                Read {selected.length || ''} document{selected.length === 1 ? '' : 's'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase !== 'select' && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {phase === 'merging'
                  ? 'Putting the proposal together…'
                  : mapStatus === 'running'
                    ? 'Mapping the documents…'
                    : `Reading pages · ${done} of ${passes.length}`}
              </h2>
              {phase === 'reading' && (
                <Button size="sm" variant="outline" onClick={stop}>
                  <Square size={12} className="mr-1" /> Stop
                </Button>
              )}
            </div>
            <StatusRow status={mapStatus} label="Map: what each page is, the systems and the spaces" error={mapError} />
            {mapStatus === 'failed' && (
              <Button size="sm" variant="outline" className="self-start" onClick={() => void start()}>
                <RotateCcw size={13} className="mr-1" /> Try again
              </Button>
            )}
            {passes.map((p) => (
              <StatusRow
                key={p.id}
                status={p.status}
                label={`${titleOf(selected[p.documentIndex])} · page${p.pages.length > 1 ? 's' : ''} ${p.pages.join(', ')}`}
                detail={p.found !== undefined ? `${p.found} found` : undefined}
                error={p.error}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatusRow({ status, label, detail, error }: { status: PassStatus; label: string; detail?: string; error?: string | null }) {
  const icon =
    status === 'done' ? <CheckCircle2 size={15} style={{ color: 'hsl(152 50% 38%)' }} />
    : status === 'failed' ? <XCircle size={15} style={{ color: 'hsl(var(--destructive))' }} />
    : status === 'running' ? <Loader2 size={15} className="animate-spin" style={{ color: 'hsl(var(--accent))' }} />
    : <span className="inline-block h-[15px] w-[15px] rounded-full border" style={{ borderColor: 'hsl(var(--border))' }} />
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex gap-2">
          <span className="truncate">{label}</span>
          {detail && <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{detail}</span>}
        </div>
        {error && (
          <div className="flex items-center gap-1 text-xs" style={{ color: status === 'failed' ? 'hsl(var(--destructive))' : 'hsl(38 90% 40%)' }}>
            <AlertTriangle size={11} /> {error}
          </div>
        )}
      </div>
    </div>
  )
}
