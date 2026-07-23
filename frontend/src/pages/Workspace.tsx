import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Send, ShieldCheck, Gauge, Coins, Timer, ChevronDown, Copy, Check,
  ShieldX, Paperclip, Sparkles, FileDown, FileText, FileCode2, FileSpreadsheet,
  FileArchive, FileImage, FileAudio, FileVideo, X, Download, UploadCloud,
  PiggyBank, Zap,
} from 'lucide-react'
import Globe from '../components/Globe'
import Markdown from '../components/Markdown'
import Pipeline from '../components/Pipeline'
import {
  api, downloadFileUrl, uploadFiles, type ChatResult, type FileMeta,
} from '../lib/api'
import { useAuth } from '../store/auth'

interface Message {
  role: 'user' | 'assistant'
  content: string
  result?: ChatResult
  blocked?: boolean
  attachments?: string[]
}

interface Attachment {
  localId: number
  name: string
  size: number
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
  meta?: FileMeta
  cancel?: () => void
}

const RISK_COLORS: Record<string, string> = {
  low: 'text-green-400 bg-green-500/12 border-green-500/30',
  medium: 'text-amber-300 bg-amber-500/12 border-amber-500/30',
  high: 'text-orange-300 bg-orange-500/12 border-orange-500/30',
  critical: 'text-red-300 bg-red-500/12 border-red-500/30',
}

const KIND_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  document: FileText, data: FileSpreadsheet, code: FileCode2,
  archive: FileArchive, image: FileImage, audio: FileAudio, video: FileVideo,
}

function fileKindOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['csv', 'xlsx', 'xls', 'json', 'xml', 'yaml', 'yml'].includes(ext)) return 'data'
  if (['zip'].includes(ext)) return 'archive'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio'
  if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) return 'video'
  if (['py', 'java', 'cpp', 'cc', 'c', 'h', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'sql', 'sh', 'ps1', 'go', 'rs', 'rb'].includes(ext)) return 'code'
  return 'document'
}

