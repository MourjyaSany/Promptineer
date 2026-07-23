import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../../lib/api'
import {
  AreaChart, BarList, Heatmap, RiskBar, StatTile,
} from '../../components/charts'

interface Overview {
  kpis: {
    prompts: number; total_tokens: number; tokens_saved: number
    cost_saved_usd: number; avg_latency_ms: number; avg_compression_pct: number
    violations: number; blocked: number; active_users: number
  }
  series: { date: string; prompts: number; tokens: number; saved: number; violations: number }[]
  by_department: { label: string; value: number }[]
  by_policy: { label: string; value: number }[]
  by_application: { label: string; value: number }[]
  risk_distribution: { label: string; value: number }[]
  top_users: { label: string; value: number }[]
  heatmap: number[][]
}

const RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Overview | null>(null)

  useEffect(() => {
    api.get<Overview>(`/api/analytics/overview?days=${days}`).then(setData)
  }, [days])

  if (!data) {
    return <div className="grid h-screen place-items-center text-ink-3">Loading analytics…</div>
  }
  const { kpis } = data

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="mx-auto max-w-7xl px-6 pb-16 pt-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Analytics</h1>
          <p className="mt-1 text-ink-2">Governance observability across the whole platform.</p>
        </div>
        <div className="glass flex rounded-full p-1">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition ${
                days === r.days ? 'bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow' : 'text-ink-2 hover:text-ink'
              }`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Prompts" value={kpis.prompts.toLocaleString()} sub={`${kpis.active_users} active users`} />
        <StatTile label="Total tokens" value={compact(kpis.total_tokens)} sub={`${kpis.avg_latency_ms}ms avg latency`} />
        <StatTile label="Tokens saved" value={compact(kpis.tokens_saved)} sub={`${kpis.avg_compression_pct}% avg compression`} />
        <StatTile label="Cost saved" value={`$${kpis.cost_saved_usd.toLocaleString()}`} sub="blended $8 / M tokens" />
        <StatTile label="Violations" value={String(kpis.violations)} sub={`${kpis.blocked} prompts blocked`} />
        <StatTile label="Block rate" value={`${kpis.prompts ? ((kpis.blocked / kpis.prompts) * 100).toFixed(1) : 0}%`} sub="of all prompts" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Prompt volume & violations" className="xl:col-span-2">
          <AreaChart
            data={data.series}
            keys={['prompts', 'violations']}
            labels={['Prompts', 'Violations']}
          />
        </Card>
        <Card title="Risk distribution">
          <RiskBar data={data.risk_distribution} />
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-ink-3">Top users</p>
            <BarList data={data.top_users} />
          </div>
        </Card>

        <Card title="Token savings over time" className="xl:col-span-2">
          <AreaChart data={data.series} keys={['saved']} labels={['Tokens saved']} height={180} />
        </Card>
        <Card title="Usage by department">
          <BarList data={data.by_department} />
        </Card>

        <Card title="Activity heatmap (weekday × hour)" className="xl:col-span-2">
          <Heatmap data={data.heatmap} />
        </Card>
        <Card title="Policy usage">
          <BarList data={data.by_policy.slice(0, 7)} />
        </Card>

        <Card title="Workspace usage" className="xl:col-span-3">
          <BarList data={data.by_application} />
        </Card>
      </div>
    </motion.div>
  )
}

function Card({ title, children, className = '' }: {
  title: string; children: React.ReactNode; className?: string
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`glass rounded-3xl p-5 ${className}`}
    >
      <h2 className="mb-4 text-[13px] font-extrabold uppercase tracking-wider text-ink-2">{title}</h2>
      {children}
    </motion.section>
  )
}

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
