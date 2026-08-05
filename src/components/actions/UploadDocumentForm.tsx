import React, { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useUploadDocument } from '@/lib/query-hooks'
import type { Document } from '@/lib/types'

const DOC_TYPES: Array<{ value: Document['doc_type']; label: string }> = [
  { value: 'SURVEY_REPORT',   label: 'Survey Report' },
  { value: 'CLASS_CERTIFICATE', label: 'Class Certificate' },
  { value: 'DRAWING',         label: 'Drawing' },
  { value: 'SPECIFICATION',   label: 'Specification' },
  { value: 'NCR',             label: 'NCR' },
  { value: 'CHANGE_ORDER',    label: 'Change Order' },
  { value: 'APPROVAL',        label: 'Approval' },
  { value: 'CORRESPONDENCE',  label: 'Correspondence' },
  { value: 'PHOTO',           label: 'Photo / Evidence' },
  { value: 'OTHER',           label: 'Other' },
]

interface Props {
  linkedObjectType?: Document['linked_object_type']
  linkedObjectId?: string
  defaultDocType?: Document['doc_type']
  label?: string
}

function titleFromFilename(name: string) {
  return name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function UploadDocumentForm({ linkedObjectType, linkedObjectId, defaultDocType = 'OTHER', label = 'Upload Document' }: Props) {
  const [open, setOpen]         = useState(false)
  const [file, setFile]         = useState<File | null>(null)
  const [title, setTitle]       = useState('')
  const [docType, setDocType]   = useState<Document['doc_type']>(defaultDocType)
  const [isClassDoc, setClass]  = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploaded, setUploaded] = useState<Document | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mutation = useUploadDocument()

  const selectFile = (f: File) => { setFile(f); if (!title) setTitle(titleFromFilename(f.name)) }
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) selectFile(f) }
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) selectFile(f) }
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    mutation.mutate(
      { file, title: title.trim(), docType, linkedObjectType: linkedObjectType ?? null, linkedObjectId: linkedObjectId ?? null, isClassDocument: isClassDoc },
      { onSuccess: (doc) => setUploaded(doc) },
    )
  }
  const handleClose = () => {
    setOpen(false); setFile(null); setTitle(''); setDocType(defaultDocType)
    setClass(false); setUploaded(null); mutation.reset()
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload size={13} className="mr-1.5" />{label}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-md">
          {uploaded ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 size={18} style={{ color: 'hsl(158 64% 40%)' }} />Document Uploaded
                </DialogTitle>
              </DialogHeader>
              <div className="rounded-md p-3 flex items-center gap-3" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                <FileText size={20} style={{ color: 'hsl(var(--primary))' }} />
                <div>
                  <div className="text-sm font-medium">{uploaded.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {uploaded.doc_number} · {uploaded.doc_type.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={handleClose}>Done</Button></DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-4 mt-4">
                <div
                  className="rounded-md border-2 border-dashed p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors"
                  style={{ borderColor: dragging ? 'hsl(var(--primary))' : file ? 'hsl(158 64% 40%)' : 'hsl(var(--border))', backgroundColor: dragging ? 'hsl(var(--primary) / 0.05)' : 'transparent' }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt" onChange={handleInput} />
                  {file ? (
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText size={16} style={{ color: 'hsl(158 64% 40%)' }} />
                      <span>{file.name}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); setTitle('') }} style={{ color: 'hsl(var(--muted-foreground))' }}><X size={14} /></button>
                    </div>
                  ) : (
                    <>
                      <Upload size={24} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Drop file here or click to browse</span>
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>PDF, images, Word, Excel — max 50 MB</span>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ud-title">Document Title *</Label>
                  <Input id="ud-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. NCR-001 Photographic Evidence" required />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ud-type">Document Type *</Label>
                  <select id="ud-type" value={docType} onChange={(e) => setDocType(e.target.value as Document['doc_type'])}
                    className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
                    style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}>
                    {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <input id="ud-class" type="checkbox" checked={isClassDoc} onChange={(e) => setClass(e.target.checked)} className="w-4 h-4 rounded" />
                  <Label htmlFor="ud-class" className="cursor-pointer">Class-required document</Label>
                </div>

                {mutation.isError && <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{(mutation.error as Error).message}</p>}
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={!file || !title.trim() || mutation.isPending}
                  style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}>
                  {mutation.isPending ? 'Uploading…' : 'Upload'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
