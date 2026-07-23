import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, ChevronUp, ChevronDown, Eye, Ban, CheckCircle2, Trash2, KeyRound,
  X, ShieldCheck, Download, UserPlus, RefreshCw, Copy, Check,
} from 'lucide-react'
import { api, ApiError, type Authority, type User } from '../../lib/api'
import { useAuth } from '../../store/auth'

type SortKey = 'name' | 'role' | 'department' | 'prompts' | 'violations' | 'total_tokens' | 'last_login'

const AUTHORITIES: { value: Authority; label: string }[] = [
  { value: 'intern', label: 'Intern' },
  { value: 'employee', label: 'Employee' },
  { value: 'senior', label: 'Senior Professional' },
  { value: 'manager', label: 'Manager' },
  { value: 'director', label: 'Director' },
  { value: 'admin', label: 'Administrator' },
]

const ROLES = ['Admin', 'Manager', 'HR', 'Healthcare', 'Finance', 'Developer',
  'Education', 'Business', 'Travel', 'Food', 'General User']

interface Detail {
  user: User
  avg_latency_ms: number
  timeline: { id: number; application: string; model: string; risk_level: string; blocked: boolean; tokens_in: number; tokens_out: number; created_at: string }[]
  violations: { id: number; type: string; severity: string; detail: string; created_at: string }[]
}

interface NewUserForm {
  name: string
  username: string
  email: string
  employee_id: string
  department: string
  role: string
  authority: Authority
  policy_id: number | ''
  autoPassword: boolean
  password: string
  status: 'active' | 'disabled'
  notes: string
}

const EMPTY_FORM: NewUserForm = {
  name: '', username: '', email: '', employee_id: '', department: '',
  role: 'General User', authority: 'employee', policy_id: '',
  autoPassword: true, password: '', status: 'active', notes: '',
}

