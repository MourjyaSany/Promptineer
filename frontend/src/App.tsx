import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Background from './components/Background'
import NavIsland from './components/NavIsland'
import { useAuth } from './store/auth'
import Landing from './pages/Landing'
import AppSelect from './pages/AppSelect'
import Workspace from './pages/Workspace'
import UsersPage from './pages/admin/Users'
import PoliciesPage from './pages/admin/Policies'
import AnalyticsPage from './pages/admin/Analytics'
import AuditPage from './pages/admin/Audit'

function Protected({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (!user) return <Navigate to="/" replace />
  if (adminOnly && user.authority !== 'admin' && user.authority !== 'manager') return <Navigate to="/apps" replace />
  return <>{children}</>
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap)
  const ready = useAuth((s) => s.ready)
  const location = useLocation()

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  return (
    <>
      <Background />
      {location.pathname !== '/' && <NavIsland />}
      {ready && (
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Landing />} />
            <Route path="/apps" element={<Protected><AppSelect /></Protected>} />
            <Route path="/chat" element={<Protected><Workspace /></Protected>} />
            <Route path="/chat/:appKey" element={<Protected><Workspace /></Protected>} />
            <Route path="/admin/users" element={<Protected adminOnly><UsersPage /></Protected>} />
            <Route path="/admin/policies" element={<Protected adminOnly><PoliciesPage /></Protected>} />
            <Route path="/admin/analytics" element={<Protected adminOnly><AnalyticsPage /></Protected>} />
            <Route path="/admin/audit" element={<Protected adminOnly><AuditPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      )}
    </>
  )
}
