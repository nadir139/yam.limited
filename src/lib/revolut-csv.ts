// Reading a Revolut statement export (finance, migration 040).
//
// Revolut Business exports transactions as CSV with columns such as "Date
// completed (UTC)", "ID", "Type", "State", "Description", "Reference",
// "Payer", "Orig currency", "Orig amount", "Payment currency", "Amount",
// "Total amount", "Fee", "Balance". A personal account's export is shorter:
// "Type, Product, Started Date, Completed Date, Description, Amount, Fee,
// Currency, State, Balance". Column names have changed over the years, so
// each field is looked up by any of the names it has had, case-insensitive.
//
// Every row is kept exactly as it came (raw), and the server stores it
// unchanged next to the fields read from it. A row's id is Revolut's own
// transaction ID; a personal export has none, so a fingerprint of the row
// (date, description, amount, balance) stands in, the same every time the
// same statement is imported, which is what lets a re-import add nothing.

export interface ImportRow {
  external_id: string
  booked_at: string
  amount: number
  currency: string
  fee: number | null
  original_amount: number | null
  original_currency: string | null
  counterparty: string | null
  description: string | null
  reference: string | null
  bank_category: string | null
  state: 'COMPLETED' | 'PENDING' | 'REVERTED' | 'DECLINED' | 'FAILED'
  raw: Record<string, string>
}

export interface ParseResult {
  rows: ImportRow[]
  /** Rows that could not be read, with the reason, by line number. */
  skipped: Array<{ line: number; reason: string }>
  format: 'REVOLUT_BUSINESS' | 'REVOLUT_PERSONAL' | 'UNKNOWN'
}

/** Splits CSV text into rows of fields; quotes, doubled quotes and newlines inside quotes. */
export function splitCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) out.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) out.push(row)
  return out
}

const pick = (r: Record<string, string>, ...names: string[]) => {
  for (const n of names) {
    const v = r[n.toLowerCase()]
    if (v !== undefined && v.trim() !== '') return v.trim()
  }
  return null
}

const num = (v: string | null): number | null => {
  if (v === null) return null
  const n = Number(v.replace(/[\s,]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** "2026-09-02 10:00:00", "2026-09-02T10:00:00Z", "02/09/2026 10:00" (day first, as Revolut writes it) to ISO, in UTC. */
export function toIso(v: string | null): string | null {
  if (!v) return null
  const t = v.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))).toISOString()
  m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))).toISOString()
  return null
}

const STATES: Record<string, ImportRow['state']> = {
  completed: 'COMPLETED',
  pending: 'PENDING',
  reverted: 'REVERTED',
  declined: 'DECLINED',
  failed: 'FAILED',
  cancelled: 'REVERTED',
  canceled: 'REVERTED',
}

async function fingerprint(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join('|'))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return 'row-' + [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function parseRevolutCsv(text: string): Promise<ParseResult> {
  const table = splitCsv(text)
  if (table.length < 2) return { rows: [], skipped: [], format: 'UNKNOWN' }
  const header = table[0].map((h) => h.trim().toLowerCase())
  const has = (n: string) => header.includes(n.toLowerCase())
  const format: ParseResult['format'] =
    has('ID') && (has('Payment currency') || has('Total amount'))
      ? 'REVOLUT_BUSINESS'
      : has('Product') && has('Completed Date')
        ? 'REVOLUT_PERSONAL'
        : has('Amount') && (has('Currency') || has('Payment currency'))
          ? 'REVOLUT_BUSINESS'
          : 'UNKNOWN'

  const rows: ImportRow[] = []
  const skipped: ParseResult['skipped'] = []
  for (let i = 1; i < table.length; i++) {
    const line = i + 1
    const raw: Record<string, string> = {}
    table[0].forEach((h, k) => (raw[h.trim()] = (table[i][k] ?? '').trim()))
    const r: Record<string, string> = {}
    Object.entries(raw).forEach(([k, v]) => (r[k.toLowerCase()] = v))

    const booked = toIso(pick(r, 'Date completed (UTC)', 'Date completed', 'Completed Date', 'Date started (UTC)', 'Started Date', 'Date'))
    const currency = (pick(r, 'Payment currency', 'Currency', 'Account currency') ?? '').toUpperCase()
    const fee = num(pick(r, 'Fee'))
    const amountField = num(pick(r, 'Amount'))
    const total = num(pick(r, 'Total amount'))
    // What left or entered the account: the business export gives it as
    // "Total amount" (fees included, signed); the personal export gives the
    // amount and a positive fee taken on top.
    const amount = total ?? (amountField === null ? null : format === 'REVOLUT_PERSONAL' && fee ? amountField - fee : amountField)
    const stateText = (pick(r, 'State') ?? 'COMPLETED').toLowerCase()
    const state = STATES[stateText]
    const description = pick(r, 'Description')

    if (!booked) {
      skipped.push({ line, reason: 'no date it was completed or started' })
      continue
    }
    if (amount === null) {
      skipped.push({ line, reason: 'no amount' })
      continue
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      skipped.push({ line, reason: 'no currency' })
      continue
    }
    if (!state) {
      skipped.push({ line, reason: `unknown state "${stateText}"` })
      continue
    }
    const id =
      pick(r, 'ID', 'Transaction ID', 'Id') ??
      (await fingerprint([booked, description ?? '', String(amount), currency, pick(r, 'Balance') ?? '', pick(r, 'Type') ?? '']))
    const origCurrency = (pick(r, 'Orig currency', 'Original currency') ?? '').toUpperCase() || null

    rows.push({
      external_id: id,
      booked_at: booked,
      amount,
      currency,
      fee,
      original_amount: num(pick(r, 'Orig amount', 'Original amount')),
      original_currency: origCurrency && origCurrency !== currency ? origCurrency : null,
      // "Payer" in a business export is the team member who paid (the
      // cardholder), not the other side: the other side is in the description
      // ("Repsol Marine Palma", "To Astilleros de Mallorca, S.A."). The payer
      // stays in raw.
      counterparty: pick(r, 'Beneficiary', 'Counterparty', 'Merchant') ?? description,
      description,
      reference: pick(r, 'Reference'),
      bank_category: pick(r, 'Type', 'Category', 'MCC'),
      state,
      raw,
    })
  }
  return { rows, skipped, format }
}