export default function UsersPage() {
  const { policies } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [query, setQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [detail, setDetail] = useState<Detail | null>(null)
  const [toast, setToast] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null)
  const [pwCopied, setPwCopied] = useState(false)

  const load = () => api.get<{ items: User[] }>('/api/admin/users').then((r) => setUsers(r.items))
  useEffect(() => { load() }, [])

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2600) }

  const departments = useMemo(() => [...new Set(users.map((u) => u.department))].sort(), [users])

  // RBAC: only offer policy suites the selected authority level may hold
  const assignablePolicies = useMemo(
    () => policies.filter((p) =>
      form.authority === 'admin' || p.authority_levels?.includes(form.authority)),
    [policies, form.authority],
  )

  const filtered = useMemo(() => {
    let list = users.filter((u) =>
      (!query || `${u.name} ${u.email} ${u.role} ${u.username ?? ''} ${u.employee_id}`.toLowerCase().includes(query.toLowerCase())) &&
      (!deptFilter || u.department === deptFilter) &&
      (!statusFilter || u.status === statusFilter),
    )
    list = [...list].sort((a, b) => {
      const av = a[sort.key] ?? 0
      const bv = b[sort.key] ?? 0
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir
    })
    return list
  }, [users, query, deptFilter, statusFilter, sort])

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))

  const openDetail = (id: number) =>
    api.get<Detail>(`/api/admin/users/${id}`).then(setDetail)

  const patch = async (id: number, body: Record<string, unknown>, msg: string) => {
    await api.patch(`/api/admin/users/${id}`, body)
    flash(msg)
    load()
  }

  const remove = async (u: User) => {
    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return
    await api.delete(`/api/admin/users/${u.id}`)
    flash(`${u.name} deleted`)
    load()
  }

  const resetPassword = async (u: User) => {
    const r = await api.post<{ password: string }>(`/api/admin/users/${u.id}/reset-password`)
    setIssued({ name: u.name, password: r.password })
  }

  const exportCsv = () => {
    const rows = [
      ['Name', 'Username', 'Email', 'Employee ID', 'Department', 'Role', 'Authority', 'Policy', 'Status', 'Prompts', 'Violations', 'Tokens'],
      ...filtered.map((u) => [u.name, u.username ?? '', u.email, u.employee_id, u.department, u.role, u.authority, u.policy_name ?? '', u.status, u.prompts ?? 0, u.violations ?? 0, u.total_tokens ?? 0]),
    ]
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'promptineering-users.csv'
    a.click()
  }

  const suggestUsername = (name: string) =>
    name.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '.')

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormErrors({})
    setSubmitError('')
    setCreating(true)
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (form.name.trim().length < 2) errors.name = 'Full name is required'
    if (!/^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/.test(form.username))
      errors.username = '3–32 chars: lowercase letters, digits, . _ -'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) errors.email = 'Valid email required'
    if (!form.department.trim()) errors.department = 'Department is required'
    if (!form.autoPassword && form.password.length < 8)
      errors.password = 'At least 8 characters (or use auto-generate)'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const submitCreate = async () => {
    if (!validate()) return
    setSaving(true)
    setSubmitError('')
    try {
      const r = await api.post<{ user: User; temp_password: string }>('/api/admin/users', {
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        employee_id: form.employee_id.trim(),
        department: form.department.trim(),
        role: form.role,
        authority: form.authority,
        policy_id: form.policy_id === '' ? null : form.policy_id,
        password: form.autoPassword ? null : form.password,
        status: form.status,
        notes: form.notes,
      })
      setCreating(false)
      setIssued({ name: r.user.name, password: r.temp_password })
      flash(`${r.user.name} provisioned`)
      load()
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : 'Creation failed')
    } finally {
      setSaving(false)
    }
  }

  const copyPassword = (pw: string) => {
    navigator.clipboard.writeText(pw)
    setPwCopied(true)
    setTimeout(() => setPwCopied(false), 1400)
  }

  const Th = ({ label, k }: { label: string; k?: SortKey }) => (
    <th
      className={`whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-ink-3 ${k ? 'cursor-pointer select-none hover:text-brand-300' : ''}`}
      onClick={k ? () => toggleSort(k) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {k && sort.key === k && (sort.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </span>
    </th>
  )

  const err = (key: string) =>
    formErrors[key] && <p className="mt-1 text-[11px] font-medium text-red-400">{formErrors[key]}</p>

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="mx-auto max-w-7xl px-6 pb-16 pt-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">User Management</h1>
          <p className="mt-1 text-ink-2">Provision access, assign policy suites and monitor usage.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <UserPlus size={15} /> Add User
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field !w-64 !pl-9" placeholder="Search name, email, role…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="field !w-44" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select className="field !w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <span className="ml-auto text-[12.5px] text-ink-3">{filtered.length} of {users.length} users</span>
        <button className="btn-ghost !px-3 !py-2 text-[12.5px]" onClick={exportCsv}>
          <Download size={14} /> Export
        </button>
      </div>

      <div className="glass mt-4 overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[1000px] text-[13px]">
          <thead className="border-b border-white/10">
            <tr>
              <Th label="Name" k="name" />
              <Th label="Department" k="department" />
              <Th label="Role" k="role" />
              <Th label="Authority" />
              <Th label="Policy" />
              <Th label="Status" />
              <Th label="Prompts" k="prompts" />
              <Th label="Violations" k="violations" />
              <Th label="Tokens" k="total_tokens" />
              <Th label="Last login" k="last_login" />
              <Th label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-white/6 transition hover:bg-white/4">
                <td className="px-3 py-2.5">
                  <div className="font-bold">{u.name}</div>
                  <div className="text-[11.5px] text-ink-3">
                    {u.email}{u.employee_id ? ` · ${u.employee_id}` : ''}
                  </div>
                </td>
                <td className="px-3 py-2.5">{u.department}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full border border-brand-500/40 bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                    {u.role}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <select
                    className="rounded-lg border border-white/12 bg-white/8 px-1.5 py-1 text-[12px] capitalize"
                    value={u.authority}
                    onChange={(e) => patch(u.id, { authority: e.target.value }, `Authority updated for ${u.name}`)}
                  >
                    {AUTHORITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <select
                    className="rounded-lg border border-white/12 bg-white/8 px-1.5 py-1 text-[12px]"
                    value={u.policy_id ?? ''}
                    onChange={(e) => patch(u.id, { policy_id: Number(e.target.value) }, `Policy updated for ${u.name}`)}
                  >
                    <option value="" disabled>—</option>
                    {policies
                      .filter((p) => u.authority === 'admin' || p.authority_levels?.includes(u.authority) || p.id === u.policy_id)
                      .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 text-[11.5px] font-bold ${u.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${u.status === 'active' ? 'bg-[--status-good]' : 'bg-[--status-critical]'}`} />
                    {u.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{u.prompts ?? 0}</td>
                <td className="px-3 py-2.5">
                  <span className={`tabular-nums font-semibold ${(u.violations ?? 0) > 4 ? 'text-red-400' : ''}`}>{u.violations ?? 0}</span>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{(u.total_tokens ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2.5 text-[12px] text-ink-3">
                  {u.last_login ? new Date(u.last_login).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-0.5">
                    <IconBtn title="View" onClick={() => openDetail(u.id)}><Eye size={14} /></IconBtn>
                    {u.status === 'active' ? (
                      <IconBtn title="Disable" onClick={() => patch(u.id, { status: 'disabled' }, `${u.name} disabled`)}><Ban size={14} /></IconBtn>
                    ) : (
                      <IconBtn title="Enable" onClick={() => patch(u.id, { status: 'active' }, `${u.name} enabled`)}><CheckCircle2 size={14} /></IconBtn>
                    )}
                    <IconBtn title="Reset password" onClick={() => resetPassword(u)}><KeyRound size={14} /></IconBtn>
                    <IconBtn title="Delete" danger onClick={() => remove(u)}><Trash2 size={14} /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- create-user slide-over ---------- */}
      <AnimatePresence>
        {creating && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" onClick={() => setCreating(false)} />
            <motion.aside
              initial={{ x: 560 }} animate={{ x: 0 }} exit={{ x: 560 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="glass-strong scroll-thin fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-extrabold">Provision new user</h2>
                  <p className="text-[13px] text-ink-3">
                    Creates a JWT-ready account, assigns a policy suite and logs the audit trail.
                  </p>
                </div>
                <button className="rounded-lg p-1.5 hover:bg-white/8" onClick={() => setCreating(false)}><X size={17} /></button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-[12px] font-semibold text-ink-2 sm:col-span-2">
                  Full name *
                  <input className="field mt-1" value={form.name} placeholder="Jane Doe"
                    onChange={(e) => setForm((f) => ({
                      ...f, name: e.target.value,
                      username: f.username === suggestUsername(f.name) || !f.username
                        ? suggestUsername(e.target.value) : f.username,
                    }))} />
                  {err('name')}
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Username *
                  <input className="field mt-1" value={form.username} placeholder="jane.doe"
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))} />
                  {err('username')}
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Employee ID
                  <input className="field mt-1" value={form.employee_id} placeholder="EMP-0000"
                    onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))} />
                </label>
                <label className="text-[12px] font-semibold text-ink-2 sm:col-span-2">
                  Email *
                  <input className="field mt-1" type="email" value={form.email} placeholder="jane@company.com"
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  {err('email')}
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Department *
                  <input className="field mt-1" value={form.department} placeholder="Engineering"
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
                  {err('department')}
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Role
                  <select className="field mt-1" value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Authority level
                  <select className="field mt-1" value={form.authority}
                    onChange={(e) => setForm((f) => ({
                      ...f, authority: e.target.value as Authority, policy_id: '',
                    }))}>
                    {AUTHORITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </label>
                <label className="text-[12px] font-semibold text-ink-2">
                  Default policy suite
                  <select className="field mt-1" value={form.policy_id}
                    onChange={(e) => setForm((f) => ({
                      ...f, policy_id: e.target.value === '' ? '' : Number(e.target.value),
                    }))}>
                    <option value="">Unassigned</option>
                    {assignablePolicies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <span className="mt-1 block text-[10.5px] font-normal text-ink-3">
                    Filtered by the selected authority level (RBAC).
                  </span>
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-4">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
                  <input type="checkbox" className="accent-brand-600" checked={form.autoPassword}
                    onChange={(e) => setForm((f) => ({ ...f, autoPassword: e.target.checked }))} />
                  Auto-generate temporary password
                </label>
                {!form.autoPassword && (
                  <label className="mt-3 block text-[12px] font-semibold text-ink-2">
                    Temporary password *
                    <input className="field mt-1" type="text" value={form.password}
                      placeholder="Minimum 8 characters"
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                    {err('password')}
                  </label>
                )}
                <p className="mt-2 text-[11px] text-ink-3">
                  Passwords are salted and hashed (PBKDF2) before storage; the plaintext
                  is shown once so you can hand it to the user securely.
                </p>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-[12px] font-semibold text-ink-2">
                  Account status
                  <select className="field mt-1" value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'disabled' }))}>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>
              <label className="mt-4 block text-[12px] font-semibold text-ink-2">
                Notes <span className="font-normal text-ink-3">(optional)</span>
                <textarea className="field mt-1 min-h-20 resize-y" value={form.notes}
                  placeholder="Context for auditors or IT — e.g. contractor until Q4."
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </label>

              {submitError && (
                <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-300">
                  {submitError}
                </p>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
                <button className="btn-primary" onClick={submitCreate} disabled={saving}>
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  {saving ? 'Provisioning…' : 'Create user'}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ---------- issued-password dialog ---------- */}
      <AnimatePresence>
        {issued && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setIssued(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="glass-strong fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white">
                  <KeyRound size={16} />
                </span>
                <div>
                  <h3 className="font-extrabold">Temporary password</h3>
                  <p className="text-[12px] text-ink-3">for {issued.name} — shown once</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-brand-500/40 bg-brand-500/12 px-4 py-3">
                <code className="text-[15px] font-bold tracking-wide">{issued.password}</code>
                <button className="rounded-lg p-1.5 text-ink-3 transition hover:bg-brand-500/15 hover:text-brand-300"
                  title="Copy" onClick={() => copyPassword(issued.password)}>
                  {pwCopied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
                The user should change this after first sign-in. The password is stored
                only as a salted hash — it cannot be retrieved again.
              </p>
              <button className="btn-primary mt-5 w-full" onClick={() => setIssued(null)}>Done</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* detail drawer */}
      <AnimatePresence>
        {detail && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" onClick={() => setDetail(null)} />
            <motion.aside
              initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="glass-strong scroll-thin fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-extrabold">{detail.user.name}</h2>
                  <p className="text-[13px] text-ink-3">
                    {detail.user.email}
                    {detail.user.username ? <> · @{detail.user.username}</> : null}
                    {detail.user.employee_id ? <> · {detail.user.employee_id}</> : null}
                  </p>
                </div>
                <button className="rounded-lg p-1.5 hover:bg-white/8" onClick={() => setDetail(null)}><X size={17} /></button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Kpi label="Prompts" value={String(detail.user.prompts ?? 0)} />
                <Kpi label="Violations" value={String(detail.user.violations ?? 0)} />
                <Kpi label="Total tokens" value={(detail.user.total_tokens ?? 0).toLocaleString()} />
                <Kpi label="Avg latency" value={`${detail.avg_latency_ms}ms`} />
                <Kpi label="Storage" value={`${detail.user.storage_used_mb} MB`} />
                <Kpi label="Policy" value={detail.user.policy_name ?? '—'} />
              </div>

              {detail.user.notes && (
                <section className="mt-5 rounded-xl border border-white/10 bg-white/8 p-3">
                  <p className="text-[10px] font-bold uppercase text-ink-3">Notes</p>
                  <p className="mt-1 text-[12.5px] text-ink-2">{detail.user.notes}</p>
                </section>
              )}

              {detail.violations.length > 0 && (
                <section className="mt-6">
                  <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-ink-3">Violations</h3>
                  <div className="space-y-1.5">
                    {detail.violations.slice(0, 8).map((v) => (
                      <div key={v.id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px]">
                        <span className="font-bold uppercase text-amber-300">{v.type} · {v.severity}</span>
                        <p className="text-ink-2">{v.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="mt-6">
                <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-ink-3">Activity timeline</h3>
                <div className="space-y-1">
                  {detail.timeline.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-brand-500/150/12">
                      <ShieldCheck size={13} className={t.blocked ? 'text-red-500' : 'text-brand-500'} />
                      <span className="font-semibold capitalize">{t.application}</span>
                      <span className="text-ink-3">{t.model.split(' ')[0]}</span>
                      <span className="ml-auto tabular-nums text-ink-3">{t.tokens_in + t.tokens_out} tok</span>
                      <span className="text-[10.5px] text-ink-3">{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </section>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-strong fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-[13px] font-semibold">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function IconBtn({ children, title, onClick, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button title={title} onClick={onClick}
      className={`rounded-lg p-1.5 text-ink-3 transition hover:bg-brand-500/15 ${danger ? 'hover:text-red-400' : 'hover:text-brand-300'}`}>
      {children}
    </button>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/8 p-3">
      <p className="text-[10px] font-bold uppercase text-ink-3">{label}</p>
      <p className="mt-0.5 truncate text-[15px] font-extrabold">{value}</p>
    </div>
  )
}
