import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { appStorage } from "@/lib/storage";

interface ProtectedRouteProps {
  children: JSX.Element;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  // ── Fast synchronous check via localStorage ──────────────────────────────
  // On web / PWA, localStorage always has the tokens (Login.tsx writes to both).
  // This avoids a 400 ms "checking" flash on every protected route transition.
  const _syncToken  = localStorage.getItem("biovault_token");
  const _syncUserId = localStorage.getItem("biovault_userId");
  const syncAuthorized = !!(_syncToken && _syncUserId);

  const [state, setState] = useState<"checking" | "authorized" | "unauthorized">(
    syncAuthorized ? "authorized" : "checking"
  );

  useEffect(() => {
    // Already verified via localStorage — no async check needed
    if (syncAuthorized) return;

    const verify = async () => {
      // Poll every 400ms for up to 12s: Capacitor Preferences bridge can take
      // 2-5s to initialize after Android kills the WebView process (e.g. during camera).
      const pollMs = 400;
      const maxMs = 12000;
      const deadline = Date.now() + maxMs;

      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, pollMs));

        let token: string | null = null;
        let userId: string | null = null;

        try {
          token  = await appStorage.getItem("biovault_token");
          userId = await appStorage.getItem("biovault_userId");
          if (token && userId) {
            localStorage.setItem("biovault_token",  token);
            localStorage.setItem("biovault_userId", userId);
          }
        } catch { /* bridge not ready yet */ }

        if (!token)  token  = localStorage.getItem("biovault_token");
        if (!userId) userId = localStorage.getItem("biovault_userId");

        if (token && userId) {
          setState("authorized");
          return;
        }
      }

      setState("unauthorized");
    };

    verify();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "checking") {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-cyan-400 text-sm font-mono">🔐 Verifying authentication...</p>
          <p className="text-slate-500 text-xs mt-2">(Checking auth credentials from storage...)</p>
        </div>
      </div>
    );
  }

  return state === "authorized" ? children : <Navigate to="/login" replace />;
}
