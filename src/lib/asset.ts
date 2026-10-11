// What a project's asset is (migration 043): a boat, a building or an
// aircraft. The `vessels` table holds all three (its name is historical);
// these helpers keep the wording and the fields right for each kind.

export type AssetKind = 'VESSEL' | 'BUILDING' | 'AIRCRAFT'

interface ProjectLike {
  project_type: string
  vessel?: { asset_kind?: string | null } | null
}

/** The kind of asset a project of this type is done to (same rule as project_asset_kind()). */
export function kindForProjectType(type: string | null | undefined): AssetKind {
  if (type === 'PROPERTY') return 'BUILDING'
  if (type === 'AIRCRAFT_CHECK' || type === 'AIRCRAFT_REFURB') return 'AIRCRAFT'
  return 'VESSEL'
}

/** The project's asset kind: the recorded asset's, else what its type implies. */
export function assetKindOf(project: ProjectLike | null | undefined): AssetKind {
  const k = project?.vessel?.asset_kind
  if (k === 'VESSEL' || k === 'BUILDING' || k === 'AIRCRAFT') return k
  return kindForProjectType(project?.project_type)
}

export const ASSET_NOUN: Record<AssetKind, string> = { VESSEL: 'boat', BUILDING: 'building', AIRCRAFT: 'aircraft' }

export interface DetailField {
  key: string
  label: string
  type: 'text' | 'number'
  unit?: string
  placeholder?: string
}

/** The details each kind records (the server checks the same keys: asset_details_spec()). */
export const DETAIL_FIELDS: Record<'BUILDING' | 'AIRCRAFT', DetailField[]> = {
  BUILDING: [
    { key: 'address', label: 'Address', type: 'text', placeholder: 'Via Roma 1' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'postcode', label: 'Postcode', type: 'text' },
    { key: 'country', label: 'Country', type: 'text', placeholder: 'IT' },
    { key: 'cadastral_ref', label: 'Cadastral reference', type: 'text', placeholder: 'Foglio 12, particella 345, sub 2' },
    { key: 'building_use', label: 'Use', type: 'text', placeholder: 'Residential' },
    { key: 'floor_area_m2', label: 'Floor area', type: 'number', unit: 'm²' },
    { key: 'plot_area_m2', label: 'Plot area', type: 'number', unit: 'm²' },
    { key: 'floors', label: 'Floors', type: 'number' },
    { key: 'units', label: 'Units', type: 'number' },
    { key: 'energy_class', label: 'Energy class', type: 'text', placeholder: 'B' },
  ],
  AIRCRAFT: [
    { key: 'registration', label: 'Registration', type: 'text', placeholder: 'I-ABCD' },
    { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
    { key: 'model', label: 'Model', type: 'text' },
    { key: 'msn', label: 'Serial number (MSN)', type: 'text' },
    { key: 'category', label: 'Category', type: 'text', placeholder: 'Business jet' },
    { key: 'engines', label: 'Engines', type: 'number' },
    { key: 'engine_model', label: 'Engine model', type: 'text' },
    { key: 'mtow_kg', label: 'MTOW', type: 'number', unit: 'kg' },
    { key: 'seats', label: 'Seats', type: 'number' },
    { key: 'base', label: 'Base', type: 'text', placeholder: 'LIML' },
    { key: 'operator', label: 'Operator', type: 'text' },
    { key: 'type_certificate', label: 'Type certificate', type: 'text' },
    { key: 'hours_at_entry', label: 'Airframe hours when recorded here', type: 'number', unit: 'h' },
    { key: 'landings_at_entry', label: 'Landings when recorded here', type: 'number' },
  ],
}
