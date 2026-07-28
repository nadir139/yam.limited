import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// The object model, read from the database that enforces it.
//
// /ontology used to hardcode this. It drifted — the published page described
// entity types (SystemComponent, DocumentRevision) that were never built, and a
// demo vessel that does not exist. Reading the registry means the marketing site
// cannot claim a system different from the one running behind the login.

export interface OntologyObjectType {
  key: string
  label: string
  table_name: string
  description: string
  display_order: number
}

export type Cardinality = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE'

export interface OntologyLink {
  from_type: string
  to_type: string
  label: string
  cardinality: Cardinality
  via_column: string
}

export interface OntologyActionParam {
  name: string
  type: string
  required?: boolean
  values?: string[]
}

export interface OntologyAction {
  key: string
  label: string
  description: string
  target_type: string
  parameters: OntologyActionParam[]
  cascades: string[]
  is_agent_usable: boolean
}

export interface OntologySnapshot {
  types: OntologyObjectType[]
  links: OntologyLink[]
  actions: OntologyAction[]
  /** False when the page fell back to the bundled copy below. */
  live: boolean
}

/**
 * A bundled copy of the registry, mirroring migration 009.
 *
 * This exists so a visitor never meets an empty page if the database is
 * unreachable or the build shipped without Supabase credentials. It is a
 * fallback, not a source of truth — when it and the database disagree, the
 * database is right and this is stale.
 */
