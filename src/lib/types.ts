import type { Database } from './database.types'

// The domain vocabulary, derived from the database rather than restated.
//
// This file used to hand-write every enum as a string union. That is two
// sources of truth for one thing, and it failed exactly the way two sources of
// truth fail: migration 018 added four values to the `discipline` enum in
// Postgres, nobody added them here, `Record<Discipline, …>` still typechecked
// with its nine keys, and the first property work package white-screened the
// Work Packages page with "Cannot read properties of undefined".
//
// Now `Discipline` *is* the Postgres enum. Regenerating `database.types.ts`
// after a migration turns that class of mistake into a compile error at every
// exhaustive lookup — which is what a type checker is for.
//
//   supabase gen types typescript --project-id xgpdfefxarllgykjbppn \
//     > src/lib/database.types.ts
//
// What stays hand-written is what has no row behind it: `AuthUser`, assembled
// from the JWT, and the join shape on `Project`.

type Enums = Database['public']['Enums']
type Tables = Database['public']['Tables']
type Row<T extends keyof Tables> = Tables[T]['Row']

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ProjectPhase = Enums['project_phase']
export type ProjectType = Enums['project_type']
export type WorkPackageStatus = Enums['work_package_status']
export type Discipline = Enums['discipline']
export type DefectSeverity = Enums['defect_severity']
export type DefectStatus = Enums['defect_status']
export type RootCause = Enums['root_cause']
export type Disposition = Enums['disposition']
export type ChangeOrderTrigger = Enums['change_order_trigger']
export type ChangeOrderStatus = Enums['change_order_status']
export type ApprovalStatus = Enums['approval_status']
/** Tier 1 under €10k, Tier 2 €10k–€50k, Tier 3 over €50k. */
export type ApprovalTier = Enums['approval_tier']
export type ClassSociety = Enums['class_society']
export type UserRole = Enums['user_role']
export type InspectionResult = Enums['inspection_result']
export type DocumentStatus = Enums['document_status']
export type DocType = Enums['doc_type']
export type MessageKind = Enums['message_kind']
export type MessageSource = Enums['message_source']
export type ObjectType = Enums['object_type']
/**
 * INVITED until they first open the project, then ACTIVE. LEFT is how someone
 * is removed — the row is never deleted, so everything they authored keeps an
 * author.
 */
export type MembershipStatus = Enums['membership_status']

// ─── Core objects ─────────────────────────────────────────────────────────────
//
// One per table. Nullability comes from the column definitions, so a column
// that can be null is `| null` here whether or not the UI expected it — which
// is the point.

export type Vessel = Row<'vessels'>
export type WorkPackage = Row<'work_packages'>
export type InspectionEvent = Row<'inspection_events'>
export type DefectRecord = Row<'defect_records'>
export type ChangeOrder = Row<'change_orders'>
export type OwnerApproval = Row<'owner_approvals'>
export type Document = Row<'documents'>
export type ProjectMember = Row<'project_members'>
export type WorldModelEvent = Row<'world_model_events'>
export type Message = Row<'messages'>

/**
 * A project, optionally carrying the vessel it refits.
 *
 * The bare row has only `vessel_id`; `vessel` appears when a query asks
 * PostgREST to embed it, and is absent otherwise — a property project has no
 * vessel at all.
 */
export type Project = Row<'projects'> & { vessel?: Vessel | null }

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Deliberately carries no role, and has no row behind it.
 *
 * A role is held on a project, not by a person: the same email can be
 * OWNERS_REP on the ketch and a member of nothing on a property. Storing one
 * here would have to pick, and picking wrongly hides or offers controls that
 * the database then contradicts. `useMyRole()` asks about the active project.
 */
export interface AuthUser {
  id: string
  email: string
  name: string
}
