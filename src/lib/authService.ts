type RegisterPayload = {
  userId: string;
  deviceToken: string;
  webauthn?: unknown;
  faceEmbedding?: number[] | null;
};

type AuthUserRecord = {
  userId: string;
  deviceToken: string;
  webauthn?: unknown;
  faceEmbedding?: number[] | null;
  tempCode?: string;
};

type AuthStore = {
  users: Record<string, AuthUserRecord>;
};

const STORE_KEY = "biovault_auth_store_v1";

function apiBase(): string {
  const baseUrl = (import.meta.env.VITE_API_URL || "https://biovault-backend-d13a.onrender.com").trim();
  return baseUrl;
}

// Test backend connectivity
export async function testBackendConnectivity(): Promise<{ reachable: boolean; error?: string; details?: any }> {
  const apiUrl = apiBase();
  
  try {
    // Test basic connectivity with a simple GET request
    const response = await fetch(`${apiUrl}/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000) // 20 second timeout
    });
    
    
    const text = await response.text();
    
    return {
      reachable: response.ok || response.status === 404, // 404 means server is running but endpoint doesn't exist
      details: {
        status: response.status,
        statusText: response.statusText,
        responsePreview: text.substring(0, 200)
      }
    };
  } catch (error: any) {
    console.error('Backend connectivity test failed:', error);
    return {
      reachable: false,
      error: error.message || 'Unknown connectivity error'
    };
  }
}

const FORCE_REMOTE = String(import.meta.env.VITE_FORCE_REMOTE || "").toLowerCase() === "true";

function shouldUseRemoteApi(): boolean {
  const base = apiBase();
  if (FORCE_REMOTE) return true; // enforce remote-only when requested
  if (!base) return false;
  const lower = base.toLowerCase();
  if (lower.includes("localhost") || lower.includes("127.0.0.1")) return false;
  return true;
}

function loadStore(): AuthStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { users: {} };
    const parsed = JSON.parse(raw) as AuthStore;
    if (!parsed || typeof parsed !== "object" || !parsed.users) {
      return { users: {} };
    }
    return parsed;
  } catch {
    return { users: {} };
  }
}

function saveStore(store: AuthStore): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function upsertLocalUser(payload: RegisterPayload): { tempCode: string } {
  const store = loadStore();
  const tempCode = String(Math.floor(100000 + Math.random() * 900000));
  store.users[payload.userId] = {
    userId: payload.userId,
    deviceToken: payload.deviceToken,
    webauthn: payload.webauthn,
    faceEmbedding: payload.faceEmbedding ?? null,
    tempCode,
  };
  saveStore(store);
  return { tempCode };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!denom) return 0;
  return dot / denom;
}

export async function registerUser(payload: RegisterPayload): Promise<{ ok: true; tempCode?: string; mode: "remote" }> {
  // FAST MODE - Skip connectivity test for speed
  const apiUrl = apiBase(); // Will always be Render URL
  
  
  // Skip connectivity test for speed - go directly to registration
  
  
  let lastError: any = null;
  
  // Retry logic for registration
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for better reliability

      const response = await fetch(`${apiUrl}/auth/biometric-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      
      let data;
      try {
        data = JSON.parse(responseText) as { error?: string; tempCode?: string; ok?: boolean; message?: string };
      } catch (parseErr: any) {
        console.error('❌ JSON parse failed:', parseErr.message);
        lastError = new Error(`Failed to parse server response: ${parseErr.message}`);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw lastError;
      }
      
      if (!response.ok) {
        lastError = new Error(data.message || data.error || `Registration failed (${response.status})`);
        
        // Retry on network/server errors
        if (attempt < 3 && response.status >= 500) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw lastError;
      }
    
    // ✅ STORE PERMANENT DEVICE UUID AFTER REGISTRATION SUCCESS
    localStorage.setItem('biovault_registeredDeviceToken', payload.deviceToken);
    localStorage.setItem('biovault_registrationTime', new Date().toISOString());
    
    return { ok: true, tempCode: data.tempCode, mode: "remote" };
    } catch (fetchErr: any) {
      console.error('❌ Network error during registration:', fetchErr.message);
      console.error('❌ Error name:', fetchErr.name);
      console.error('❌ Backend URL:', apiUrl);
      
      // Handle AbortError specifically
      if (fetchErr.name === 'AbortError') {
        console.error('❌ Request timed out - backend took too long to respond');
        lastError = new Error('Registration timed out. Backend server may be slow. Please try again.');
      } else {
        lastError = fetchErr;
      }
      
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw new Error(`Failed to register: ${lastError.message}. Backend: ${apiUrl}`);
    }
  }
  
  console.error('❌ Registration failed after all retries:', lastError?.message);
  throw lastError;
}

