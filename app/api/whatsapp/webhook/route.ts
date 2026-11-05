import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { normalizeMetaPayload } from '@/lib/whatsapp'
import { enqueue } from '@/lib/whatsapp-inbox'

export const dynamic = 'force-dynamic'

/* Meta calls this once when the webhook is registered. */
export function GET(request: Request) {
  const url = new URL(request.url)
  const token = process.env.WHATSAPP_VERIFY_TOKEN
  if (!token) return new NextResponse('WHATSAPP_VERIFY_TOKEN is not configured', { status: 503 })
  if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === token) {
    return new NextResponse(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

function signatureValid(raw: string, header: string | null, secret: string) {
  if (!header?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(raw).digest()
  const given = Buffer.from(header.slice(7), 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/* Inbound messages for the single dedicated ChargeSini number.
   ?dryRun=1 only parses and returns the result: the sandbox uses it, no credentials needed, nothing is queued. */
export async function POST(request: Request) {
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
  const raw = await request.text()
  const secret = process.env.WHATSAPP_APP_SECRET

  if (!dryRun) {
    if (!secret) return NextResponse.json({ error: 'WHATSAPP_APP_SECRET is not configured' }, { status: 503 })
    if (!signatureValid(raw, request.headers.get('x-hub-signature-256'), secret)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { messages, skipped } = normalizeMetaPayload(body, dryRun ? undefined : process.env.WHATSAPP_PHONE_NUMBER_ID)
  if (!dryRun) enqueue(messages)
  return NextResponse.json({ received: messages.length, skipped, messages })
}
