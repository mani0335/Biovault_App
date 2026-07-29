import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { appStorage } from "@/lib/storage";
import { PINITVaultDashboard } from "@/components/PINITVaultDashboard";
import { registerPushNotifications } from "@/lib/pushNotificationService";

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isTemporaryAccess, setIsTemporaryAccess] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);


  useEffect(() => {
    const loadUser = async () => {
      // Poll for up to 10s: Capacitor Preferences bridge takes time after Android
      // kills the WebView process (e.g. when camera opens and OS reclaims memory).
      const pollMs = 400;
      const maxMs = 10000;
      const deadline = Date.now() + maxMs;
      let id: string | null = null;

      while (Date.now() < deadline) {
        try {
          id = await appStorage.getItem("biovault_userId");
        } catch { /* bridge not ready */ }
        if (!id) id = localStorage.getItem("biovault_userId");
        if (id) {
          localStorage.setItem("biovault_userId", id);
          break;
        }
        await new Promise(r => setTimeout(r, pollMs));
      }

      setUserId(id);
      if (id) registerPushNotifications(id).catch(() => {});
      setIsLoadingUser(false);
    };
    loadUser();

    // Navigate to Activity when a push notification is tapped
    const onOpenActivity = () => navigate("/dashboard");
    window.addEventListener("pinit:open-activity", onOpenActivity);
    return () => window.removeEventListener("pinit:open-activity", onOpenActivity);

    // Check if user has temporary access
    const tempAccess = (location.state as any)?.tempAccess || false;
    const restricted = (location.state as any)?.restricted || false;
    
    if (tempAccess || restricted) {
      setIsTemporaryAccess(true);
      setIsRestricted(true);
    }
  }, [location.state]);

  // Show loading state while userId is loading
  if (isLoadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-black">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-3 border-cyan-500/30 border-t-cyan-500 rounded-full"></div>
          <p className="text-cyan-400/70 text-sm font-mono">🔄 Loading vault...</p>
          <p className="text-slate-500 text-xs">(Retrieving your vault...)</p>
        </motion.div>
      </div>
    );
  }

  const handleLogout = () => {
    // Clear auth tokens only — keep userId so vault data persists on next login
    localStorage.removeItem("biovault_token");
    localStorage.removeItem("biovault_refresh_token");
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("sessionExpiryTime");

    appStorage.removeItem("biovault_token");
    appStorage.removeItem("biovault_refresh_token");
    appStorage.removeItem("sessionToken");
    appStorage.removeItem("sessionExpiryTime");

    navigate("/login");
  };

  const handleBack = () => {
    navigate("/login");
  };

  // SAFETY CHECK: If we somehow got here without a userId, redirect back to login, NOT register
  if (!userId && !isLoadingUser) {
    console.error('❌ [Dashboard] CRITICAL: No userId found - redirecting to login');
    // Don't redirect again if already in a navigation state
    setTimeout(() => {
      navigate("/login", { replace: true });
    }, 0);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-black">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-3 border-red-500/30 border-t-red-500 rounded-full"></div>
          <p className="text-red-400/70 text-sm font-mono">⚠️ Session expired, redirecting to login...</p>
        </motion.div>
      </div>
    );
  }

  const handleCompleteRegistration = () => {
    navigate("/register", { replace: true });
  };

  
  return <PINITVaultDashboard userId={userId || undefined} />;
};

export default Dashboard;