const DAY = 86400000
const SEED_ANCHOR_DAY = '2026-11-03'
const SEED_ANCHOR_MS = new Date(`${SEED_ANCHOR_DAY}T10:00:00+08:00`).getTime()

const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(d)
const utcMs = (day: string) => Date.parse(`${day}T00:00:00Z`)

/** Today's calendar date in Malaysia time, as YYYY-MM-DD. */
export const todayKL = () => dayOf(new Date())

/** Calendar date `n` days after (or before) a YYYY-MM-DD day. */
export const addDays = (day: string, n: number) => new Date(utcMs(day) + n * DAY).toISOString().slice(0, 10)

/** Whole days between the date the seed data was authored for and today (Malaysia time). */
export const SEED_DAY_SHIFT = Math.round((utcMs(todayKL()) - utcMs(SEED_ANCHOR_DAY)) / DAY)

/** 10:00 Malaysia time today: the reference moment all seed data is built around. */
export const SEED_BASE_MS = SEED_ANCHOR_MS + SEED_DAY_SHIFT * DAY

/** Moves the first YYYY-MM-DD found in a seed string by the same shift, keeping the time and offset. */
export const seedDate = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}/, d => addDays(d, SEED_DAY_SHIFT))

/** Moves a dd/mm/yyyy string by the same shift. */
export const seedDmy = (s: string) => s.replace(/(\d{2})\/(\d{2})\/(\d{4})/, (_, d, m, y) => addDays(`${y}-${m}-${d}`, SEED_DAY_SHIFT).split('-').reverse().join('/'))

/** The current moment. `offset` (ms) lets a screen simulate a later time. */
export function getNow(offset = 0) { return new Date(Date.now() + offset) }
export function resetClockOrigin() {}
