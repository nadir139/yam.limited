import { formatDistanceToNow } from 'date-fns'
import { Compass } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import MessageThread from '@/components/MessageThread'
import {
  useUnplannedWork,
  useWorkPackages,
  useDefects,
  useInspections,
} from '@/lib/query-hooks'
import type { Message } from '@/lib/types'

/**
 * Work that happened outside the plan.
 *
 * This is the point of tagging a message UNPLANNED_WORK rather than leaving it
 * as prose: the extra half-day someone spent re-bedding a flange "while we were
 * in there" is invisible in every system that only tracks the plan, and it is
 * exactly the thing worth knowing before scoping the next survey. Collected in
 * one place, it becomes a list you can read at the end of a job.
 */
function UnplannedWork() {
  const { data: messages = [], isLoading } = useUnplannedWork()
  const { data: workPackages = [] } = useWorkPackages()
  const { data: defects = [] } = useDefects()
  const { data: inspections = [] } = useInspections()

  const contextFor = (m: Message) => {
    if (!m.linked_object_id) return null
    if (m.linked_object_type === 'WORK_PACKAGE')
      return workPackages.find((w) => w.id === m.linked_object_id)?.wp_number
    if (m.linked_object_type === 'DEFECT_RECORD')
      return defects.find((d) => d.id === m.linked_object_id)?.ncr_number
    if (m.linked_object_type === 'INSPECTION_EVENT')
      return inspections.find((i) => i.id === m.linked_object_id)?.inspection_number
    return null
  }

  if (isLoading) {
    return (
      <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Loading…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Anything posted as <strong>unplanned work</strong>, anywhere on the
        project. Work done off the plan is normally invisible — it never reaches
        a work package and nobody remembers it at the next survey. Tagged, it
        becomes something to scope against next time.
      </p>

      {messages.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Nothing logged yet. Post a message with the{' '}
            <span className="font-medium">Unplanned work</span> tag — on a work
            package, an NCR, or here — and it collects in this list.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((m) => {
            const ref = contextFor(m)
            return (
              <Card key={m.id}>
                <CardContent className="flex gap-3 p-4">
                  <Compass
                    size={16}
                    className="mt-0.5 flex-shrink-0"
                    style={{ color: 'hsl(38 80% 38%)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold">{m.author_name}</span>
                      {ref && (
                        <span className="font-mono text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {ref}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MessagesPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Conversation</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          The project channel. Messages about a specific object live on that
          object's page, and everything here feeds the world model the agent
          reads.
        </p>
      </div>

      <Tabs defaultValue="channel">
        <TabsList>
          <TabsTrigger value="channel">Project channel</TabsTrigger>
          <TabsTrigger value="unplanned">Unplanned work</TabsTrigger>
        </TabsList>

        <TabsContent value="channel">
          <Card>
            <CardContent className="p-5">
              <MessageThread title="" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unplanned">
          <UnplannedWork />
        </TabsContent>
      </Tabs>
    </div>
  )
}
