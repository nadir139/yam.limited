import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// A drawing, opened on the part.
//
// Renders one page of the document with pdf.js and draws the box the import
// recorded around the part, then scrolls it into view. The box is approximate
// (it came from reading the drawing), so the whole page stays visible and
// zoomable around it rather than cropping to it.

export interface DrawingTarget {
  url: string
  title: string
  page: number
  /** x0, y0, x1, y1 as fractions of the page as displayed. */
  bbox: number[] | null
  label?: string | null
}

export default function DrawingViewer({
  target,
  onClose,
}: {
  target: DrawingTarget | null
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1.5)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load the document when the target changes.
  useEffect(() => {
    if (!target) return
    let cancelled = false
    setError(null)
    setDoc(null)
    setPage(target.page)
    const task = pdfjs.getDocument({ url: target.url })
    task.promise
      .then((d) => {
        if (!cancelled) setDoc(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open the document')
      })
    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [target])

  // Render the page.
  useEffect(() => {
    if (!doc || !canvasRef.current) return
    let cancelled = false
    let renderTask: pdfjs.RenderTask | null = null
    doc
      .getPage(Math.min(Math.max(page, 1), doc.numPages))
      .then((p) => {
        if (cancelled || !canvasRef.current) return
        const viewport = p.getViewport({ scale: zoom * (window.devicePixelRatio || 1) })
        const canvas = canvasRef.current
        canvas.width = viewport.width
        canvas.height = viewport.height
        const cssW = viewport.width / (window.devicePixelRatio || 1)
        const cssH = viewport.height / (window.devicePixelRatio || 1)
        canvas.style.width = `${cssW}px`
        canvas.style.height = `${cssH}px`
        setSize({ w: cssW, h: cssH })
        renderTask = p.render({ canvasContext: canvas.getContext('2d')!, viewport })
        return renderTask.promise
      })
      .then(() => {
        if (!cancelled && page === target?.page) {
          highlightRef.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
        }
      })
      .catch((e) => {
        if (!cancelled && !(e instanceof Error && e.name === 'RenderingCancelledException')) {
          setError(e instanceof Error ? e.message : 'Could not draw the page')
        }
      })
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [doc, page, zoom, target?.page])

  const box = target?.bbox && page === target.page && size ? target.bbox : null

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[90vh] max-w-6xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="truncate pr-8 text-base">
            {target?.title}
            {target?.label ? <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}> · {target.label}</span> : null}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
            <ChevronLeft size={14} />
          </Button>
          <span>
            Page {page}
            {doc ? ` of ${doc.numPages}` : ''}
          </span>
          <Button size="sm" variant="outline" disabled={!doc || page >= doc.numPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
            <ChevronRight size={14} />
          </Button>
          <span className="mx-2 h-4 w-px" style={{ background: 'hsl(var(--border))' }} />
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} aria-label="Zoom out">
            <Minus size={14} />
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} aria-label="Zoom in">
            <Plus size={14} />
          </Button>
          {target?.page !== page && target && (
            <Button size="sm" variant="ghost" onClick={() => setPage(target.page)}>
              Back to the part
            </Button>
          )}
          {target && (
            <a href={`${target.url}#page=${page}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs hover:underline" style={{ color: 'hsl(var(--accent))' }}>
              Open the PDF <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto rounded-md border" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted))' }}>
          {error ? (
            <p className="p-6 text-sm" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
          ) : !doc ? (
            <p className="p-6 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Opening the drawing…</p>
          ) : null}
          <div className="relative mx-auto" style={{ width: size?.w, height: size?.h }}>
            <canvas ref={canvasRef} className="block bg-white" />
            {box && size && (
              <div
                ref={highlightRef}
                className="pointer-events-none absolute rounded-sm"
                style={{
                  left: `${box[0] * 100}%`,
                  top: `${box[1] * 100}%`,
                  width: `${(box[2] - box[0]) * 100}%`,
                  height: `${(box[3] - box[1]) * 100}%`,
                  boxShadow: '0 0 0 3px hsl(var(--accent)), 0 0 0 9999px rgb(0 0 0 / 0.12)',
                  background: 'hsl(var(--accent) / 0.12)',
                }}
              />
            )}
          </div>
        </div>
        {target && !target.bbox && (
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            No position was recorded for this part on the page.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
