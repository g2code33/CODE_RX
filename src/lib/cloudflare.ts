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
    updateStatus: (id: number, status: 'approved' | 'rejected') =>
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
    update: (id: number, data: { points?: number; level?: string; is_active?: boolean }) =>
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
    reviewApplication: (id: number, status: 'approved' | 'rejected' | 'pending', note?: string) =>
      apiCall(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status, note }) }),
    createFromApplication: (id: number, data: any) =>
      apiCall<{ data: any }>(`/api/phantom/applications/${id}/create-member`, { method: 'POST', body: JSON.stringify(data) }),
    createMember: (data: any) => apiCall<{ data: any }>('/api/phantom/members', { method: 'POST', body: JSON.stringify(data) }),
    members: async (status?: string) => (await apiCall<{ data: any[] }>(`/api/phantom/members${status ? `?status=${encodeURIComponent(status)}` : ''}`)).data || [],
    updateMember: (id: number, data: any) => apiCall(`/api/phantom/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    memberHistory: async (id: number) => (await apiCall<{ data: any }>(`/api/phantom/members/${id}/history`)).data,
    scoreHistory: async (id: number) => (await apiCall<{ data: any[] }>(`/api/phantom/members/${id}/score-history`)).data || [],
    adjustScore: (id: number, data: { action: 'add' | 'deduct' | 'set'; points: number; reason: string }) =>
      apiCall<{ data: any }>(`/api/phantom/members/${id}/score`, { method: 'POST', body: JSON.stringify(data) }),
    scoreRules: async () => (await apiCall<{ data: any[] }>('/api/phantom/score-rules')).data || [],
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
  login: async (email: string, password: string): Promise<AuthUser> => {
    const data = await apiCall<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
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
