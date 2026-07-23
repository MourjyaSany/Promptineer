import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, HeartPulse, Landmark, GraduationCap, Code, Briefcase, Plane,
  Utensils, Scale, FlaskConical, Megaphone, Headset, BarChart3, Sparkles,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../store/auth'

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  users: Users, 'heart-pulse': HeartPulse, landmark: Landmark,
  'graduation-cap': GraduationCap, code: Code, briefcase: Briefcase,
  plane: Plane, utensils: Utensils, scale: Scale,
  'flask-conical': FlaskConical, megaphone: Megaphone, headset: Headset,
  'bar-chart-3': BarChart3, sparkles: Sparkles,
}

export default function AppSelect() {
  const navigate = useNavigate()
  const { applications, user } = useAuth()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto max-w-6xl px-6 pb-20 pt-28"
    >
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm font-semibold text-brand-400">
          Welcome back, {user?.name?.split(' ')[0]}
        </p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">
          Choose your workspace
        </h1>
        <p className="mt-2 max-w-xl text-ink-2">
          Each workspace carries its own system prompt, guardrail emphasis and
          token strategy behind the pipeline
          {user?.policy_name ? <> — your default suite is <b>{user.policy_name}</b>.</> : '.'}
        </p>
      </motion.div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {applications.map((app, i) => {
          const Icon = ICONS[app.icon] ?? Sparkles
          const accent = app.accent || '#3987e5'
          const profileNote = app.guardrail_profile?.notes
          return (
            <motion.button
              key={app.key}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.04, type: 'spring', stiffness: 200, damping: 20 }}
              whileHover={{ y: -6, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(`/chat/${app.key}`)}
              className="glass group rounded-3xl p-6 text-left transition-shadow hover:shadow-xl"
            >
              <span
                className="grid h-11 w-11 place-items-center rounded-2xl transition-colors"
                style={{ background: `${accent}26`, color: accent }}
              >
                <Icon size={20} />
              </span>
              <h3 className="mt-4 text-lg font-bold tracking-tight">{app.name}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                {app.description}
              </p>
              {profileNote && (
                <p className="mt-3 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide"
                  style={{ color: accent }}>
                  <ShieldCheck size={11} /> {profileNote}
                </p>
              )}
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}
