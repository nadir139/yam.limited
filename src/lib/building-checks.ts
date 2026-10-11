// Typical maintenance of a building (migration 044), offered as a starting
// point on an empty building so nobody has to invent the list. They are
// common practice, not the law of any one country: each is an ordinary
// service interval the owner edits, retires or adds to, and the agent and
// the page say so. Each lands on a part under one of the building's starter
// systems (src/lib/parts.ts), created if missing.

export interface BuildingCheck {
  /** Top-level system, as in STARTER_SYSTEMS.property (or Safety). */
  system: { name: string; category: string }
  /** The part the check is done on. */
  part: { name: string; category: string }
  title: string
  everyDays: number
}

const HEATING = { name: 'Heating & cooling', category: 'ENERGY' }
const ROOF = { name: 'Roof', category: 'STRUCTURAL' }
const ELECTRICAL = { name: 'Electrical', category: 'ELECTRICAL' }
const PLUMBING = { name: 'Plumbing', category: 'MECHANICAL' }
const FACADE = { name: 'Façade & openings', category: 'STRUCTURAL' }
const SAFETY = { name: 'Safety', category: 'SAFETY' }

export const BUILDING_CHECKS: BuildingCheck[] = [
  { system: HEATING, part: { name: 'Boiler', category: 'ENERGY' }, title: 'Boiler service', everyDays: 365 },
  { system: HEATING, part: { name: 'Boiler', category: 'ENERGY' }, title: 'Combustion and efficiency check', everyDays: 730 },
  { system: HEATING, part: { name: 'Air conditioning', category: 'ENERGY' }, title: 'Air-conditioning service and filters', everyDays: 365 },
  { system: HEATING, part: { name: 'Chimney / flue', category: 'ENERGY' }, title: 'Chimney sweep and flue inspection', everyDays: 365 },
  { system: ROOF, part: { name: 'Roof covering', category: 'STRUCTURAL' }, title: 'Roof inspection', everyDays: 365 },
  { system: ROOF, part: { name: 'Gutters and downpipes', category: 'STRUCTURAL' }, title: 'Gutter cleaning', everyDays: 182 },
  { system: ELECTRICAL, part: { name: 'Main panel', category: 'ELECTRICAL' }, title: 'RCD (residual current device) test', everyDays: 182 },
  { system: ELECTRICAL, part: { name: 'Main panel', category: 'ELECTRICAL' }, title: 'Electrical installation inspection', everyDays: 1826 },
  { system: PLUMBING, part: { name: 'Water heater', category: 'MECHANICAL' }, title: 'Water heater service and descaling', everyDays: 365 },
  { system: FACADE, part: { name: 'Windows and doors', category: 'STRUCTURAL' }, title: 'Seals, hinges and locks check', everyDays: 365 },
  { system: SAFETY, part: { name: 'Smoke and CO alarms', category: 'SAFETY' }, title: 'Alarm test and batteries', everyDays: 182 },
  { system: SAFETY, part: { name: 'Fire extinguishers', category: 'SAFETY' }, title: 'Extinguisher check', everyDays: 182 },
]

const EVERY = (d: number) => (d % 365 === 0 ? (d === 365 ? 'every year' : `every ${d / 365} years`) : d === 182 ? 'every 6 months' : d === 1826 ? 'every 5 years' : `every ${d} days`)
export const everyLabel = EVERY
