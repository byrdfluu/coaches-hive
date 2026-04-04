import { NextResponse } from 'next/server'

export type ExportFormat = 'csv' | 'pdf'

export const normalizeExportFormat = (format?: string | null): ExportFormat =>
  format === 'pdf' ? 'pdf' : 'csv'

const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return ''
  const raw = String(value)
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

export const toCsv = (rows: Array<Array<string | number | null | undefined>>) =>
  rows.map((row) => row.map(csvEscape).join(',')).join('\n')

const escapePdfText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

export const buildPdfBuffer = (title: string, lines: string[]) => {
  const safeTitle = title ? title.trim() : 'Export'
  const safeLines = lines.map((line) => escapePdfText(line))
  const content = [
    'BT',
    '/F1 12 Tf',
    '14 TL',
    '50 760 Td',
    `(${escapePdfText(safeTitle)}) Tj`,
    'T*',
    ...safeLines.map((line) => `(${line}) Tj T*`),
    'ET',
  ].join('\n')

  const objects: string[] = []
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n'
  )
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n')
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream\nendobj\n`)

  const parts: string[] = ['%PDF-1.4\n']
  const offsets: number[] = []
  let byteLength = Buffer.byteLength(parts[0])

  objects.forEach((object) => {
    offsets.push(byteLength)
    parts.push(object)
    byteLength += Buffer.byteLength(object)
  })

  const xrefStart = byteLength
  const xrefRows = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
  ]
  const xref = `${xrefRows.join('\n')}\n`
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  parts.push(xref, trailer)

  return Buffer.from(parts.join(''), 'utf8')
}

const rowsToPdfLines = (rows: Array<Array<string | number | null | undefined>>) =>
  rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))).join(' | '))

export const buildExportResponse = (
  format: ExportFormat,
  filenameBase: string,
  title: string,
  rows: Array<Array<string | number | null | undefined>>
) => {
  const today = new Date().toISOString().slice(0, 10)
  const filename = `${filenameBase}-${today}.${format}`

  if (format === 'pdf') {
    const pdfBuffer = buildPdfBuffer(title, rowsToPdfLines(rows))
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const csv = toCsv(rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
