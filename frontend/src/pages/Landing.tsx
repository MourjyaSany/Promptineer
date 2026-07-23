import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ShieldCheck, ScanSearch, UserCog, FolderUp,
  Minimize2, ScrollText, Route as RouteIcon, Activity,
  ArrowRight, Loader2, Lock, Sparkles,
} from 'lucide-react'
import Globe from '../components/Globe'
import { useAuth } from '../store/auth'
import { ApiError } from '../lib/api'

const FEATURES = [
  { icon: ShieldCheck, label: 'NVIDIA NeMo Guardrails' },
  { icon: Minimize2, label: 'LLMLingua Token Compression' },
  { icon: UserCog, label: 'Role-Based Policy Engine' },
  { icon: FolderUp, label: 'Enterprise File Processing' },
  { icon: ScrollText, label: 'Audit Logging' },
  { icon: ScanSearch, label: 'Prompt Intelligence' },
  { icon: RouteIcon, label: 'Model Routing' },
  { icon: Activity, label: 'Real-Time Risk Scoring' },
]

const SECTIONS = [
  {
    title: 'Every prompt, inspected before the model ever sees it',
    body: 'A twelve-stage guardrail pipeline screens each request for prompt injection, jailbreak framing, PII, credentials and policy violations — redacting, masking or rejecting in milliseconds.',
    stat: '12-stage pipeline',
  },
  {
    title: 'Intelligent token optimization that pays for itself',
    body: 'Semantic compression, duplicate removal and prompt rewriting cut token spend by up to 40% without changing intent — with full before/after transparency on every request.',
    stat: 'Up to 40% saved',
  },
  {
    title: 'Observability that enterprise buyers actually ask for',
    body: 'Live analytics on volume, violations, policy effectiveness, latency and cost savings — plus a complete, exportable audit trail of every event on the platform.',
    stat: '100% audit coverage',
  },
]

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@promptineering.io', password: 'admin123' },
  { label: 'Developer', email: 'ken@promptineering.io', password: 'demo123' },
  { label: 'Finance', email: 'daniel@promptineering.io', password: 'demo123' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { login, user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(creds?.email ?? email, creds?.password ?? password)
      navigate('/apps')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reach the platform')
    } finally {
      setBusy(false)
    }
  }

  // node layout + flowing spline connectors for the feature network
  const parallaxRef = useRef<HTMLDivElement>(null)
  const [par, setPar] = useState({ x: 0, y: 0 })

  const nodes = useMemo(
    () =>
      FEATURES.map((f, i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        // stagger alternating rows and add gentle vertical drift per column
        return {
          ...f,
          x: 13 + col * 24.5 + (row % 2) * 5,
          y: 28 + row * 56 + Math.sin(i * 1.7) * 7,
        }
      }),
    [],
  )

  const splines = useMemo(() => {
    const paths: { id: string; d: string; length: number }[] = []
    nodes.forEach((a, i) =>
      nodes.slice(i + 1).forEach((b, j) => {
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (dist > 46) return
        // cubic Bézier bowed perpendicular to the chord — organic, not rigid
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const nx = -(b.y - a.y) / dist
        const ny = (b.x - a.x) / dist
        const bow = dist * 0.28 * ((i + j) % 2 === 0 ? 1 : -1)
        const c1x = a.x + (mx - a.x) * 0.6 + nx * bow
        const c1y = a.y + (my - a.y) * 0.6 + ny * bow
        const c2x = b.x + (mx - b.x) * 0.6 + nx * bow
        const c2y = b.y + (my - b.y) * 0.6 + ny * bow
        paths.push({
          id: `spline-${i}-${j}`,
          d: `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`,
          length: dist,
        })
      }),
    )
    return paths
  }, [nodes])

  const onParallax = (e: React.MouseEvent) => {
    const rect = parallaxRef.current?.getBoundingClientRect()
    if (!rect) return
    setPar({
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
    })
  }

  return (
    <div className="relative">
      {/* ---------- hero ---------- */}
      <header className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-6 pt-14 lg:flex-row lg:gap-4 lg:pt-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="order-2 shrink-0 lg:order-1"
        >
          <Globe size={560} className="animate-float" />
        </motion.div>

        <div className="order-1 max-w-2xl lg:order-2 lg:pl-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/15 px-4 py-1.5 text-xs font-semibold text-brand-300"
          >
            <Sparkles size={13} />
            Enterprise AI Governance Platform
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl"
          >
            Prompt<span className="gradient-text">ineering</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2"
          >
            Secure AI interactions through enterprise guardrails, policy
            orchestration and intelligent token optimization — one governed
            gateway between your people and every large language model.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.44 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <button
              className="btn-primary"
              onClick={() =>
                document.getElementById(user ? '' : 'login')?.scrollIntoView({ behavior: 'smooth' }) ||
                (user && navigate('/apps'))
              }
            >
              Get Started <ArrowRight size={16} />
            </button>
            <button
              className="btn-ghost"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Learn More
            </button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-ink-3"
          >
            <span><b className="text-ink">NeMo</b> guardrail rails</span>
            <span><b className="text-ink">8</b> enterprise policy suites</span>
            <span><b className="text-ink">LLMLingua</b> compression</span>
            <span><b className="text-ink">SOC2-ready</b> audit trail</span>
          </motion.div>
        </div>
      </header>

      {/* ---------- animated feature network ---------- */}
      <section id="features" className="mx-auto mt-28 max-w-6xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center text-3xl font-bold tracking-tight md:text-4xl"
        >
          One connected governance fabric
        </motion.h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-ink-2">
          NeMo rails, LLMLingua compression, RBAC policy enforcement and audit —
          every capability feeds the next like a living neural network.
        </p>

        <div
          ref={parallaxRef}
          onMouseMove={onParallax}
          onMouseLeave={() => setPar({ x: 0, y: 0 })}
          className="relative mt-12 hidden md:block"
          style={{ height: 360 }}
        >
          <svg
            className="absolute inset-0 h-full w-full transition-transform duration-500 ease-out"
            viewBox="0 0 100 140" preserveAspectRatio="none"
            style={{ transform: `translate(${par.x * 5}px, ${par.y * 5}px)` }}
          >
            <defs>
              <filter id="net-aura" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="1.8" />
              </filter>
              <filter id="net-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="0.55" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="spline-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(57,135,229,0.15)" />
                <stop offset="50%" stopColor="rgba(130,185,255,0.75)" />
                <stop offset="100%" stopColor="rgba(57,135,229,0.15)" />
              </linearGradient>
            </defs>
            {/* soft aura under the splines */}
            <g filter="url(#net-aura)">
              {splines.map((s) => (
                <path key={`aura-${s.id}`} d={s.d} fill="none"
                  stroke="rgba(57,135,229,0.28)" strokeWidth="1.2" />
              ))}
            </g>
            {/* flowing spline strokes */}
            <g filter="url(#net-glow)">
              {splines.map((s) => (
                <path
                  key={s.id} id={s.id} d={s.d} fill="none"
                  stroke="url(#spline-grad)" strokeWidth="0.35"
                  strokeLinecap="round" strokeDasharray="2.4 3"
                  className="dash-flow"
                />
              ))}
            </g>
            {/* particles travelling along the splines */}
            {splines.map((s, i) => (
              <g key={`p-${s.id}`}>
                <circle r="0.7" fill="rgba(158,197,244,0.95)" filter="url(#net-glow)">
                  <animateMotion
                    dur={`${(3.2 + (i % 5) * 1.1).toFixed(1)}s`}
                    repeatCount="indefinite"
                    keyPoints={i % 2 ? '1;0' : '0;1'} keyTimes="0;1"
                    calcMode="linear"
                  >
                    <mpath href={`#${s.id}`} />
                  </animateMotion>
                </circle>
                {i % 3 === 0 && (
                  <circle r="0.45" fill="rgba(109,167,236,0.7)">
                    <animateMotion
                      dur={`${(4.6 + (i % 4) * 1.3).toFixed(1)}s`}
                      repeatCount="indefinite"
                      begin={`${(i % 3) * 0.9}s`}
                      keyPoints={i % 2 ? '0;1' : '1;0'} keyTimes="0;1"
                      calcMode="linear"
                    >
                      <mpath href={`#${s.id}`} />
                    </animateMotion>
                  </circle>
                )}
              </g>
            ))}
            {/* gently pulsing connection nodes */}
            {nodes.map((n, i) => (
              <circle
                key={`dot-${n.label}`} cx={n.x} cy={n.y} r="1.1"
                fill="rgba(130,185,255,0.9)"
                className="node-pulse"
                style={{ animationDelay: `${i * 0.35}s` }}
              />
            ))}
          </svg>
          <div
            className="absolute inset-0 transition-transform duration-500 ease-out"
            style={{ transform: `translate(${par.x * 10}px, ${par.y * 10}px)` }}
          >
            {nodes.map((node, i) => {
              const Icon = node.icon
              return (
                <motion.div
                  key={node.label}
                  initial={{ opacity: 0, scale: 0.6 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 18 }}
                  whileHover={{ y: -4, scale: 1.05 }}
                  className="glass absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full px-4 py-2"
                  style={{ left: `${node.x}%`, top: `${(node.y / 140) * 100}%` }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" style={{ animationDuration: '2.6s', animationDelay: `${i * 0.3}s` }} />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
                  </span>
                  <Icon size={15} className="text-brand-400" />
                  <span className="whitespace-nowrap text-[13px] font-semibold">{node.label}</span>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* mobile fallback grid */}
        <div className="mt-10 grid grid-cols-2 gap-3 md:hidden">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.label} className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
                <Icon size={15} className="text-brand-400" />
                <span className="text-[13px] font-semibold">{f.label}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ---------- feature sections ---------- */}
      <section className="mx-auto mt-28 max-w-5xl space-y-10 px-6">
        {SECTIONS.map((section, i) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.55, delay: i * 0.08 }}
            className={`glass flex flex-col gap-6 rounded-3xl p-8 md:flex-row md:items-center md:p-10 ${
              i % 2 ? 'md:flex-row-reverse' : ''
            }`}
          >
            <div className="flex-1">
              <h3 className="text-2xl font-bold tracking-tight">{section.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-2">{section.body}</p>
            </div>
            <div className="shrink-0 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-800 px-8 py-6 text-center text-white shadow-lg">
              <div className="text-2xl font-extrabold">{section.stat.split(' ')[0]}</div>
              <div className="mt-1 text-xs font-medium opacity-85">
                {section.stat.split(' ').slice(1).join(' ')}
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      {/* ---------- login ---------- */}
      <section id="login" className="mx-auto mt-28 flex max-w-6xl flex-col items-center px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          className="glass-strong w-full max-w-md rounded-3xl p-8"
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow">
              <Lock size={17} />
            </span>
            <div>
              <h3 className="text-lg font-bold">Sign in to the console</h3>
              <p className="text-xs text-ink-3">Role-based access, JWT-secured</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <input
              className="field"
              type="email"
              placeholder="Work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
            <input
              className="field"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <div className="flex items-center justify-between text-xs text-ink-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="accent-brand-600"
                />
                Remember me
              </label>
              <button type="button" className="font-medium text-brand-400 hover:underline">
                Forgot password?
              </button>
            </div>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300"
              >
                {error}
              </motion.p>
            )}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {busy ? 'Authenticating…' : 'Login'}
            </button>
          </form>

          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              Demo accounts
            </p>
            <div className="flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.label}
                  onClick={() => submit(undefined, account)}
                  disabled={busy}
                  className="rounded-full border border-brand-500/40 bg-brand-500/15 px-3 py-1 text-[11px] font-semibold text-brand-300 transition hover:bg-brand-500/30"
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
        <p className="mt-10 text-xs text-ink-3">
          Promptineering · Enterprise AI Governance, Prompt Security & Intelligent Token Optimization
        </p>
      </section>
    </div>
  )
}
