import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Fingerprint, ScanFace, Shield, Copy, Check, XCircle, CheckCircle, ChevronRight, Sparkles, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FingerprintScanner } from "@/components/FingerprintScanner";
import { FaceScanner } from "@/components/FaceScanner";
import { registerUser } from "@/lib/authService";
import { appStorage } from "@/lib/storage";

type Step = "tempId" | "fingerprint" | "face" | "userId" | "complete";

function generateId(prefix: string) {
  return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
}

const STEP_META = [
  { id: "tempId", label: "Device", icon: Shield },
  { id: "fingerprint", label: "Fingerprint", icon: Fingerprint },
  { id: "face", label: "Face", icon: ScanFace },
  { id: "userId", label: "Identity", icon: User },
  { id: "complete", label: "Done", icon: CheckCircle },
] as const;

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("tempId");
  const [tempId] = useState(() => generateId("TMP"));
  const [userId] = useState(() => generateId("USR"));
  const [copied, setCopied] = useState(false);
  const [webauthn, setWebauthn] = useState<unknown | null>(null);
  const [faceEmbedding, setFaceEmbedding] = useState<number[] | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [userIdSaved, setUserIdSaved] = useState(false);

  useEffect(() => {
    const saveUserIdImmediately = async () => {
      try {
        await appStorage.setItem('biovault_userId', userId);
        setUserIdSaved(true);
      } catch {
        setTimeout(() => saveUserIdImmediately(), 300);
      }
    };
    saveUserIdImmediately();
  }, [userId]);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const steps: Step[] = ["tempId", "fingerprint", "face", "userId", "complete"];
  const currentIdx = steps.indexOf(step);

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gradient-to-br from-violet-100/40 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-gradient-to-tl from-indigo-50/40 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen px-6 py-8 max-w-md mx-auto">
        {/* Back */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors mb-6 self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back</span>
        </motion.button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Create Identity</h1>
          <p className="text-sm text-slate-400 mt-1">PINIT Origin Enrollment</p>
        </motion.div>

        {/* Step indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-center gap-1 mb-6"
        >
          {STEP_META.map((s, i) => {
            const done = currentIdx > i;
            const active = currentIdx === i;
            return (
              <div key={s.id} className="flex items-center gap-1">
                <motion.div
                  animate={active ? { scale: [1, 1.1, 1] } : {}}
                  transition={active ? { duration: 1.5, repeat: Infinity } : {}}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    done ? "bg-emerald-100 border border-emerald-300" :
                    active ? "bg-violet-100 border-2 border-violet-500 shadow-md shadow-violet-100" :
                    "bg-slate-100 border border-slate-200"
                  }`}
                >
                  {done ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <s.icon className={`w-4 h-4 ${active ? "text-violet-600" : "text-slate-300"}`} />
                  )}
                </motion.div>
                {i < STEP_META.length - 1 && (
                  <div className={`w-4 h-0.5 rounded-full ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </motion.div>

        {/* Error banner */}
        <AnimatePresence>
          {registerError && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2 overflow-hidden"
            >
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">{registerError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content card */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-slate-50 rounded-3xl p-6 border border-slate-100"
            >
              {step === "tempId" && (
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-4"
                  >
                    <Shield className="w-8 h-8 text-violet-600" />
                  </motion.div>
                  <h2 className="text-lg font-bold text-slate-800 mb-1">Device Detected</h2>
                  <p className="text-xs text-slate-400 mb-6">Your device fingerprint has been collected</p>

                  <div className="bg-white rounded-2xl p-4 mb-6 border border-slate-200">
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-2">Temporary ID</p>
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-2xl font-black text-violet-600 tracking-wider">{tempId}</span>
                      <button onClick={() => copyId(tempId)} className="text-slate-300 hover:text-slate-500 transition-colors">
                        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={async () => {
                      try {
                        await appStorage.setItem('biovault_userId', userId);
                        setStep("fingerprint");
                      } catch {
                        setRegisterError('Failed to save user ID');
                      }
                    }}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-violet-200/50 flex items-center justify-center gap-2"
                  >
                    Continue Enrollment
                    <ChevronRight className="w-4 h-4" />
                  </motion.button>
                </div>
              )}

              {step === "fingerprint" && (
                <div>
                  <div className="text-center mb-4">
                    <h2 className="text-lg font-bold text-slate-800">Fingerprint Enrollment</h2>
                    <p className="text-xs text-slate-400 mt-1">Register your biometric key</p>
                  </div>
                  <FingerprintScanner
                    mode="register"
                    required={true}
                    userId={userId}
                    onSuccess={(credential) => {
                      setRegisterError(null);
                      if (!credential) {
                        setRegisterError('Fingerprint capture failed. Please try again.');
                        return;
                      }
                      if (!(credential as { id?: string; verified?: boolean }).id || !(credential as { id?: string; verified?: boolean }).verified) {
                        setRegisterError('Invalid biometric data. Please scan your fingerprint properly.');
                        return;
                      }
                      setRegisterError(null);
                      setStep("face");
                    }}
                    onCredential={(c) => {
                      setWebauthn(c);
                      setRegisterError(null);
                    }}
                    onError={(error) => {
                      if (error && error.trim() !== '') {
                        setRegisterError(error);
                      } else {
                        setRegisterError(null);
                      }
                    }}
                  />
                </div>
              )}

              {step === "face" && (
                <div>
                  {!webauthn && (
                    <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-500 text-xs mb-4">
                      Fingerprint not captured. Please go back and register your fingerprint first.
                    </div>
                  )}
                  <div className="text-center mb-4">
                    <h2 className="text-lg font-bold text-slate-800">Face Capture</h2>
                    <p className="text-xs text-slate-400 mt-1">12-angle face geometry scan</p>
                  </div>
                  <FaceScanner
                    mode="register"
                    onSuccess={(faceData?: unknown) => {
                      const embedding = (faceData as { embedding?: number[] })?.embedding || faceData || null;
                      if (!embedding || (Array.isArray(embedding) && (embedding as number[]).length === 0)) {
                        setRegisterError('Face capture failed. Please try again.');
                        return;
                      }
                      setFaceEmbedding(embedding as number[]);
                      setRegisterError(null);
                      setStep("userId");
                    }}
                  />
                </div>
              )}

              {step === "userId" && (
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4"
                  >
                    <User className="w-8 h-8 text-emerald-600" />
                  </motion.div>
                  <h2 className="text-lg font-bold text-slate-800 mb-1">Identity Created</h2>
                  <p className="text-xs text-slate-400 mb-5">Your Human Origin Identity (HOID)</p>

                  <div className="bg-white rounded-2xl p-4 mb-4 border border-slate-200">
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-2">Your PINIT ID</p>
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-2xl font-black text-violet-600 tracking-wider">{userId}</span>
                      <button onClick={() => copyId(userId)} className="text-slate-300 hover:text-slate-500 transition-colors">
                        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Enrollment summary */}
                  <div className="bg-white rounded-2xl p-4 mb-6 border border-slate-200 space-y-2.5">
                    {[
                      { label: "Device ID", value: tempId, color: "text-slate-600" },
                      { label: "PINIT ID", value: userId, color: "text-violet-600" },
                      { label: "Fingerprint", value: "ENROLLED", color: "text-emerald-500" },
                      { label: "Face Data", value: "CAPTURED", color: "text-emerald-500" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{row.label}</span>
                        <span className={`font-bold ${row.color}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    disabled={isRegistering}
                    onClick={async () => {
                      setIsRegistering(true);
                      setRegisterError(null);
                      try {
                        if (!(webauthn as { id?: string })?.id) {
                          throw new Error('Fingerprint not captured. Please go back and register your fingerprint.');
                        }
                        if (!faceEmbedding || !Array.isArray(faceEmbedding) || faceEmbedding.length === 0) {
                          throw new Error('Face data not captured. Please go back and scan your face.');
                        }

                        const [deviceToken] = await Promise.all([
                          (async () => {
                            const { getDeviceToken } = await import('@/lib/deviceToken');
                            return await getDeviceToken();
                          })(),
                        ]);

                        await Promise.all([
                          appStorage.setItem('biovault_userId', userId),
                          faceEmbedding.length
                            ? appStorage.setItem('biovault_faceEmbedding', JSON.stringify(faceEmbedding))
                            : Promise.resolve(),
                        ]);

                        const verifyUserId = await appStorage.getItem('biovault_userId');
                        if (verifyUserId !== userId) throw new Error('Failed to save userId to storage');

                        const data = await registerUser({ userId, deviceToken, webauthn, faceEmbedding });
                        if (!data || !data.ok) throw new Error('Backend registration returned invalid response');

                        if (data?.tempCode) setRecoveryCode(String(data.tempCode));

                        // Set auth token so ProtectedRoute allows dashboard access
                        const token = data.token || `verified_${userId}`;
                        await appStorage.setItem('biovault_token', token);
                        localStorage.setItem('biovault_token', token);
                        localStorage.setItem('biovault_userId', userId);

                        setStep('complete');
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Registration failed';
                        setRegisterError('Registration Error: ' + msg);
                        setIsRegistering(false);
                      }
                    }}
                    className={`w-full py-3.5 rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all ${
                      isRegistering
                        ? "bg-slate-300 text-slate-500 shadow-none"
                        : "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-violet-200/50"
                    }`}
                  >
                    {isRegistering ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                        />
                        Verifying…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Store & Verify
                      </>
                    )}
                  </motion.button>
                </div>
              )}

              {step === "complete" && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onAnimationComplete={() => {
                    setTimeout(() => navigate("/dashboard", { replace: true }), 1800);
                  }}
                  className="text-center py-4"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-4"
                  >
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                  </motion.div>
                  <h2 className="text-xl font-black text-emerald-600 mb-1">Registration Complete</h2>
                  <p className="text-sm text-slate-400 mb-4">Welcome to PINIT Vault</p>

                  {recoveryCode && (
                    <div className="bg-amber-50 rounded-2xl p-4 mb-4 border border-amber-200">
                      <p className="text-[10px] text-amber-600 uppercase tracking-widest font-semibold mb-1">Recovery Code</p>
                      <p className="text-lg font-black text-amber-700 tracking-wider">{recoveryCode}</p>
                      <p className="text-[10px] text-amber-500 mt-1">Save this code securely</p>
                    </div>
                  )}

                  <p className="text-xs text-slate-400 mb-3">Entering your vault…</p>
                  <motion.div
                    animate={{ width: ["0%", "100%"] }}
                    transition={{ duration: 1.5 }}
                    className="h-1 bg-emerald-400 rounded-full mx-auto max-w-[200px]"
                  />
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Register;
