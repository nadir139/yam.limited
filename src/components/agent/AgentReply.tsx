import { Fragment } from 'react'
import { ArrowRight } from 'lucide-react'
import { typeColor } from '@/lib/ontology'
import type { ChangedRef, ObjectRef } from './thread'

// How an agent reply is drawn, wherever it appears: object numbers as chips
// that open the record, **bold** and bullets, and the cascade an Action set off.

/** Object numbers look like NCR-2026-001, WP-MECH-004, APPR-2026-005. */
const NUMBER_SHAPE = /^[A-Z]{2,6}-[A-Z0-9-]+$/
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const chipClass = (type: string) =>
  `${typeColor(type)} inline-flex items-center whitespace-nowrap rounded ` +
  `border border-current/30 bg-current/[0.08] px-1.5 py-px align-baseline ` +
  `font-mono text-[12px] font-semibold`

function ObjectChip({
  number,
  target,
  isOpen,
  onToggle,
}: {
  number: string
  target: ObjectRef
  isOpen: boolean
  onToggle: (number: string, target: ObjectRef) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(number, target)}
      title={target.label}
      className={`${chipClass(target.type)} cursor-pointer hover:bg-current/[0.18] ${
        isOpen ? 'ring-1 ring-current' : ''
      }`}
    >
      {number}
    </button>
  )
}

/**
 * The subset of Markdown the agent actually produces: **bold** and `- ` bullets.
 *
 * Rendered rather than stripped, and built as React nodes rather than injected
 * HTML — the reply is model output, so it never becomes markup.
 */
function renderInline(
  text: string,
  key: string,
  linkify: (chunk: string, key: string) => React.ReactNode,
): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={`${key}-b${i}`}>{linkify(part.slice(2, -2), `${key}-b${i}`)}</strong>
    ) : (
      <Fragment key={`${key}-t${i}`}>{linkify(part, `${key}-t${i}`)}</Fragment>
    ),
  )
}

/**
 * Turns object numbers in the reply into links to the record.
 *
 * The agent is told to reference objects by number rather than describe them,
 * and this is what makes that instruction pay off — the reader clicks through
 * instead of reading a paragraph reconstructing what the object is. The index
 * is built from ids the database returned, so a link can never point at
 * something that does not exist.
 */
export function LinkedText({
  text,
  index,
  openNumbers,
  onToggle,
}: {
  text: string
  index?: Record<string, ObjectRef>
  openNumbers: string[]
  onToggle: (number: string, target: ObjectRef) => void
}) {
  const keys = Object.keys(index ?? {}).filter((k) => NUMBER_SHAPE.test(k))

  const linkify = (chunk: string, key: string): React.ReactNode => {
    if (!index || keys.length === 0) return chunk
    // Longest first, so CO-2026-0011 is not eaten by CO-2026-001.
    const pattern = keys.sort((a, b) => b.length - a.length).map(escapeRe).join('|')
    return chunk.split(new RegExp(`(${pattern})`, 'g')).map((part, i) =>
      index[part] ? (
        <ObjectChip
          key={`${key}-${i}`}
          number={part}
          target={index[part]}
          isOpen={openNumbers.includes(part)}
          onToggle={onToggle}
        />
      ) : (
        <Fragment key={`${key}-${i}`}>{part}</Fragment>
      ),
    )
  }

  return (
    <>
      {text.split('\n').map((line, i) => {
        const bullet = /^\s*[-*]\s+/.exec(line)
        const content = bullet ? line.slice(bullet[0].length) : line
        return (
          <div key={i} className={bullet ? 'flex gap-2' : undefined}>
            {bullet && (
              <span aria-hidden style={{ color: 'hsl(var(--muted-foreground))' }}>
                •
              </span>
            )}
            <span className="min-w-0">{renderInline(content, `l${i}`, linkify)}</span>
          </div>
        )
      })}
    </>
  )
}

/**
 * The propagation, drawn.
 *
 * When an Action cascades, prose has to spell out that recording one thing
 * created two others. Showing the chain as connected nodes makes the shape
 * legible at a glance — which is the whole argument for a world model over a
 * task list, so it should not be buried in a paragraph.
 */
export function CascadeChain({
  changed,
  openNumbers,
  onToggle,
}: {
  changed: ChangedRef[]
  openNumbers: string[]
  onToggle: (number: string, target: ObjectRef) => void
}) {
  if (changed.length === 0) return null

  // An arrow means "which created", so it only goes before an object the
  // cascade produced. Ten work packages filed from one job list are ten
  // separate records, not a chain of ten — drawing them joined claimed each
  // one had caused the next.
  const anyCascade = changed.some((c) => c.cascaded)

  return (
    <div className="mb-3 rounded-[var(--radius)] border border-accent/30 bg-accent/[0.04] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {anyCascade
          ? 'Recorded, and what followed'
          : changed.length === 1
            ? 'Recorded'
            : `Recorded · ${changed.length}`}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {changed.map((c, i) => (
          // Arrow and the node it points at wrap together, so a line break can
          // never leave an arrow dangling at the end of a row.
          <span key={c.id} className="inline-flex items-center gap-1.5">
            {i > 0 && c.cascaded && (
              <ArrowRight
                className="h-3.5 w-3.5 flex-shrink-0 text-accent"
                aria-label="which created"
              />
            )}
            <button
              type="button"
              onClick={() => onToggle(c.number, c)}
              title={c.label}
              className={`${typeColor(c.type)} inline-flex min-w-0 items-center gap-1.5 ` +
                'rounded-md border border-current/40 bg-current/[0.1] px-2 py-1 text-xs ' +
                `hover:bg-current/[0.2] ${openNumbers.includes(c.number) ? 'ring-1 ring-current' : ''}`}
            >
              {/* The number must never break across lines — a half-rendered
                  NCR-2026-\n012 reads as a different object. */}
              <span className="whitespace-nowrap font-mono font-semibold">{c.number}</span>
              <span className="max-w-[130px] truncate text-muted-foreground">{c.label}</span>
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

