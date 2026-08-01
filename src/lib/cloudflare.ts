// Cloudflare API client for CODE Rx SOCIETY
// Talks to the Pages Functions API. In production the API is served from the
// same domain (relative URLs). For local dev, set VITE_API_URL in .env to
// your local server (e.g. http://localhost:8788).

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'codeRx_token';
const USER_KEY = 'codeRx_user';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ---------- session helpers ----------
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export interface AuthUser {
  id: number | string;
  email: string;
  name?: string;
  role: 'admin' | 'member';
}

export const getStoredUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

export const setStoredUser = (user: AuthUser | null) => {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
};

// ---------- core request helper ----------
async function apiCall<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 0);
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status);
  }
  return data as T;
}

// ---------- database helpers ----------
export const db = {
  applications: {
    create: (data: { name: string; email: string; phone: string }) =>
      apiCall('/api/applications', { method: 'POST', body: JSON.stringify(data) }),
    getAll: async () => {
      const result = await apiCall<{ data: any[] }>('/api/applications');
      return result.data || [];
    },
    updateStatus: (id: number, status: 'approved' | 'rejected') =>
      apiCall(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },

  subscribers: {
    create: (data: { email: string; name?: string; phone?: string }) =>
      apiCall('/api/subscribers', { method: 'POST', body: JSON.stringify(data) }),
    getAll: async () => {
      const result = await apiCall<{ data: any[] }>('/api/subscribers');
      return result.data || [];
    },
  },

  contacts: {
    create: (data: { name: string; email: string; subject: string; message: string }) =>
      apiCall('/api/contacts', { method: 'POST', body: JSON.stringify(data) }),
    getAll: async () => {
      const result = await apiCall<{ data: any[] }>('/api/contacts');
      return result.data || [];
    },
    updateStatus: (id: number, status: 'read' | 'archived') =>
      apiCall(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },

  siteContent: {
    /** Returns the content object, or null if none has been saved yet. */
    get: async () => {
      const result = await apiCall<{ data: any }>('/api/site-content');
      return result.data ?? null;
    },
    update: (data: any) => apiCall('/api/site-content', { method: 'PUT', body: JSON.stringify(data) }),
  },

  members: {
    getAll: async () => {
      const result = await apiCall<{ data: any[] }>('/api/members');
      return result.data || [];
    },
    create: (data: { name: string; email: string; phone: string; role?: string }) =>
      apiCall('/api/members', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { points?: number; level?: string; is_active?: boolean }) =>
      apiCall(`/api/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: number) => apiCall(`/api/members/${id}`, { method: 'DELETE' }),
  },

  getStats: async () => {
    const result = await apiCall<{ data: any }>('/api/stats');
    return result.data;
  },
};

// ---------- file upload (admin) ----------
export const uploadFile = async (file: File, folder: string = 'uploads') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  const data = await apiCall<{ url: string; filename: string }>('/api/upload', {
    method: 'POST',
    body: formData,
  });
  return data;
};

// ---------- authentication ----------
export const auth = {
  login: async (email: string, password: string): Promise<AuthUser> => {
    const data = await apiCall<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setStoredUser(data.user);
    return data.user;
  },

  register: async (name: string, email: string, password: string): Promise<AuthUser> => {
    const data = await apiCall<{ token: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setToken(data.token);
    setStoredUser(data.user);
    return data.user;
  },

  /** Validates the stored token against the server; returns user or null. */
  me: async (): Promise<AuthUser | null> => {
    if (!getToken()) return null;
    try {
      const data = await apiCall<{ user: AuthUser }>('/api/auth/me');
      setStoredUser(data.user);
      return data.user;
    } catch {
      setToken(null);
      setStoredUser(null);
      return null;
    }
  },

  /** Changes the signed-in user's password (verifies the current one). */
  changePassword: async (currentPassword: string, newPassword: string) => {
    await apiCall('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  /** Requests a password-reset link for an email address. */
  forgotPassword: async (email: string) =>
    apiCall<{ message: string; devResetLink?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /** Resets the password using the one-time token from the reset email. */
  resetPassword: async (email: string, token: string, newPassword: string) =>
    apiCall('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, token, newPassword }),
    }),

  logout: () => {
    setToken(null);
    setStoredUser(null);
  },

  getUser: (): AuthUser | null => getStoredUser(),
};

// ---------- health check ----------
export const healthCheck = async (): Promise<boolean> => {
  try {
    const result = await apiCall<{ status: string }>('/api/health');
    return result.status === 'ok';
  } catch {
    return false;
  }
};
