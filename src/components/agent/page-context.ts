// What the agent is told about where the user is, and what it offers there.
//
// The dock sends `context` with every question, so "what does this affect?"
// on an NCR's page means that NCR. Detail pages pass the object's type and id;
// the agent reads it with get_object, which RLS still checks.

export interface PageContext {
  /** Shown in the dock's header: "On the schedule". */
  label: string
  /** Sent to the agent as `context`. */
  context: string
  /** Questions that make sense on this page, offered as one-tap chips. */
  suggestions: string[]
}

interface Route {
  pattern: RegExp
  label: string
  /** Ontology type for a detail page, so the agent can read the record. */
  objectType?: string
  suggestions: string[]
}

const ROUTES: Route[] = [
  {
    pattern: /^\/app\/defects\/([^/]+)$/,
    label: 'this NCR',
    objectType: 'DEFECT_RECORD',
    suggestions: ['What does this NCR affect?', 'Draft a change order for this.', 'Who should act on this next?'],
  },
  {
    pattern: /^\/app\/work-packages\/([^/]+)$/,
    label: 'this work package',
    objectType: 'WORK_PACKAGE',
    suggestions: ["What's blocking this package?", 'What depends on it in the schedule?', 'Summarise its open NCRs and change orders.'],
  },
  {
    pattern: /^\/app\/change-orders\/([^/]+)$/,
    label: 'this change order',
    objectType: 'CHANGE_ORDER',
    suggestions: ['Summarise this change order for the owner.', 'What is its cost and schedule impact?', 'What caused it?'],
  },
  { pattern: /^\/app\/dashboard$/, label: 'the dashboard', suggestions: ['What needs my attention today?', "What's at risk of slipping?", 'What changed this week?'] },
  { pattern: /^\/app\/project$/, label: 'the project overview', suggestions: ['Give me a one-paragraph status for the owner.', 'What is still missing from the vessel record?'] },
  { pattern: /^\/app\/schedule$/, label: 'the schedule', suggestions: ["What's on the critical path?", 'What moves if the haul-out slips a week?', 'Which packages are late against the baseline?'] },
  { pattern: /^\/app\/work-packages$/, label: 'the work packages', suggestions: ['Which packages are behind?', 'Group the open packages by discipline.'] },
  { pattern: /^\/app\/defects$/, label: 'the NCR list', suggestions: ['Which open NCRs are most urgent?', 'Total cost impact of open NCRs?'] },
  { pattern: /^\/app\/change-orders$/, label: 'the change orders', suggestions: ['Which change orders wait on the owner?', 'Total approved vs pending cost?'] },
  { pattern: /^\/app\/approvals$/, label: 'the approvals', suggestions: ['Which approvals have waited longest?', 'What happens if I approve the oldest one?'] },
  { pattern: /^\/app\/inspections$/, label: 'the inspections', suggestions: ['What inspections are coming up?', 'Which inspections failed and why?'] },
  { pattern: /^\/app\/parts/, label: 'the parts', suggestions: ['Which parts have open NCRs?', 'What depends on the main engine?'] },
  { pattern: /^\/app\/model$/, label: 'the 3D model', suggestions: ['Which systems have the most open work?', 'Where are the safety-critical parts?'] },
  { pattern: /^\/app\/documents$/, label: 'the documents', suggestions: ['Which records have no supporting document?', 'What was uploaded this week?'] },
  { pattern: /^\/app\/logbook$/, label: 'the logbook', suggestions: ['Summarise the last week of the log.', 'Anything in the log that should be an NCR?'] },
  { pattern: /^\/app\/crew$/, label: 'the crew', suggestions: ['Whose certificates expire in the next 90 days?', 'Sea time for each crew member?'] },
  { pattern: /^\/app\/rest$/, label: 'hours of rest', suggestions: ['Any hours-of-rest breaches this week?', 'Who is closest to a breach?'] },
  { pattern: /^\/app\/maintenance$/, label: 'maintenance', suggestions: ['What service is overdue or due soon?', 'Which intervals have no reading lately?'] },
  { pattern: /^\/app\/oil-record$/, label: 'the Oil Record Book', suggestions: ['Is the Oil Record Book complete for this month?', 'When was sludge last discharged?'] },
  { pattern: /^\/app\/finance$/, label: 'finance', suggestions: ['Where is the money going this month?', 'Which transactions are not allocated yet?'] },
  { pattern: /^\/app\/payments$/, label: 'payments', suggestions: ['Which payment stages are ready to release?', 'What is held back and why?'] },
  { pattern: /^\/app\/messages$/, label: 'messages', suggestions: ['Summarise what the team discussed this week.', 'Any decisions in the messages not recorded yet?'] },
  { pattern: /^\/app\/action-items$/, label: 'your action items', suggestions: ['Which of my items are most urgent?', 'Draft replies for my open mentions.'] },
  { pattern: /^\/app\/team$/, label: 'the team', suggestions: ['Who is waiting on whom?', 'Who has the most open items?'] },
]

const FALLBACK = ['What needs my attention right now?', 'What changed on this project in the last week?']

export function pageContext(pathname: string): PageContext {
  for (const r of ROUTES) {
    const m = r.pattern.exec(pathname)
    if (!m) continue
    const id = r.objectType ? m[1] : undefined
    return {
      label: `On ${r.label}`,
      context: id ? `${r.label} (object_type ${r.objectType}, id ${id})` : `${r.label} page`,
      suggestions: r.suggestions,
    }
  }
  return { label: 'Ask about this project', context: '', suggestions: FALLBACK }
}

/** The page a record the agent named opens on, so a chip in a reply goes there. */
export function routeForObject(type: string, id: string): string | null {
  switch (type) {
    case 'DEFECT_RECORD':
      return `/app/defects/${id}`
    case 'WORK_PACKAGE':
      return `/app/work-packages/${id}`
    case 'CHANGE_ORDER':
      return `/app/change-orders/${id}`
    case 'OWNER_APPROVAL':
      return '/app/approvals'
    case 'INSPECTION_EVENT':
      return '/app/inspections'
    case 'DOCUMENT':
      return '/app/documents'
    case 'PART':
    case 'SPACE':
      return '/app/parts'
    default:
      return null
  }
}

/** Opens the dock from anywhere (a brief's "Ask a follow-up", a page button). */
export const AGENT_OPEN_EVENT = 'yam:agent-open'
export function openAgent(prompt?: string) {
  window.dispatchEvent(new CustomEvent(AGENT_OPEN_EVENT, { detail: { prompt } }))
}
