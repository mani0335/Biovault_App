import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ScanFace, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FaceScanner } from "@/components/FaceScanner";
import { appStorage } from "@/lib/storage";

type Step = "face" | "success";

function generateTempUserId(prefix = "TEMP") {
  return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
}

const TempAccessFace = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("face");
  const [hasNavigatedToDashboard, setHasNavigatedToDashboard] = useState(false);
  const [tempUserId] = useState(() => generateTempUserId());

  useEffect(() => {
    const saveTempUserId = async () => {
      try {
        await appStorage.setItem('biovault_userId', tempUserId);
      } catch { /* retry on next render */ }
    };
    saveTempUserId();
  }, [tempUserId]);

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-gradient-to-br from-emerald-50/50 to-transparent rounded-full blur-3xl" />
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
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <ScanFace className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Quick Access</h1>
          <p className="text-sm text-slate-400 mt-1">Face verification for temporary session</p>
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
                <div className="text-center mb-4">
                  <h2 className="text-lg font-bold text-slate-800">Verify Your Face</h2>
                  <p className="text-xs text-slate-400 mt-1">Position your face in the frame</p>
                </div>
                <FaceScanner
                  mode="temp-access"
                  onSuccess={async (faceData) => {
                    if (hasNavigatedToDashboard) return;

                    try {
                      const { verifyFaceBackend } = await import('@/lib/authService');
                      const faceEmbedding = (faceData as { embedding?: number[] })?.embedding || [];

                      if (!faceEmbedding.length) {
                        setStep("face");
                        return;
                      }

                      const result = await verifyFaceBackend(faceEmbedding, null);

                      if (!result.verified) {
                        setStep("face");
                        return;
                      }

                      setHasNavigatedToDashboard(true);

                      if (result.userId) {
                        await appStorage.setItem('biovault_userId', result.userId);
                        localStorage.setItem('biovault_userId', result.userId);
                      }
                      if (result.token) {
                        await appStorage.setItem('biovault_token', result.token);
                        localStorage.setItem('biovault_token', result.token);
                      }
                      if (result.refreshToken) {
                        await appStorage.setItem('biovault_refresh_token', result.refreshToken);
                        localStorage.setItem('biovault_refresh_token', result.refreshToken);
                      }

                      setStep("success");

                      setTimeout(() => {
                        navigate("/dashboard", {
                          replace: true,
                          state: { tempAccess: true, restricted: true },
                        });
                      }, 800);
                    } catch {
                      setStep("face");
                    }
                  }}
                  onError={() => setStep("face")}
                />
              </div>
            )}

            {step === "success" && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                  className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle className="w-10 h-10 text-emerald-500" />
                </motion.div>
                <h2 className="text-xl font-black text-emerald-600 mb-1">Verified</h2>
                <p className="text-sm text-slate-400">Redirecting to your vault…</p>
                <motion.div
                  animate={{ width: ["0%", "100%"] }}
                  transition={{ duration: 0.8 }}
                  className="h-1 bg-emerald-400 rounded-full mt-6 mx-auto max-w-[200px]"
                />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TempAccessFace;
