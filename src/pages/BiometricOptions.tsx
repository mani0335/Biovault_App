import { motion } from "framer-motion";
import { ArrowLeft, Shield, UserPlus, ScanFace, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const BiometricOptions = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-amber-50/60 to-transparent rounded-full blur-3xl" />
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
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Not Recognized</h1>
          <p className="text-sm text-slate-400 mt-1">Your biometric was not found in our system</p>
        </motion.div>

        <div className="space-y-3">
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/register')}
            className="w-full flex items-center gap-4 bg-violet-50 rounded-2xl px-5 py-4 border border-violet-200 text-left hover:bg-violet-100 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-200 flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-6 h-6 text-violet-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">New Registration</p>
              <p className="text-xs text-slate-400">Full biometric enrollment</p>
            </div>
          </motion.button>

          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/temp-access-face')}
            className="w-full flex items-center gap-4 bg-emerald-50 rounded-2xl px-5 py-4 border border-emerald-200 text-left hover:bg-emerald-100 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-200 flex items-center justify-center flex-shrink-0">
              <ScanFace className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Temporary Access</p>
              <p className="text-xs text-slate-400">Face scan for limited dashboard</p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/temp-access')}
            className="w-full flex items-center gap-4 bg-blue-50 rounded-2xl px-5 py-4 border border-blue-200 text-left hover:bg-blue-100 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-200 flex items-center justify-center flex-shrink-0">
              <Clock className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Face Search Access</p>
              <p className="text-xs text-slate-400">Search database with face scan</p>
            </div>
          </motion.button>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-[11px] text-slate-400 mt-8"
        >
          Temporary access provides restricted functionality until you complete full registration.
        </motion.p>
      </div>
    </div>
  );
};

export default BiometricOptions;
