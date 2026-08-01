// CODE Rx SOCIETY - Cloudflare Configuration
// API keys and settings loaded from environment variables

export const CONFIG = {
  // Cloudflare Workers API.
  // Production: same-origin (empty string) — the API is served from
  // /api/* on the same domain as the site.
  // Local dev with Vite: set VITE_API_URL to your API server, e.g. http://localhost:8788
  API: {
    URL: import.meta.env.VITE_API_URL || '',
  },

  // Cloudflare R2 Storage
  STORAGE: {
    BUCKET_URL: import.meta.env.VITE_R2_BUCKET_URL || 'https://code-rx-storage.r2.cloudflarestorage.com',
  },

  // Admin Settings
  ADMIN: {
    EMAIL: import.meta.env.VITE_ADMIN_EMAIL || 'coderxsociety@gmail.com',
  },

  // Social Links
  SOCIAL: {
    TELEGRAM: import.meta.env.VITE_TELEGRAM_LINK || 'https://t.me/+EdRpfR1GTGNjM2Q0',
  },

  // Feature Flags
  FEATURES: {
    ENABLE_EMAIL_NOTIFICATIONS: import.meta.env.VITE_ENABLE_EMAIL === 'true',
    ENABLE_FILE_UPLOADS: import.meta.env.VITE_ENABLE_UPLOADS === 'true',
    ENABLE_AUTHENTICATION: import.meta.env.VITE_ENABLE_AUTH !== 'false',
  }
};

// Validate configuration
const missingKeys: string[] = [];

if (!import.meta.env.VITE_API_URL) {
  missingKeys.push('VITE_API_URL');
}

if (missingKeys.length > 0) {
  console.warn('️ Missing environment variables:', missingKeys.join(', '));
  console.warn('Please copy .env.example to .env and configure Cloudflare settings.');
  console.warn('The app will use localhost for development.');
}

// Export Cloudflare API client
export { db, uploadFile, auth, healthCheck } from './lib/cloudflare';
