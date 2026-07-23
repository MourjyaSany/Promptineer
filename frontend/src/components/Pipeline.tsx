import { motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, ShieldX, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { Stage } from '../lib/api'

const STATUS_STYLES = {
  pass: { icon: CheckCircle2, color: 'text-[--status-good]', chip: 'bg-green-500/12 border-green-500/30 text-green-400', label: 'Pass' },
  warning: { icon: AlertTriangle, color: 'text-[--status-warning]', chip: 'bg-amber-500/12 border-amber-500/30 text-amber-300', label: 'Warning' },
  blocked: { icon: ShieldX, color: 'text-[--status-critical]', chip: 'bg-red-500/12 border-red-500/30 text-red-300', label: 'Blocked' },
} as const

export default function Pipeline({ stages }: { stages: Stage[] }) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div className="relative">
      <div className="absolute bottom-3 left-[13px] top-3 w-px bg-gradient-to-b from-brand-500/30 via-brand-400/50 to-brand-500/30" />
      <div className="space-y-1">
        {stages.map((stage, i) => {
          const style = STATUS_STYLES[stage.result.status] ?? STATUS_STYLES.pass
          const Icon = style.icon
          const expanded = open === i
          return (
            <motion.div
              key={stage.name + i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <button
                onClick={() => setOpen(expanded ? null : i)}
                className="relative flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-brand-500/12"
              >
                <span className="relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#26272b] shadow-sm ring-1 ring-white/15">
                  <Icon size={14} className={style.color} />
                </span>
                <span className="flex-1 truncate text-[12.5px] font-semibold">{stage.name}</span>
                <span className="text-[10px] tabular-nums text-ink-3">
                  {stage.result.time_ms}ms
                </span>
                <ChevronDown
                  size={12}
                  className={`text-ink-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="ml-9 overflow-hidden"
                >
                  <div className="mb-2 rounded-xl border border-white/10 bg-white/6 p-3 text-[12px]">
                    <span className={`mb-1.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.chip}`}>
                      {style.label}
                      {stage.result.confidence > 0 &&
                        ` · ${Math.round(stage.result.confidence * 100)}%`}
                    </span>
                    <p className="text-ink-2">{stage.result.reason}</p>
                    <p className="mt-1 text-[11px] text-ink-3">
                      → {stage.result.recommendation}
                    </p>
                    {stage.engine && (
                      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                        Engine: {stage.engine}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
