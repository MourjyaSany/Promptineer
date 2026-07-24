const TOKEN_KEY = 'promptineering.token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(path, { ...options, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string'
        ? body.detail
        : Array.isArray(body.detail)
          ? body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ')
          : detail
    } catch { /* non-JSON error body */ }
    if (res.status === 401) setToken(null)
    throw new ApiError(res.status, detail)
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/* ---------- file uploads (XHR for progress + cancel) ---------- */

export interface UploadHandle {
  promise: Promise<{ items: FileMeta[] }>
  cancel: () => void
}

export function uploadFiles(
  files: File[],
  application: string,
  onProgress: (pct: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<{ items: FileMeta[] }>((resolve, reject) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('application', application)
    xhr.open('POST', '/api/files/upload')
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText))
      else {
        let detail = xhr.statusText
        try { detail = JSON.parse(xhr.responseText).detail ?? detail } catch { /* noop */ }
        reject(new ApiError(xhr.status, detail))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed'))
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled'))
    xhr.send(form)
  })
  return { promise, cancel: () => xhr.abort() }
}

export function downloadFileUrl(id: number) {
  const token = getToken()
  return `/api/files/${id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

/* ---------- shared types ---------- */

export type Authority = 'intern' | 'employee' | 'senior' | 'manager' | 'director' | 'admin'

export interface User {
  id: number
  name: string
  username: string | null
  email: string
  employee_id: string
  role: string
  department: string
  authority: Authority
  policy_id: number | null
  policy_name: string | null
  status: string
  notes: string
  must_change_password: boolean
  storage_used_mb: number
  created_at: string | null
  last_login: string | null
  prompts?: number
  total_tokens?: number
  violations?: number
}

export interface Policy {
  id: number
  name: string
  description: string
  category: string
  risk_level: string
  roles: string[]
  authority_levels: Authority[]
  applications: string[]
  guardrails: Record<string, boolean>
  rails_config: Record<string, boolean>
  blocked_topics: string[]
  compliance_tags: string[]
  allowed_file_types: string[]
  allowed_models: string[]
  tool_permissions: string[]
  max_tokens: number
  compression_level: string
  compression_target: number
  upload_max_mb: number
  logging_level: string
  response_strictness: string
  temperature_limit: number
  enabled: boolean
  usage_count?: number
}

export interface AppDef {
  id: number
  key: string
  name: string
  description: string
  icon: string
  accent: string
  system_prompt: string
  guardrail_profile: Record<string, string>
  suggested_policies: string[]
  token_strategy: string
  example_prompts: string[]
}

export interface FileMeta {
  id: number
  user_id: number
  user_name: string | null
  application: string
  prompt_log_id: number | null
  original_name: string
  ext: string
  kind: 'document' | 'data' | 'code' | 'image' | 'audio' | 'video' | 'archive'
  mime_type: string
  size_bytes: number
  sha256: string
  status: string
  created_at: string | null
}

export interface StageResult {
  status: 'pass' | 'warning' | 'blocked'
  confidence: number
  reason: string
  findings: unknown[]
  recommendation: string
  time_ms: number
}

export interface Stage {
  name: string
  engine?: string
  result: StageResult
}

export interface Intelligence {
  original_prompt: string
  optimized_prompt: string
  removed: string[]
  pii: { type: string; value: string }[]
  secrets: { type: string; value: string }[]
  financial: { type: string; value: string }[]
  tokens_in: number
  tokens_out: number
  tokens_saved: number
  compression_pct: number
  compression_level: string
  est_cost_saved_usd: number
  est_latency_saved_ms: number
  risk_score: number
  risk_level: string
  policy: string
  latency_ms: number
  attachments: string[]
  engines: {
    rails: { framework: string; package_installed: boolean; llm_rails_active: boolean }
    optimizer: { engine: string; llmlingua_state: string; model: string }
    provider: string
  }
}

export interface BlockExplanation {
  blocked_by: string
  engine: string
  reason: string
  findings: unknown[]
  recommendation: string
}

export interface ModelsInfo {
  models: string[]
  all_models: string[]
  default: string
  provider: string
}

export interface ChatResult {
  id: number
  blocked: boolean
  blocked_reason: string | null
  explanation: BlockExplanation | null
  response: string
  model: string
  stages: Stage[]
  intelligence: Intelligence
}