function prettySize(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

let attachmentSeq = 1

export default function Workspace() {
  const { appKey = 'general' } = useParams()
  const { user, applications, policies, activePolicy, setActivePolicy } = useAuth()
  const app = applications.find((a) => a.key === appKey)
  const accent = app?.accent || '#3987e5'

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [temperature, setTemperature] = useState(0.5)
  const [latest, setLatest] = useState<ChatResult | null>(null)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<FileMeta | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  useEffect(() => { setAttachments([]) }, [appKey])

  const tokenEstimate = Math.max(1, Math.round(input.length / 4))
  const costEstimate = ((tokenEstimate / 1_000_000) * 5).toFixed(5)
  const qualityScore = Math.min(
    98,
    40 + Math.min(input.length / 6, 40) + (input.includes('?') ? 8 : 0) + (/\b(step|format|example|context)\b/i.test(input) ? 10 : 0),
  ).toFixed(0)

  /* ---------- uploads ---------- */

  const startUploads = (files: File[]) => {
    files.forEach((file) => {
      const localId = attachmentSeq++
      const entry: Attachment = {
        localId, name: file.name, size: file.size, progress: 0, status: 'uploading',
      }
      const handle = uploadFiles([file], appKey, (pct) =>
        setAttachments((list) => list.map((a) =>
          a.localId === localId ? { ...a, progress: pct } : a)))
      entry.cancel = handle.cancel
      setAttachments((list) => [...list, entry])
      handle.promise
        .then((r) => setAttachments((list) => list.map((a) =>
          a.localId === localId
            ? { ...a, status: 'done', progress: 100, meta: r.items[0] }
            : a)))
        .catch((e) => setAttachments((list) =>
          e?.message === 'Upload cancelled'
            ? list.filter((a) => a.localId !== localId)
            : list.map((a) => a.localId === localId
              ? { ...a, status: 'error', error: e?.message ?? 'Upload failed' }
              : a)))
    })
  }

  const removeAttachment = async (a: Attachment) => {
    if (a.status === 'uploading') { a.cancel?.(); return }
    setAttachments((list) => list.filter((x) => x.localId !== a.localId))
    if (a.meta) { try { await api.delete(`/api/files/${a.meta.id}`) } catch { /* already gone */ } }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (e.dataTransfer.files.length) startUploads([...e.dataTransfer.files])
  }

  /* ---------- chat ---------- */

  const send = async () => {
    const text = input.trim()
    if (!text || thinking) return
    if (attachments.some((a) => a.status === 'uploading')) return
    const ready = attachments.filter((a) => a.status === 'done' && a.meta)
    setInput('')
    setMessages((m) => [...m, {
      role: 'user', content: text,
      attachments: ready.map((a) => a.name),
    }])
    setAttachments([])
    setThinking(true)
    try {
      const result = await api.post<ChatResult>('/api/chat', {
        message: text,
        application: appKey,
        policy_id: activePolicy?.id,
        temperature,
        file_ids: ready.map((a) => a.meta!.id),
      })
      setLatest(result)
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: result.blocked
            ? `**Request blocked by ${result.explanation?.blocked_by ?? 'guardrails'}.**\n\n> ${result.blocked_reason}\n\n${result.explanation?.recommendation ? `_Recommendation: ${result.explanation.recommendation}_\n\n` : ''}The full decision trail is in the System Intelligence panel.`
            : result.response,
          result,
          blocked: result.blocked,
        },
      ])
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `**Platform error:** ${err instanceof Error ? err.message : 'unknown'}`, blocked: true },
      ])
    } finally {
      setThinking(false)
    }
  }

  const copy = (i: number, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(i)
    setTimeout(() => setCopied(null), 1400)
  }

  const download = (text: string) => {
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'promptineering-response.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  const guardStatus = latest
    ? latest.blocked
      ? 'Blocked'
      : latest.stages.some((s) => s.result.status === 'warning')
        ? 'Warnings'
        : 'Clean'
    : 'Armed'

  const examples = app?.example_prompts?.length
    ? app.example_prompts
    : ['Summarize our Q3 revenue drivers', 'Draft an onboarding checklist', 'My email is jane.doe@acme.com — draft a reply']

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex h-screen max-w-[1700px] flex-col px-4 pb-4 pt-20"
    >
      {/* ---------- toolbar ---------- */}
      <div className="glass z-20 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-2.5 text-[12.5px]">
        <span className="flex items-center gap-1.5 font-bold">
          <Sparkles size={14} style={{ color: accent }} />
          {app?.name ?? 'General'}
        </span>
        <span className="h-4 w-px bg-white/12" />

        {/* policy dropdown */}
        <div className="relative">
          <button
            onClick={() => setPolicyOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/8 px-2.5 py-1 font-semibold transition hover:border-brand-300"
          >
            <ShieldCheck size={13} className="text-brand-400" />
            {activePolicy?.name ?? 'No policy'}
            <ChevronDown size={12} className={policyOpen ? 'rotate-180 transition' : 'transition'} />
          </button>
          <AnimatePresence>
            {policyOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                className="glass-strong absolute left-0 top-9 z-40 w-72 rounded-2xl p-2"
              >
                {policies.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setActivePolicy(p); setPolicyOpen(false) }}
                    className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-brand-500/15 ${
                      p.id === activePolicy?.id ? 'bg-brand-500/20' : ''
                    }`}
                  >
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      p.risk_level === 'critical' ? 'bg-[--status-critical]'
                      : p.risk_level === 'high' ? 'bg-[--status-serious]'
                      : p.risk_level === 'medium' ? 'bg-[--status-warning]'
                      : 'bg-[--status-good]'
                    }`} />
                    <span>
                      <span className="block text-[12.5px] font-bold">{p.name}</span>
                      <span className="block text-[11px] leading-snug text-ink-3">{p.description}</span>
                      {app?.suggested_policies?.includes(p.name) && (
                        <span className="mt-0.5 inline-block rounded-full bg-brand-500/20 px-1.5 py-px text-[9.5px] font-bold uppercase text-brand-300">
                          Suggested here
                        </span>
                      )}
                    </span>
                  </button>
                ))}
                {policies.length === 0 && (
                  <p className="px-3 py-2 text-[12px] text-ink-3">
                    No policy suites available for your authority level.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span className="rounded-full border border-brand-500/40 bg-brand-500/15 px-2.5 py-0.5 font-semibold text-brand-300">
          {user?.role}
        </span>
        <span className="hidden items-center gap-1 text-ink-2 lg:flex">
          Model: <b className="text-ink">{latest?.model?.split(' ')[0] ?? 'auto-routed'}</b>
        </span>

        <label className="hidden items-center gap-2 text-ink-2 xl:flex">
          Temp
          <input
            type="range" min={0} max={activePolicy?.temperature_limit ?? 1} step={0.1}
            value={Math.min(temperature, activePolicy?.temperature_limit ?? 1)}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-20 accent-brand-600"
          />
          <b className="w-6 text-ink tabular-nums">{Math.min(temperature, activePolicy?.temperature_limit ?? 1).toFixed(1)}</b>
        </label>

        <span className="ml-auto hidden items-center gap-1 text-ink-2 md:flex">
          <Coins size={13} /> {latest ? `${latest.intelligence.tokens_in + latest.intelligence.tokens_out} tok` : '— tok'}
        </span>
        <span className="hidden items-center gap-1 text-ink-2 md:flex">
          <Timer size={13} /> {latest ? `${latest.intelligence.latency_ms}ms` : '— ms'}
        </span>
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-bold ${
          guardStatus === 'Blocked' ? RISK_COLORS.critical
          : guardStatus === 'Warnings' ? RISK_COLORS.medium
          : RISK_COLORS.low
        }`}>
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-current" />
          Guardrails: {guardStatus}
        </span>
      </div>

      {/* ---------- 3-column body ---------- */}
      <div className="mt-3 flex min-h-0 flex-1 gap-3">
        {/* globe */}
        <div className="hidden w-[340px] shrink-0 flex-col items-center justify-center xl:flex">
          <Globe mode={thinking ? 'thinking' : 'idle'} size={335} />
          <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-widest text-ink-3">
            {thinking ? 'Processing pipeline…' : 'Governance core idle'}
          </p>
        </div>

        {/* chat */}
        <div
          className="glass relative flex min-w-0 flex-1 flex-col rounded-3xl"
          onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false) }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 grid place-items-center rounded-3xl border-2 border-dashed bg-black/40 backdrop-blur-sm"
                style={{ borderColor: accent }}
              >
                <div className="text-center">
                  <UploadCloud size={38} className="mx-auto" style={{ color: accent }} />
                  <p className="mt-2 text-[14px] font-bold">Drop files to attach</p>
                  <p className="text-[11.5px] text-ink-3">
                    Policy limit: {activePolicy?.upload_max_mb ?? 25} MB per file
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={scrollRef} className="scroll-thin flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Globe mode="idle" size={200} className="xl:hidden" />
                <h3 className="text-xl font-bold">Governed {app?.name ?? ''} workspace</h3>
                <p className="mt-2 max-w-sm text-sm text-ink-2">
                  {app?.description || 'Every message passes injection, PII, secret and compliance screening plus token optimization before reaching the model.'}
                </p>
                <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
                  {examples.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="rounded-full border bg-white/8 px-3 py-1.5 text-[12px] font-medium transition hover:bg-white/14"
                      style={{ borderColor: `${accent}66`, color: accent }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((message, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.35 }}
                  className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  {message.role === 'user' ? (
                    <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-gradient-to-br from-brand-500 to-brand-700 px-5 py-3 text-[14px] leading-relaxed text-white shadow-md">
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {message.attachments.map((name) => (
                            <span key={name} className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-semibold">
                              <Paperclip size={10} /> {name}
                            </span>
                          ))}
                        </div>
                      )}
                      {message.content}
                    </div>
                  ) : (
                    <div className={`max-w-[92%] rounded-3xl rounded-bl-lg border px-5 py-4 shadow-sm ${
                      message.blocked ? 'border-red-500/30 bg-red-500/10' : 'border-white/10 bg-white/7'
                    }`}>
                      {message.blocked && (
                        <span className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-400">
                          <ShieldX size={13} /> Guardrail intervention
                        </span>
                      )}
                      <Markdown>{message.content}</Markdown>
                      {!message.blocked && (
                        <div className="mt-3 flex items-center gap-2 border-t border-white/8 pt-2.5">
                          {message.result && (
                            <span className="text-[10.5px] text-ink-3">
                              {message.result.model} · {message.result.intelligence.latency_ms}ms
                            </span>
                          )}
                          <span className="flex-1" />
                          <button
                            onClick={() => copy(i, message.content)}
                            className="rounded-lg p-1.5 text-ink-3 transition hover:bg-brand-500/15 hover:text-brand-300"
                            title="Copy"
                          >
                            {copied === i ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                          <button
                            onClick={() => download(message.content)}
                            className="rounded-lg p-1.5 text-ink-3 transition hover:bg-brand-500/15 hover:text-brand-300"
                            title="Download as Markdown"
                          >
                            <FileDown size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {thinking && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-lg border border-white/10 bg-white/7 px-5 py-4">
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="h-2 w-2 rounded-full bg-brand-500"
                      animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ repeat: Infinity, duration: 0.9, delay: d * 0.15 }}
                    />
                  ))}
                  <span className="ml-2 text-[12px] font-medium text-ink-2">
                    Running guardrail pipeline…
                  </span>
                </div>
              </motion.div>
            )}
          </div>

          {/* input */}
          <div className="border-t border-white/8 p-4">
            {/* attachment tray */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-2 flex flex-wrap gap-2 overflow-hidden"
                >
                  {attachments.map((a) => {
                    const kind = a.meta?.kind ?? fileKindOf(a.name)
                    const Icon = KIND_ICONS[kind] ?? FileText
                    return (
                      <div key={a.localId}
                        className={`relative flex w-56 items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-2 text-[11.5px] ${
                          a.status === 'error' ? 'border-red-500/40 bg-red-500/10' : 'border-white/12 bg-white/7'
                        }`}>
                        {a.status === 'uploading' && (
                          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
                            <span className="block h-full transition-all"
                              style={{ width: `${a.progress}%`, background: accent }} />
                          </span>
                        )}
                        <Icon size={16} className="shrink-0" style={{ color: accent }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{a.name}</span>
                          <span className="block text-[10px] text-ink-3">
                            {a.status === 'uploading' ? `Uploading ${a.progress}%`
                              : a.status === 'error' ? (a.error ?? 'Failed')
                              : `${prettySize(a.size)} · ${kind}`}
                          </span>
                        </span>
                        {a.status === 'done' && a.meta && (
                          <>
                            {(kind === 'image' || kind === 'document' || kind === 'code' || kind === 'data') && (
                              <button className="rounded p-1 text-ink-3 hover:text-brand-300" title="Preview"
                                onClick={() => setPreview(a.meta!)}>
                                <FileText size={12} />
                              </button>
                            )}
                            <a className="rounded p-1 text-ink-3 hover:text-brand-300" title="Download"
                              href={downloadFileUrl(a.meta.id)} download={a.name}>
                              <Download size={12} />
                            </a>
                          </>
                        )}
                        <button className="rounded p-1 text-ink-3 hover:text-red-400"
                          title={a.status === 'uploading' ? 'Cancel upload' : 'Remove'}
                          onClick={() => removeAttachment(a)}>
                          <X size={12} />
                        </button>
                      </div>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="rounded-2xl border border-white/12 bg-white/6 p-3 transition focus-within:border-brand-400 focus-within:shadow-[0_0_0_3px_rgba(42,120,214,0.15)]">
              <textarea
                className="scroll-thin max-h-36 w-full resize-none bg-transparent text-[14px] outline-none placeholder:text-ink-3"
                rows={2}
                placeholder={`Message the ${app?.name ?? 'governed'} assistant…  ( / for commands )`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-3">
                <input ref={fileInputRef} type="file" multiple className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) startUploads([...e.target.files])
                    e.target.value = ''
                  }} />
                <button
                  className="rounded-lg p-1 transition hover:bg-brand-500/15 hover:text-brand-300"
                  title={`Attach files (policy limit ${activePolicy?.upload_max_mb ?? 25} MB)`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={14} />
                </button>
                <span className="flex items-center gap-1"><Coins size={11} /> ~{tokenEstimate} tok</span>
                <span>${costEstimate}</span>
                <span className="hidden items-center gap-1 sm:flex">
                  <Gauge size={11} /> Quality {input ? qualityScore : '—'}
                </span>
                <span className="flex-1" />
                <button onClick={send}
                  disabled={!input.trim() || thinking || attachments.some((a) => a.status === 'uploading')}
                  className="btn-primary !rounded-xl !px-4 !py-2">
                  <Send size={14} />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* intelligence panel */}
        <div className="glass scroll-thin hidden w-[360px] shrink-0 overflow-y-auto rounded-3xl p-4 lg:block">
          <h3 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wider text-ink-2">
            <ShieldCheck size={15} className="text-brand-400" /> System Intelligence
          </h3>

          {!latest ? (
            <p className="mt-6 text-[13px] leading-relaxed text-ink-3">
              Send a prompt to watch the guardrail pipeline execute stage by
              stage — NeMo rails screening, PII redaction, secret masking,
              LLMLingua compression and policy-aware routing.
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Risk score" value={`${latest.intelligence.risk_score}`}
                  chip={latest.intelligence.risk_level} chipClass={RISK_COLORS[latest.intelligence.risk_level]} />
                <Metric label="Compression" value={`${latest.intelligence.compression_pct}%`}
                  chip={latest.intelligence.compression_level} chipClass="border-brand-500/40 bg-brand-500/12 text-brand-300" />
                <Metric label="Tokens saved" value={`${latest.intelligence.tokens_saved}`} />
                <Metric label="Latency" value={`${latest.intelligence.latency_ms}ms`} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-2.5">
                  <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-green-400">
                    <PiggyBank size={11} /> Est. cost saved
                  </p>
                  <p className="mt-0.5 text-lg font-extrabold text-green-300">
                    ${latest.intelligence.est_cost_saved_usd.toFixed(4)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/8 p-2.5">
                  <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-ink-3">
                    <Zap size={11} /> Latency gain
                  </p>
                  <p className="mt-0.5 text-lg font-extrabold">
                    −{latest.intelligence.est_latency_saved_ms}ms
                  </p>
                </div>
              </div>

              <section>
                <PanelHeading>Pipeline</PanelHeading>
                <Pipeline stages={latest.stages} />
              </section>

              <section>
                <PanelHeading>Prompt optimization</PanelHeading>
                <div className="space-y-2 text-[12px]">
                  <div className="rounded-xl border border-white/10 bg-white/8 p-2.5">
                    <p className="mb-1 text-[10px] font-bold uppercase text-ink-3">Original ({latest.intelligence.tokens_in} tok)</p>
                    <p className="text-ink-2">{latest.intelligence.original_prompt}</p>
                  </div>
                  <div className="rounded-xl border border-brand-500/40 bg-brand-500/12 p-2.5">
                    <p className="mb-1 text-[10px] font-bold uppercase text-brand-300">
                      Optimized (−{latest.intelligence.tokens_saved} tok)
                    </p>
                    <p className="text-ink-2">{latest.intelligence.optimized_prompt}</p>
                  </div>
                  {latest.intelligence.removed.length > 0 && (
                    <p className="text-[11px] text-ink-3">
                      Removed: {latest.intelligence.removed.slice(0, 5).map((r) => `“${r}”`).join(', ')}
                    </p>
                  )}
                </div>
              </section>

              {(latest.intelligence.pii.length > 0 || latest.intelligence.secrets.length > 0 || (latest.intelligence.financial?.length ?? 0) > 0) && (
                <section>
                  <PanelHeading>Redactions</PanelHeading>
                  <div className="space-y-1.5">
                    {latest.intelligence.pii.map((p, i) => (
                      <Finding key={`p${i}`} kind={p.type} value={p.value} tone="amber" />
                    ))}
                    {latest.intelligence.secrets.map((s, i) => (
                      <Finding key={`s${i}`} kind={s.type} value={s.value} tone="red" />
                    ))}
                    {(latest.intelligence.financial ?? []).map((f, i) => (
                      <Finding key={`f${i}`} kind={f.type} value={f.value} tone="amber" />
                    ))}
                  </div>
                </section>
              )}

              {latest.intelligence.attachments?.length > 0 && (
                <section>
                  <PanelHeading>Attachments processed</PanelHeading>
                  <div className="space-y-1">
                    {latest.intelligence.attachments.map((name) => (
                      <p key={name} className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
                        <Paperclip size={11} className="text-ink-3" /> {name}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-xl border border-white/10 bg-white/8 p-3 text-[12px] text-ink-2">
                <PanelHeading>Reasoning</PanelHeading>
                Policy <b>{latest.intelligence.policy}</b> governed this request.{' '}
                {latest.blocked
                  ? `${latest.explanation?.blocked_by ?? 'A guardrail'} rejected the prompt before model access; no tokens were spent on inference.`
                  : `${latest.intelligence.engines?.optimizer.engine ?? 'The optimizer'} removed ${latest.intelligence.tokens_saved} tokens (${latest.intelligence.compression_pct}%) and the router selected ${latest.model} for this workload.`}
              </section>

              {latest.intelligence.engines && (
                <section className="flex flex-wrap gap-1.5">
                  <EngineChip label={`Rails: ${latest.intelligence.engines.rails.framework}`} />
                  <EngineChip label={`Optimizer: ${latest.intelligence.engines.optimizer.engine}`} />
                  <EngineChip label={`Provider: ${latest.intelligence.engines.provider}`} />
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------- file preview modal ---------- */}
      <AnimatePresence>
        {preview && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setPreview(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-strong fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl p-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="truncate pr-4 font-extrabold">{preview.original_name}</h3>
                <button className="rounded-lg p-1.5 hover:bg-white/8" onClick={() => setPreview(null)}><X size={16} /></button>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-3">
                {preview.kind} · {prettySize(preview.size_bytes)} · sha256 {preview.sha256.slice(0, 16)}…
              </p>
              <div className="scroll-thin mt-3 max-h-[58vh] overflow-auto rounded-xl border border-white/10 bg-black/25 p-3">
                {preview.kind === 'image' ? (
                  <img src={downloadFileUrl(preview.id)} alt={preview.original_name}
                    className="mx-auto max-h-[52vh] rounded-lg object-contain" />
                ) : (
                  <TextPreview file={preview} />
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <a className="btn-ghost !px-4 !py-2 text-[12.5px]" href={downloadFileUrl(preview.id)} download={preview.original_name}>
                  <Download size={13} /> Download
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function TextPreview({ file }: { file: FileMeta }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    fetch(downloadFileUrl(file.id), {
      headers: { Authorization: `Bearer ${localStorage.getItem('promptineering.token') ?? ''}` },
    })
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => setText(t.slice(0, 20000)))
      .catch(() => setError(true))
  }, [file.id])
  if (error) return <p className="text-[12px] text-ink-3">Preview not available for this file type.</p>
  if (text === null) return <p className="text-[12px] text-ink-3">Loading preview…</p>
  return <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-ink-2">{text}</pre>
}

function EngineChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/12 bg-white/7 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
      {label}
    </span>
  )
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10.5px] font-extrabold uppercase tracking-widest text-ink-3">
      {children}
    </p>
  )
}

function Metric({ label, value, chip, chipClass }: {
  label: string; value: string; chip?: string; chipClass?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/8 p-2.5">
      <p className="text-[10px] font-bold uppercase text-ink-3">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-lg font-extrabold">
        {value}
        {chip && (
          <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase ${chipClass}`}>
            {chip}
          </span>
        )}
      </p>
    </div>
  )
}

function Finding({ kind, value, tone }: { kind: string; value: string; tone: 'amber' | 'red' }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11.5px] ${
      tone === 'red' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    }`}>
      <span className="font-bold">{kind}</span>
      <span className="truncate pl-2 font-mono opacity-80">{value}</span>
    </div>
  )
}
