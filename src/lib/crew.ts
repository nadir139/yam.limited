// Crew certificates (migration 037): how close each is to expiring.

import type { CrewCertificate } from './types'

export type CertState = 'EXPIRED' | 'EXPIRING' | 'VALID' | 'NO_EXPIRY'

/** Within this many days of expiry a certificate is flagged: time to book a renewal course. */
export const EXPIRY_WARNING_DAYS = 90

export const CERT_STATE_META: Record<CertState, { label: string; colour: string }> = {
  EXPIRED: { label: 'Expired', colour: '#dc2626' },
  EXPIRING: { label: 'Expires soon', colour: '#d97706' },
  VALID: { label: 'Valid', colour: '#16a34a' },
  NO_EXPIRY: { label: 'No expiry', colour: '#6b7280' },
}

const DAY = 86_400_000

/** Whole days from `today` (YYYY-MM-DD) to `date`; negative when past. */
export const daysUntil = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / DAY)

export function certState(c: Pick<CrewCertificate, 'expires_on'>, today: string): CertState {
  if (!c.expires_on) return 'NO_EXPIRY'
  const d = daysUntil(c.expires_on, today)
  if (d < 0) return 'EXPIRED'
  if (d <= EXPIRY_WARNING_DAYS) return 'EXPIRING'
  return 'VALID'
}
