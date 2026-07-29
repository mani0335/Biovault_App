import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Fingerprint, ScanFace, Lock, ChevronRight, Sparkles, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { appStorage } from "@/lib/storage";

const Index = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"splash" | "welcome">("splash");
  const [routing, setRouting] = useState(true);
  const routeDone = useRef(false);

  useEffect(() => {
    const route = async () => {
      try {
        await Promise.all([
          new Promise(resolve => setTimeout(resolve, 2800)),
          fetch(`${import.meta.env.VITE_API_URL || 'https://biovault-backend-d13a.onrender.com'}/api/health`, {
            method: 'GET', signal: AbortSignal.timeout(55000),
          }).catch(() => {}),
        ]);

        const sessionToken = await appStorage.getItem('sessionToken');
        const expiryTime = await appStorage.getItem('sessionExpiryTime');
        const userId = await appStorage.getItem('biovault_userId');

        if (sessionToken && expiryTime && userId) {
          const tokenExpiry = parseInt(expiryTime);
          if (Date.now() < tokenExpiry) {
            routeDone.current = true;
            navigate('/dashboard', { replace: true });
            return;
          }
          const refreshToken = await appStorage.getItem('refreshToken');
          if (refreshToken) {
            try {
              const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://biovault-backend-d13a.onrender.com'}/api/refresh-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken, userId }),
              });
              if (res.ok) {
                const data = await res.json();
                await appStorage.setItem('sessionToken', data.token);
                await appStorage.setItem('sessionExpiryTime', (Date.now() + 3600000).toString());
                routeDone.current = true;
                navigate('/dashboard', { replace: true });
                return;
              }
            } catch { /* refresh failed */ }
          }
        }

        if (userId) {
          // Biometric login stores biovault_token (not sessionToken).
          // After a WebView restart (e.g. camera activity killed the process),
          // sessionToken is missing but biovault_token persists in native prefs.
          // Skip re-authentication in that case and go straight to dashboard.
          const biovaultToken = await appStorage.getItem('biovault_token');
          if (biovaultToken) {
            // Mirror to localStorage so ProtectedRoute's sync check passes instantly.
            localStorage.setItem('biovault_token', biovaultToken);
            localStorage.setItem('biovault_userId', userId);
            routeDone.current = true;
            navigate('/dashboard', { replace: true });
            return;
          }
          // userId exists but no token — must re-authenticate.
          routeDone.current = true;
          navigate('/login', { replace: true });
          return;
        }

        setRouting(false);
      } catch {
        setRouting(false);
      }
    };

    setTimeout(() => {
      if (!routeDone.current) setPhase("welcome");
    }, 2400);
    route();
  }, [navigate]);

  const taglines = [
    { word: "Secure", icon: Lock, desc: "End-to-end encrypted vault" },
    { word: "Ensure", icon: Eye, desc: "Verify ownership instantly" },
    { word: "Protect", icon: Shield, desc: "DNA-level file protection" },
  ];

  return (
    <div className="fixed inset-0 bg-white overflow-hidden flex flex-col">
      {/* Animated gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%]"
          style={{
            background: "conic-gradient(from 0deg, transparent 0%, rgba(139,92,246,0.06) 10%, transparent 20%, rgba(99,102,241,0.04) 30%, transparent 40%, rgba(139,92,246,0.06) 50%, transparent 60%, rgba(99,102,241,0.04) 70%, transparent 80%, rgba(139,92,246,0.06) 90%, transparent 100%)",
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-gradient-to-b from-violet-100/50 via-purple-50/20 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-indigo-50/40 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-[250px] h-[250px] bg-gradient-to-tl from-violet-50/30 to-transparent rounded-full blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        {phase === "splash" ? (
          <motion.div
            key="splash"
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 flex-1 flex flex-col items-center justify-center px-8"
          >
            {/* Animated rings */}
            <div className="relative mb-8">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative"
              >
                {[120, 100, 80].map((size, i) => (
                  <motion.div
                    key={size}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 + i * 0.15, type: "spring", stiffness: 150 }}
                    className="absolute rounded-full border"
                    style={{
                      width: size, height: size,
                      top: `${(120 - size) / 2}px`,
                      left: `${(120 - size) / 2}px`,
                      borderColor: `rgba(139,92,246,${0.1 + i * 0.08})`,
                    }}
                  />
                ))}
                <motion.div
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 12 }}
                  className="w-[120px] h-[120px] flex items-center justify-center"
                >
                  <div className="w-20 h-20 rounded-[22px] bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 shadow-2xl shadow-violet-400/30 flex items-center justify-center">
                    <Shield className="w-10 h-10 text-white drop-shadow-lg" />
                  </div>
                </motion.div>
              </motion.div>

              {/* Pulsing ring */}
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 rounded-full border-2 border-violet-400/20"
                style={{ width: 120, height: 120 }}
              />
            </div>

            {/* Brand name with stagger */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="text-center"
            >
              <h1 className="text-5xl font-black tracking-tight text-slate-900 leading-none">
                {"PINIT".split("").map((char, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.08, type: "spring", stiffness: 300 }}
                    className="inline-block"
                  >
                    {char}
                  </motion.span>
                ))}
              </h1>
              <motion.p
                initial={{ opacity: 0, letterSpacing: "0.5em" }}
                animate={{ opacity: 1, letterSpacing: "0.35em" }}
                transition={{ delay: 1.1, duration: 0.8 }}
                className="text-lg font-bold text-violet-600 uppercase mt-1"
              >
                Vault
              </motion.p>
            </motion.div>

            {/* Animated tagline dots */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="flex items-center gap-3 mt-6"
            >
              {["Secure", "Ensure", "Protect"].map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.5 + i * 0.2, type: "spring" }}
                  className="flex items-center gap-1.5"
                >
                  {i > 0 && <span className="text-violet-300 text-xs">·</span>}
                  <span className="text-sm font-semibold text-slate-500">{word}</span>
                </motion.span>
              ))}
            </motion.div>

            {/* Loading bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.8 }}
              className="mt-10 w-48"
            >
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 1.8, duration: 1.5, ease: "easeInOut" }}
                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
                />
              </div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0.6] }}
                transition={{ delay: 2, duration: 1.5 }}
                className="text-[10px] text-slate-400 text-center mt-2 font-medium tracking-wider uppercase"
              >
                Initializing vault…
              </motion.p>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 flex-1 flex flex-col px-7 pt-16 pb-8"
          >
            {/* Logo small */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-3 mb-10"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-300/30">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xl font-black text-slate-900 leading-none">PINIT <span className="text-violet-600">Vault</span></p>
                <p className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">Human Origin Identity</p>
              </div>
            </motion.div>

            {/* Hero text */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <h2 className="text-3xl font-black text-slate-900 leading-tight">
                Your identity,{"\n"}
                <span className="text-violet-600">cryptographically</span>{" "}
                yours.
              </h2>
              <p className="text-sm text-slate-400 mt-3 leading-relaxed max-w-[280px]">
                Secure your ownership, provenance and digital rights — forever. No passwords needed.
              </p>
            </motion.div>

            {/* Feature cards */}
            <div className="space-y-2.5 mb-auto">
              {taglines.map((item, i) => (
                <motion.div
                  key={item.word}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.1, type: "spring", stiffness: 300 }}
                  className="flex items-center gap-3.5 bg-slate-50/80 backdrop-blur-sm rounded-2xl px-4 py-3.5 border border-slate-100/80"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    i === 0 ? "bg-violet-100" : i === 1 ? "bg-indigo-100" : "bg-purple-100"
                  }`}>
                    <item.icon className={`w-5 h-5 ${
                      i === 0 ? "text-violet-600" : i === 1 ? "text-indigo-600" : "text-purple-600"
                    }`} />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-slate-800">{item.word}</p>
                    <p className="text-[11px] text-slate-400">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* CTA buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="space-y-3 mt-6"
            >
              <button
                onClick={() => navigate("/register")}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 text-white font-bold text-[15px] shadow-xl shadow-violet-300/30 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Sparkles className="w-5 h-5" />
                Create Identity
                <ChevronRight className="w-5 h-5" />
              </button>

              <button
                onClick={() => navigate("/login")}
                className="w-full py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Fingerprint className="w-4 h-4 text-violet-500" />
                I already have an identity
              </button>
            </motion.div>

            {routing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-400"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-3.5 h-3.5 border-2 border-violet-200 border-t-violet-500 rounded-full"
                />
                Checking session…
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
