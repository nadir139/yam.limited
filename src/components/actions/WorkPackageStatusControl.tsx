import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useUpdateWorkPackage, usePermissions } from '@/lib/query-hooks'
import type { WorkPackage, WorkPackageStatus } from '@/lib/types'

const STATUSES: WorkPackageStatus[] = [
  'DRAFT',
  'SCOPED',
  'ACTIVE',
  'EXPANDED',
  'ON_HOLD',
  'COMPLETE',
]

/**
 * Moves a work package through its lifecycle.
 *
 * The interesting case is COMPLETE: the Action refuses it while open NCRs are
 * linked to the package, and names them. That rejection is surfaced verbatim
 * rather than reworded — the database knows which NCRs, and the user needs to
 * know that too.
 */
export default function WorkPackageStatusControl({ wp }: { wp: WorkPackage }) {
  const mutation = useUpdateWorkPackage()
  const { can } = usePermissions()
  const [error, setError] = useState<string | null>(null)

  const change = (status: WorkPackageStatus) => {
    if (status === wp.status) return
    setError(null)
    mutation.mutate(
      { id: wp.id, patch: { status } },
      { onError: (e) => setError(e.message) },
    )
  }

  if (!can('action_update_work_package')) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label
          htmlFor="wp-status"
          className="text-xs font-medium"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          Status
        </label>
        <select
          id="wp-status"
          value={wp.status}
          disabled={mutation.isPending}
          onChange={(e) => change(e.target.value as WorkPackageStatus)}
          className="h-8 rounded-md border px-2 text-sm shadow-sm"
          style={{
            borderColor: 'hsl(var(--border))',
            backgroundColor: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p
          className="flex items-start gap-1.5 text-xs"
          style={{ color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={13} className="mt-px flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
