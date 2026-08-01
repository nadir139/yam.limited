import React from 'react'
import type { ProjectMember } from '@/lib/types'

// Rendering a mention from the names that were mentioned, not from the text.
//
// The obvious implementation scans the body for "@" and highlights whatever
// follows it. That gets "@ 3 coats" wrong, gets email addresses wrong, and
// highlights people who are not on the project. Here the message already knows
// who it named — `messages.mentions` holds their `project_members.id` — so the
// only names we look for are the ones that actually became obligations, and a
// mention still renders correctly years later when the person has left and
// their display name has changed.

/** Longest names first, so "@Marco Ferretti" is not eaten by "@Marco". */
function escapeForRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function MentionText({
  body,
  mentions,
  members,
}: {
  body: string
  mentions: string[] | null
  members: ProjectMember[]
}) {
  const named = React.useMemo(
    () =>
      (mentions ?? [])
        .map((id) => members.find((m) => m.id === id))
        .filter((m): m is ProjectMember => Boolean(m))
        .sort((a, b) => b.name.length - a.name.length),
    [mentions, members],
  )

  if (named.length === 0) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
  }

  const pattern = new RegExp(
    `@(${named.map((m) => escapeForRegex(m.name)).join('|')})`,
    'g',
  )

  const parts: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > last) parts.push(body.slice(last, match.index))
    parts.push(
      <span
        key={`${match.index}-${match[1]}`}
        className="rounded px-1 font-medium"
        style={{
          backgroundColor: 'hsl(var(--primary) / 0.12)',
          color: 'hsl(var(--primary))',
        }}
      >
        @{match[1]}
      </span>,
    )
    last = match.index + match[0].length
  }
  if (last < body.length) parts.push(body.slice(last))

  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{parts}</p>
}

export default MentionText
