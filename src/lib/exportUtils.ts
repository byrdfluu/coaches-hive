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

// ---------------------------------------------------------------------------
// Branded single-receipt PDF
// ---------------------------------------------------------------------------

const ep = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

export const buildReceiptPdfBuffer = (params: {
  receiptId: string
  amount: number
  status: string
  date: string
  coachName: string
  athleteName: string
  athleteEmail: string
  sessionTitle: string | null
  paymentMethod: string
  currency: string
}) => {
  const { receiptId, amount, status, date, coachName, athleteName, athleteEmail, sessionTitle, paymentMethod, currency } = params

  const formattedAmount = `$${amount.toFixed(2).replace(/\.00$/, '')}`
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''
  const receiptShort = receiptId.slice(0, 8).toUpperCase()
  const statusLabel = (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()).trim()
  const methodLabel = (paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1).toLowerCase()).trim()
  const currencyLabel = currency.toUpperCase()

  const lineItems: Array<[string, string]> = [
    ['Receipt ID', receiptShort],
    ...(sessionTitle ? [['Session', sessionTitle] as [string, string]] : []),
    ['Coach', coachName],
    ['Athlete', athleteName],
    ...(athleteEmail ? [['Email', athleteEmail] as [string, string]] : []),
    ['Payment method', methodLabel],
    ['Currency', currencyLabel],
  ]

  const cmds: string[] = []

  // Header bar (#191919)
  cmds.push('0.098 0.098 0.098 rg')
  cmds.push('0 712 612 80 re f')

  // COACHES HIVE — white bold
  cmds.push('1 1 1 rg')
  cmds.push('BT /F2 17 Tf 50 748 Td (' + ep('COACHES HIVE') + ') Tj ET')

  // PAYMENT RECEIPT — white regular
  cmds.push('BT /F1 9 Tf 1 1 1 rg 50 727 Td (' + ep('PAYMENT RECEIPT') + ') Tj ET')

  // Status badge
  const isPaid = status.toLowerCase() === 'paid'
  cmds.push(isPaid ? '0.118 0.663 0.424 rg' : '0.6 0.6 0.6 rg')
  cmds.push('462 718 100 24 re f')
  cmds.push('1 1 1 rg')
  cmds.push('BT /F2 9 Tf 474 727 Td (' + ep(statusLabel) + ') Tj ET')

  // Amount — large
  cmds.push('0.098 0.098 0.098 rg')
  cmds.push('BT /F2 30 Tf 50 667 Td (' + ep(formattedAmount) + ') Tj ET')

  // Date
  cmds.push('0.29 0.29 0.29 rg')
  cmds.push('BT /F1 10 Tf 50 642 Td (' + ep(formattedDate) + ') Tj ET')

  // Divider 1
  cmds.push('0.863 0.863 0.863 rg')
  cmds.push('40 624 532 1 re f')

  // Line items — two columns
  let y = 606
  for (const [label, value] of lineItems) {
    cmds.push('0.29 0.29 0.29 rg')
    cmds.push(`BT /F1 10 Tf 50 ${y} Td (${ep(label)}) Tj ET`)
    cmds.push('0.098 0.098 0.098 rg')
    cmds.push(`BT /F2 10 Tf 310 ${y} Td (${ep(value)}) Tj ET`)
    y -= 22
  }

  // Divider 2
  const div2Y = y - 8
  cmds.push('0.863 0.863 0.863 rg')
  cmds.push(`40 ${div2Y} 532 1 re f`)

  // Total row
  const totalY = div2Y - 26
  cmds.push('0.098 0.098 0.098 rg')
  cmds.push(`BT /F2 11 Tf 50 ${totalY} Td (${ep('Total paid')}) Tj ET`)
  cmds.push(`BT /F2 20 Tf 390 ${totalY} Td (${ep(formattedAmount)}) Tj ET`)

  // Footer divider
  cmds.push('0.863 0.863 0.863 rg')
  cmds.push('40 90 532 1 re f')

  // Footer left
  cmds.push('0.45 0.45 0.45 rg')
  cmds.push('BT /F1 8 Tf 50 74 Td (' + ep('Generated by Coaches Hive. Questions? Contact support@coacheshive.com') + ') Tj ET')

  // Footer right — receipt short ID
  cmds.push('0.65 0.65 0.65 rg')
  cmds.push('BT /F1 8 Tf 460 74 Td (' + ep(`Receipt ${receiptShort}`) + ') Tj ET')

  const content = cmds.join('\n')

  // PDF object graph — 6 objects: catalog, pages, page, font Helvetica, font Helvetica-Bold, content
  const objects: string[] = []
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n'
  )
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n')
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n')
  objects.push(`6 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream\nendobj\n`)

  const parts: string[] = ['%PDF-1.4\n']
  const offsets: number[] = []
  let byteLength = Buffer.byteLength(parts[0])
  objects.forEach((obj) => {
    offsets.push(byteLength)
    parts.push(obj)
    byteLength += Buffer.byteLength(obj)
  })

  const xrefStart = byteLength
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `),
  ].join('\n') + '\n'
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  parts.push(xref, trailer)

  return Buffer.from(parts.join(''), 'utf8')
}

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
