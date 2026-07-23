import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MessageSquare, Users, ShieldCheck, BarChart3, ScrollText, LogOut,
  LayoutGrid,
} from 'lucide-react'
import { useAuth } from '../store/auth'

const ITEMS = [
  { key: '/apps', label: 'Apps', icon: LayoutGrid, adminOnly: false },
  { key: '/chat', label: 'Chat', icon: MessageSquare, adminOnly: false },
  { key: '/admin/users', label: 'Users', icon: Users, adminOnly: true },
  { key: '/admin/policies', label: 'Policies', icon: ShieldCheck, adminOnly: true },
  { key: '/admin/analytics', label: 'Analytics', icon: BarChart3, adminOnly: true },
  { key: '/admin/audit', label: 'Audit Logs', icon: ScrollText, adminOnly: true },
]

export default function NavIsland() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      setCollapsed(window.scrollY > 80 && window.scrollY > lastY)
      lastY = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!user) return null
  const isAdmin = user.authority === 'admin' || user.authority === 'manager'
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin)
  const compact = collapsed && !hovered

  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fixed top-4 left-1/2 z-50 -translate-x-1/2"
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="glass-strong flex items-center gap-1 rounded-full px-2 py-1.5"
      >
        <div className="mr-1 flex items-center gap-2 pl-2 pr-1">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[11px] font-bold text-white shadow">
            P
          </span>
          {!compact && (
            <span className="hidden text-sm font-bold tracking-tight sm:block">
              Promptineering
            </span>
          )}
        </div>

        {items.map((item) => {
          const active = location.pathname.startsWith(item.key)
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.key)}
              title={item.label}
              className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                active ? 'text-white' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 shadow"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon size={15} className="relative z-10" />
              {!compact && <span className="relative z-10 hidden md:block">{item.label}</span>}
            </button>
          )
        })}

        <div className="mx-1 h-5 w-px bg-white/15" />
        <button
          onClick={() => {
            logout()
            navigate('/')
          }}
          title="Logout"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-red-400"
        >
          <LogOut size={15} />
          {!compact && <span className="hidden md:block">Logout</span>}
        </button>
      </motion.div>
    </motion.nav>
  )
}
