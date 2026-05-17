'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type Snapshot = {
  id: string
  metric_label: string
  value: string
  unit?: string | null
  recorded_at: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

function MetricChart({ label, snapshots }: { label: string; snapshots: Snapshot[] }) {
  const unit = snapshots.find((s) => s.unit)?.unit || ''
  const data = snapshots.map((s) => ({
    date: s.recorded_at,
    value: parseFloat(s.value),
    label: s.metric_label,
  })).filter((s) => !isNaN(s.value))

  if (data.length === 0) return null

  if (data.length === 1) {
    return (
      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#4a4a4a]">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-[#191919]">
          {data[0].value}{unit ? ` ${unit}` : ''}
        </p>
        <p className="mt-1 text-xs text-[#9a9a9a]">Log more data points to see the trend.</p>
      </div>
    )
  }

  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const delta = max - min
  const yMin = Math.floor(min - delta * 0.15)
  const yMax = Math.ceil(max + delta * 0.15)

  return (
    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#4a4a4a]">{label}</p>
        {unit && <p className="text-xs text-[#9a9a9a]">{unit}</p>}
      </div>
      <div className="flex items-baseline gap-3 mt-1">
        <p className="text-2xl font-semibold text-[#191919]">{data[data.length - 1].value}</p>
        {data.length >= 2 && (() => {
          const diff = data[data.length - 1].value - data[0].value
          const sign = diff > 0 ? '+' : ''
          const color = diff > 0 ? 'text-[#2d7a4f]' : diff < 0 ? 'text-[#b80f0a]' : 'text-[#9a9a9a]'
          return <p className={`text-sm font-semibold ${color}`}>{sign}{diff.toFixed(1)}</p>
        })()}
      </div>
      <div className="mt-3 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 10, fill: '#9a9a9a' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: '#9a9a9a' }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              formatter={(val: number) => [`${val}${unit ? ` ${unit}` : ''}`, label]}
              labelFormatter={formatDate}
              contentStyle={{ borderRadius: '12px', border: '1px solid #dcdcdc', fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#191919"
              strokeWidth={2}
              dot={{ r: 3, fill: '#191919', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#b80f0a' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[10px] text-[#9a9a9a]">
        {data.length} data point{data.length !== 1 ? 's' : ''} · {formatDate(data[0].date)} – {formatDate(data[data.length - 1].date)}
      </p>
    </div>
  )
}

export default function MetricsChart({
  snapshots,
}: {
  snapshots: Snapshot[]
}) {
  const grouped: Record<string, Snapshot[]> = {}
  for (const s of snapshots) {
    if (!grouped[s.metric_label]) grouped[s.metric_label] = []
    grouped[s.metric_label].push(s)
  }

  const labels = Object.keys(grouped)
  if (labels.length === 0) return null

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {labels.map((label) => (
        <MetricChart key={label} label={label} snapshots={grouped[label]} />
      ))}
    </div>
  )
}
