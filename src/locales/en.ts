// The source language, and the fallback for every other one.
//
// Keys are grouped by the surface they appear on. Enum values (project type,
// phase, status, discipline, role) get their own namespaces because they show
// up on almost every screen — translating those alone takes the app from
// "English with a language menu" to usable in another language.
//
// Adding a key here without adding it elsewhere is fine: the lookup falls back
// to this file, so the untranslated string appears in English rather than as a
// key. `translationCoverage()` reports what is missing.

export const en: Record<string, string> = {
  // ─── Common ────────────────────────────────────────────────────────────────
  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.create': 'Create',
  'common.creating': 'Creating…',
  'common.optional': 'optional',
  'common.required': 'required',
  'common.none': '—',
  'common.search': 'Search',
  'common.language': 'Language',
  'common.partialTranslation': 'partly translated',

  // ─── Navigation ────────────────────────────────────────────────────────────
  'nav.dashboard': 'Dashboard',
  'nav.project': 'Project',
  'nav.workPackages': 'Work Packages',
  'nav.inspections': 'Inspections',
  'nav.defects': 'Defects / NCRs',
  'nav.changeOrders': 'Change Orders',
  'nav.approvals': 'Approvals',
  'nav.documents': 'Documents',
  'nav.team': 'Team',
  'nav.messages': 'Messages',
  'nav.agent': 'Agent',
  'nav.signOut': 'Sign out',
  'nav.noRole': 'No project role',

  // ─── Projects ──────────────────────────────────────────────────────────────
  'project.switch': 'Switch project',
  'project.none': 'No project',
  'project.create': 'New project',
  'project.yours': 'Your projects ({count})',
  'project.emptyTitle': 'You are not on a project yet',
  'project.emptyBody':
    'Projects are private to their members. Ask someone to add you to theirs, or start your own — a refit, a survey, or a property.',
  'project.name': 'Project name',
  'project.namePlaceholder': 'Villa Capo Ceraso — compliance',
  'project.type': 'Type',
  'project.yardName': 'Yard or contractor',
  'project.yardLocation': 'Location',
  'project.plannedStart': 'Planned start',
  'project.plannedDelivery': 'Planned delivery',
  'project.budget': 'Budget',
  'project.classSociety': 'Class society',
  'project.classSocietyHint': 'Vessels only — leave empty for a property.',
  'project.created': 'Project created. You are its owner’s representative.',

  // ─── Project types ─────────────────────────────────────────────────────────
  'projectType.FIVE_YEAR_SURVEY': 'Five-year survey',
  'projectType.REFIT': 'Refit',
  'projectType.NEWBUILD': 'New build',
  'projectType.ANNUAL_SURVEY': 'Annual survey',
  'projectType.DAMAGE_REPAIR': 'Damage repair',
  'projectType.PROPERTY': 'Property',

  // ─── Phases ────────────────────────────────────────────────────────────────
  'phase.PRE_SURVEY': 'Pre-survey',
  'phase.HAUL_OUT': 'Haul out',
  'phase.STRUCTURAL': 'Structural',
  'phase.SYSTEMS': 'Systems',
  'phase.INTERIOR': 'Interior',
  'phase.SEA_TRIALS': 'Sea trials',
  'phase.DELIVERED': 'Delivered',

  // ─── Roles ─────────────────────────────────────────────────────────────────
  'role.OWNER': 'Owner',
  'role.OWNERS_REP': 'Owner’s Representative',
  'role.CAPTAIN': 'Captain',
  'role.YARD_PM': 'Yard Project Manager',
  'role.CLASS_SURVEYOR': 'Class Surveyor',
  'role.NAVAL_ARCHITECT': 'Naval Architect',
  'role.SUBCONTRACTOR': 'Subcontractor',

  // ─── Statuses ──────────────────────────────────────────────────────────────
  'status.OPEN': 'Open',
  'status.IN_PROGRESS': 'In progress',
  'status.PENDING_APPROVAL': 'Pending approval',
  'status.CLOSED': 'Closed',
  'status.DISPUTED': 'Disputed',
  'status.DRAFT': 'Draft',
  'status.SCOPED': 'Scoped',
  'status.ACTIVE': 'Active',
  'status.EXPANDED': 'Expanded',
  'status.ON_HOLD': 'On hold',
  'status.COMPLETE': 'Complete',
  'status.PENDING': 'Pending',
  'status.APPROVED': 'Approved',
  'status.REJECTED': 'Rejected',

  // ─── Severity ──────────────────────────────────────────────────────────────
  'severity.CRITICAL': 'Critical',
  'severity.HIGH': 'High',
  'severity.MEDIUM': 'Medium',
  'severity.LOW': 'Low',

  // ─── Disciplines ───────────────────────────────────────────────────────────
  'discipline.STRUCTURAL': 'Structural',
  'discipline.HULL': 'Hull',
  'discipline.MECHANICAL': 'Mechanical',
  'discipline.ELECTRICAL': 'Electrical',
  'discipline.RIGGING': 'Rigging',
  'discipline.INTERIOR': 'Interior',
  'discipline.PAINT': 'Paint',
  'discipline.CLASS': 'Class',
  'discipline.SAFETY': 'Safety',
}
