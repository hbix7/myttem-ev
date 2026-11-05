import { NextResponse } from 'next/server'
import { drain } from '@/lib/whatsapp-inbox'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ messages: drain() })
}
