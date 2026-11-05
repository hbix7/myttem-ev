'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppShell, PageHeader, StatusPill, EmptyState } from '@/components/shared'
import { useStore } from '@/lib/store'
import { emailDoc } from '@/lib/ev'

const EV_TYPES = ['Technical Assessment Form', 'Installation Report']

export default function GeneratedDocumentsPage() {
  const documents = useStore(s => s.documents)
  const jobs = useStore(s => s.jobs)
  const [type, setType] = useState('All')
  const [search, setSearch] = useState('')
  const rows = useMemo(() => documents
    .filter(d => EV_TYPES.includes(d.docType) && (type === 'All' || d.docType === type))
    .map(d => ({ d, job: jobs.find(j => j.id === d.jobId) }))
    .filter(r => `${r.job?.jobNo} ${r.d.principal}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.d.createdAt.localeCompare(a.d.createdAt)), [documents, jobs, type, search])

  return (
    <AppShell crumb="Documents > Generated">
      <PageHeader title="Generated documents" crumb="Documents > Generated" subtitle="Technical Assessment Forms and Installation Reports created from completed EV work." />
      <main className="content">
        <div className="filter-bar">
          <select className="field-input" value={type} onChange={e => setType(e.target.value)} aria-label="Document type">
            <option>All</option>
            {EV_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <input className="field-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search case or principal..." aria-label="Search documents" />
        </div>
        <section className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Case</th><th>Principal</th><th>Document type</th><th>Generated at</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map(({ d, job }) => (
                <tr key={d.id}>
                  <td><Link className="link" href={`/jobs/${d.jobId}`}><strong>{job?.jobNo}</strong></Link></td>
                  <td>{d.principal}</td>
                  <td>{d.docType}</td>
                  <td>{new Date(d.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td><StatusPill>{d.status === 'Sent' ? 'Emailed' : 'Generated'}</StatusPill></td>
                  <td>
                    <div className="action-row">
                      {d.dataUrl && <a className="button secondary" href={d.dataUrl} download={d.fileName}>Download PDF</a>}
                      <button className="button secondary" onClick={() => { emailDoc(d.id); toast.success('Document emailed to the principal and customer') }}>{d.status === 'Sent' ? 'Email again' : 'Email'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <EmptyState title="No documents yet" helper="Documents are generated when an assessment or installation is submitted." />}
        </section>
      </main>
    </AppShell>
  )
}
