// Suggesting what a bank transaction paid for (finance, migration 040).
//
// A transaction says "Repsol Marine Palma −1,850.40"; the model knows the
// boat bunkered 12.5 t at Palma that morning (Oil Record Book, code H). The
// suggestions join the two so the owner confirms with one tap instead of
// typing. They are only suggestions: nothing is allocated until a person
// confirms, and the reason for each is shown.

export type FinanceCategory =
  | 'FUEL' | 'BERTHING' | 'CREW' | 'MAINTENANCE' | 'REFIT' | 'REPAIRS' | 'INSURANCE'
  | 'PROVISIONS' | 'CHARTER_INCOME' | 'TAXES_FEES' | 'ADMIN' | 'TRANSFER' | 'OTHER'

export const CATEGORY_LABEL: Record<FinanceCategory, string> = {
  FUEL: 'Fuel', BERTHING: 'Berthing', CREW: 'Crew', MAINTENANCE: 'Maintenance', REFIT: 'Refit', REPAIRS: 'Repairs',
  INSURANCE: 'Insurance', PROVISIONS: 'Provisions', CHARTER_INCOME: 'Charter income', TAXES_FEES: 'Taxes and fees',
  ADMIN: 'Admin', TRANSFER: 'Transfer', OTHER: 'Other',
}

export interface TxLike {
  booked_at: string
  amount: number
  counterparty: string | null
  description: string | null
  reference: string | null
}

export interface Candidates {
  /** Bunkering entries of the Oil Record Book (code H), not struck. */
  bunkerings: Array<{ id: string; occurred_at: string; label: string }>
  /** Work packages with the contractor doing them. */
  workPackages: Array<{ id: string; label: string; contractor: string | null }>
  /** Change orders with their cost. */
  changeOrders: Array<{ id: string; label: string; cost: number | null }>
  /** Days in the log, with the port. */
  logDays: Array<{ id: string; date: string; port: string | null }>
}

export interface Suggestion {
  category: FinanceCategory
  objectType: 'ORB_ENTRY' | 'WORK_PACKAGE' | 'CHANGE_ORDER' | 'LOG_DAY' | null
  objectId: string | null
  label: string
  why: string
}

const KEYWORDS: Array<[RegExp, FinanceCategory]> = [
  [/\b(fuel|diesel|gasoil|mgo|bunker|repsol|cepsa|shell|bp|total ?energies|esso|eni)\b/i, 'FUEL'],
  [/\b(marina|port|puerto|porto|harbour|harbor|berth|mooring|amarre|ormeggio|club de mar)\b/i, 'BERTHING'],
  [/\b(insurance|pantaenius|assicurazion|seguro)\b/i, 'INSURANCE'],
  [/\b(payroll|salary|wages|crew)\b/i, 'CREW'],
  [/\b(supermarket|mercadona|carrefour|provision|lidl|eroski|esselunga)\b/i, 'PROVISIONS'],
  [/\b(tax|vat|iva|customs|aduana|dogana|harbour dues|fee)\b/i, 'TAXES_FEES'],
  [/\b(shipyard|astillero|cantiere|yard|refit)\b/i, 'REFIT'],
  [/\b(chandler|west marine|svb|chandlery|spare|parts)\b/i, 'MAINTENANCE'],
]

const day = (iso: string) => iso.slice(0, 10)
const daysApart = (a: string, b: string) => Math.abs(Date.parse(day(a)) - Date.parse(day(b))) / 86_400_000
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9à-ÿ ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4)

/** Whether two names share a distinctive word ("Astilleros de Mallorca" ~ "To Astilleros de Mallorca, S.A."). */
export function sameParty(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const wb = new Set(words(b))
  return words(a).some((w) => wb.has(w) && !['marine', 'yacht', 'yachts', 'services', 'limited'].includes(w))
}

export function suggest(tx: TxLike, c: Candidates): Suggestion[] {
  const text = [tx.counterparty, tx.description, tx.reference].filter(Boolean).join(' ')
  const out: Suggestion[] = []
  const add = (s: Suggestion) => {
    if (!out.some((o) => o.objectId === s.objectId && o.category === s.category)) out.push(s)
  }
  const keyword = KEYWORDS.find(([re]) => re.test(text))?.[1] ?? null

  if (tx.amount > 0) {
    add({ category: /charter/i.test(text) ? 'CHARTER_INCOME' : 'TRANSFER', objectType: null, objectId: null, label: 'Money in', why: 'money received' })
  }

  // A change order for exactly this amount.
  for (const co of c.changeOrders.filter((co) => co.cost != null && Math.abs(Math.abs(tx.amount) - co.cost) < 0.005)) {
    add({ category: 'REFIT', objectType: 'CHANGE_ORDER', objectId: co.id, label: co.label, why: 'same amount as the change order' })
  }

  // Paid to the contractor doing a work package.
  for (const wp of c.workPackages.filter((wp) => sameParty(wp.contractor, text))) {
    add({ category: keyword === 'MAINTENANCE' ? 'MAINTENANCE' : 'REFIT', objectType: 'WORK_PACKAGE', objectId: wp.id, label: wp.label, why: `paid to ${wp.contractor}` })
  }

  // Fuel paid within two days of a bunkering in the Oil Record Book: when the
  // name says fuel, or when nothing stronger (an exact amount, a contractor)
  // explains the payment.
  if (tx.amount < 0 && (keyword === 'FUEL' || (!keyword && out.length === 0))) {
    for (const b of c.bunkerings.filter((b) => daysApart(b.occurred_at, tx.booked_at) <= 2)) {
      add({ category: 'FUEL', objectType: 'ORB_ENTRY', objectId: b.id, label: b.label, why: `bunkering on ${day(b.occurred_at)}` })
    }
  }

  // A marina charge on a day the log has the boat in port.
  if (keyword === 'BERTHING') {
    const d = c.logDays.find((d) => d.date === day(tx.booked_at))
    if (d) add({ category: 'BERTHING', objectType: 'LOG_DAY', objectId: d.id, label: `${d.date}${d.port ? ` at ${d.port}` : ''}`, why: 'the log has the boat in port that day' })
  }

  if (keyword && !out.some((o) => o.category === keyword)) {
    add({ category: keyword, objectType: null, objectId: null, label: CATEGORY_LABEL[keyword], why: 'from the name on the transaction' })
  }
  return out.slice(0, 4)
}
