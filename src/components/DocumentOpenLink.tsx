import { useState, type CSSProperties, type ReactNode } from 'react'
import { toast } from 'sonner'
import { documentUrl, hasDocumentFile, type OpenableDocument } from '@/lib/db'

/**
 * Opens a document in a new tab, signing a short-lived URL at the moment of
 * the click (migration 048). Nothing long-lived is ever rendered into the page.
 *
 * The tab is opened synchronously and pointed at the file once the URL is
 * signed: opening it after the await would be treated as a pop-up and
 * blocked by Safari and most mobile browsers.
 */
export function DocumentOpenLink({
  doc,
  children = 'Open',
  className = 'text-xs hover:underline',
  style = { color: 'hsl(var(--accent))' },
}: {
  doc: OpenableDocument
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const [busy, setBusy] = useState(false)
  if (!hasDocumentFile(doc)) return null

  const open = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const tab = window.open('', '_blank')
    setBusy(true)
    try {
      const url = await documentUrl(doc)
      if (tab) {
        tab.opener = null // same effect as rel="noopener"
        tab.location.href = url
      } else {
        // Pop-ups fully blocked: fall back to this tab.
        window.location.assign(url)
      }
    } catch (err) {
      tab?.close()
      toast.error(err instanceof Error ? err.message : 'Could not open the file')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className={`${className} disabled:opacity-60`}
      style={style}
    >
      {busy ? 'Opening…' : children}
    </button>
  )
}
