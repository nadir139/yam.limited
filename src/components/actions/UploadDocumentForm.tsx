import React, { useCallback, useRef, useState } from 'react'
import { Upload, FileText, X, CheckCircle2, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useUploadDocument } from '@/lib/query-hooks'
import type { Document, ObjectType } from '@/lib/types'

const DOC_TYPES: { value: Document['doc_type']; label: string }[] = [
  { value: 'SURVEY_REPORT', label: 'Survey Report' },
  { value: 'NCR', label: 'NCR / Defect Report' },
  { value: 'CHANGE_ORDER', label: 'Change Order' },
  { value: 'APPROVAL', label: 'Approval Document' },
  { value: 'DRAWING', label: 'Drawing / Plan' },
  { value: 'SPECIFICATION', label: 'Specification' },
  { value: 'CLASS_CERTIFICATE', label: 'Class Certificate' },
  { value: 'PHOTO', label: 'Photo Evidence' },
  { value: 'CORRESPONDENCE', label: 'Correspondence' },
  { value: 'OTHER', label: 'Other' },
]

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx,.doc,.xls,.txt'

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  linkedObjectType?: ObjectType
  linkedObjectId?: string
  defaultDocType?: Document['doc_type']
  label?: string
}

export default function UploadDocumentForm({
  linkedObjectType,
  linkedObjectId,
  defaultDocType = 'OTHER',
  label = 'Upload Document',
}: Props) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState<Document['doc_type']>(defaultDocType)
  const [isClassDoc, setIsClassDoc] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useUploadDocument()

  const selectFile = (f: File) => {
    setFile(f)
    // Auto-fill title from filename if empty
    if (!title) {
      setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '))
    }
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped) selectFile(dropped)
    },
    [title],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    upload.mutate(
      {
        file,
        title: title || file.name,
        docType,
        linkedObjectType: linkedObjectType ?? null,
        linkedObjectId: linkedObjectId ?? null,
        isClassDocument: isClassDoc,
      },
      { onSuccess: () => setDone(true) },
    )
  }

  const handleClose = () => {
    setOpen(false)
    setDone(false)
    setFile(null)
    setTitle('')
    setDocType(defaultDocType)
    setIsClassDoc(false)
    upload.reset()
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        style={{ borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }}
      >
        <Paperclip size={13} className="mr-1.5" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-md">
          {done ? (
            <div className="flex flex-col gap-4 items-center text-center py-4">
              <CheckCircle2 size={40} style={{ color: 'hsl(var(--success))' }} />
              <div>
                <h3 className="font-bold text-lg">Document uploaded</h3>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {upload.data?.title} has been saved to the document library.
                </p>
              </div>
              <DialogFooter className="w-full">
                <Button onClick={handleClose} className="w-full">Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-4 mt-4">
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  className="rounded-lg border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 py-8 select-none"
                  style={{
                    borderColor: dragOver ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                    backgroundColor: dragOver ? 'hsl(var(--primary)/0.04)' : file ? 'hsl(var(--muted)/0.5)' : 'transparent',
                  }}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) selectFile(f)
                    }}
                  />

                  {file ? (
                    <>
                      <FileText size={28} style={{ color: 'hsl(var(--primary))' }} />
                      <div className="text-sm font-medium text-center px-4">{file.name}</div>
                      <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {formatSize(file.size)}
                      </div>
                      <button
                        type="button"
                        className="text-xs underline mt-1"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                        onClick={(e) => { e.stopPropagation(); setFile(null) }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload size={28} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <div className="text-sm text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <span className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                          Click to select
                        </span>{' '}
                        or drag and drop
                      </div>
                      <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        PDF, JPG, PNG, DOCX, XLSX — up to 50MB
                      </div>
                    </>
                  )}
                </div>

                {/* Title */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="doc-title">Document Title *</Label>
                  <Input
                    id="doc-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. NCR-001 Frame Corrosion Photo Evidence"
                    required
                  />
                </div>

                {/* Type */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="doc-type">Document Type *</Label>
                  <select
                    id="doc-type"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as Document['doc_type'])}
                    className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
                    style={{
                      borderColor: 'hsl(var(--border))',
                      backgroundColor: 'hsl(var(--background))',
                      color: 'hsl(var(--foreground))',
                    }}
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Class document */}
                <div className="flex items-center gap-3">
                  <input
                    id="doc-class"
                    type="checkbox"
                    checked={isClassDoc}
                    onChange={(e) => setIsClassDoc(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <Label htmlFor="doc-class" className="cursor-pointer">
                    Class document (required for RINA sign-off)
                  </Label>
                </div>

                {upload.isError && (
                  <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                    {(upload.error as Error).message}
                  </p>
                )}
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={!file || upload.isPending}
                  style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                >
                  {upload.isPending ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin"
                      />
                      Uploading…
                    </span>
                  ) : (
                    <>
                      <Upload size={14} className="mr-1.5" />
                      Upload
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
