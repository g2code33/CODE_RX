/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_ADMIN_EMAIL: string
  readonly VITE_TELEGRAM_LINK: string
  readonly VITE_ENABLE_EMAIL: string
  readonly VITE_ENABLE_UPLOADS: string
  readonly VITE_ENABLE_AUTH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
