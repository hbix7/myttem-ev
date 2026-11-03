const BASE = new Date('2026-11-03T10:00:00+08:00').getTime()
let loadedAt = Date.now()
export function getNow(offset = 0) { return new Date(BASE + (Date.now() - loadedAt) + offset) }
export function resetClockOrigin() { loadedAt = Date.now() }
