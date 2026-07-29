import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Fingerprint, ScanFace, CheckCircle, Clock, Wifi } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { FingerprintScanner } from "@/components/FingerprintScanner";
import { FaceScanner } from "@/components/FaceScanner";
import { appStorage } from "@/lib/storage";
import { loadFaceDetectionModel } from "@/lib/faceDetection";

const BACKEND = import.meta.env.VITE_API_URL || "https://biovault-backend-d13a.onrender.com";

type Step = "fingerprint" | "face" | "success" | "error";

const STEPS = [
  { id: "fingerprint", label: "Fingerprint", icon: Fingerprint },
  { id: "face", label: "Face Scan", icon: ScanFace },
] as const;

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<Step>("fingerprint");
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasNavigatedToDashboard, setHasNavigatedToDashboard] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [serverWaking, setServerWaking] = useState(false);
  const serverWakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Warm up backend + preload face models as soon as Login mounts
  useEffect(() => {
    // Show "waking up" banner if backend doesn't respond in 4s
    serverWakeTimer.current = setTimeout(() => setServerWaking(true), 4000);

    const wakeBackend = async () => {
      try {
        await fetch(`${BACKEND}/api/health`, { method: 'GET', signal: AbortSignal.timeout(55000) });
      } catch { /* silent */ } finally {
        if (serverWakeTimer.current) clearTimeout(serverWakeTimer.current);
        setServerWaking(false);
      }
    };
    wakeBackend();

    // Preload face detection models in background so face scan is instant
    loadFaceDetectionModel().catch(() => {});

    return () => { if (serverWakeTimer.current) clearTimeout(serverWakeTimer.current); };
  }, []);

  useEffect(() => {
    const checkRegistration = async () => {
      try {
        const passedUserId = (location.state as { userId?: string })?.userId;
        if (passedUserId) {
          await appStorage.setItem("biovault_userId", passedUserId);
          localStorage.setItem("biovault_userId", passedUserId);
          setUserId(passedUserId);
          setIsLoading(false);
          return;
        }

        let savedUserId = null;
        for (let i = 0; i < 8; i++) {
          savedUserId = await appStorage.getItem("biovault_userId");
          if (savedUserId) {
            try {
              const API_BASE = process.env.REACT_APP_BACKEND_URL || "https://biovault-backend-d13a.onrender.com";
              const response = await fetch(`${API_BASE}/api/user/check`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: savedUserId }),
                signal: AbortSignal.timeout(5000),
              });
              if (response.ok) {
                const biometricData = await response.json();
                if (biometricData.ok && (biometricData.fingerprintRegistered || biometricData.faceRegistered)) {
                  setUserId(savedUserId);
                  setIsLoading(false);
                  return;
                }
              }
            } catch { /* backend unreachable */ }
            setUserId(savedUserId);
            setIsLoading(false);
            return;
          }
          if (i < 7) await new Promise(resolve => setTimeout(resolve, 500));
        }

        setUserId(null);
        setIsLoading(false);
      } catch {
        setUserId(null);
        setIsLoading(false);
      }
    };
    checkRegistration();
  }, [location.state, navigate]);

  const onFaceSuccess = async () => {
    if (hasNavigatedToDashboard) return;
    setHasNavigatedToDashboard(true);
    setStep("success");
    setTimeout(async () => {
      try {
        const token = (await appStorage.getItem("biovault_token")) || localStorage.getItem("biovault_token");
        if (!token) { setStep("fingerprint"); setHasNavigatedToDashboard(false); return; }
        navigate("/dashboard", { replace: true });
      } catch {
        setStep("fingerprint");
        setHasNavigatedToDashboard(false);
      }
    }, 800);
  };

  const stepIdx = step === "fingerprint" ? 0 : step === "face" ? 1 : 2;

  return (
    <div className="fixed inset-0 bg-white overflow-hidden flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-violet-100/40 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[250px] h-[250px] bg-gradient-to-tr from-purple-50/40 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Server wake-up banner */}
      <AnimatePresence>
        {serverWaking && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="relative z-20 mx-4 mt-3 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-amber-50 border border-amber-200"
          >
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}>
              <Wifi className="w-4 h-4 text-amber-500 flex-shrink-0" />
            </motion.div>
            <div>
              <p className="text-[12px] font-bold text-amber-700">Server starting up…</p>
              <p className="text-[10px] text-amber-500">First login may take 30–60s. Please wait.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex-1 flex flex-col px-6 pt-12 pb-6 max-w-md mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 shadow-lg shadow-violet-200/50 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 leading-none">Verify Identity</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Biometric authentication</p>
          </div>
        </motion.div>

        {/* Step indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-center gap-4 mb-6"
        >
          {STEPS.map((s, i) => {
            const done = stepIdx > i;
            const active = stepIdx === i;
            return (
              <div key={s.id} className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-1">
                  <motion.div
                    animate={active ? { scale: [1, 1.08, 1] } : {}}
                    transition={active ? { duration: 1.5, repeat: Infinity } : {}}
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                      done ? "bg-emerald-100 border-2 border-emerald-400" :
                      active ? "bg-violet-100 border-2 border-violet-500 shadow-md shadow-violet-100" :
                      "bg-slate-100 border-2 border-slate-200"
                    }`}
                  >
                    {done ? (
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <s.icon className={`w-5 h-5 ${active ? "text-violet-600" : "text-slate-300"}`} />
                    )}
                  </motion.div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${
                    done ? "text-emerald-500" : active ? "text-violet-600" : "text-slate-300"
                  }`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-10 h-0.5 rounded-full mb-4 transition-colors ${done ? "bg-emerald-400" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </motion.div>

        {/* Scanner content */}
        <div className="flex-1 flex flex-col justify-center min-h-0">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-8"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  className="w-10 h-10 border-3 border-violet-200 border-t-violet-600 rounded-full"
                />
                <p className="text-sm font-semibold text-slate-500">Loading biometric data…</p>
              </motion.div>
            ) : (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
              >
                {step === "fingerprint" && (
                  <FingerprintScanner
                    mode="login"
                    required={true}
                    userId={userId || undefined}
                    onCredential={async (credential) => {
                      if (!credential || !userId) {
                        navigate('/register');
                        return;
                      }
                      try {
                        const { checkUserRegistered } = await import('@/lib/authService');
                        const userCheck = await checkUserRegistered(userId);
                        if (!userCheck.ok || !userCheck.fingerprintRegistered) {
                          navigate('/register');
                          return;
                        }
                        setStep("face");
                      } catch {
                        navigate('/register');
                      }
                    }}
                    onSuccess={() => {}}
                    onError={(err) => {
                      const msg = (err || '').toString();
                      const isSensorError = msg.includes('not available') || msg.includes('not enrolled') ||
                        msg.includes('Hardware unavailable') || msg.includes('not initialized') ||
                        msg.includes('Cordova') || msg.includes('timeout');
                      if (isSensorError) return;
                      navigate('/register');
                    }}
                  />
                )}

                {step === "face" && (
                  <FaceScanner
                    mode="login"
                    userId={userId || undefined}
                    onSuccess={onFaceSuccess}
                    onError={() => {}}
                  />
                )}

                {step === "success" && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center py-8"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center mb-4"
                    >
                      <CheckCircle className="w-10 h-10 text-emerald-500" />
                    </motion.div>
                    <h2 className="text-xl font-black text-emerald-600 mb-1">Identity Verified</h2>
                    <p className="text-sm text-slate-400">Redirecting to your vault…</p>
                    <motion.div
                      animate={{ width: ["0%", "100%"] }}
                      transition={{ duration: 0.8 }}
                      className="h-1 bg-emerald-400 rounded-full mt-6 w-48"
                    />
                  </motion.div>
                )}

                {step === "error" && (
                  <div className="flex flex-col items-center py-8">
                    <div className="w-16 h-16 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center mb-4">
                      <span className="text-2xl">!</span>
                    </div>
                    <h2 className="text-lg font-bold text-red-600 mb-2">Verification Failed</h2>
                    <p className="text-sm text-slate-400 mb-6">{errorMsg || "Please try again"}</p>
                    <button
                      onClick={() => { setStep("fingerprint"); setErrorMsg(null); }}
                      className="px-6 py-2.5 rounded-xl bg-violet-600 text-white font-semibold text-sm"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="pt-4 space-y-3"
        >
          {/* Temp Access */}
          <button
            onClick={() => navigate("/temp-access-face")}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 active:scale-[0.98] transition-transform"
          >
            <Clock className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-600">Temporary Access</span>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Face only</span>
          </button>

          {/* Register link */}
          <p className="text-center text-[11px] text-slate-400">
            Not registered?{" "}
            <button onClick={() => navigate("/register")} className="text-violet-600 font-semibold hover:underline">
              Create Identity
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
