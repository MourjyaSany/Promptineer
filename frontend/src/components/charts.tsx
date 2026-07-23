/**
 * Lightweight SVG chart kit following the reference dataviz palette:
 * series-1 blue #2a78d6, thin marks, hairline grid, tooltips on hover,
 * status colors reserved for risk states (icon + label, never color alone).
 */
import { Fragment, useState } from 'react'

/* ---------- stat tile ---------- */
export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 text-[26px] font-extrabold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] text-ink-2">{sub}</p>}
    </div>
  )
}

/* ---------- area / line chart ---------- */
interface SeriesPoint { date: string; [key: string]: string | number }

export function AreaChart({
  data, keys, labels, height = 220,
}: {
  data: SeriesPoint[]
  keys: string[]
  labels: string[]
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 640
  const pad = { l: 42, r: 12, t: 12, b: 26 }
  const colors = ['var(--series-1)', 'var(--series-2)']
  if (data.length === 0) return <Empty height={height} />

  const max = Math.max(1, ...data.flatMap((d) => keys.map((k) => Number(d[k]) || 0)))
  const x = (i: number) => pad.l + (i / Math.max(1, data.length - 1)) * (width - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b)
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f))

  const path = (key: string, close: boolean) => {
    const pts = data.map((d, i) => `${x(i)},${y(Number(d[key]) || 0)}`)
    const line = `M${pts.join(' L')}`
    return close ? `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : line
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * width
          const idx = Math.round(((px - pad.l) / (width - pad.l - pad.r)) * (data.length - 1))
          setHover(Math.max(0, Math.min(data.length - 1, idx)))
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--gridline)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10}
              fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t >= 1000 ? `${(t / 1000).toFixed(1)}k` : t}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} />

        {keys.map((key, ki) => (
          <g key={key}>
            <path d={path(key, true)} fill={colors[ki]} opacity={0.08} />
            <path d={path(key, false)} fill="none" stroke={colors[ki]} strokeWidth={2} strokeLinejoin="round" />
          </g>
        ))}

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} strokeDasharray="3 3" />
            {keys.map((key, ki) => (
              <circle key={key} cx={x(hover)} cy={y(Number(data[hover][key]) || 0)} r={4}
                fill={colors[ki]} stroke="var(--surface-1)" strokeWidth={2} />
            ))}
          </g>
        )}

        {data.map((d, i) => (
          i % Math.ceil(data.length / 6) === 0 && (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
              {String(d.date).slice(5)}
            </text>
          )
        ))}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-xl border border-white/12 bg-[#26272b]/95 px-3 py-2 text-[11.5px] shadow-lg"
          style={{ left: `${(x(hover) / width) * 100}%`, transform: x(hover) > width * 0.7 ? 'translateX(-105%)' : 'translateX(8px)' }}
        >
          <p className="font-bold">{data[hover].date}</p>
          {keys.map((key, ki) => (
            <p key={key} className="mt-0.5 flex items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: colors[ki] }} />
              {labels[ki]}: <b className="tabular-nums">{Number(data[hover][key]).toLocaleString()}</b>
            </p>
          ))}
        </div>
      )}

      {keys.length > 1 && (
        <div className="mt-1 flex gap-4 pl-10">
          {keys.map((key, ki) => (
            <span key={key} className="flex items-center gap-1.5 text-[11px] text-ink-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: colors[ki] }} />
              {labels[ki]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- horizontal bar list ---------- */
export function BarList({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return <Empty height={120} />
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="group">
          <div className="mb-0.5 flex justify-between text-[11.5px]">
            <span className="font-semibold text-ink-2">{d.label}</span>
            <span className="tabular-nums text-ink-3">{d.value.toLocaleString()}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded bg-white/10">
            <div
              className="h-full rounded transition-all duration-700 group-hover:opacity-80"
              style={{ width: `${(d.value / max) * 100}%`, background: 'var(--series-1)' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- risk distribution (status colors + labels) ---------- */
const RISK_META: Record<string, { color: string; label: string }> = {
  low: { color: 'var(--status-good)', label: 'Low' },
  medium: { color: 'var(--status-warning)', label: 'Medium' },
  high: { color: 'var(--status-serious)', label: 'High' },
  critical: { color: 'var(--status-critical)', label: 'Critical' },
}

export function RiskBar({ data }: { data: { label: string; value: number }[] }) {
  const order = ['low', 'medium', 'high', 'critical']
  const sorted = order
    .map((k) => ({ key: k, value: data.find((d) => d.label === k)?.value ?? 0 }))
    .filter((d) => d.value > 0)
  const total = sorted.reduce((a, b) => a + b.value, 0) || 1
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-lg">
        {sorted.map((d) => (
          <div key={d.key} style={{ width: `${(d.value / total) * 100}%`, background: RISK_META[d.key].color }} />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        {sorted.map((d) => (
          <span key={d.key} className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
            <span className="h-2 w-2 rounded-sm" style={{ background: RISK_META[d.key].color }} />
            {RISK_META[d.key].label}
            <b className="tabular-nums">{d.value}</b>
            <span className="text-ink-3">({Math.round((d.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- weekday × hour heatmap (sequential blue) ---------- */
const SEQ = ['#26272b', '#16365c', '#184f95', '#1c5cab', '#256abf', '#3987e5', '#6da7ec']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function Heatmap({ data }: { data: number[][] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null)
  const max = Math.max(1, ...data.flat())
  return (
    <div className="relative">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: '32px repeat(24, 1fr)' }}>
        {data.map((row, d) => (
          <Fragment key={d}>
            <span className="pr-1 text-right text-[10px] leading-[14px] text-ink-3">
              {DAYS[d]}
            </span>
            {row.map((v, h) => (
              <div
                key={`${d}-${h}`}
                className="h-[14px] rounded-[3px] ring-brand-300 transition hover:ring-2"
                style={{ background: SEQ[Math.min(SEQ.length - 1, Math.ceil((v / max) * (SEQ.length - 1)))] }}
                onMouseEnter={() => setHover({ d, h })}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between pl-8 text-[10px] text-ink-3">
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
      </div>
      {hover && (
        <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-lg border border-white/12 bg-[#26272b]/95 px-2.5 py-1 text-[11px] font-semibold shadow">
          {DAYS[hover.d]} {String(hover.h).padStart(2, '0')}:00 — {data[hover.d][hover.h]} prompts
        </div>
      )}
    </div>
  )
}

function Empty({ height }: { height: number }) {
  return (
    <div className="grid place-items-center text-[12px] text-ink-3" style={{ height }}>
      No data in range
    </div>
  )
}
