import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Download, ScrollText } from 'lucide-react'
import { api, getToken } from '../../lib/api'

interface AuditEntry {
  id: number
  actor_email: string
  event: string
  detail: string
  ip: string
  created_at: string
}

const EVENT_COLORS: Record<string, string> = {
  'auth.login': 'bg-green-500/12 text-green-400 border-green-500/30',
  'auth.login_failed': 'bg-red-500/12 text-red-300 border-red-500/30',
  'auth.logout': 'bg-white/8 text-ink-2 border-white/12',
  'prompt.processed': 'bg-brand-500/15 text-brand-300 border-brand-500/40',
  'policy.updated': 'bg-amber-500/12 text-amber-300 border-amber-500/30',
  'policy.created': 'bg-amber-500/12 text-amber-300 border-amber-500/30',
  'user.updated': 'bg-violet-500/12 text-violet-300 border-violet-500/30',
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditEntry[]>([])
  const [events, setEvents] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [eventFilter, setEventFilter] = useState('')

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: '200' })
    if (query) params.set('q', query)
    if (eventFilter) params.set('event', eventFilter)
    api.get<{ items: AuditEntry[]; events: string[] }>(`/api/audit?${params}`)
      .then((r) => { setItems(r.items); setEvents(r.events) })
  }, [query, eventFilter])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const exportCsv = async () => {
    const res = await fetch('/api/audit/export', {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'promptineering-audit.csv'
    a.click()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="mx-auto max-w-6xl px-6 pb-16 pt-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Audit Logs</h1>
          <p className="mt-1 text-ink-2">
            Immutable record of every login, prompt, policy change and admin action.
          </p>
        </div>
        <button className="btn-ghost" onClick={exportCsv}>
          <Download size={15} /> Export CSV
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field !w-72 !pl-9" placeholder="Search actor, event or detail…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="field !w-52" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
          <option value="">All events</option>
          {events.map((e) => <option key={e}>{e}</option>)}
        </select>
        <span className="ml-auto self-center text-[12.5px] text-ink-3">{items.length} entries</span>
      </div>

      <div className="glass mt-4 overflow-hidden rounded-2xl">
        {items.length === 0 ? (
          <div className="grid h-40 place-items-center text-ink-3">
            <span className="flex items-center gap-2 text-sm"><ScrollText size={16} /> No matching events</span>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="border-b border-white/10">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-ink-3">
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Event</th>
                <th className="px-4 py-2.5">Detail</th>
                <th className="hidden px-4 py-2.5 md:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id} className="border-b border-white/6 transition hover:bg-white/4">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-2">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{entry.actor_email}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                      EVENT_COLORS[entry.event] ?? 'bg-white/8 text-ink-2 border-white/12'
                    }`}>
                      {entry.event}
                    </span>
                  </td>
                  <td className="max-w-[320px] truncate px-4 py-2.5 text-ink-2">{entry.detail}</td>
                  <td className="hidden px-4 py-2.5 font-mono text-[12px] text-ink-3 md:table-cell">{entry.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  )
}
