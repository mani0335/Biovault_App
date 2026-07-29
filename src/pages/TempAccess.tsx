import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ScanFace, CheckCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FaceScanner } from "@/components/FaceScanner";

type Step = "face" | "success" | "error";

const TempAccess = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("face");
  const [message, setMessage] = useState("Scan your face to access your account");
  const [userId, setUserId] = useState<string | null>(null);

  const handleFaceSuccess = async (faceData: unknown) => {
    const faceEmbedding = (faceData as { embedding?: number[] })?.embedding || faceData || null;

    if (!faceEmbedding || !Array.isArray(faceEmbedding) || (faceEmbedding as number[]).length === 0) {
      setMessage("Face not captured properly. Please try again.");
      setStep("error");
      return;
    }

    try {
      setMessage("Searching database for your face…");
      const apiUrl = (import.meta.env.VITE_API_URL || "https://biovault-backend-d13a.onrender.com").trim();

      const resp = await fetch(`${apiUrl}/auth/verify-face`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faceEmbedding, userId: null }),
      });

      const data = await resp.json();

      if (data.verified && data.userId) {
        setUserId(data.userId);
        setMessage(`Welcome back, ${data.userId}!`);
        setStep("success");

        if (data.token) localStorage.setItem("biovault_token", data.token);
        if (data.refreshToken) localStorage.setItem("biovault_refresh_token", data.refreshToken);

        setTimeout(() => navigate("/dashboard", { replace: true }), 1000);
      } else {
        setMessage(data.message || "Face not found in database");
        setStep("error");
      }
    } catch (err: unknown) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Failed to identify face"}`);
      setStep("error");
    }
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-blue-50/50 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen px-6 py-8 max-w-md mx-auto">
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors mb-8 self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back</span>
        </motion.button>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <ScanFace className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Face Search</h1>
          <p className="text-sm text-slate-400 mt-1">Identify yourself via face scan</p>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-slate-50 rounded-3xl p-6 border border-slate-100"
          >
            {step === "face" && (
              <div>
                <p className="text-xs text-slate-400 text-center mb-4">{message}</p>
                <FaceScanner
                  mode="login"
                  onSuccess={handleFaceSuccess}
                  onError={() => {
                    setMessage("Face scan failed. Please try again.");
                    setStep("error");
                  }}
                />
              </div>
            )}

            {step === "success" && (
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle className="w-10 h-10 text-emerald-500" />
                </motion.div>
                <h2 className="text-xl font-black text-emerald-600 mb-1">Identified</h2>
                <p className="text-sm text-slate-400">{message}</p>
                <motion.div
                  animate={{ width: ["0%", "100%"] }}
                  transition={{ duration: 1 }}
                  className="h-1 bg-emerald-400 rounded-full mt-6 mx-auto max-w-[200px]"
                />
              </motion.div>
            )}

            {step === "error" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-red-600 mb-2">Not Found</h2>
                <p className="text-sm text-slate-400 mb-6">{message}</p>
                <button
                  onClick={() => { setStep("face"); setMessage("Scan your face to access your account"); }}
                  className="px-6 py-2.5 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TempAccess;
