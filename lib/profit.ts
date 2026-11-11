import type { Invoice, RateItem } from '@/lib/store/commercial'

/* Cost is estimated from item type because the item master holds selling prices only. */
const COST_RATIO: Record<string, number> = { Service: 0.55, Labour: 0.55, Part: 0.7, Material: 0.7 }
const costRatio = (type?: string) => COST_RATIO[type ?? ''] ?? 0.65

export function invoiceProfit(inv: Invoice, items: RateItem[]) {
  const revenue = inv.subtotal
  const cost = inv.lines.reduce((n, l) => n + l.qty * l.unitPrice * costRatio(items.find(x => x.id === l.itemId)?.type), 0)
  return { revenue, cost, profit: revenue - cost, margin: revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0 }
}

export function profitTotals(invoices: Invoice[], items: RateItem[]) {
  const t = invoices.reduce((n, i) => { const p = invoiceProfit(i, items); return { revenue: n.revenue + p.revenue, cost: n.cost + p.cost } }, { revenue: 0, cost: 0 })
  return { ...t, profit: t.revenue - t.cost, margin: t.revenue ? Math.round(((t.revenue - t.cost) / t.revenue) * 100) : 0 }
}
