'use client'

import { useCallback, useState } from 'react'

type ExportButtonsProps = {
  endpoint: string
  filenamePrefix: string
  label?: string
  className?: string
  disabled?: boolean
  showDateRange?: boolean
}

export default function ExportButtons({
  endpoint,
  filenamePrefix,
  label,
  className,
  disabled = false,
  showDateRange = false,
}: ExportButtonsProps) {
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [notice, setNotice] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const handleExport = useCallback(
    async (format: 'csv' | 'pdf') => {
      if (disabled) return
      setNotice('')
      setExporting(format)
      const params = new URLSearchParams()
      params.set('format', format)
      if (startDate) params.set('start', startDate)
      if (endDate) params.set('end', endDate)
      const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${params.toString()}`
      const response = await fetch(url)
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setNotice(payload?.error || 'Unable to export data.')
        setExporting(null)
        return
      }
      const blob = await response.blob()
      const link = document.createElement('a')
      const objectUrl = window.URL.createObjectURL(blob)
      link.href = objectUrl
      link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      setExporting(null)
    },
    [disabled, endpoint, filenamePrefix, startDate, endDate]
  )

  return (
    <div className={`min-w-0 overflow-hidden rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 ${className || ''}`}>
      {label ? <p className="text-[11px] uppercase tracking-[0.3em] text-[#4a4a4a]">{label}</p> : null}
      <div className="mt-3 min-h-[88px]">
        {showDateRange ? (
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <label className="min-w-0 space-y-1 text-xs text-[#4a4a4a]">
              <span className="block text-[10px] uppercase tracking-[0.3em]">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="export-date-input block w-full min-w-0 max-w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
              />
            </label>
            <label className="min-w-0 space-y-1 text-xs text-[#4a4a4a]">
              <span className="block text-[10px] uppercase tracking-[0.3em]">To</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="export-date-input block w-full min-w-0 max-w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
              />
            </label>
          </div>
        ) : (
          <div className="flex h-full items-center rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#4a4a4a]">
            Export includes all available records.
          </div>
        )}
      </div>
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => handleExport('csv')}
          disabled={disabled || exporting !== null}
          className="min-w-0 rounded-full border border-[#191919] px-3 py-1 text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a] disabled:opacity-60"
        >
          {exporting === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
        </button>
        <button
          type="button"
          onClick={() => handleExport('pdf')}
          disabled={disabled || exporting !== null}
          className="min-w-0 rounded-full border border-[#191919] px-3 py-1 text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a] disabled:opacity-60"
        >
          {exporting === 'pdf' ? 'Exporting PDF...' : 'Export PDF'}
        </button>
      </div>
      {notice ? <p className="text-xs text-[#b80f0a]">{notice}</p> : null}
    </div>
  )
}
