'use client'
import { AppShell, PageHeader } from '@/components/shared'
import { useEvStore } from '@/lib/store/ev'
export default function GeneratedDocumentsPage(){const docs=useEvStore(s=>s.documents);return <AppShell crumb="Documents > Generated"><PageHeader title="Generated documents" crumb="Documents > Generated"/><main className="content"><section className="table-wrap"><table className="data-table"><thead><tr><th>Job</th><th>Principal</th><th>Document type</th><th>Generated at</th><th>Status</th></tr></thead><tbody>{docs.map(d=><tr key={d.id}><td><strong>{d.jobNo}</strong></td><td>{d.principal}</td><td>{d.type}</td><td>{new Date(d.createdAt).toLocaleString('en-MY')}</td><td><span className="status-pill">{d.status}</span></td></tr>)}</tbody></table></section></main></AppShell>}
