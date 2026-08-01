// Cloudflare Workers API Client for CODE Rx SOCIETY
// Replaces Supabase client with Cloudflare Workers endpoints

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

// Helper function for API calls
async function apiCall(endpoint: string, options: RequestInit = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Database helper functions
export const db = {
  // Applications
  applications: {
    create: async (data: { name: string; email: string; phone: string }) => {
      return await apiCall('/api/applications', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    getAll: async () => {
      const result = await apiCall('/api/applications');
      return result.data || [];
    },
    updateStatus: async (id: number, status: 'approved' | 'rejected') => {
      return await apiCall(`/api/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    }
  },

  // Subscribers
  subscribers: {
    create: async (data: { email: string; name?: string; phone?: string }) => {
      return await apiCall('/api/subscribers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    getAll: async () => {
      const result = await apiCall('/api/subscribers');
      return result.data || [];
    }
  },

  // Contact Messages
  contacts: {
    create: async (data: { name: string; email: string; subject: string; message: string }) => {
      return await apiCall('/api/contacts', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    getAll: async () => {
      const result = await apiCall('/api/contacts');
      return result.data || [];
    },
    updateStatus: async (id: number, status: 'read' | 'archived') => {
      return await apiCall(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    }
  },

  // Site Content
  siteContent: {
    get: async () => {
      const result = await apiCall('/api/site-content');
      return result.data;
    },
    update: async (data: any) => {
      return await apiCall('/api/site-content', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    }
  },

  // Members
  members: {
    getAll: async () => {
      const result = await apiCall('/api/members');
      return result.data || [];
    },
    create: async (data: { name: string; email: string; phone: string; role?: string }) => {
      return await apiCall('/api/members', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    update: async (id: number, data: { points?: number; level?: string; is_active?: boolean }) => {
      return await apiCall(`/api/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    }
  },

  // Stats
  getStats: async () => {
    const result = await apiCall('/api/stats');
    return result.data;
  }
};

// File upload to R2
export const uploadFile = async (file: File, folder: string = 'uploads') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  
  try {
    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    
    return data;
  } catch (error) {
    console.error('Upload Error:', error);
    throw error;
  }
};

// Authentication
export const auth = {
  login: async (email: string, password: string) => {
    return await apiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  register: async (email: string, password: string) => {
    return await apiCall('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }
};

// Health check
export const healthCheck = async () => {
  try {
    const result = await apiCall('/api/health');
    return result.status === 'ok';
  } catch {
    return false;
  }
};
