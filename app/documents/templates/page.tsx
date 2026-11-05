'use client'
import { AppShell, PageHeader, StatusPill } from '@/components/shared'
import { EV_TEMPLATES } from '@/lib/evdocs'

export default function TemplatesPage() {
  return (
    <AppShell crumb="Documents > Templates">
      <PageHeader title="Document templates" crumb="Documents > Templates" subtitle="Ten templates: a Technical Assessment Form and an Installation Report for each of the five principals." />
      <main className="content">
        <div className="notice">A sixth Principal, a changed form, a different format (Excel, direct upload) or a manufacturer-specific compliance document is a Change Request after Scope Lock.</div>
        <section className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Principal</th><th>Document</th><th>Sections</th><th>Status</th></tr></thead>
            <tbody>
              {EV_TEMPLATES.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.principal}</strong></td>
                  <td>{t.type}</td>
                  <td className="muted">{t.fields.join(', ')}</td>
                  <td><StatusPill>{t.status}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </AppShell>
  )
}
