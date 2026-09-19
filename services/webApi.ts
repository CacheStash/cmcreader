// Web API Adapter implementing ElectronAPI interface via HTTP fetch

const TOKEN_KEY = 'zen_web_token';

export const isElectron = typeof window !== 'undefined' && Boolean(window.navigator?.userAgent?.includes('Electron'));

export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setStoredToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

const getAuthHeaders = (): Record<string, string> => {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

async function postJson<T>(url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('zen:unauthorized'));
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return await res.json();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('zen:unauthorized'));
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return await res.json();
}

// Auth API helpers
export const authApi = {
  checkAuth: async (): Promise<{ authenticated: boolean; username?: string }> => {
    try {
      const res = await getJson<{ authenticated: boolean; username?: string }>('/api/auth/me');
      return res;
    } catch {
      return { authenticated: false };
    }
  },

  login: async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.token) {
        setStoredToken(data.token);
        return { success: true };
      }
      return { success: false, error: data.error || 'Login failed' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  },

  logout: async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch {}
    setStoredToken(null);
    window.dispatchEvent(new CustomEvent('zen:unauthorized'));
  },
};

// Full ElectronAPI implementation for Web Mode
export const webApi = {
  selectFolder: async (): Promise<string | null> => {
    // In web mode, prompt user for server-side root path
    try {
      const current = (await webApi.getSettings()).rootFolder || '';
      const input = window.prompt(
        'Enter comic root folder path on the server (e.g. H:\\cmc or /path/to/comics):',
        current
      );
      return input ? input.trim() : null;
    } catch {
      return null;
    }
  },

  getSettings: async () => {
    return await getJson<{ rootFolder?: string; pinEnabled?: boolean; pin?: string }>('/api/settings');
  },

  saveSettings: async (settings: any) => {
    return await postJson('/api/settings', settings);
  },

  scanFolder: async (rootPath: string) => {
    return await postJson<any[]>('/api/scan', { rootPath });
  },

  getCover: async (filePath: string, format: string) => {
    return await postJson<string | { isPdf: boolean; filePath: string } | null>('/api/cover', { filePath, format });
  },

  saveCover: async (filePath: string, dataUrl: string) => {
    return await postJson<boolean>('/api/save-cover', { filePath, dataUrl });
  },

  getPageList: async (filePath: string, format: string) => {
    return await postJson<string[]>('/api/page-list', { filePath, format });
  },

  getPageData: async (filePath: string, format: string, pageName: string) => {
    return await postJson<string | null>('/api/page-data', { filePath, format, pageName });
  },

  readFileBuffer: async (filePath: string): Promise<ArrayBuffer | null> => {
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/file?filePath=${encodeURIComponent(filePath)}`, {
        headers,
      });

      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('zen:unauthorized'));
        return null;
      }
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch (e) {
      console.error('Failed to fetch file buffer:', e);
      return null;
    }
  },

  openPathInExplorer: async (_filePath: string): Promise<boolean> => {
    // Explorer cannot be opened from a remote browser client
    return false;
  },
};
