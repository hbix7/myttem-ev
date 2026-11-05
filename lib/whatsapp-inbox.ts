import type { InboundMessage } from '@/lib/whatsapp'

/* Best-effort, in-memory hand-off between the webhook and the browser app. The app keeps its data in the browser,
   so there is no database to write to. This queue is lost on restart and is not shared between server instances. */
const globalForInbox = globalThis as unknown as { __waInbox?: InboundMessage[] }
const queue = (globalForInbox.__waInbox ??= [])

export function enqueue(messages: InboundMessage[]) {
  for (const m of messages) if (!queue.some(q => q.id === m.id)) queue.push(m)
  if (queue.length > 200) queue.splice(0, queue.length - 200)
}

export const drain = () => queue.splice(0, queue.length)
