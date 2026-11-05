'use client'
import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { EmptyState, LiveIndicator } from '@/components/shared'

/* ---------- Tooltip (CSS) ---------- */
export function Tip({ text, children }: { text?: string; children: React.ReactNode }) {
  return <span className="tip" data-tip={text} tabIndex={text ? 0 : undefined}>{children}</span>
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, description, children, footer, width }: {
  open: boolean; onClose: () => void; title: string; description?: string; children?: React.ReactNode; footer?: React.ReactNode; width?: number
}) {
  return (
    <Dialog.Root open={open} onOpenChange={o => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <div className="dialog-wrap">
          <Dialog.Popup className="dialog-popup" style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}>
            <Dialog.Title render={<h2 />}>{title}</Dialog.Title>
            {description && <Dialog.Description className="dialog-desc" render={<p />}>{description}</Dialog.Description>}
            {children}
            {footer && <div className="modal-footer">{footer}</div>}
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ---------- Stepper ---------- */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className={`step ${i < current ? 'done' : i === current ? 'current' : ''}`} aria-current={i === current ? 'step' : undefined}>
          <span className="dot">{i < current ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
          <small>{s}</small>
        </li>
      ))}
    </ol>
  )
}

/* ---------- Timeline ---------- */
export interface TimelineItem { id: string; title: React.ReactNode; meta?: React.ReactNode; detail?: React.ReactNode; tone?: string; icon?: React.ReactNode }
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ul className="timeline">
      {items.map(i => (
        <li key={i.id}>
          <span className={`t-dot tone-${i.tone ?? 'grey'}`}>{i.icon ?? <span style={{ width: 6, height: 6, borderRadius: 3, background: 'currentColor' }} />}</span>
          <div className="t-body">
            <div className="t-title">{i.title}</div>
            {i.meta && <div className="t-meta">{i.meta}</div>}
            {i.detail && <div className="t-detail">{i.detail}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ---------- Detail card ---------- */
export function DetailCard({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="detail-card-head">
        {icon && <span className="dc-icon">{icon}</span>}
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className="kv-list">
      {rows.map(([k, v]) => <div className="kv-row" key={k}><span>{k}</span><span>{v}</span></div>)}
    </div>
  )
}

/* ---------- Data table ---------- */
export interface Column<T> {
  key: string; header: string; render: (row: T) => React.ReactNode
  sortValue?: (row: T) => string | number; align?: 'right'
}
export function DataTable<T>({ title, count, columns, rows, rowKey, onRowClick, selection, empty, footerLabel = 'rows', defaultPageSize = 10 }: {
  title: string; count?: number; columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void
  selection?: { selected: Set<string>; onChange: (s: Set<string>) => void }
  empty?: React.ReactNode; footerLabel?: string; defaultPageSize?: number
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sort?.key)
    if (!sort || !col?.sortValue) return rows
    return [...rows].sort((a, b) => {
      const x = col.sortValue!(a), y = col.sortValue!(b)
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [rows, sort, columns])
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  useEffect(() => { if (page >= pages) setPage(0) }, [page, pages])
  const visible = sorted.slice(page * pageSize, page * pageSize + pageSize)
  const from = sorted.length ? page * pageSize + 1 : 0
  const to = Math.min(sorted.length, page * pageSize + pageSize)
  const allOnPage = visible.length > 0 && selection && visible.every(r => selection.selected.has(rowKey(r)))
  const toggleAll = () => {
    if (!selection) return
    const next = new Set(selection.selected)
    visible.forEach(r => (allOnPage ? next.delete(rowKey(r)) : next.add(rowKey(r))))
    selection.onChange(next)
  }
  const toggleOne = (id: string) => {
    if (!selection) return
    const next = new Set(selection.selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    selection.onChange(next)
  }
  return (
    <div className="table-card">
      <div className="table-head">
        <div><h2>{title}</h2><p>{count ?? rows.length} records</p></div>
        <LiveIndicator />
      </div>
      {rows.length === 0 ? empty : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {selection && <th className="check"><input type="checkbox" aria-label="Select all rows on this page" checked={!!allOnPage} onChange={toggleAll} /></th>}
                  {columns.map(c => {
                    const active = sort?.key === c.key
                    return (
                      <th key={c.key} className={c.align === 'right' ? 'num' : ''} aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}>
                        {c.sortValue ? (
                          <button className="sort-btn" onClick={() => setSort(active && sort!.dir === -1 ? null : { key: c.key, dir: active ? -1 : 1 })}>
                            {c.header}{active ? (sort!.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} style={{ opacity: 0.45 }} />}
                          </button>
                        ) : c.header}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map(r => {
                  const id = rowKey(r)
                  return (
                    <tr key={id} className={`${onRowClick ? 'clickable' : ''} ${selection?.selected.has(id) ? 'selected' : ''}`}
                      tabIndex={onRowClick ? 0 : undefined}
                      onClick={onRowClick ? () => onRowClick(r) : undefined}
                      onKeyDown={onRowClick ? e => { if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(r) } : undefined}>
                      {selection && <td className="check" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Select row ${id}`} checked={selection.selected.has(id)} onChange={() => toggleOne(id)} /></td>}
                      {columns.map(c => <td key={c.key} className={c.align === 'right' ? 'num' : ''}>{c.render(r)}</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>Showing {from}–{to} of {sorted.length} {footerLabel}</span>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Rows</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }} aria-label="Rows per page">
                  {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button className="icon-button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ opacity: page === 0 ? 0.4 : 1 }}><ChevronLeft size={16} /></button>
              <span className="page-number">{page + 1} / {pages}</span>
              <button className="icon-button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} style={{ opacity: page >= pages - 1 ? 0.4 : 1 }}><ChevronRight size={16} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export { EmptyState }
