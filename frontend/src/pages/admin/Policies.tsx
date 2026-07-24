import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus, Copy, Trash2, Pencil, X, ShieldCheck, Power,
} from 'lucide-react'
import { api, type Policy } from '../../lib/api'
import { useAuth } from '../../store/auth'

const GUARDRAIL_KEYS = ['injection', 'pii', 'secrets', 'jailbreak', 'compliance', 'toxicity', 'financial']
const RAILS_KEYS = ['input_rails', 'output_rails', 'dialog_rails', 'topical_rails', 'self_check']
const ROLES = ['Admin', 'Manager', 'HR', 'Healthcare', 'Finance', 'Developer', 'Education', 'Business', 'Travel', 'Food', 'General User']
const AUTHORITY_LEVELS = ['intern', 'employee', 'senior', 'manager', 'director', 'admin'] as const
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash']
const COMPRESSION_LEVELS = ['low', 'medium', 'high', 'maximum']
const LOGGING_LEVELS = ['minimal', 'standard', 'verbose', 'supervised']
const STRICTNESS = ['relaxed', 'professional', 'strict']
const RISK_STYLES: Record<string, string> = {
  low: 'bg-green-500/12 text-green-400 border-green-500/30',
  medium: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
  high: 'bg-orange-500/12 text-orange-300 border-orange-500/30',
  critical: 'bg-red-500/12 text-red-300 border-red-500/30',
}

