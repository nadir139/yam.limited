import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Boxes, Plus, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  useCreatePart,
  useLinkPart,
  usePartLinks,
  useParts,
  usePermissions,
  useProject,
  useUnlinkPart,
  type PartLinkTarget,
} from '@/lib/query-hooks'
import { buildPartTree, flattenTree, partPath } from '@/lib/parts'

// Which parts of the asset a record concerns.
//
// Shown on a work package or an NCR as chips; each one opens the part, where
// its whole history is. Adding one searches the tree by path, and typing a
// name that is not there records it on the spot, so linking never waits on
// someone building the tree first.

export default function PartLinks({
  objectType,
  objectId,
}: {
  objectType: PartLinkTarget
  objectId: string
}) {
  const { data: project } = useProject()
  const { data: parts = [] } = useParts()
  const { data: links = [] } = usePartLinks()
  const { can } = usePermissions()
  const link = useLinkPart()
  const unlink = useUnlinkPart()
  const create = useCreatePart()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  const linked = links
    .filter((l) => l.object_type === objectType && l.object_id === objectId)
    .map((l) => byId.get(l.part_id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
  const linkedIds = new Set(linked.map((p) => p.id))
  const options = useMemo(
    () => flattenTree(buildPartTree(parts)).map((n) => ({ part: n.part, path: partPath(n.part, byId) })),
    [parts, byId],
  )

  const canLink = can('action_link_part')
  const canCreate = can('action_create_part')
  // A boat project needs its vessel before parts can hang off it.
  const needsVessel = project !== undefined && project.project_type !== 'PROPERTY' && !project.vessel_id

  const attach = (partId: string) => {
    link.mutate(
      { partId, objectType, objectId },
      { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not link the part') },
    )
    setOpen(false)
    setQuery('')
  }

  const recordAndAttach = () => {
    const name = query.trim()
    if (!name) return
    create.mutate(
      { name },
      {
        onSuccess: ({ part }) => attach(part.id),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not record the part'),
      },
    )
  }

  const detach = (partId: string, name: string) => {
    const reason = window.prompt(`Why does this no longer concern "${name}"? (kept in the record)`)
    if (reason === null) return
    unlink.mutate(
      { partId, objectType, objectId, reason },
      { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not unlink the part') },
    )
  }

  const exact = options.some((o) => o.part.name.toLowerCase() === query.trim().toLowerCase())

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
        <Boxes size={13} /> Parts
      </span>
      {linked.length === 0 && (
        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          none linked
        </span>
      )}
      {linked.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
          style={{ borderColor: 'hsl(var(--border))' }}
          title={partPath(p, byId)}
        >
          <Link to={`/app/parts?part=${p.id}`} className="hover:underline">
            {p.name}
          </Link>
          {p.removed_at && <span style={{ color: 'hsl(var(--muted-foreground))' }}>(removed)</span>}
          {canLink && (
            <button
              type="button"
              aria-label={`Unlink ${p.name}`}
              className="opacity-50 hover:opacity-100"
              onClick={() => detach(p.id, p.name)}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {canLink && !needsVessel && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs hover:bg-[hsl(var(--muted))]"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              <Plus size={11} /> Link part
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search parts, or type a new one…" value={query} onValueChange={setQuery} />
              <CommandList>
                <CommandEmpty>{canCreate ? 'No part by that name yet.' : 'No matching part.'}</CommandEmpty>
                <CommandGroup>
                  {options
                    .filter((o) => !linkedIds.has(o.part.id))
                    .map((o) => (
                      <CommandItem key={o.part.id} value={o.path} onSelect={() => attach(o.part.id)}>
                        <span className="truncate">{o.path}</span>
                      </CommandItem>
                    ))}
                </CommandGroup>
                {canCreate && query.trim() && !exact && (
                  <CommandGroup heading="New">
                    <CommandItem value={`__create ${query}`} onSelect={recordAndAttach}>
                      <Plus size={13} className="mr-1.5" /> Record “{query.trim()}” and link it
                    </CommandItem>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
