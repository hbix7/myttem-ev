'use client'

export type Cell = string | number | boolean | null | undefined

function save(blob: Blob, fileName: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function downloadCsv(fileName: string, header: string[], rows: Cell[][]) {
  const esc = (v: Cell) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
  save(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), fileName)
}

export async function downloadXlsx(fileName: string, header: string[], rows: Cell[][]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const toCell = (v: Cell, bold = false) => ({ value: v === null || v === undefined ? '' : typeof v === 'boolean' ? String(v) : v, ...(bold ? { fontWeight: 'bold' as const } : {}) })
  const sheetData = [header.map(h => toCell(h, true)), ...rows.map(r => r.map(v => toCell(v)))]
  await writeExcelFile(sheetData as never).toFile(fileName)
}

export async function readXlsxRows(file: File): Promise<string[][]> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text()
    return parseCsv(text)
  }
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const result = await readXlsxFile(file) as unknown
  const sheets = result as Array<{ data?: unknown[][] }> | unknown[][]
  const rows = Array.isArray(sheets) && sheets.length && !Array.isArray(sheets[0]) ? (sheets as Array<{ data?: unknown[][] }>)[0].data ?? [] : (sheets as unknown[][])
  return rows.map(r => r.map(c => (c === null || c === undefined ? '' : String(c).trim())))
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell.trim()); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows.filter(r => r.some(Boolean))
}

/* Minimal text-only PDF (Helvetica, A4, paginated). Returns a data URL so it can be stored on the job. */
export function buildPdfDataUrl(title: string, lines: string[]): string {
  const clean = (t: string) => t.replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const perPage = 46
  const body = lines.flatMap(l => l.length > 92 ? l.match(/.{1,92}/g) ?? [l] : [l])
  const pages: string[][] = []
  for (let i = 0; i < Math.max(1, body.length); i += perPage) pages.push(body.slice(i, i + perPage))
  const objects: string[] = []
  const add = (s: string) => { objects.push(s); return objects.length }
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
  const kids: number[] = []
  pages.forEach((pg, pi) => {
    let stream = `BT /F2 16 Tf 50 800 Td (${clean(title)}) Tj ET\n`
    pg.forEach((line, li) => { stream += `BT /F1 10 Tf 50 ${772 - li * 15} Td (${clean(line)}) Tj ET\n` })
    stream += `BT /F1 8 Tf 50 30 Td (Page ${pi + 1} of ${pages.length}) Tj ET\n`
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`))
  })
  objects[1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return `data:application/pdf;base64,${btoa(pdf)}`
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}
