import { create } from 'zustand'
import { api, setToken, getToken, type AppDef, type Policy, type User } from '../lib/api'

interface AuthState {
  user: User | null
  applications: AppDef[]
  policies: Policy[]
  activePolicy: Policy | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  bootstrap: () => Promise<void>
  logout: () => void
  setActivePolicy: (policy: Policy) => void
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  applications: [],
  policies: [],
  activePolicy: null,
  ready: false,

  login: async (email, password) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/login', {
      email,
      password,
    })
    setToken(res.token)
    set({ user: res.user })
    await get().bootstrap()
  },

  bootstrap: async () => {
    if (!getToken()) {
      set({ ready: true })
      return
    }
    try {
      const res = await api.get<{
        user: User
        applications: AppDef[]
        policies: Policy[]
        active_policy: Policy | null
      }>('/api/auth/bootstrap')
      set({
        user: res.user,
        applications: res.applications,
        policies: res.policies,
        activePolicy: res.active_policy ?? res.policies[0] ?? null,
        ready: true,
      })
    } catch {
      setToken(null)
      set({ user: null, ready: true })
    }
  },

  logout: () => {
    setToken(null)
    set({ user: null, applications: [], policies: [], activePolicy: null })
  },

  setActivePolicy: (policy) => set({ activePolicy: policy }),
}))
