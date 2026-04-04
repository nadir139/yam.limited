// ─── Enums ────────────────────────────────────────────────────────────────────

export type ProjectPhase =
  | 'PRE_SURVEY'
  | 'HAUL_OUT'
  | 'STRUCTURAL'
  | 'SYSTEMS'
  | 'INTERIOR'
  | 'SEA_TRIALS'
  | 'DELIVERED'

export type WorkPackageStatus =
  | 'DRAFT'
  | 'SCOPED'
  | 'ACTIVE'
  | 'EXPANDED'
  | 'ON_HOLD'
  | 'COMPLETE'

export type Discipline =
  | 'STRUCTURAL'
  | 'HULL'
  | 'MECHANICAL'
  | 'ELECTRICAL'
  | 'RIGGING'
  | 'INTERIOR'
  | 'PAINT'
  | 'CLASS'
  | 'SAFETY'

export type DefectSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type DefectStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PENDING_APPROVAL'
  | 'CLOSED'
  | 'DISPUTED'

export type RootCause =
  | 'WEAR'
  | 'CORROSION'
  | 'IMPACT'
  | 'FATIGUE'
  | 'INSTALLATION_ERROR'
  | 'DESIGN_DEFICIENCY'
  | 'MOISTURE_INGRESS'
  | 'OTHER'

export type Disposition = 'REPAIR' | 'REPLACE' | 'MONITOR' | 'ACCEPT_AS_IS' | 'PENDING'

export type ChangeOrderTrigger =
  | 'CLASS_REQUIREMENT'
  | 'OWNER_REQUEST'
  | 'DEFECT_DISCOVERY'
  | 'SCOPE_GROWTH'
  | 'REGULATORY'

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED'

// Tier 1 < €10k, Tier 2 €10k–€50k, Tier 3 > €50k
export type ApprovalTier = 'TIER_1' | 'TIER_2' | 'TIER_3'

export type ClassSociety = 'LLOYDS' | 'BV' | 'RINA' | 'DNV' | 'ABS' | 'OTHER'

export type UserRole =
  | 'OWNERS_REP'
  | 'OWNER'
  | 'CAPTAIN'
  | 'YARD_PM'
  | 'CLASS_SURVEYOR'
  | 'SUBCONTRACTOR'
  | 'NAVAL_ARCHITECT'

export type InspectionResult = 'PASS' | 'CONDITIONAL_PASS' | 'FAIL' | 'PENDING'

export type DocumentStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'SUPERSEDED'

export type ObjectType =
  | 'VESSEL'
  | 'PROJECT'
  | 'WORK_PACKAGE'
  | 'CHANGE_ORDER'
  | 'INSPECTION_EVENT'
  | 'DEFECT_RECORD'
  | 'OWNER_APPROVAL'
  | 'DOCUMENT'
  | 'SUBCONTRACTOR'

// ─── Core Objects ─────────────────────────────────────────────────────────────

export interface Vessel {
  id: string
  name: string
  hull_id: string
  vessel_type: string
  loa: number // metres
  beam: number
  draft: number
  gross_tonnage: number
  flag_state: string
  class_society: ClassSociety
  class_number: string
  year_built: number
  build_yard: string
  created_at: string
}

export interface Project {
  id: string
  vessel_id: string
  name: string
  project_type: 'FIVE_YEAR_SURVEY' | 'REFIT' | 'NEWBUILD' | 'ANNUAL_SURVEY' | 'DAMAGE_REPAIR'
  phase: ProjectPhase
  yard_name: string
  yard_location: string
  planned_start: string
  planned_delivery: string
  actual_start: string | null
  actual_delivery: string | null
  budget_locked: number // EUR
  budget_spent: number
  budget_contingency: number
  class_society: ClassSociety
  survey_due_date: string | null
  created_at: string
  vessel?: Vessel
}

export interface WorkPackage {
  id: string
  project_id: string
  wp_number: string // WP-STRUCT-001
  title: string
  discipline: Discipline
  description: string
  status: WorkPackageStatus
  planned_hours: number
  actual_hours: number
  planned_cost: number
  actual_cost: number
  trade_contractor: string | null
  planned_start: string
  planned_end: string
  actual_start: string | null
  actual_end: string | null
  is_class_item: boolean
  class_society: ClassSociety | null
  class_item_ref: string | null
  created_at: string
}

export interface InspectionEvent {
  id: string
  project_id: string
  work_package_id: string | null
  inspection_number: string // INSP-HULL-001
  title: string
  inspector_role: 'CLASS_SURVEYOR' | 'OWNERS_REP' | 'YARD_QC' | 'FLAG_STATE'
  inspector_name: string
  scheduled_date: string
  actual_date: string | null
  result: InspectionResult
  notes: string | null
  is_class_inspection: boolean
  class_item_ref: string | null
  defect_count: number
  created_at: string
}

export interface DefectRecord {
  id: string
  project_id: string
  inspection_event_id: string | null
  work_package_id: string | null
  ncr_number: string // NCR-2026-001
  title: string
  description: string
  location_on_vessel: string
  severity: DefectSeverity
  status: DefectStatus
  root_cause: RootCause
  disposition: Disposition
  is_class_defect: boolean
  class_item_ref: string | null
  discovered_by: string
  discovered_date: string
  closed_date: string | null
  cost_impact: number | null
  schedule_impact_days: number | null
  change_order_id: string | null
  created_at: string
}

export interface ChangeOrder {
  id: string
  project_id: string
  co_number: string // CO-2026-001
  title: string
  description: string
  trigger_type: ChangeOrderTrigger
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED'
  cost_delta: number
  schedule_delta_days: number
  raised_by: string
  raised_date: string
  defect_record_id: string | null
  approval_id: string | null
  created_at: string
}

export interface OwnerApproval {
  id: string
  project_id: string
  approval_number: string // APPR-2026-001
  title: string
  description: string
  tier: ApprovalTier
  status: ApprovalStatus
  requested_by: string
  requested_date: string
  approver_name: string | null
  decision_date: string | null
  decision_notes: string | null
  change_order_id: string | null
  cost_amount: number
  deadline: string | null
  created_at: string
}

export interface Document {
  id: string
  project_id: string
  doc_number: string
  title: string
  doc_type:
    | 'SURVEY_REPORT'
    | 'CLASS_CERTIFICATE'
    | 'DRAWING'
    | 'SPECIFICATION'
    | 'NCR'
    | 'CHANGE_ORDER'
    | 'APPROVAL'
    | 'CORRESPONDENCE'
    | 'PHOTO'
    | 'OTHER'
  revision: string
  status: DocumentStatus
  file_url: string | null
  file_size: number | null
  mime_type: string | null
  uploaded_by: string
  uploaded_date: string
  linked_object_type: ObjectType | null
  linked_object_id: string | null
  is_class_document: boolean
  created_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: UserRole
  name: string
  email: string
  company: string | null
  created_at: string
}

// Event log (world model audit trail)
export interface WorldModelEvent {
  id: string
  project_id: string
  event_type: string
  object_type: ObjectType
  object_id: string
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown>
  triggered_by: string // user id
  triggered_at: string
  cascade_from_event_id: string | null // if auto-triggered
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
}
