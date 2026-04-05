import React, { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X, CheckCircle2, AlertCircle } from 'lucide-react'
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
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/lib/query-hooks'
import * as db from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import type { Document, ObjectType } from '@/lib/types'

const DOC_TYPES: Document['doc_type'][] = [
  'SURVEY_REPORT', 'CLASS_CERTIFICATE', 'DRAWING', 'SPECIFICATION',
  'NCR', 'CHANGE_ORDER', 'APPROVAL', 'CORRESPONDENCE', 'PHOTO', 'OTHER',
]

interface Props {
  /** Pre-link the uploaded doc to a specific object */
  linkedObjectType?: ObjectType
  linkedObjectId?: string
  /** Suggested doc type based on context */
  defaultDocType?: Document['doc_type']
  onSuccess?: (doc: Document) => void
  trigger?: React.ReactNode
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export default function UploadDocumentForm({
  linkedObjectType,
  linkedObjectId,
  defaultDocType = 'SPECIFICATION',
  onSuccess,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState<Document['doc_type']>(defaultDocType)
  const [revision, setRevision] = useState('Rev.0')
  const [isClassDoc, setIsClassDoc] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const { user } = useAuth()

  const selectStyle: React.CSSProperties = {
    borderColor: 'hsl(var(--border))',
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    padding: '0.375rem 0.75rem',
    borderRadius: 'var(--radius)',
    border: '1px solid hsl(var(--border))',
    fontSize: '0.875rem',
    height: '2.25rem',
    width: '100%',
  }

  const acceptFile = (f: File) => {
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
    // Auto-detect doc type from file name/type
    if (f.type.startsWith('image/')) setDocType('PHOTO')
    else if (f.name.toLowerCase().includes('survey')) setDocType('SURVEY_REPORT')
    else if (f.name.toLowerCase().includes('drawing') || f.name.toLowerCase().includes('dwg')) setDocType('DRAWING')
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) acceptFile(dropped)
  }, [])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setUploadState('uploading')
    setProgress(10)
    setError(null)

    try {
      const docNumber = await db.nextDocNumber()
      setProgress(20)

      // Build storage path: project_id/object_type/object_id/filename
      const ext = file.name.split('.').pop() ?? 'bin'
      const safeName = `${docNumber}-${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${ext}`
      const storagePath = [
        db.PROJECT_ID,
        linkedObjectType ?? 'PROJECT',
        linkedObjectId ?? db.PROJECT_ID,
        safeName,
      ].join('/')

      setProgress(40)
      const { url, size, mimeType } = await db.uploadFile(file, storagePath)
      setProgress(80)

      const doc = await db.createDocument({
        project_id: db.PROJECT_ID,
        doc_number: docNumber,
        title: title || file.name,
        doc_type: docType,
        revision,
        status: 'DRAFT',
        file_url: url,
        file_size: size,
        mime_type: mimeType,
        uploaded_by: user?.name || user?.email || 'Unknown',
        uploaded_date: new Date().toISOString().split('T')[0],
        linked_object_type: linkedObjectType ?? null,
        linked_object_id: linkedObjectId ?? null,
        is_class_document: isClassDoc,
      })
      setProgress(100)
      setUploadState('success')

      await qc.invalidateQueries({ queryKey: QUERY_KEYS.documents })
      onSuccess?.(doc)
    } catch (err) {
      setError((err as Error).message)
      setUploadState('error')
    }
  }

  const handleClose = () => {
    setOpen(false)
    setFile(null)
    setTitle('')
    setDocType(defaultDocType)
    setRevision('Rev.0')
    setIsClassDoc(false)
    setUploadState('idle')
    setProgress(0)
    setError(null)
  }

  return (
    <>
      <div onClick={() => setOpen(true)}>
        {trigger ?? (
          <Button size="sm" style={{ backgroundColor: 'hsl(var(--accent))', color: 'white' }}>
            <Upload size={14} className="mr-1.5" />
            Upload
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>

          {uploadState === 'success' ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <CheckCircle2 size={40} style={{ color: 'hsl(var(--success))' }} />
              <div className="text-center">
                <p className="font-semibold">Upload complete</p>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{title}</p>
              </div>
              <Button onClick={handleClose}>Done</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4 mt-2">
                {/* Drop zone */}
                <div
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center py-8 gap-2"
                  style={{
                    borderColor: isDragging
                      ? 'hsl(var(--accent))'
                      : file
                      ? 'hsl(var(--success))'
                      : 'hsl(var(--border))',
                    backgroundColor: isDragging ? 'hsl(var(--accent)/0.05)' : 'transparent',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xls,.xlsx,.doc,.docx"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f) }}
                  />
                  {file ? (
                    <>
                      <FileText size={28} style={{ color: 'hsl(var(--success))' }} />
                      <div className="text-center">
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFile(null) }}
                        className="text-xs underline"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload size={24} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <p className="text-sm font-medium">Drop file here or click to browse</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        PDF, JPG, PNG, HEIC, Excel, Word · max 50 MB
                      </p>
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
                    placeholder="e.g. Hull Gauging Report Rev.1"
                    required
                  />
                </div>

                {/* Type + Revision row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="doc-type">Type *</Label>
                    <select
                      id="doc-type"
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as Document['doc_type'])}
                      style={selectStyle}
                    >
                      {DOC_TYPES.map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="doc-rev">Revision</Label>
                    <Input
                      id="doc-rev"
                      value={revision}
                      onChange={(e) => setRevision(e.target.value)}
                      placeholder="Rev.0"
                    />
                  </div>
                </div>

                {/* Class document flag */}
                <div className="flex items-center gap-3">
                  <input
                    id="doc-class"
                    type="checkbox"
                    checked={isClassDoc}
                    onChange={(e) => setIsClassDoc(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <Label htmlFor="doc-class" className="cursor-pointer">
                    Class-required document (RINA sign-off)
                  </Label>
                </div>

                {/* Linked object info */}
                {linkedObjectType && (
                  <div
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
                    style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                  >
                    <X size={12} />
                    Linked to: {linkedObjectType.replace(/_/g, ' ')}
                  </div>
                )}

                {/* Upload progress */}
                {uploadState === 'uploading' && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <span>Uploading…</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${progress}%`,
                          backgroundColor: 'hsl(var(--accent))',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 text-xs rounded-md p-3"
                    style={{ backgroundColor: 'hsl(0 72% 51% / 0.08)', color: 'hsl(var(--destructive))' }}>
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold">Upload failed: </span>
                      {error}
                      {error.includes('bucket') && (
                        <><br /><span className="opacity-80">Run supabase-migration-002-storage.sql in your Supabase SQL editor.</span></>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!file || !title || uploadState === 'uploading'}
                  style={{ backgroundColor: 'hsl(var(--accent))', color: 'white' }}
                >
                  {uploadState === 'uploading' ? 'Uploading…' : 'Upload'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
