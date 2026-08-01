/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_EMAILJS_PUBLIC_KEY: string
  readonly VITE_EMAILJS_SERVICE_ID: string
  readonly VITE_EMAILJS_TEMPLATE_ID_JOIN: string
  readonly VITE_EMAILJS_TEMPLATE_ID_CONTACT: string
  readonly VITE_EMAILJS_TEMPLATE_ID_SUBSCRIBE: string
  readonly VITE_ADMIN_EMAIL: string
  readonly VITE_TELEGRAM_LINK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
