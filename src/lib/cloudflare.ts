// Cloudflare API client for CODE Rx SOCIETY
// Talks to the Pages Functions API. In production the API is served from the
// same domain (relative URLs). For local dev, set VITE_API_URL in .env to
// your local server (e.g. http://localhost:8788).

export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
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
export const getToken = (): string | null => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) return token;
  if (import.meta.env.DEV) return 'dev-sandbox-phantom-token';
  return null;
};
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export interface AuthUser {
  id: number | string;
  email: string;
  name?: string;
  role: 'phantom' | 'admin' | 'member';
  isPhantom?: boolean;
  isWebsiteAdmin?: boolean;
  memberCode?: string | null;
  memberStatus?: 'pending_activation' | 'active' | 'locked' | 'archived' | null;
  codenamePath?: 'member' | 'custom_founding' | 'direct_founding' | null;
  codename?: string | null;
}

export const isAdminUser = (user: AuthUser | null | undefined) => Boolean(
  user && (user.isPhantom || user.isWebsiteAdmin || user.role === 'phantom' || user.role === 'admin')
);

export const DEV_PHANTOM_USER: AuthUser = {
  id: 1,
  email: 'coderxsociety@gmail.com',
  name: 'PHANTOM',
  role: 'phantom',
  isPhantom: true,
  memberCode: 'CRX-001',
  codename: 'PHANTOM',
  codenamePath: 'direct_founding',
};