const FALLBACK: Omit<OntologySnapshot, 'live'> = {
  types: [
    { key: 'VESSEL', label: 'Vessel', table_name: 'vessels', description: 'The physical asset. Everything else hangs off it.', display_order: 1 },
    { key: 'PROJECT', label: 'Project', table_name: 'projects', description: 'A campaign against a vessel — survey, refit or newbuild — with budget and phase.', display_order: 2 },
    { key: 'WORK_PACKAGE', label: 'Work Package', table_name: 'work_packages', description: 'A scoped unit of work in one discipline, costed and scheduled.', display_order: 3 },
    { key: 'INSPECTION_EVENT', label: 'Inspection', table_name: 'inspection_events', description: 'A survey attendance and its result. The honest signal: a frame is to spec or it is not.', display_order: 4 },
    { key: 'DEFECT_RECORD', label: 'Defect (NCR)', table_name: 'defect_records', description: 'A non-conformance. The origin of most cascades.', display_order: 5 },
    { key: 'CHANGE_ORDER', label: 'Change Order', table_name: 'change_orders', description: 'A costed, scheduled change to the agreed scope.', display_order: 6 },
    { key: 'OWNER_APPROVAL', label: 'Owner Approval', table_name: 'owner_approvals', description: 'A decision the owner must make, tiered by cost, with a deadline.', display_order: 7 },
    { key: 'DOCUMENT', label: 'Document', table_name: 'documents', description: 'Evidence attached to any other object.', display_order: 8 },
    { key: 'SUBCONTRACTOR', label: 'Stakeholder', table_name: 'project_members', description: 'A party to the project and the role they hold.', display_order: 9 },
  ],
  links: [
    { from_type: 'PROJECT', to_type: 'VESSEL', label: 'concerns', cardinality: 'MANY_TO_ONE', via_column: 'vessel_id' },
    { from_type: 'WORK_PACKAGE', to_type: 'PROJECT', label: 'belongs to', cardinality: 'MANY_TO_ONE', via_column: 'project_id' },
    { from_type: 'INSPECTION_EVENT', to_type: 'WORK_PACKAGE', label: 'inspects', cardinality: 'MANY_TO_ONE', via_column: 'work_package_id' },
    { from_type: 'DEFECT_RECORD', to_type: 'INSPECTION_EVENT', label: 'discovered by', cardinality: 'MANY_TO_ONE', via_column: 'inspection_event_id' },
    { from_type: 'DEFECT_RECORD', to_type: 'WORK_PACKAGE', label: 'affects', cardinality: 'MANY_TO_ONE', via_column: 'work_package_id' },
    { from_type: 'DEFECT_RECORD', to_type: 'CHANGE_ORDER', label: 'resolved by', cardinality: 'ONE_TO_ONE', via_column: 'change_order_id' },
    { from_type: 'CHANGE_ORDER', to_type: 'DEFECT_RECORD', label: 'raised from', cardinality: 'ONE_TO_ONE', via_column: 'defect_record_id' },
    { from_type: 'CHANGE_ORDER', to_type: 'OWNER_APPROVAL', label: 'gated by', cardinality: 'ONE_TO_ONE', via_column: 'approval_id' },
    { from_type: 'OWNER_APPROVAL', to_type: 'CHANGE_ORDER', label: 'authorises', cardinality: 'ONE_TO_ONE', via_column: 'change_order_id' },
    { from_type: 'DOCUMENT', to_type: 'PROJECT', label: 'filed under', cardinality: 'MANY_TO_ONE', via_column: 'project_id' },
    { from_type: 'SUBCONTRACTOR', to_type: 'PROJECT', label: 'works on', cardinality: 'MANY_TO_ONE', via_column: 'project_id' },
  ],
  actions: [
    {
      key: 'action_raise_defect',
      label: 'Raise NCR',
      description: 'Records a non-conformance. HIGH or CRITICAL severity carrying a cost impact automatically raises the Change Order and the Owner Approval it requires.',
      target_type: 'DEFECT_RECORD',
      cascades: ['CHANGE_ORDER', 'OWNER_APPROVAL'],
      is_agent_usable: true,
      parameters: [
        { name: 'p_title', type: 'text', required: true },
        { name: 'p_description', type: 'text', required: true },
        { name: 'p_location_on_vessel', type: 'text', required: true },
        { name: 'p_severity', type: 'enum', required: true, values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        { name: 'p_root_cause', type: 'enum', required: true, values: ['WEAR', 'CORROSION', 'IMPACT', 'FATIGUE', 'INSTALLATION_ERROR', 'DESIGN_DEFICIENCY', 'MOISTURE_INGRESS', 'OTHER'] },
        { name: 'p_disposition', type: 'enum', required: true, values: ['REPAIR', 'REPLACE', 'MONITOR', 'ACCEPT_AS_IS', 'PENDING'] },
        { name: 'p_is_class_defect', type: 'boolean' },
        { name: 'p_class_item_ref', type: 'text' },
        { name: 'p_cost_impact', type: 'numeric' },
        { name: 'p_schedule_impact_days', type: 'integer' },
        { name: 'p_work_package_id', type: 'uuid' },
        { name: 'p_inspection_event_id', type: 'uuid' },
      ],
    },
    {
      key: 'action_update_defect_status',
      label: 'Change NCR status',
      description: 'Moves an NCR through its lifecycle. A closed NCR cannot be reopened.',
      target_type: 'DEFECT_RECORD',
      cascades: [],
      is_agent_usable: true,
      parameters: [
        { name: 'p_defect_id', type: 'uuid', required: true },
        { name: 'p_status', type: 'enum', required: true, values: ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED', 'DISPUTED'] },
        { name: 'p_closed_date', type: 'date' },
      ],
    },
    {
      key: 'action_record_inspection_result',
      label: 'Record inspection result',
      description: 'Records the outcome of a survey attendance and refreshes its defect count.',
      target_type: 'INSPECTION_EVENT',
      cascades: [],
      is_agent_usable: true,
      parameters: [
        { name: 'p_inspection_id', type: 'uuid', required: true },
        { name: 'p_result', type: 'enum', required: true, values: ['PASS', 'CONDITIONAL_PASS', 'FAIL', 'PENDING'] },
        { name: 'p_notes', type: 'text' },
        { name: 'p_actual_date', type: 'date' },
      ],
    },
    {
      key: 'action_decide_approval',
      label: 'Decide owner approval',
      description: 'Records the owner decision and propagates it to the Change Order the approval gates. An approval can only be decided once.',
      target_type: 'OWNER_APPROVAL',
      cascades: ['CHANGE_ORDER'],
      is_agent_usable: true,
      parameters: [
        { name: 'p_approval_id', type: 'uuid', required: true },
        { name: 'p_decision', type: 'enum', required: true, values: ['APPROVED', 'REJECTED'] },
        { name: 'p_notes', type: 'text' },
      ],
    },
    {
      key: 'action_advance_project_phase',
      label: 'Advance project phase',
      description: 'Moves the project to the next phase. The next phase is derived server-side from the current one.',
      target_type: 'PROJECT',
      cascades: [],
      is_agent_usable: true,
      parameters: [],
    },
    {
      key: 'action_register_document',
      label: 'Register document',
      description: 'Records an uploaded document and links it to another object.',
      target_type: 'DOCUMENT',
      cascades: [],
      is_agent_usable: true,
      parameters: [
        { name: 'p_title', type: 'text', required: true },
        { name: 'p_doc_type', type: 'enum', required: true, values: ['SURVEY_REPORT', 'CLASS_CERTIFICATE', 'DRAWING', 'SPECIFICATION', 'NCR', 'CHANGE_ORDER', 'APPROVAL', 'CORRESPONDENCE', 'PHOTO', 'OTHER'] },
        { name: 'p_file_url', type: 'text', required: true },
        { name: 'p_file_size', type: 'integer' },
        { name: 'p_mime_type', type: 'text' },
        { name: 'p_linked_object_type', type: 'enum', values: ['VESSEL', 'PROJECT', 'WORK_PACKAGE', 'CHANGE_ORDER', 'INSPECTION_EVENT', 'DEFECT_RECORD', 'OWNER_APPROVAL', 'DOCUMENT', 'SUBCONTRACTOR'] },
        { name: 'p_linked_object_id', type: 'uuid' },
        { name: 'p_is_class_document', type: 'boolean' },
      ],
    },
  ],
}

export const FALLBACK_ONTOLOGY: OntologySnapshot = { ...FALLBACK, live: false }

/**
 * Reads the registry as an anonymous visitor.
 *
 * Migration 010 grants `anon` SELECT on these three tables and nothing else —
 * the shape of the system is public, its contents are not. A visitor who reads
 * this learns that `action_raise_defect` exists; they still cannot call it, and
 * they cannot see a single defect record.
 */
export async function fetchOntology(): Promise<OntologySnapshot> {
  if (!isSupabaseConfigured) return FALLBACK_ONTOLOGY

  const [typesRes, linksRes, actionsRes] = await Promise.all([
    supabase.from('ontology_object_types').select('*').order('display_order'),
    supabase.from('ontology_links').select('*'),
    supabase.from('ontology_actions').select('*').order('key'),
  ])

  // Partial data would render a graph with edges pointing at nothing, which
  // looks broken in a way that is worse than being one deploy out of date.
  if (
    typesRes.error || linksRes.error || actionsRes.error ||
    !typesRes.data?.length || !linksRes.data?.length || !actionsRes.data?.length
  ) {
    return FALLBACK_ONTOLOGY
  }

  return {
    types: typesRes.data as OntologyObjectType[],
    links: linksRes.data as OntologyLink[],
    actions: (actionsRes.data as OntologyAction[]).map((a) => ({
      ...a,
      parameters: Array.isArray(a.parameters) ? a.parameters : [],
      cascades: Array.isArray(a.cascades) ? a.cascades : [],
    })),
    live: true,
  }
}

/** Tailwind colour pairs, one per object type, legible on both themes. */
export const TYPE_COLOR: Record<string, string> = {
  VESSEL: 'text-[#2563eb] dark:text-[#60a5fa]',
  PROJECT: 'text-[#4f46e5] dark:text-[#818cf8]',
  WORK_PACKAGE: 'text-[#0d9488] dark:text-[#2dd4bf]',
  INSPECTION_EVENT: 'text-[#16a34a] dark:text-[#4ade80]',
  DEFECT_RECORD: 'text-[#dc2626] dark:text-[#f87171]',
  CHANGE_ORDER: 'text-[#ea580c] dark:text-[#fb923c]',
  OWNER_APPROVAL: 'text-[#ca8a04] dark:text-[#facc15]',
  DOCUMENT: 'text-[#0891b2] dark:text-[#22d3ee]',
  SUBCONTRACTOR: 'text-[#64748b] dark:text-[#94a3b8]',
}

export const typeColor = (key: string) => TYPE_COLOR[key] ?? 'text-muted-foreground'

export const CARDINALITY_LABEL: Record<Cardinality, string> = {
  ONE_TO_ONE: '1 : 1',
  ONE_TO_MANY: '1 : n',
  MANY_TO_ONE: 'n : 1',
}
