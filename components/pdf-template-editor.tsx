'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCan } from '@/components/access'
import { usePdfTemplates } from '@/lib/store/pdftemplates'
import { previewTemplatePdf } from '@/lib/pdf'
import { logAudit } from '@/lib/store/audit'

export function PdfTemplateEditor() {
  const { templates, update, reset } = usePdfTemplates()
  const canEdit = useCan('templates', 'edit')
  const [id, setId] = useState(templates[0].id)
  const tpl = templates.find(t => t.id === id) ?? templates[0]

  return (
    <section className="table-card tpl-editor">
      <div className="tpl-list" role="listbox" aria-label="PDF templates">
        {templates.map(t => (
          <button key={t.id} role="option" aria-selected={t.id === id} className={t.id === id ? 'active' : ''} onClick={() => setId(t.id)}>{t.name}</button>
        ))}
      </div>
      <div className="tpl-form">
        <label>Logo text<input disabled={!canEdit} value={tpl.logoText} onChange={e => update(tpl.id, { logoText: e.target.value })} /></label>
        <label>Header (company details)<textarea disabled={!canEdit} rows={3} value={tpl.header} onChange={e => update(tpl.id, { header: e.target.value })} /></label>
        <label>Terms<textarea disabled={!canEdit} rows={3} value={tpl.terms} onChange={e => update(tpl.id, { terms: e.target.value })} /></label>
        <label>Footer<textarea disabled={!canEdit} rows={2} value={tpl.footer} onChange={e => update(tpl.id, { footer: e.target.value })} /></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="button secondary" onClick={async () => { toast.success(`Preview saved as ${await previewTemplatePdf(tpl)}`) }}>Preview PDF</button>
          {canEdit && (
            <>
              <button className="button primary" onClick={() => { logAudit('Templates', 'Edited PDF template', tpl.name); toast.success(`${tpl.name} saved`) }}>Save changes</button>
              <button className="button ghost" onClick={() => { reset(tpl.id); logAudit('Templates', 'Reset PDF template', tpl.name); toast.success('Reset to default') }}>Reset to default</button>
            </>
          )}
        </div>
        {!canEdit && <small className="muted">Only an Owner can edit PDF templates.</small>}
      </div>
    </section>
  )
}
