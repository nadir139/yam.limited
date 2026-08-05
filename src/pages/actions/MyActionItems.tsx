import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ActionItemCard from '@/components/ActionItemCard'
import { day } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useMyActionItems, useProjectActionItems } from '@/lib/query-hooks'
import { useTranslation } from '@/lib/i18n'
import type { ActionItem } from '@/lib/types'

// The job list nobody fills in.
//
// Everything here arrived because somebody named this person in a sentence.
// There is no "add item" button and there never will be: an obligation with no
// conversation behind it is a note to self, and a note to self is exactly the
// thing that gets lost when the person holding it goes ashore. The chef reads
// this page and knows that on the 5th she is making three lunches, one
// vegetarian, because the varnishers are on board — and she typed none of it.
//
// Two tabs, because "what do I owe" and "who owes me" are different questions
// asked by different people on the same day.

/** Group by the date the work is actually needed, not the date it was asked. */
function byDueDate(items: ActionItem[]) {
  const groups = new Map<string, ActionItem[]>()
  for (const item of items) {
    const key = item.due_date ?? ''
    const existing = groups.get(key)
    if (existing) existing.push(item)
    else groups.set(key, [item])
  }
  return [...groups.entries()].sort(([a], [b]) => {
    // Undated last: they are not less important, they are just not a day.
    if (a === '') return 1
    if (b === '') return -1
    return a < b ? -1 : 1
  })
}

const OPEN_STATUSES: ActionItem['status'][] = ['OPEN', 'ACKNOWLEDGED']

export default function MyActionItems() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
  const [tab, setTab] = useState<'mine' | 'everyone'>('mine')
  const [showSettled, setShowSettled] = useState(false)

  const mineQuery = useMyActionItems()
  const everyoneQuery = useProjectActionItems()

  const myEmail = (user?.email ?? '').toLowerCase()
  const source = tab === 'mine' ? mineQuery : everyoneQuery
  const all = useMemo(() => source.data ?? [], [source.data])

  const visible = useMemo(
    () =>
      showSettled ? all : all.filter((i) => OPEN_STATUSES.includes(i.status)),
    [all, showSettled],
  )
  const grouped = useMemo(() => byDueDate(visible), [visible])

  const openCount = (mineQuery.data ?? []).filter((i) => i.status === 'OPEN').length
  const settledCount = all.length - all.filter((i) => OPEN_STATUSES.includes(i.status)).length

  const openObject = (item: ActionItem) => {
    if (item.linked_object_type === 'WORK_PACKAGE' && item.linked_object_id)
      navigate(`/app/work-packages/${item.linked_object_id}`)
    else if (item.linked_object_type === 'DEFECT_RECORD' && item.linked_object_id)
      navigate(`/app/defects/${item.linked_object_id}`)
    else if (item.linked_object_type === 'CHANGE_ORDER' && item.linked_object_id)
      navigate(`/app/change-orders/${item.linked_object_id}`)
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{t('nav.actionItems')}</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {openCount === 0
            ? 'Nothing is waiting on you. Anything asked of you by name lands here on its own.'
            : `${openCount} ${openCount === 1 ? 'thing is' : 'things are'} waiting on your answer.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['mine', 'everyone'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="rounded-md border px-3 py-1 text-sm font-medium"
            style={{
              borderColor: tab === k ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              color: tab === k ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            }}
          >
            {k === 'mine' ? 'Asked of me' : 'Everyone'}
          </button>
        ))}
        {settledCount > 0 && (
          <button
            onClick={() => setShowSettled((s) => !s)}
            className="ml-auto text-xs underline"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            {showSettled ? 'Hide' : `Show ${settledCount} answered`}
          </button>
        )}
      </div>

      {source.isLoading ? (
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Loading…
        </p>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox size={28} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {tab === 'mine'
                ? 'Nothing outstanding. When someone names you in a conversation, the request appears here with the date it is needed — you never have to write it down.'
                : 'Nobody on this project owes anybody anything right now.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        grouped.map(([dueKey, items]) => (
          <Card key={dueKey || 'undated'}>
            <CardHeader>
              <CardTitle className="text-base">
                {dueKey ? day(dueKey) : 'No date attached'}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col gap-1">
                  <ActionItemCard
                    item={item}
                    mine={item.assignee_email.toLowerCase() === myEmail}
                    showContext
                  />
                  {item.linked_object_id && (
                    <button
                      onClick={() => openObject(item)}
                      className="self-start text-xs underline"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      Open the conversation this came from
                    </button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
