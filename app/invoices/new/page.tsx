import { InvoiceBuilder } from '@/components/invoice-builder'

export default async function Page({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const { jobId } = await searchParams
  return <InvoiceBuilder jobId={jobId} />
}
