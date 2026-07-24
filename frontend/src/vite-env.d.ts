/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for cross-origin deploys, e.g. https://promptineer-api.onrender.com.
   *  Empty in dev (Vite proxies /api) and when frontend/backend share a domain. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
