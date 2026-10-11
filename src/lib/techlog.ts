// Tech log times (migration 045). Aviation keeps time in UTC, so the form
// takes HH:MM in UTC on the flight's date and the list shows UTC, whatever
// the browser's own time zone.

/** "2026-10-03" + "08:10" (UTC) → ISO; a time earlier than `after` rolls to the next day (a flight past midnight). */
export function utcTime(date: string, time: string, after?: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  let t = Date.parse(`${date}T${time}:00Z`)
  if (after) {
    const a = Date.parse(after)
    while (t < a) t += 86_400_000
  }
  return new Date(t).toISOString()
}

/** "HH:MM" in UTC of an ISO timestamp. */
export const utcHHMM = (iso: string) => new Date(iso).toISOString().slice(11, 16)