const EMPTY: Omit<Policy, 'id'> = {
  name: '', description: '', category: 'general', risk_level: 'medium',
  roles: [], authority_levels: [], applications: [],
  guardrails: Object.fromEntries(GUARDRAIL_KEYS.map((k) => [k, k !== 'financial'])),
  rails_config: { input_rails: true, output_rails: true, dialog_rails: false, topical_rails: true, self_check: false },
  blocked_topics: [], compliance_tags: [],
  allowed_file_types: ['pdf', 'docx', 'csv', 'txt'],
  allowed_models: MODELS, tool_permissions: ['search', 'summarize', 'export'],
  max_tokens: 4096, compression_level: 'medium', compression_target: 20,
  upload_max_mb: 25, logging_level: 'standard', response_strictness: 'professional',
  temperature_limit: 0.7, enabled: true,
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [editing, setEditing] = useState<(Omit<Policy, 'id'> & { id?: number }) | null>(null)
  const [error, setError] = useState('')
  const refreshShell = useAuth((s) => s.bootstrap)

  const load = () => api.get<{ items: Policy[] }>('/api/admin/policies').then((r) => setPolicies(r.items))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing) return
    setError('')
    try {
      const { id, usage_count: _uc, ...body } = editing as Policy & { id?: number }
      if (id) await api.put(`/api/admin/policies/${id}`, body)
      else await api.post('/api/admin/policies', body)
      setEditing(null)
      await load()
      refreshShell()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const clone = async (p: Policy) => { await api.post(`/api/admin/policies/${p.id}/clone`); load() }
  const remove = async (p: Policy) => {
    if (!window.confirm(`Delete policy "${p.name}"? Users assigned to it will be unassigned.`)) return
    await api.delete(`/api/admin/policies/${p.id}`)
    load(); refreshShell()
  }
  const toggle = async (p: Policy) => {
    const { id, usage_count: _uc, ...body } = p
    await api.put(`/api/admin/policies/${id}`, { ...body, enabled: !p.enabled })
    load()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="mx-auto max-w-7xl px-6 pb-16 pt-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Policy Management</h1>
          <p className="mt-1 text-ink-2">Guardrail suites that govern every role and workspace.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}>
          <Plus size={15} /> New Policy
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {policies.map((p, i) => (
          <motion.div key={p.id}
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`glass rounded-3xl p-5 ${p.enabled ? '' : 'opacity-55'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500/25 to-brand-500/10 text-brand-300">
                  <ShieldCheck size={17} />
                </span>
                <div>
                  <h3 className="font-bold leading-tight">{p.name}</h3>
                  <span className={`mt-0.5 inline-block rounded-full border px-2 py-px text-[10px] font-bold uppercase ${RISK_STYLES[p.risk_level]}`}>
                    {p.risk_level} risk
                  </span>
                </div>
              </div>
              <div className="flex gap-0.5">
                <CardBtn title={p.enabled ? 'Disable' : 'Enable'} onClick={() => toggle(p)}><Power size={13} /></CardBtn>
                <CardBtn title="Edit" onClick={() => setEditing({ ...p })}><Pencil size={13} /></CardBtn>
                <CardBtn title="Clone" onClick={() => clone(p)}><Copy size={13} /></CardBtn>
                <CardBtn title="Delete" danger onClick={() => remove(p)}><Trash2 size={13} /></CardBtn>
              </div>
            </div>

            <p className="mt-3 line-clamp-2 min-h-[2.4em] text-[12.5px] leading-snug text-ink-2">{p.description}</p>

            <div className="mt-3 flex flex-wrap gap-1">
              {GUARDRAIL_KEYS.filter((k) => p.guardrails?.[k]).map((k) => (
                <span key={k} className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold capitalize text-brand-300">{k}</span>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/8 pt-3 text-center">
              <MiniStat label="Access" value={String(p.authority_levels?.length ?? 0)} />
              <MiniStat label="Compress" value={p.compression_level ?? 'medium'} />
              <MiniStat label="Upload" value={`${p.upload_max_mb ?? 25}MB`} />
              <MiniStat label="Usage" value={String(p.usage_count ?? 0)} />
            </div>
            <p className="mt-2 truncate text-[11px] capitalize text-ink-3">
              {p.authority_levels?.length ? p.authority_levels.join(' · ') : 'No authority levels assigned'}
            </p>
          </motion.div>
        ))}
      </div>

      {/* builder modal */}
      <AnimatePresence>
        {editing && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" onClick={() => setEditing(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 24 }}
              className="glass-strong scroll-thin fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold">{editing.id ? 'Edit policy' : 'Create policy'}</h2>
                <button className="rounded-lg p-1.5 hover:bg-white/8" onClick={() => setEditing(null)}><X size={17} /></button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-[12px] font-semibold text-ink-2">
                  Name
                  <input className="field mt-1" value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Risk level
                  <select className="field mt-1" value={editing.risk_level}
                    onChange={(e) => setEditing({ ...editing, risk_level: e.target.value })}>
                    {['low', 'medium', 'high', 'critical'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
                <label className="text-[12px] font-semibold text-ink-2 sm:col-span-2">
                  Description
                  <input className="field mt-1" value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </label>
              </div>

              <Section title="Authority levels (RBAC access)">
                <div className="flex flex-wrap gap-1.5">
                  {AUTHORITY_LEVELS.map((lvl) => (
                    <Chip key={lvl} active={editing.authority_levels?.includes(lvl) ?? false}
                      onClick={() => setEditing({
                        ...editing,
                        authority_levels: editing.authority_levels?.includes(lvl)
                          ? editing.authority_levels.filter((l) => l !== lvl)
                          : [...(editing.authority_levels ?? []), lvl],
                      })}>
                      <span className="capitalize">{lvl}</span>
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title="Roles">
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map((role) => (
                    <Chip key={role} active={editing.roles.includes(role)}
                      onClick={() => setEditing({
                        ...editing,
                        roles: editing.roles.includes(role)
                          ? editing.roles.filter((r) => r !== role)
                          : [...editing.roles, role],
                      })}>
                      {role}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title="Guardrails">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {GUARDRAIL_KEYS.map((k) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-[12.5px] font-semibold capitalize">
                      <input type="checkbox" className="accent-brand-600"
                        checked={!!editing.guardrails[k]}
                        onChange={(e) => setEditing({
                          ...editing,
                          guardrails: { ...editing.guardrails, [k]: e.target.checked },
                        })} />
                      {k}
                    </label>
                  ))}
                </div>
              </Section>

              <Section title="NeMo Guardrails features">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {RAILS_KEYS.map((k) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-[12.5px] font-semibold">
                      <input type="checkbox" className="accent-brand-600"
                        checked={!!editing.rails_config?.[k]}
                        onChange={(e) => setEditing({
                          ...editing,
                          rails_config: { ...editing.rails_config, [k]: e.target.checked },
                        })} />
                      {k.replace(/_/g, ' ')}
                    </label>
                  ))}
                </div>
              </Section>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="text-[12px] font-semibold text-ink-2">
                  Compression level
                  <select className="field mt-1 capitalize" value={editing.compression_level}
                    onChange={(e) => setEditing({ ...editing, compression_level: e.target.value })}>
                    {COMPRESSION_LEVELS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Logging level
                  <select className="field mt-1 capitalize" value={editing.logging_level}
                    onChange={(e) => setEditing({ ...editing, logging_level: e.target.value })}>
                    {LOGGING_LEVELS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Response strictness
                  <select className="field mt-1 capitalize" value={editing.response_strictness}
                    onChange={(e) => setEditing({ ...editing, response_strictness: e.target.value })}>
                    {STRICTNESS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Upload limit (MB)
                  <input type="number" className="field mt-1" value={editing.upload_max_mb}
                    onChange={(e) => setEditing({ ...editing, upload_max_mb: Number(e.target.value) })} />
                </label>
                <label className="text-[12px] font-semibold text-ink-2 sm:col-span-2">
                  Compliance tags <span className="font-normal text-ink-3">(comma-separated)</span>
                  <input className="field mt-1" value={(editing.compliance_tags ?? []).join(', ')}
                    onChange={(e) => setEditing({
                      ...editing,
                      compliance_tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })} />
                </label>
              </div>

              <Section title="Allowed models">
                <div className="flex flex-wrap gap-1.5">
                  {MODELS.map((m) => (
                    <Chip key={m} active={editing.allowed_models.includes(m)}
                      onClick={() => setEditing({
                        ...editing,
                        allowed_models: editing.allowed_models.includes(m)
                          ? editing.allowed_models.filter((x) => x !== m)
                          : [...editing.allowed_models, m],
                      })}>
                      {m}
                    </Chip>
                  ))}
                </div>
              </Section>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="text-[12px] font-semibold text-ink-2">
                  Max tokens
                  <input type="number" className="field mt-1" value={editing.max_tokens}
                    onChange={(e) => setEditing({ ...editing, max_tokens: Number(e.target.value) })} />
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Compression target %
                  <input type="number" className="field mt-1" value={editing.compression_target}
                    onChange={(e) => setEditing({ ...editing, compression_target: Number(e.target.value) })} />
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Temperature limit
                  <input type="number" step={0.1} min={0} max={1} className="field mt-1" value={editing.temperature_limit}
                    onChange={(e) => setEditing({ ...editing, temperature_limit: Number(e.target.value) })} />
                </label>
              </div>

              <label className="mt-4 block text-[12px] font-semibold text-ink-2">
                Blocked topics <span className="font-normal text-ink-3">(comma-separated)</span>
                <input className="field mt-1" value={editing.blocked_topics.join(', ')}
                  onChange={(e) => setEditing({
                    ...editing,
                    blocked_topics: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                  })} />
              </label>

              {error && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-300">{error}</p>}

              <div className="mt-6 flex justify-end gap-2">
                <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn-primary" onClick={save} disabled={!editing.name.trim()}>
                  {editing.id ? 'Save changes' : 'Create policy'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-ink-3">{title}</p>
      {children}
    </section>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${
        active
          ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
          : 'border-white/14 bg-white/8 text-ink-2 hover:border-brand-300'
      }`}>
      {children}
    </button>
  )
}

function CardBtn({ children, title, onClick, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button title={title} onClick={onClick}
      className={`rounded-lg p-1.5 text-ink-3 transition hover:bg-brand-500/15 ${danger ? 'hover:text-red-400' : 'hover:text-brand-300'}`}>
      {children}
    </button>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-ink-3">{label}</p>
      <p className="text-[15px] font-extrabold">{value}</p>
    </div>
  )
}
