// API Client for BioVault Backend
// Use environment variable for API URL (default to latest Render backend)
const BASE_URL = (import.meta.env.VITE_API_URL || 'https://biovault-backend-d13a.onrender.com').trim();

const getToken = () => {
  try {
    // Try pinit_token first
    let token = localStorage.getItem('pinit_token') || sessionStorage.getItem('pinit_token');
    if (token) {
      return token;
    }
    
    // Fallback to biovault_token (user authenticated via biometric)
    token = localStorage.getItem('biovault_token') || sessionStorage.getItem('biovault_token');
    if (token) {
      return token;
    }
    
    return null;
  } catch {
    return null;
  }
};

const request = async (method: string, endpoint: string, body: any = null, requiresAuth = true) => {
  const headers: any = { 'Content-Type': 'application/json' };
  
  if (requiresAuth) {
    const token = getToken();
    if (!token && endpoint !== '/auth/login' && endpoint !== '/auth/register' && !endpoint.startsWith('/vault') && !endpoint.startsWith('/compare')) {
      throw new Error('Not authenticated');
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } else {
    // Optional auth - try to add token if available without throwing error
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const config: any = { method, headers };
  if (body) config.body = JSON.stringify(body);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Request failed');
    return data;
  } catch (error: any) {
    throw new Error(error.message || 'API request failed');
  }
};

// Auth API
export const authAPI = {
  register: (username: string, email: string, password: string) =>
    request('POST', '/auth/register', { username, email, password }, false),
  login: (email: string, password: string) =>
    request('POST', '/auth/login', { email, password }, false),
  changePassword: (new_password: string) =>
    request('POST', '/auth/change-password', { new_password }),
  getMe: () => request('GET', '/auth/me'),
};

// Vault API
export const vaultAPI = {
  save: (data: any) => request('POST', '/vault/save', data, false),
  list: (userId?: string) => {
    const endpoint = userId ? `/vault/list?user_id=${encodeURIComponent(userId)}` : '/vault/list';
    return request('GET', endpoint, null, false);
  },
  getOne: (id: string, userId?: string) => {
    const endpoint = userId ? `/vault/${id}?user_id=${encodeURIComponent(userId)}` : `/vault/${id}`;
    return request('GET', endpoint, null, false);
  },
  download: async (assetId: string, userId?: string) => {
    /**
     * Download image as file (JPG, PNG, etc.)
     * For Capacitor/Android: saves to Documents/PINIT or App cache
     * For Web: triggers browser download
     */
    try {
      // Use backend API URL correctly
      const endpoint = userId 
        ? `${BASE_URL}/vault/${assetId}/download?user_id=${encodeURIComponent(userId)}`
        : `${BASE_URL}/vault/${assetId}/download`;
      
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'image/*' }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Download Error:', response.status, errorText);
        throw new Error(`Download failed: ${response.status} ${response.statusText}. ${errorText}`);
      }
      
      const blob = await response.blob();
      
      // Extract filename from Content-Disposition header if available
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'image.jpg';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }
      
      // Check if running on Capacitor (mobile)
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
        
        // Convert blob to base64
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = window.btoa(binary);
        
        
        // Android 11+ scoped storage: use Documents directory
        try {
          const docPath = `PINIT_Downloads/${filename}`;
          
          await Filesystem.writeFile({
            path: docPath,
            data: base64,
            directory: Directory.Documents,
            recursive: true,
          });
          
          
          try {
            const uri = await Filesystem.getUri({
              path: docPath,
              directory: Directory.Documents,
            });
          } catch (uriErr) {
          }
          
          return { success: true, filename, location: 'Documents/PINIT_Downloads' };
        } catch (docsErr: any) {
          console.error('❌ Documents save failed:', docsErr);
          
          // Fallback 1: Try app cache directory
          try {
            const cachePath = filename;
            
            await Filesystem.writeFile({
              path: cachePath,
              data: base64,
              directory: Directory.Cache,
              recursive: true,
            });
            
            return { success: true, filename, location: 'App Cache (Temp)' };
          } catch (cacheErr: any) {
            console.error('❌ Cache save failed:', cacheErr);
            throw new Error(`Failed to save file: ${docsErr.message}`);
          }
        }
      } else {
        // Web browser - use standard download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        return { success: true, filename, location: 'Downloads' };
      }
    } catch (error) {
      console.error('Download error:', error);
      return { success: false, error: String(error) };
    }
  },
  delete: (id: string, userId?: string) => {
    const endpoint = userId ? `/vault/${id}?user_id=${encodeURIComponent(userId)}` : `/vault/${id}`;
    return request('DELETE', endpoint, null, false);
  },
  verifyByHash: (hash: string) => request('GET', `/vault/verify/${hash}`, null, false),
  search: (q: string) => request('GET', `/vault/search/query?q=${encodeURIComponent(q)}`, null, false),
};

// Certificates API
export const certAPI = {
  save: (data: any) => request('POST', '/certificates/save', data),
  list: () => request('GET', '/certificates/list'),
  delete: (id: string) => request('DELETE', `/certificates/${id}`),
};

// Comparison API
export const compareAPI = {
  save: (data: any) => request('POST', '/compare/save', data),
  getHistory: () => request('GET', '/compare/history'),
  getByAsset: (assetId: string) => request('GET', `/compare/${assetId}`),
  getPublic: (token: string) => request('GET', `/compare/public/${token}`, null, false),
};

// Admin API
export const adminAPI = {
  getUsers: () => request('GET', '/admin/users'),
  getAllVault: () => request('GET', '/admin/vault'),
  getAllReports: () => request('GET', '/admin/reports'),
  suspendUser: (id: string, reason: string) => request('PATCH', `/admin/users/${id}/suspend`, { reason }),
  activateUser: (id: string) => request('PATCH', `/admin/users/${id}/activate`),
  getAuditLog: () => request('GET', '/admin/audit-log'),
  getStats: () => request('GET', '/admin/stats'),
};