export async function validateUser(userId: string, deviceToken: string): Promise<{ authorized: boolean; reason?: string; mode: "remote" | "local" }> {
  if (shouldUseRemoteApi()) {
    const apiUrl = apiBase();
    const resp = await fetch(`${apiUrl}/api/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, deviceToken }),
    });
    
    // Must use .text() then parse to catch HTML responses
    const responseText = await resp.text();
    
    let data;
    try {
      data = JSON.parse(responseText) as { authorized?: boolean; reason?: string };
    } catch (parseErr: any) {
      console.error('❌ JSON parse failed:', parseErr.message);
      console.error('❌ Response starts with:', responseText.substring(0, 50));
      return { authorized: false, reason: `Server error: ${parseErr.message}`, mode: "remote" };
    }
    
    if (resp.ok && data.authorized) return { authorized: true, mode: "remote" };
    return { authorized: false, reason: data.reason || `User not authorized (${resp.status})`, mode: "remote" };
  }

  const user = loadStore().users[userId];
  if (!user) return { authorized: false, reason: "User not registered", mode: "local" };
  if (user.deviceToken !== deviceToken) return { authorized: false, reason: "Device mismatch", mode: "local" };
  return { authorized: true, mode: "local" };
}

export async function verifyFace(userId: string, embedding: number[]): Promise<{ ok: boolean; match: boolean; score: number; token?: string; refreshToken?: string; reason?: string; mode: "remote" | "local" }> {
  if (shouldUseRemoteApi()) {
    const apiUrl = apiBase();
    // FIXED: Call the correct Python FastAPI backend endpoint
    const resp = await fetch(`${apiUrl}/auth/verify-face`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, faceEmbedding: embedding }),
    });
    
    // Must use .text() then parse to catch HTML responses
    const responseText = await resp.text();
    
    let data;
    try {
      data = JSON.parse(responseText) as {
        verified?: boolean;
        ok?: boolean;
        match?: boolean;
        score?: number;
        similarity?: number;
        threshold?: number;
        token?: string;
        refreshToken?: string;
        reason?: string;
        message?: string;
      };
    } catch (parseErr: any) {
      console.error('❌ JSON parse failed:', parseErr.message);
      console.error('❌ Response starts with:', responseText.substring(0, 50));
      return { ok: false, match: false, score: 0, reason: `Server error: ${parseErr.message}`, mode: "remote" };
    }
    
    // Python backend returns { ok: bool, match: bool, score: number, token?, refreshToken?, reason?, message? }
    // EXPLICIT CHECK: All of these conditions must be true for success:
    // 1. Backend returned ok: true (not false, not undefined)
    // 2. Backend returned match: true (not false, not undefined)
    // 3. Access token is present
    // 4. Refresh token is present
    const backendOk = data.ok === true;
    const backendMatch = data.match === true;
    const hasAccessToken = !!data.token;
    const hasRefreshToken = !!data.refreshToken;
    const score = data.similarity || data.score || 0;
    
    
    // SUCCESS: Backend confirmed match AND both tokens are present
    if (backendOk && backendMatch && hasAccessToken && hasRefreshToken) {
      return {
        ok: true,
        match: true,
        score,
        token: data.token,
        refreshToken: data.refreshToken,
        mode: "remote",
      };
    }
    
    // FAILURE: Any of the requirements failed
    
    return {
      ok: false,
      match: false,
      score,
      reason: data.reason || data.message || "Face verification failed - please try again",
      mode: "remote",
    };
  }

  const user = loadStore().users[userId];
  if (!user) return { ok: false, match: false, score: 0, reason: "User not registered", mode: "local" };
  if (!user.faceEmbedding || !user.faceEmbedding.length) {
    return { ok: false, match: false, score: 0, reason: "Face profile not enrolled", mode: "local" };
  }

  const score = cosineSimilarity(user.faceEmbedding, embedding);
  const match = score >= 0.70; // 70% similarity threshold (backend default)
  if (!match) {
    return { ok: false, match: false, score, reason: "Face does not match. Please ensure only YOUR face is visible.", mode: "local" };
  }

  return {
    ok: true,
    match: true,
    score,
    token: `local-token-${Date.now()}`,
    refreshToken: `local-refresh-${Date.now()}`,
    mode: "local",
  };
}

export async function requestTempCode(userId: string): Promise<{ ok: boolean; tempCode?: string; reason?: string; mode: "remote" | "local" }> {
  if (shouldUseRemoteApi()) {
    const apiUrl = apiBase();
    const resp = await fetch(`${apiUrl}/api/temp-code/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    
    const responseText = await resp.text();
    
    let data;
    try {
      data = JSON.parse(responseText) as { tempCode?: string; reason?: string };
    } catch (parseErr: any) {
      console.error('❌ JSON parse failed:', parseErr.message);
      console.error('❌ Response starts with:', responseText.substring(0, 50));
      return { ok: false, reason: `Server error: ${parseErr.message}`, mode: "remote" };
    }
    
    if (resp.ok && data.tempCode) return { ok: true, tempCode: data.tempCode, mode: "remote" };
    return { ok: false, reason: data.reason || "Could not issue temp code", mode: "remote" };
  }

  const store = loadStore();
  const user = store.users[userId];
  if (!user) return { ok: false, reason: "User not registered", mode: "local" };
  const tempCode = String(Math.floor(100000 + Math.random() * 900000));
  user.tempCode = tempCode;
  saveStore(store);
  return { ok: true, tempCode, mode: "local" };
}

export async function verifyTempCode(userId: string, code: string): Promise<{ ok: boolean; reason?: string; mode: "remote" | "local" }> {
  if (shouldUseRemoteApi()) {
    const apiUrl = apiBase();
    const resp = await fetch(`${apiUrl}/api/temp-code/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, code }),
    });
    
    const responseText = await resp.text();
    
    let data;
    try {
      data = JSON.parse(responseText) as { ok?: boolean; reason?: string };
    } catch (parseErr: any) {
      console.error('❌ JSON parse failed:', parseErr.message);
      console.error('❌ Response starts with:', responseText.substring(0, 50));
      return { ok: false, reason: `Server error: ${parseErr.message}`, mode: "remote" };
    }
    
    if (resp.ok && data.ok) return { ok: true, mode: "remote" };
    return { ok: false, reason: data.reason || "Invalid temp code", mode: "remote" };
  }

  const user = loadStore().users[userId];
  if (!user) return { ok: false, reason: "User not registered", mode: "local" };
  if (!user.tempCode) return { ok: false, reason: "No temp code issued", mode: "local" };
  if (user.tempCode !== code) return { ok: false, reason: "Invalid temp code", mode: "local" };
  return { ok: true, mode: "local" };
}

export async function rebindDevice(userId: string, deviceToken: string): Promise<{ ok: boolean; reason?: string; mode: "remote" | "local" }> {
  if (shouldUseRemoteApi()) {
    const apiUrl = apiBase();
    const resp = await fetch(`${apiUrl}/api/device/rebind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, deviceToken }),
    });
    
    const responseText = await resp.text();
    
    let data;
    try {
      data = JSON.parse(responseText) as { ok?: boolean; reason?: string };
    } catch (parseErr: any) {
      console.error('❌ JSON parse failed:', parseErr.message);
      console.error('❌ Response starts with:', responseText.substring(0, 50));
      return { ok: false, reason: `Server error: ${parseErr.message}`, mode: "remote" };
    }
    
    if (resp.ok && data.ok) return { ok: true, mode: "remote" };
    return { ok: false, reason: data.reason || "Device update failed", mode: "remote" };
  }

  const store = loadStore();
  const user = store.users[userId];
  if (!user) return { ok: false, reason: "User not registered", mode: "local" };
  user.deviceToken = deviceToken;
  saveStore(store);
  return { ok: true, mode: "local" };
}

