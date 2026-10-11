// The Oil Record Book, Part I (migration 039): the codes and the item
// numbers each entry is written against, as in the IMO guidance for the
// recording of operations (MEPC.1/Circ.736/Rev.2). The form offers the
// items of the chosen code; the engineer fills in what applies.

export type OrbCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'

export interface OrbItem {
  item: string
  /** What the guidance asks to be recorded against this item. */
  asks: string
}

export interface OrbCodeInfo {
  code: OrbCode
  title: string
  items: OrbItem[]
  /** The quantity the entry is about, when the code has one. */
  quantity?: { label: string; unit: 'm3' | 't'; required?: boolean }
}

export const ORB_CODES: OrbCodeInfo[] = [
  {
    code: 'A',
    title: 'Ballasting or cleaning of fuel oil tanks',
    items: [
      { item: '1', asks: 'Identity of tank(s) ballasted' },
      { item: '2', asks: 'Whether cleaned since they last contained oil; if not, type of oil previously carried' },
      { item: '3', asks: 'Cleaning process: position at start and completion, tanks, method, chemicals and quantity' },
      { item: '4', asks: 'Position at start of ballasting and quantity of ballast (m3)' },
    ],
    quantity: { label: 'Ballast', unit: 'm3' },
  },
  {
    code: 'B',
    title: 'Discharge of dirty ballast or cleaning water from fuel oil tanks',
    items: [
      { item: '5', asks: 'Identity of tank(s)' },
      { item: '6', asks: 'Position of ship at start of discharge' },
      { item: '7', asks: 'Position of ship on completion of discharge' },
      { item: '8', asks: "Ship's speed(s) during discharge" },
      { item: '9', asks: 'Method of discharge (through 15 ppm equipment, to reception facilities)' },
      { item: '10', asks: 'Quantity discharged (m3)' },
    ],
    quantity: { label: 'Discharged', unit: 'm3' },
  },
  {
    code: 'C',
    title: 'Collection, transfer and disposal of oil residues (sludge)',
    items: [
      { item: '11.1', asks: 'Collection: tank identity, capacity, total quantity retained (m3)' },
      { item: '11.2', asks: 'Collection by manual operation: tank, quantity collected, total retained' },
      { item: '12.1', asks: 'Disposal to reception facilities: port, quantity, receipt' },
      { item: '12.2', asks: 'Transfer to another tank: tanks, quantity, total retained in each' },
      { item: '12.3', asks: 'Incineration: tank, quantity, time of start and stop' },
      { item: '12.4', asks: 'Other method: which, quantity' },
    ],
    quantity: { label: 'Sludge', unit: 'm3' },
  },
  {
    code: 'D',
    title: 'Non-automatic discharge overboard, transfer or disposal of bilge water',
    items: [
      { item: '13', asks: 'Quantity discharged, transferred or disposed of (m3)' },
      { item: '14', asks: 'Time of start and stop' },
      { item: '15.1', asks: 'Overboard through 15 ppm equipment: position at start and end' },
      { item: '15.2', asks: 'To reception facilities: port, receipt' },
      { item: '15.3', asks: 'Transfer to a holding tank: tank, quantity, total retained' },
    ],
    quantity: { label: 'Bilge water', unit: 'm3' },
  },
  {
    code: 'E',
    title: 'Automatic discharge overboard, transfer or disposal of bilge water',
    items: [
      { item: '16', asks: 'Time the system was put in automatic mode for discharge overboard through 15 ppm equipment' },
      { item: '17', asks: 'Time the pump was put in automatic mode for transfer to a holding tank' },
      { item: '18', asks: 'Time the system was put back to manual operation' },
    ],
  },
  {
    code: 'F',
    title: 'Condition of the oil filtering equipment',
    items: [
      { item: '19', asks: 'Time of system failure' },
      { item: '20', asks: 'Time when the system was made operational' },
      { item: '21', asks: 'Reasons for failure' },
    ],
  },
  {
    code: 'G',
    title: 'Accidental or other exceptional discharges of oil',
    items: [
      { item: '22', asks: 'Time of occurrence' },
      { item: '23', asks: 'Place or position of ship at time of occurrence' },
      { item: '24', asks: 'Approximate quantity and type of oil' },
      { item: '25', asks: 'Circumstances of discharge or escape, the reasons for it and general remarks' },
    ],
    quantity: { label: 'Approximate quantity', unit: 'm3' },
  },
  {
    code: 'H',
    title: 'Bunkering of fuel or bulk lubricating oil',
    items: [
      { item: '26.1', asks: 'Place of bunkering' },
      { item: '26.2', asks: 'Type and quantity of fuel oil and identity of tank(s): quantity added (t) and total content' },
      { item: '26.3', asks: 'Type and quantity of lubricating oil and identity of tank(s): quantity added and total content' },
    ],
    quantity: { label: 'Bunkered', unit: 't', required: true },
  },
  {
    code: 'I',
    title: 'Additional operational procedures and general remarks',
    items: [{ item: '', asks: 'What was done, or the remark' }],
  },
]

export const codeInfo = (code: OrbCode) => ORB_CODES.find((c) => c.code === code)!

export interface OrbLine {
  item: string | null
  text: string
}

/**
 * The lines to send: only items with something written, in the order of the
 * code's items. Null when nothing at all was written.
 */
export function linesFrom(code: OrbCode, written: Record<string, string>): OrbLine[] | null {
  const lines = codeInfo(code)
    .items.map((i) => ({ item: i.item || null, text: (written[i.item] ?? '').trim() }))
    .filter((l) => l.text.length > 0)
  return lines.length ? lines : null
}

/** "C 11.1, 12.3" — the codes and items of an entry, as the book's columns show them. */
export function itemsLabel(code: string, lines: OrbLine[]): string {
  const items = lines.map((l) => l.item).filter(Boolean)
  return items.length ? `${code} ${items.join(', ')}` : code
}