export const getStoredUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw) as AuthUser;
    if (import.meta.env.DEV) {
      return DEV_PHANTOM_USER;
    }
    return null;
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

  // A Pages deployment that serves the SPA instead of the Functions route can
  // return HTML with a 200 status. Fail with a useful message rather than a
  // confusing `undefined token` error in the sign-in form.
  if (data === null) {
    throw new ApiError('The authentication service returned an invalid response.', response.status);
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
    updateStatus: (id: number, status: 'rejected' | 'pending') =>
      apiCall(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    remove: (id: number) => apiCall(`/api/applications/${id}`, { method: 'DELETE' }),
  },

  subscribers: {
    create: (data: { email: string; name?: string; phone?: string }) =>
      apiCall('/api/subscribers', { method: 'POST', body: JSON.stringify(data) }),
    getAll: async () => {
      const result = await apiCall<{ data: any[] }>('/api/subscribers');
      return result.data || [];
    },
    remove: (id: number) => apiCall(`/api/subscribers/${id}`, { method: 'DELETE' }),
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
    remove: (id: number) => apiCall(`/api/contacts/${id}`, { method: 'DELETE' }),
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
    update: (id: number, data: { points?: number; is_active?: boolean }) =>
      apiCall(`/api/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: number) => apiCall(`/api/members/${id}`, { method: 'DELETE' }),
  },

  member: {
    me: async () => {
      const result = await apiCall<{ data: any }>('/api/member/me');
      return result.data;
    },
    leaderboard: async (limit = 10) => (await apiCall<{ data: any[] }>(`/api/members/leaderboard?limit=${limit}`)).data || [],
  },

  notifications: {
    inbox: async (limit = 40) => (await apiCall<{ data: any }>(`/api/notifications?limit=${limit}`)).data,
    audience: async () => (await apiCall<{ data: any }>('/api/notifications/audience')).data,
    markRead: (id: number) => apiCall(`/api/notifications/${id}/read`, { method: 'POST' }),
    dismiss: (id: number) => apiCall(`/api/notifications/${id}`, { method: 'DELETE' }),
    sent: async (limit = 40) => (await apiCall<{ data: any[] }>(`/api/notifications/sent?limit=${limit}`)).data || [],
    updateSent: (id: number, data: { title?: string; message?: string }) =>
      apiCall<{ data: any; message?: string }>(`/api/notifications/sent/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteSent: (id: number) => apiCall(`/api/notifications/sent/${id}`, { method: 'DELETE' }),
    send: (data: { title: string; message: string; audience: 'all' | 'selected' | 'role'; memberProfileIds?: number[]; roleCode?: string }) =>
      apiCall<{ data: any; message?: string }>('/api/notifications/send', { method: 'POST', body: JSON.stringify(data) }),
  },

  community: {
    enterPublic: (email: string) => apiCall<{ data: any; message?: string }>('/api/community/public/enter', { method: 'POST', body: JSON.stringify({ email }) }),
    publicThreads: async (query = '') => (await apiCall<{ data: any[] }>(`/api/community/public/threads${query ? `?q=${encodeURIComponent(query)}` : ''}`)).data || [],
    publicThread: async (id: number) => (await apiCall<{ data: any }>(`/api/community/public/threads/${id}`)).data,
    createPublicThread: (guestToken: string, data: { title: string; body: string }) => apiCall<{ data: any; message?: string }>('/api/community/public/threads', { method: 'POST', headers: { 'X-Code-Rx-Community-Guest': guestToken }, body: JSON.stringify(data) }),
    replyPublicThread: (guestToken: string, threadId: number, data: { body: string; parentPostId?: number }) => apiCall<{ data: any; message?: string }>(`/api/community/public/threads/${threadId}/posts`, { method: 'POST', headers: { 'X-Code-Rx-Community-Guest': guestToken }, body: JSON.stringify(data) }),
    editPublicThread: (guestToken: string, id: number, data: { title?: string; body?: string }) => apiCall(`/api/community/public/threads/${id}`, { method: 'PATCH', headers: { 'X-Code-Rx-Community-Guest': guestToken }, body: JSON.stringify(data) }),
    deletePublicThread: (guestToken: string, id: number) => apiCall(`/api/community/public/threads/${id}`, { method: 'DELETE', headers: { 'X-Code-Rx-Community-Guest': guestToken } }),
    editPublicPost: (guestToken: string, id: number, body: string) => apiCall(`/api/community/public/posts/${id}`, { method: 'PATCH', headers: { 'X-Code-Rx-Community-Guest': guestToken }, body: JSON.stringify({ body }) }),
    deletePublicPost: (guestToken: string, id: number) => apiCall(`/api/community/public/posts/${id}`, { method: 'DELETE', headers: { 'X-Code-Rx-Community-Guest': guestToken } }),
    reactPublicPost: (guestToken: string, postId: number, emoji: string) => apiCall<{ data: any }>(`/api/community/public/posts/${postId}/reactions`, { method: 'PUT', headers: { 'X-Code-Rx-Community-Guest': guestToken }, body: JSON.stringify({ emoji }) }),
    reportPublic: (guestToken: string, data: { threadId?: number; postId?: number; reason: string }) => apiCall('/api/community/public/reports', { method: 'POST', headers: { 'X-Code-Rx-Community-Guest': guestToken }, body: JSON.stringify(data) }),
    publicChat: async () => (await apiCall<{ data: any[] }>('/api/community/public/chat')).data || [],
    sendPublicChat: (guestToken: string, body: string) => apiCall<{ data: any; message?: string }>('/api/community/public/chat', { method: 'POST', headers: { 'X-Code-Rx-Community-Guest': guestToken }, body: JSON.stringify({ body }) }),
    members: async (query = '') => (await apiCall<{ data: any[] }>(`/api/community/members${query ? `?q=${encodeURIComponent(query)}` : ''}`)).data || [],
    conversations: async () => (await apiCall<{ data: any[] }>('/api/community/conversations')).data || [],
    openDm: async (profileId: number) => (await apiCall<{ data: any }>(`/api/community/dms/${profileId}`, { method: 'POST' })).data,
    groups: async () => (await apiCall<{ data: any[] }>('/api/community/groups')).data || [],
    group: async (id: number) => (await apiCall<{ data: any }>(`/api/community/groups/${id}`)).data,
    createGroup: (data: any) => apiCall<{ data: any }>('/api/community/groups', { method: 'POST', body: JSON.stringify(data) }),
    joinGroup: (id: number, message?: string) => apiCall<{ data: any; message?: string }>(`/api/community/groups/${id}/join`, { method: 'POST', body: JSON.stringify({ message }) }),
    groupRequests: async (id: number) => (await apiCall<{ data: any[] }>(`/api/community/groups/${id}/requests`)).data || [],
    reviewGroupRequest: (groupId: number, requestId: number, action: 'approve' | 'reject') => apiCall(`/api/community/groups/${groupId}/requests/${requestId}`, { method: 'POST', body: JSON.stringify({ action }) }),
    updateGroup: (id: number, data: any) => apiCall(`/api/community/groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateGroupMember: (groupId: number, profileId: number, data: any) => apiCall(`/api/community/groups/${groupId}/members/${profileId}`, { method: 'PUT', body: JSON.stringify(data) }),
    messages: async (conversationId: number, before?: number) => (await apiCall<{ data: any }>(`/api/community/conversations/${conversationId}/messages${before ? `?before=${before}` : ''}`)).data,
    sendMessage: (conversationId: number, data: { body: string; replyToMessageId?: number; messageType?: 'text' | 'announcement' }) => apiCall<{ data: any; message?: string }>(`/api/community/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
    editMessage: (id: number, body: string) => apiCall(`/api/community/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    deleteMessage: (id: number) => apiCall(`/api/community/messages/${id}`, { method: 'DELETE' }),
    reactMessage: (id: number, emoji: string) => apiCall<{ data: any }>(`/api/community/messages/${id}/reactions`, { method: 'PUT', body: JSON.stringify({ emoji }) }),
    markRead: (conversationId: number, messageId: number) => apiCall(`/api/community/conversations/${conversationId}/read`, { method: 'POST', body: JSON.stringify({ messageId }) }),
    pinMessage: (id: number) => apiCall(`/api/community/messages/${id}/pin`, { method: 'POST' }),
    reportMessage: (id: number, reason: string) => apiCall(`/api/community/messages/${id}/reports`, { method: 'POST', body: JSON.stringify({ reason }) }),
    search: async (query: string) => (await apiCall<{ data: any }>(`/api/community/search?q=${encodeURIComponent(query)}`)).data,
    telegramLink: async () => (await apiCall<{ data: any }>('/api/community/telegram/link', { method: 'POST' })).data,
    telegramStatus: async () => (await apiCall<{ data: any }>('/api/community/telegram/status')).data,
    disconnectTelegram: () => apiCall('/api/community/telegram/link', { method: 'DELETE' }),

    phantomInbox: async () => (await apiCall<{ data: any }>('/api/community/phantom-inbox')).data,
    markPhantomInboxRead: (channel: string, itemId: number) =>
      apiCall<{ message: string }>('/api/community/phantom-inbox/read', { method: 'POST', body: JSON.stringify({ channel, itemId }) }),
    replyPhantomInbox: (itemId: number, replyText: string) =>
      apiCall<{ message: string; emailSent?: boolean }>('/api/community/phantom-inbox/reply', { method: 'POST', body: JSON.stringify({ itemId, replyText }) }),
    mediaPolicy: async (conversationId: number) => (await apiCall<{ data: any[] }>(`/api/community/conversations/${conversationId}/media-policy`)).data || [],
    uploadAttachment: async (conversationId: number, file: File, caption = '') => {
      const form = new FormData(); form.append('file', file); if (caption) form.append('caption', caption);
      return apiCall<{ data: any; message?: string }>(`/api/community/conversations/${conversationId}/attachments`, { method: 'POST', body: form });
    },
    downloadAttachment: async (id: number) => {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/community/attachments/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) { let data: any = null; try { data = await response.json(); } catch { /* ignore */ } throw new ApiError(data?.error || 'Could not open this attachment.', response.status); }
      return { url: URL.createObjectURL(await response.blob()), filename: response.headers.get('content-disposition')?.match(/filename=\"?([^\";]+)/i)?.[1] || 'community-attachment' };
    },
    deleteAttachment: (id: number) => apiCall(`/api/community/attachments/${id}`, { method: 'DELETE' }),
    retryAttachmentTelegramSync: (id: number) => apiCall<{ data: { deletedFromR2: boolean }; message?: string }>(`/api/community/attachments/${id}/telegram-sync`, { method: 'POST' }),
  },
  communityAdmin: {
    mediaSettings: async () => (await apiCall<{ data: any }>('/api/phantom/community/media-settings')).data,
    saveMediaSetting: (data: any) => apiCall('/api/phantom/community/media-settings', { method: 'PUT', body: JSON.stringify(data) }),
    publicReports: async () => (await apiCall<{ data: any[] }>('/api/phantom/community/public/reports')).data || [],
    updatePublicReport: (id: number, status: 'reviewed' | 'resolved' | 'dismissed') => apiCall(`/api/phantom/community/public/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    moderatePublicThread: (id: number, data: { pinned?: boolean; status?: string }) => apiCall(`/api/phantom/community/public/threads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    moderatePublicPost: (id: number, status: 'active' | 'hidden' | 'deleted') => apiCall(`/api/phantom/community/public/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },

  codenames: {
    ballot: async () => {
      const result = await apiCall<{ data: any }>('/api/codenames/ballot');
      return result.data;
    },
    reveal: async (slot?: number) => {
      const result = await apiCall<{ data: any }>('/api/codenames/reveal', { method: 'POST', body: JSON.stringify(slot ? { slot } : {}) });
      return result.data;
    },
    check: async (codenameId: number) => {
      const result = await apiCall<{ data: any }>('/api/codenames/check', { method: 'POST', body: JSON.stringify({ codenameId }) });
      return result.data;
    },
    pass: async (codenameId: number) => {
      const result = await apiCall<{ data: any }>('/api/codenames/pass', { method: 'POST', body: JSON.stringify({ codenameId }) });
      return result.data;
    },
    claim: async (codenameId: number) => {
      const result = await apiCall<{ data: any }>('/api/codenames/claim', { method: 'POST', body: JSON.stringify({ codenameId }) });
      return result.data;
    },
  },

  vault: {
    home: async () => (await apiCall<{ data: any }>('/api/vault/home')).data,
    activity: async (limit = 30) => (await apiCall<{ data: any[] }>(`/api/vault/activity?limit=${limit}`)).data || [],
    search: async (query: string) => (await apiCall<{ data: any[] }>(`/api/vault/search?q=${encodeURIComponent(query)}`)).data || [],
    tags: async () => (await apiCall<{ data: any[] }>('/api/vault/tags')).data || [],
    sharingStatus: async () => (await apiCall<{ data: any }>('/api/vault/sharing/status')).data,
    shares: async (documentId: number) => (await apiCall<{ data: any }>(`/api/vault/documents/${documentId}/shares`)).data,
    createShare: (documentId: number, options: { allowDownload?: boolean; expiresInDays?: number | null } = {}) => apiCall<{ data: any }>(`/api/vault/documents/${documentId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ allowDownload: options.allowDownload === true, expiresInDays: options.expiresInDays ?? null }),
    }),
    replaceShare: (documentId: number, shareId: number) => apiCall<{ data: any }>(`/api/vault/documents/${documentId}/shares/${shareId}/replace`, { method: 'POST' }),
    revokeShare: (documentId: number, shareId: number) => apiCall(`/api/vault/documents/${documentId}/shares/${shareId}/revoke`, { method: 'POST' }),
    downloadDocument: async (documentId: number) => {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/vault/documents/${documentId}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) { let data: any = null; try { data = await response.json(); } catch { /* ignore */ } throw new ApiError(data?.error || 'Could not download this document.', response.status); }
      return { url: URL.createObjectURL(await response.blob()), filename: response.headers.get('content-disposition')?.match(/filename="?([^";]+)/i)?.[1] || 'code-rx-vault-document.html' };
    },
    publicShare: async (token: string) => (await apiCall<{ data: any }>(`/api/vault/shares/${encodeURIComponent(token)}`)).data,
    publicDownloadUrl: (token: string) => `${API_BASE}/api/vault/shares/${encodeURIComponent(token)}/download`,
    sections: async () => {
      const result = await apiCall<{ data: any[] }>('/api/vault/sections');
      return result.data || [];
    },
    uploadFile: async (file: File, section: string, documentId?: number) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('section', section);
      if (documentId) formData.append('documentId', String(documentId));
      return apiCall<{ attachment: any; fileKey: string; url: string }>('/api/vault/upload', { method: 'POST', body: formData });
    },
    fetchFile: async (fileKey: string) => {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/vault-files/${encodeURIComponent(fileKey).replace(/%2F/g, '/')}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        let data: any = null;
        try { data = await response.json(); } catch { /* ignore */ }
        throw new ApiError(data?.error || 'Could not open Vault attachment.', response.status);
      }
      return URL.createObjectURL(await response.blob());
    },
    documents: async (section: string, archived = false) => {
      const result = await apiCall<{ data: any[] }>(`/api/vault/documents?section=${encodeURIComponent(section)}${archived ? '&archived=1' : ''}`);
      return result.data || [];
    },
    document: async (id: number) => {
      const result = await apiCall<{ data: any }>(`/api/vault/documents/${id}`);
      return result.data;
    },
    createDocument: (data: any) => apiCall<{ data: any }>('/api/vault/documents', { method: 'POST', body: JSON.stringify(data) }),
    updateDocument: (id: number, data: any) =>
      apiCall<{ data: any }>(`/api/vault/documents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    archiveDocument: (id: number) => apiCall('/api/vault/documents/' + id, { method: 'DELETE' }),
    /**
     * Delete a Vault document into the Recycle Bin. Distinct from archiving:
     * an archived document stays on the shelf, a deleted one leaves it and can
     * be restored from PHANTOM → Recycle Bin.
     */
    deleteDocument: (id: number) => apiCall<{ message: string; data?: { recycleId?: number } }>(
      '/api/vault/documents/' + id + '/delete', { method: 'POST' },
    ),
    unarchiveDocument: (id: number) => apiCall('/api/vault/documents/' + id + '/unarchive', { method: 'POST' }),
    documentVersions: async (id: number) => (await apiCall<{ data: any[] }>(`/api/vault/documents/${id}/versions`)).data || [],
    documentVersion: async (id: number, version: number) => (await apiCall<{ data: any }>(`/api/vault/documents/${id}/versions/${version}`)).data,
    restoreDocumentVersion: (id: number, version: number) => apiCall<{ data: any }>(`/api/vault/documents/${id}/restore/${version}`, { method: 'POST' }),
    projects: async (archived = false) => {
      const result = await apiCall<{ data: any[] }>(`/api/vault/projects${archived ? '?archived=1' : ''}`);
      return result.data || [];
    },
    createProject: (data: any) => apiCall('/api/vault/projects', { method: 'POST', body: JSON.stringify(data) }),
    updateProject: (id: number, data: any) => apiCall(`/api/vault/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    project: async (id: number) => (await apiCall<{ data: any }>(`/api/vault/projects/${id}`)).data,
    createTask: (projectId: number, data: any) => apiCall(`/api/vault/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    meetings: async () => (await apiCall<{ data: any[] }>('/api/vault/meetings')).data || [],
    createMeeting: (data: any) => apiCall('/api/vault/meetings', { method: 'POST', body: JSON.stringify(data) }),
  },

  phantom: {
    overview: async () => (await apiCall<{ data: any }>('/api/phantom/overview')).data,
    applications: async () => (await apiCall<{ data: any[] }>('/api/phantom/applications')).data || [],
    reviewApplication: (id: number, status: 'rejected' | 'pending', note?: string) =>
      apiCall(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status, note }) }),
    approveAndInviteApplication: (id: number, data: any) =>
      apiCall<{ data: any; message?: string }>(`/api/phantom/applications/${id}/approve-and-invite`, { method: 'POST', body: JSON.stringify(data) }),
    // Retained as a compatibility name for older PHANTOM UI paths. It now uses
    // the unified approval + secure invitation endpoint.
    createFromApplication: (id: number, data: any) =>
      apiCall<{ data: any; message?: string }>(`/api/phantom/applications/${id}/approve-and-invite`, { method: 'POST', body: JSON.stringify(data) }),
    createMember: (data: any) => apiCall<{ data: any; message?: string }>('/api/phantom/members', { method: 'POST', body: JSON.stringify(data) }),
    regenerateActivationLink: (profileId: number) =>
      apiCall<{ data: any; message?: string }>(`/api/phantom/members/${profileId}/activation-link`, { method: 'POST' }),
    reassignCodename: (profileId: number, codenameId: number) =>
      apiCall<{ data: { oldCodename: string | null; codename: string; pool: 'member' | 'founding' }; message?: string }>(`/api/phantom/members/${profileId}/codename`, { method: 'POST', body: JSON.stringify({ codenameId }) }),
    members: async (status?: string) => (await apiCall<{ data: any[] }>(`/api/phantom/members${status ? `?status=${encodeURIComponent(status)}` : ''}`)).data || [],
    updateMember: (id: number, data: any) => apiCall(`/api/phantom/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    memberHistory: async (id: number) => (await apiCall<{ data: any }>(`/api/phantom/members/${id}/history`)).data,
    scoreHistory: async (id: number) => (await apiCall<{ data: any[] }>(`/api/phantom/members/${id}/score-history`)).data || [],
    adjustScore: (id: number, data: { action: 'add' | 'deduct' | 'set'; points: number; reason: string }) =>
      apiCall<{ data: any }>(`/api/phantom/members/${id}/score`, { method: 'POST', body: JSON.stringify(data) }),
    scoreRules: async () => (await apiCall<{ data: any[] }>('/api/phantom/score-rules')).data || [],
    calLevels: async () => (await apiCall<{ data: any[] }>('/api/phantom/cal-levels')).data || [],
    saveCalLevels: (levels: any[]) => apiCall<{ data: any[]; message?: string }>('/api/phantom/cal-levels', { method: 'PUT', body: JSON.stringify({ levels }) }),
    updateScoreRule: (key: string, data: { enabled?: boolean; points?: number }) =>
      apiCall(`/api/phantom/score-rules/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(data) }),
    sharing: async () => (await apiCall<{ data: any }>('/api/phantom/sharing')).data,
    setGlobalSharing: (enabled: boolean) => apiCall('/api/phantom/sharing/global', { method: 'PUT', body: JSON.stringify({ enabled }) }),
    setGlobalDownloads: (enabled: boolean) => apiCall('/api/phantom/downloads/global', { method: 'PUT', body: JSON.stringify({ enabled }) }),
    setMemberSharing: (id: number, canShare: boolean) => apiCall(`/api/phantom/members/${id}/sharing`, { method: 'PUT', body: JSON.stringify({ canShare }) }),
    setMemberDownloads: (id: number, canDownload: boolean) => apiCall(`/api/phantom/members/${id}/downloads`, { method: 'PUT', body: JSON.stringify({ canDownload }) }),
    notificationDelegates: async () => (await apiCall<{ data: any[] }>('/api/phantom/notification-delegates')).data || [],
    setNotificationDelegate: (id: number, canSend: boolean) => apiCall(`/api/phantom/notification-delegates/${id}`, { method: 'PUT', body: JSON.stringify({ canSend }) }),
    roles: async () => (await apiCall<{ data: any }>('/api/phantom/roles')).data,
    createRole: (data: any) => apiCall('/api/phantom/roles', { method: 'POST', body: JSON.stringify(data) }),
    updateRoleProfile: (id: number, data: { name?: string; description?: string }) =>
      apiCall<{ data: any; message?: string }>(`/api/phantom/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateRolePermissions: (id: number, permissions: any[]) => apiCall(`/api/phantom/roles/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),
    updateMemberPermissions: (id: number, permissions: any[]) => apiCall(`/api/phantom/members/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),
    websiteAdmins: async () => (await apiCall<{ data: any }>('/api/phantom/website-admins')).data,
    assignWebsiteAdmin: (data: any) => apiCall('/api/phantom/website-admins', { method: 'POST', body: JSON.stringify(data) }),
    updateWebsiteAdmin: (id: number, data: any) => apiCall(`/api/phantom/website-admins/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    vaultSections: async () => (await apiCall<{ data: any[] }>('/api/phantom/vault-sections')).data || [],
    createVaultSection: (data: any) => apiCall('/api/phantom/vault-sections', { method: 'POST', body: JSON.stringify(data) }),
    updateVaultSection: (id: number, data: any) => apiCall(`/api/phantom/vault-sections/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    codenames: async () => (await apiCall<{ data: any }>('/api/phantom/codenames')).data,
    addCodename: (data: { name: string; pool?: 'member' | 'founding'; reserve?: boolean; note?: string }) => apiCall('/api/phantom/codenames', { method: 'POST', body: JSON.stringify(data) }),
    addCodenamesBatch: (data: { input: string; pool?: 'member' | 'founding'; reserve?: boolean }) => apiCall<{ data: any; message?: string }>('/api/phantom/codenames/batch', { method: 'POST', body: JSON.stringify(data) }),
    assignCodename: (id: number, memberProfileId: number) => apiCall(`/api/phantom/codenames/${id}/assign`, { method: 'POST', body: JSON.stringify({ memberProfileId }) }),
    updateCodename: (id: number, data: any) => apiCall(`/api/phantom/codenames/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    releaseCodename: (id: number, data: { confirm: boolean; mode?: 'available' | 'retired' }) => apiCall(`/api/phantom/codenames/${id}/release`, { method: 'POST', body: JSON.stringify(data) }),
    auditLogs: async (limit = 100) => (await apiCall<{ data: any[] }>(`/api/phantom/audit-logs?limit=${limit}`)).data || [],
    recycleBin: async (limit = 100) => (await apiCall<{ data: any[] }>(`/api/phantom/recycle-bin?limit=${limit}`)).data || [],
    restoreRecycleBin: (id: number) => apiCall(`/api/phantom/recycle-bin/${id}/restore`, { method: 'POST' }),
    purgeRecycleBin: (id: number) => apiCall(`/api/phantom/recycle-bin/${id}`, { method: 'DELETE' }),
    settings: async () => (await apiCall<{ data: any[] }>('/api/phantom/settings')).data || [],
    saveSetting: (key: string, value: string) => apiCall(`/api/phantom/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) }),
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
  login: async (identifier: string, password: string): Promise<AuthUser> => {
    // In local development (Vite dev server without Cloudflare Pages Functions
    // backend), allow immediate dev-sandbox access with dev credentials.
    if (
      import.meta.env.DEV &&
      (identifier.trim().toLowerCase() === 'coderxsociety@gmail.com' || identifier.trim().toUpperCase() === 'PHANTOM') &&
      password === 'admin'
    ) {
      const devPhantomUser: AuthUser = {
        id: 1,
        email: 'coderxsociety@gmail.com',
        name: 'PHANTOM',
        role: 'phantom',
        isPhantom: true,
        memberCode: 'CRX-001',
        codename: 'PHANTOM',
        codenamePath: 'direct_founding',
      };
      setToken('dev-sandbox-phantom-token');
      setStoredUser(devPhantomUser);
      return devPhantomUser;
    }

    const data = await apiCall<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim(), password }),
    });
    if (!data?.token || !data?.user) {
      throw new ApiError('The authentication service returned an invalid response.', 502);
    }
    setToken(data.token);
    setStoredUser(data.user);
    return data.user;
  },

  /** Completes an invitation-only member activation and stores the resulting session. */
  activate: async (email: string, token: string, password: string): Promise<AuthUser> => {
    const data = await apiCall<{ token: string; user: AuthUser }>('/api/auth/activate', {
      method: 'POST', body: JSON.stringify({ email, token, password }),
    });
    setToken(data.token);
    setStoredUser(data.user);
    return data.user;
  },

  /** Validates the stored token against the server; returns user or null. */
  me: async (): Promise<AuthUser | null> => {
    if (!getToken()) return null;
    if (import.meta.env.DEV && getToken() === 'dev-sandbox-phantom-token') {
      return getStoredUser();
    }
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
    apiCall<{ message: string }>('/api/auth/forgot-password', {
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

// ===========================================================================
// CLIENT PROJECT PORTAL (Phase 3)
// ---------------------------------------------------------------------------
// A client session is NOT the member session: a separate header, a separate
// lifetime, and a separate browser store. The member token is deliberately
// never attached to these calls, and the raw access key is never stored —
// it lives in component state for the moment it takes to exchange it for a
// session, and is then dropped.
// ===========================================================================

const CLIENT_SESSION_KEY = 'codeRx_clientSession';
export const CLIENT_SESSION_HEADER = 'X-Code-Rx-Client-Session';

export interface ClientPortalSession {
  token: string;
  expiresAt: string;
}

/**
 * The safest store the app supports for this credential: sessionStorage is
 * scoped to one tab and cleared when that tab closes, so a client session
 * cannot outlive the browsing session or be picked up by another tab. It is
 * never written to localStorage.
 */
export const clientPortalSession = {
  read: (): ClientPortalSession | null => {
    try {
      const raw = sessionStorage.getItem(CLIENT_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ClientPortalSession;
      if (!parsed?.token) return null;
      if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
        sessionStorage.removeItem(CLIENT_SESSION_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },
  write: (session: ClientPortalSession) => {
    try {
      sessionStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(session));
    } catch {
      /* Private mode or a full quota: the session still works until reload. */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(CLIENT_SESSION_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

export class ClientPortalError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'ClientPortalError';
    this.status = status;
    this.code = code;
  }
}

interface ClientCallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * One request helper for every client-portal route. It sends the client session
 * header only, surfaces the server's non-technical `code` for the access screen,
 * and never forwards anything else about the failure to the UI.
 */
async function clientCall<T = any>(endpoint: string, options: ClientCallOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  const token = options.token ?? clientPortalSession.read()?.token ?? null;
  if (token) headers.set(CLIENT_SESSION_HEADER, token);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      cache: 'no-store',
      signal: options.signal,
    });
  } catch {
    throw new ClientPortalError('We could not reach Code Rx Society. Check your connection and try again.', 0, 'offline');
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    /* a non-JSON response is treated as an unavailable service below */
  }

  if (!response.ok || payload?.success === false) {
    const code = typeof payload?.code === 'string' ? payload.code : null;
    throw new ClientPortalError(payload?.error || '', response.status, code);
  }
  if (payload === null) {
    throw new ClientPortalError('', response.status, 'server_error');
  }
  return payload as T;
}

/**
 * The client-visible scope of a session (Phase 7). A key session reports
 * `restricted: false`; a session minted from a temporary link reports the one
 * destination it may reach, derived by the server from the stored link row.
 */
export interface ClientPortalDestination {
  restricted: boolean;
  destination: string;
  intent: string;
  section: string | null;
  documentId: string | null;
}

export interface ClientPortalSessionPayload {
  session?: ClientPortalSession;
  client?: any;
  project?: any;
  permissions?: any;
  destination?: ClientPortalDestination | null;
  target?: { id: string; title: string; reference?: string | null; category?: string; version?: string | null } | null;
  /** Present on a REQUIRE_PASSKEY link: the passkey is still the credential. */
  requiresPasskey?: boolean;
  mode?: string;
  expiresAt?: string | null;
}

/**
 * The server's description of the stamped client copy: what exists, what it is
 * called, and which endpoints the client may use. It carries no storage key and
 * no bytes — those only ever arrive through `stampedCopy`/`download`.
 */
export interface ClientDelivery {
  available: boolean;
  kind: string | null;
  sourceKind: string | null;
  label: string;
  contentType: string;
  designation: string;
  stamped: boolean;
  message: string;
  reason: string | null;
  viewerPath: string | null;
  printPath: string | null;
  downloadPath: string | null;
}

export const clientPortal = {
  /**
   * Exchanges a raw access key for a short-lived client session.
   *
   * `linkToken` is supplied when the client arrived through a REQUIRE_PASSKEY
   * link: the passkey stays the credential, and the link narrows the session to
   * its own destination. The token is never stored.
   */
  exchangeAccessKey: (accessKey: string, linkToken?: string | null) =>
    clientCall<{ data: ClientPortalSessionPayload }>(
      '/api/client/auth/login',
      { method: 'POST', body: linkToken ? { passkey: accessKey, linkToken } : { passkey: accessKey } },
    ),

  /**
   * Exchanges a temporary link token for a scoped client session — or, for a
   * REQUIRE_PASSKEY link, reports that the passkey is required and keeps the
   * destination closed until it is given.
   */
  redeemLink: (linkToken: string) =>
    clientCall<{ data: ClientPortalSessionPayload }>(
      `/api/client/link/${encodeURIComponent(linkToken)}`,
      { method: 'POST' },
    ),

  me: () => clientCall<{ data: any }>('/api/client/me'),

  logout: () => clientCall<{ success: boolean }>('/api/client/auth/logout', { method: 'POST' }),

  project: (projectId: string) =>
    clientCall<{ data: { project: any; sections: any[]; recent: any[]; scope?: ClientPortalDestination } }>(
      `/api/client/project/${encodeURIComponent(projectId)}`,
    ),

  section: (projectId: string, section: string) =>
    clientCall<{ data: { project: any; section: string; documents: any[] } }>(
      `/api/client/project/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(section)}`,
    ),

  /**
   * SIGNING. What the document's signature is now, and the act of signing it.
   * Saving writes the signed copy into the linked Vault document, so the room
   * and the Vault never disagree, and PHANTOM is notified either way.
   */
  signature: (projectId: string, documentId: string) =>
    clientCall<{ data: any }>(
      `/api/client/project/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/signature`,
    ),
  /**
   * The drawn mark is REQUIRED: `inkPng` is the pencil pad's canvas as a
   * base64 PNG data URL and `strokes` the normalized polylines drawn on it.
   * The server refuses a name without a drawing, so there is no typed-only
   * signature.
   */
  sign: (projectId: string, documentId: string, payload: {
    signerName: string;
    signerTitle?: string;
    inkPng: string;
    strokes: Array<{ points: Array<{ x: number; y: number }> }>;
  }) =>
    clientCall<{ message: string; data: any }>(
      `/api/client/project/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/signature`,
      { method: 'POST', body: payload },
    ),
  /** Send a document back to PHANTOM, signed or not. */
  sendToPhantom: (projectId: string, documentId: string) =>
    clientCall<{ message: string; data: any }>(
      `/api/client/project/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/send-to-phantom`,
      { method: 'POST' },
    ),
  /** TEXT PHANTOM: the client's messages on this project. */
  messages: (projectId: string) =>
    clientCall<{ data: any }>(`/api/client/project/${encodeURIComponent(projectId)}/messages`),
  sendMessage: (projectId: string, payload: { body: string; documentId?: string }) =>
    clientCall<{ message: string; data: any }>(
      `/api/client/project/${encodeURIComponent(projectId)}/messages`,
      { method: 'POST', body: payload },
    ),
  /**
   * The review section: the four answers a client may give, and their own words.
   * The answer goes to PHANTOM; it never changes access to the document.
   */
  review: (projectId: string, documentId: string) =>
    clientCall<{ data: any }>(
      `/api/client/project/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/review`,
    ),
  saveReview: (projectId: string, documentId: string, decision: string, comment: string) =>
    clientCall<{ message: string; data: any }>(
      `/api/client/project/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/review`,
      { method: 'POST', body: { decision, comment } },
    ),

  document: (projectId: string, documentId: string) =>
    clientCall<{ data: { project: any; document: any; delivery: ClientDelivery } }>(
      `/api/client/project/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`,
    ),

  /**
   * Fetches the STAMPED client copy and returns it as a local object URL.
   *
   * The portal never re-types the document: the viewer, the print window and the
   * download all read the artifact the server produced, which is why the Code Rx
   * watermark is present in each of them. The object URL is created from an
   * authenticated response body, so the file is never given a public address.
   */
  stampedCopy: async (projectId: string, documentId: string, action: 'preview' | 'print' = 'preview') => {
    const token = clientPortalSession.read()?.token ?? null;
    const response = await fetch(
      `${API_BASE}/api/client/project/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/${action}`,
      {
        headers: token ? { [CLIENT_SESSION_HEADER]: token } : {},
        credentials: 'omit',
        cache: 'no-store',
      },
    );
    if (!response.ok) {
      let code: string | null = null;
      let message = '';
      try {
        const body = await response.json();
        code = body?.code ?? null;
        message = body?.error ?? '';
      } catch {
        /* not JSON */
      }
      throw new ClientPortalError(message, response.status, code);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return { url: URL.createObjectURL(blob), filename: match?.[1] || 'code-rx-client-copy.pdf' };
  },

  /**
   * Downloads the client-safe artifact. Only a published, client-visible
   * document that explicitly allows downloads and has a stamped artifact is
   * ever served; everything else is refused by the server.
   */
  download: async (projectId: string, documentId: string, fileName: string) => {
    const token = clientPortalSession.read()?.token ?? null;
    const response = await fetch(
      `${API_BASE}/api/client/project/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/download`,
      {
        headers: token ? { [CLIENT_SESSION_HEADER]: token } : {},
        credentials: 'omit',
        cache: 'no-store',
      },
    );
    if (!response.ok) {
      let code: string | null = null;
      try {
        code = (await response.json())?.code ?? null;
      } catch {
        /* not JSON */
      }
      throw new ClientPortalError('', response.status, code);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = match?.[1] || fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};

// ===========================================================================
// CLIENT ACCESS CENTER (Phase 5) — PHANTOM workspace only.
// Every call here is an internal management call. It uses the member bearer
// token through the normal PHANTOM/admin authentication; it never creates or
// uses a client session, and a member without the matching clients.*
// permission is refused by the server.
// ===========================================================================

export const clientAccessCenter = {
  clients: async (options: { archived?: boolean } = {}) => {
    const result = await apiCall<{ data: any[] }>(`/api/phantom/clients${options.archived ? '?archived=1' : ''}`);
    return result.data || [];
  },
  // The detail route returns { client, projects }; the workspace loads projects
  // separately, so only the client record is unwrapped here.
  client: async (clientId: string) =>
    (await apiCall<{ data: { client: any } }>(`/api/phantom/clients/${clientId}`)).data.client,
  createClient: (data: any) => apiCall<{ data: { id: string } }>('/api/phantom/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (clientId: string, data: any) => apiCall(`/api/phantom/clients/${clientId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  setClientStatus: (clientId: string, status: string) =>
    apiCall<{ data: any; message: string }>(`/api/phantom/clients/${clientId}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  revokeAllAccess: (clientId: string) =>
    apiCall<{ data: any }>(`/api/phantom/clients/${clientId}/revoke-all`, { method: 'POST' }),

  projects: async (clientId: string) => (await apiCall<{ data: any[] }>(`/api/phantom/clients/${clientId}/projects`)).data || [],
  createProject: (clientId: string, data: any) =>
    apiCall<{ data: { id: string; reference: string } }>(`/api/phantom/clients/${clientId}/projects`, { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (projectId: string, data: any) =>
    apiCall(`/api/phantom/client-projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  keys: async (clientId: string) => (await apiCall<{ data: any[] }>(`/api/phantom/clients/${clientId}/keys`)).data || [],
  createKey: (clientId: string, data: any) =>
    apiCall<{ data: { id: string; passkey: string; hint: string; expiresAt: string | null }; message: string }>(
      `/api/phantom/clients/${clientId}/keys`, { method: 'POST', body: JSON.stringify(data) },
    ),
  regenerateKey: (keyId: string) =>
    apiCall<{ data: { id: string; passkey: string; hint: string; sessionsRevoked: number }; message: string }>(
      `/api/phantom/client-keys/${keyId}/regenerate`, { method: 'POST' },
    ),
  revokeKey: (keyId: string) => apiCall<{ message: string }>(`/api/phantom/client-keys/${keyId}/revoke`, { method: 'POST' }),

  documents: async (clientId: string, projectId?: string) => {
    const query = projectId ? `?project=${encodeURIComponent(projectId)}` : '';
    return (await apiCall<{ data: any[] }>(`/api/phantom/clients/${clientId}/documents${query}`)).data || [];
  },
  createDocument: (clientId: string, data: any) =>
    apiCall<{ data: { id: string; reference: string; category: string } }>(`/api/phantom/clients/${clientId}/documents`, { method: 'POST', body: JSON.stringify(data) }),
  updateDocument: (documentId: string, data: any) =>
    apiCall(`/api/phantom/client-documents/${documentId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  /**
   * PHANTOM: prepare (or refresh) the stamped client copy.
   *
   * The server renders the watermarked artifact from the document's own source
   * and caches it; a source that cannot be stamped answers with a controlled
   * error instead of any file. Response:
   * `{ available, kind, label, contentType, filename, sizeBytes, sha256, cached }`.
   */
  prepareDelivery: (documentId: string, refresh = false, customization?: any) =>
    apiCall<{ data: { available: boolean; kind: string; label: string; filename: string; sizeBytes: number; cached: boolean } }>(
      `/api/phantom/client-documents/${encodeURIComponent(documentId)}/delivery`,
      { method: 'POST', body: JSON.stringify({ refresh, customization }) },
    ),

  presentationPreview: async (documentId: string, customization?: any): Promise<{ url: string; filename: string; contentType: string }> => {
    const response = await fetch(
      `${API_BASE}/api/phantom/client-documents/${encodeURIComponent(documentId)}/presentation-preview`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customization }),
        cache: 'no-store',
        credentials: 'omit',
      },
    );
    if (!response.ok) {
      let message = '';
      try {
        const body = await response.json();
        message = body?.error ?? '';
      } catch {
        /* not JSON */
      }
      throw new ApiError(message || 'The client presentation preview could not be generated.', response.status);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return {
      url: URL.createObjectURL(blob),
      filename: match?.[1] || 'client-presentation-preview.pdf',
      contentType: response.headers.get('Content-Type') || 'application/pdf',
    };
  },

  setDocumentLifecycle: (documentId: string, state: string, clientVisible?: boolean) =>
    apiCall<{ data: { state: string; clientVisible: boolean }; message: string }>(
      `/api/phantom/client-documents/${documentId}/lifecycle`, { method: 'POST', body: JSON.stringify({ state, clientVisible }) },
    ),

  /**
   * PHANTOM: the signed copy the client handed back, as an authenticated blob
   * object URL. The returned file is stamp-rendered from the snapshot that now
   * carries the client's signature (text and drawn mark), never the source.
   */
  receivedCopy: async (documentId: string): Promise<{ url: string; filename: string }> => {
    const response = await fetch(
      `${API_BASE}/api/phantom/client-documents/${encodeURIComponent(documentId)}/received-copy`,
      { headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store', credentials: 'omit' },
    );
    if (!response.ok) {
      let message = '';
      try {
        const body = await response.json();
        message = body?.error ?? '';
      } catch {
        /* not JSON */
      }
      throw new ApiError(message || 'The signed copy could not be opened.', response.status);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return { url: URL.createObjectURL(blob), filename: match?.[1] || 'code-rx-signed-copy.pdf' };
  },

  links: async (clientId: string) => (await apiCall<{ data: any[] }>(`/api/phantom/clients/${clientId}/links`)).data || [],
  createLink: (clientId: string, data: any) =>
    apiCall<{
      data: {
        id: string; token: string; path: string; url: string; expiresAt: string; expiresInMinutes: number;
        mode: string; destination: string; destinationLabel: string; intent: string;
        maxUses: number | null; allowView: boolean; allowDownload: boolean;
        document: { id: string; title: string; reference: string } | null;
      };
      message: string;
    }>(
      `/api/phantom/clients/${clientId}/links`, { method: 'POST', body: JSON.stringify(data) },
    ),
  revokeLink: (linkId: string) => apiCall<{ message: string }>(`/api/phantom/client-links/${linkId}/revoke`, { method: 'POST' }),

  /**
   * The client activity timeline. Entries are built and filtered server-side
   * (kind / project / document); `meta.counts` counts the client's whole loaded
   * history so the filter chips stay honest. Nothing sensitive is returned — the
   * server drops credentials and internal keys before it answers.
   */
  activity: async (
    clientId: string,
    limit = 60,
    filters: { kind?: string | null; project?: string | null; document?: string | null } = {},
  ) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (filters.kind) query.set('kind', filters.kind);
    if (filters.project) query.set('project', filters.project);
    if (filters.document) query.set('document', filters.document);
    const payload = await apiCall<{ data: any[]; meta?: any }>(
      `/api/phantom/clients/${clientId}/activity?${query.toString()}`,
    );
    return {
      entries: payload.data || [],
      meta: payload.meta || { total: 0, counts: { all: 0 }, kinds: [], filters: {} },
    };
  },

  /** Publishable Vault sources for the publishing workflow (internal picker). */
  vaultSources: async (search = '') => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return (await apiCall<{ data: any[] }>(`/api/phantom/client-vault-sources${query}`)).data || [];
  },

  /** Delete a client document. It is snapshotted into the existing Recycle Bin. */
  deleteDocument: (documentId: string) =>
    apiCall<{ message: string }>(`/api/phantom/client-documents/${documentId}`, { method: 'DELETE' }),

  /** The granular capability catalog plus the caller's own effective set. */
  capabilities: async () => (await apiCall<{ data: any }>('/api/phantom/client-capabilities')).data,

  /** The client permission matrix (PHANTOM, or a delegated permission manager). */
  permissionMatrix: async () => (await apiCall<{ data: any }>('/api/phantom/client-permissions')).data,
  setMemberPermissions: (memberProfileId: number, permissions: string[]) =>
    apiCall<{ data: any; message: string }>('/api/phantom/client-permissions', {
      method: 'POST', body: JSON.stringify({ memberProfileId, permissions }),
    }),

  /**
   * The client portal switches, and (Phase 9) the optional notification
   * switches — the same route and the same `system_settings` rows, grouped.
   */
  portalSettings: async (group: 'portal' | 'notifications' = 'portal') =>
    (await apiCall<{ data: any[] }>(`/api/phantom/client-portal-settings?group=${group}`)).data || [],
  savePortalSettings: (settings: Array<{ key: string; value: boolean }>) =>
    apiCall<{ data: any; message: string }>('/api/phantom/client-portal-settings', {
      method: 'PUT', body: JSON.stringify({ settings }),
    }),

  /** PREVIEW AS CLIENT — the same payloads the client API returns. */
  preview: async (clientId: string, projectId?: string) => {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    return (await apiCall<{ data: any }>(`/api/phantom/clients/${clientId}/preview${query}`)).data;
  },
  previewProject: async (clientId: string, projectId: string) =>
    (await apiCall<{ data: { room: any } }>(`/api/phantom/clients/${clientId}/preview/projects/${projectId}`)).data,
  previewSection: async (clientId: string, projectId: string, section: string) =>
    (await apiCall<{ data: any }>(`/api/phantom/clients/${clientId}/preview/projects/${projectId}/sections/${section}`)).data,
  previewDocument: async (clientId: string, projectId: string, documentId: string) =>
    (await apiCall<{ data: any }>(`/api/phantom/clients/${clientId}/preview/projects/${projectId}/documents/${documentId}`)).data,
};