export async function verifyFingerprint(userId: string, credential: string): Promise<{ ok: boolean; match: boolean; reason?: string; mode: "remote" | "local" }> {
  if (shouldUseRemoteApi()) {
    const apiUrl = apiBase();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const resp = await fetch(`${apiUrl}/auth/verify-fingerprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, credential }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await resp.json();
      
      // SUCCESS: Fingerprint found in database, proceed to face authentication
      if (resp.ok && data.match) {
        return { ok: true, match: true, mode: "remote" };
      }
      
      // FAILURE: Fingerprint not found or doesn't match
      return { ok: false, match: false, reason: data.reason || "Fingerprint not found in database. Please register first.", mode: "remote" };
    } catch (error: any) {
      console.error('Fingerprint verification error:', error);
      if (error.name === 'AbortError') {
        return { ok: false, match: false, reason: "Verification timeout - please try again", mode: "remote" };
      }
      return { ok: false, match: false, reason: "Database verification failed", mode: "remote" };
    }
  }

  // Local fallback
  const user = loadStore().users[userId];
  if (!user) return { ok: false, match: false, reason: "User not found", mode: "local" };
  if (!user.webauthn) return { ok: false, match: false, reason: "Fingerprint not registered", mode: "local" };
  return { ok: true, match: true, mode: "local" };
}

// POST /api/user/check - Check if user exists with registered fingerprint (for login)
export async function checkUserRegistered(userId: string, retries = 3): Promise<{ ok: boolean; reason?: string; fingerprintRegistered?: boolean; faceRegistered?: boolean; mode: "remote" }> {
  // ALWAYS use remote API - no local fallback
  const apiUrl = apiBase();
  
  let lastError: any = null;
  
  // Retry logic for resilience
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout for Render compatibility
      
      const resp = await fetch(`${apiUrl}/api/user/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const responseText = await resp.text();
      
      let result;
      try {
        result = JSON.parse(responseText) as { ok?: boolean; reason?: string; fingerprintRegistered?: boolean; faceRegistered?: boolean };
      } catch (parseErr: any) {
        console.error('❌ JSON parse failed:', parseErr.message);
        lastError = new Error(`Failed to parse server response: ${parseErr.message}`);
        
        // Retry on parse error (might be temporary)
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw lastError;
      }
      
      if (!resp.ok) {
        lastError = new Error(result.reason || `Check failed (${resp.status})`);
        
        // Retry on network/server errors
        if (attempt < retries && resp.status >= 500) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw lastError;
      }
      
      if (!result.ok) {
        lastError = new Error(result.reason || 'User check failed');
        
        // Retry on "user not found" as MongoDB might not be synced yet
        if (attempt < retries && result.reason?.includes('not found')) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw lastError;
      }
      
      return {
        ok: true,
        fingerprintRegistered: result.fingerprintRegistered ?? false,
        faceRegistered: result.faceRegistered ?? false,
        mode: "remote"
      };
    } catch (err: any) {
      lastError = err;
      console.error(`❌ Error on attempt ${attempt}:`, err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
  
  console.error('❌ User check failed after all retries:', lastError?.message);
  throw lastError;
}


// ── New Backend Verification Endpoints ────────────────────────────────────────

export async function verifyFingerprintBackend(userId: string, webauthn?: any): Promise<{ 
  verified: boolean; 
  userId: string | null; 
  message: string;
  userRecord?: any;
  mode: "remote";
}> {
  const apiUrl = apiBase();
  
  try {
    const resp = await fetch(`${apiUrl}/auth/verify-fingerprint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        userId,
        webauthn: webauthn || null
      }),
    });
    
    const responseText = await resp.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr: any) {
      console.error('❌ JSON parse failed:', parseErr.message);
      return { 
        verified: false, 
        userId: null, 
        message: `Server error: ${parseErr.message}`,
        mode: "remote"
      };
    }
    
    return {
      verified: data.verified || false,
      userId: data.userId || null,
      message: data.message || "Verification failed",
      userRecord: data.userRecord,
      mode: "remote"
    };
  } catch (err: any) {
    console.error('❌ Fingerprint verification error:', err.message);
    return {
      verified: false,
      userId: null,
      message: `Network error: ${err.message}`,
      mode: "remote"
    };
  }
}


export async function verifyFaceBackend(faceEmbedding: number[], userId?: string): Promise<{
  verified: boolean;
  userId: string | null;
  message: string;
  similarity: number;
  mode: "remote";
  token?: string;
  refreshToken?: string;
}> {
  const apiUrl = apiBase();
  const endpoint = `${apiUrl}/auth/verify-face`;
  
  
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faceEmbedding,
        userId: userId || null
      }),
    });
    
    const responseText = await resp.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr: any) {
      console.error('❌ JSON parse failed:', parseErr.message);
      return {
        verified: false,
        userId: null,
        message: `Server error: ${parseErr.message}`,
        similarity: 0,
        mode: "remote",
        token: undefined,
        refreshToken: undefined
      };
    }
    
    return {
      verified: data.verified || false,
      userId: data.userId || null,
      message: data.message || "Face verification failed",
      similarity: data.similarity || 0,
      mode: "remote",
      token: data.token,
      refreshToken: data.refreshToken
    };
  } catch (err: any) {
    console.error('❌ Face verification error:', err.message);
    return {
      verified: false,
      userId: null,
      message: `Network error: ${err.message}`,
      similarity: 0,
      mode: "remote",
      token: undefined,
      refreshToken: undefined
    };
  }
}
