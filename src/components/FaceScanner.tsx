import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera as CameraIcon, CheckCircle, XCircle, ScanFace } from "lucide-react";
import { ScanEffect } from "./ScanEffect";
import { Button } from "./ui/button";
import { verifyFace, verifyFaceBackend } from "@/lib/authService";
import { appStorage } from "@/lib/storage";
import { detectFaceInVideo, loadFaceDetectionModel, faceEuclideanDistance } from "@/lib/faceDetection";

interface FaceScannerProps {
  onSuccess: (faceData?: number[]) => void;
  onError?: (error: string) => void;
  mode: "register" | "login" | "temp-access";
  required?: boolean;
  userId?: string; // ADD: Optional userId prop for login mode
}

export function FaceScanner({ onSuccess, onError, mode, required = false, userId: propUserId }: FaceScannerProps) {
  const [status, setStatus] = useState<"idle" | "camera" | "scanning" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hasAutoStarted = useRef(false);

  const PROCESSING_MS = 900;
  const SUCCESS_HOLD_MS = 1200;

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    try {
      setStatus("camera");
      setCameraReady(false);
      setModelReady(false);
      setMessage("Initializing secure camera and face detection...");
      
      // Request camera stream - this will prompt for permission on first access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Some WebViews will auto-play once metadata is ready.
        }
      }
      
      // Load face detection model
      try {
        await loadFaceDetectionModel();
        setModelReady(true);
        setMessage("Preparing camera feed and face detection...");
      } catch (err) {
        console.error("Face detection model load error:", err);
        setMessage("⚠️ Face detection unavailable. Please ensure stable internet connection.");
        // Allow camera to continue even if model fails to load
        setModelReady(false);
      }
    } catch (err: unknown) {
      const errorMsg = (err as { message?: string; name?: string })?.message || (err as { name?: string })?.name || "";
      const isPermDenied = errorMsg.includes("Permission") || errorMsg.includes("permission") || errorMsg.includes("NotAllowed");
      const isCapacitor = !!(window as unknown as { Capacitor?: unknown }).Capacitor;

      if (isCapacitor) {
        setStatus("error");
        setMessage(isPermDenied
          ? "Camera permission denied. Please allow camera access in your device settings."
          : "Camera unavailable. Please check device settings.");
        onError?.(isPermDenied ? "Camera permission denied" : "Camera access failed");
      } else {
        setStatus("idle");
        setMessage(isPermDenied
          ? "Camera blocked by browser. Click below to allow access, or use the phone app for best experience."
          : "Camera not available in this browser. Install the PINIT Vault app for full biometric support.");
      }
      setTimeout(() => setStatus("idle"), 3500);
    }
  }, [onError]);

  const cancelCamera = useCallback(() => {
    stopCamera();
    setCameraReady(false);
    setStatus("idle");
    setMessage("Camera closed");
  }, [stopCamera]);

  // Auto-start scan in register mode when camera and model are ready
  const autoStartScanInRegister = useCallback(() => {
    // This will be called when status changes to camera and conditions are met
  }, []);

  const scanRef = useRef<() => void | null>(null);

  useEffect(() => {
    if (mode === "register" && status === "camera" && cameraReady && modelReady && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      // Delay slightly to ensure everything is ready
      setTimeout(() => {
        if (scanRef.current) {
          scanRef.current();
        }
      }, 300);
    }
  }, [mode, status, cameraReady, modelReady]);

  const startScan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !cameraReady || video.readyState < 2) {
      setStatus("error");
      setMessage("❌ Camera is not ready. Please wait a moment and retry.");
      setTimeout(() => {
        setStatus("camera");
        setMessage("Align your face inside the frame");
      }, 1200);
      return;
    }

    setStatus("scanning");
    setMessage("Detecting face...");

    // Shared: holds the face-api.js 128-dim descriptor captured during detection
    let lastDescriptor: Float32Array | null = null;

    // FOR REGISTRATION: Properly detect face presence first
    if (mode === "register") {
      let faceDetected = false;
      let detectionAttempts = 0;
      const maxDetectionAttempts = 75;
      const minConfidence = 0.5;

      setMessage("📸 Looking for your face... (Move closer if needed)");

      while (!faceDetected && detectionAttempts < maxDetectionAttempts) {
        detectionAttempts++;
        await new Promise((r) => setTimeout(r, 200));

        try {
          const faceDetection = await detectFaceInVideo(video);

          if (faceDetection.hasFace && faceDetection.confidence >= minConfidence) {
            faceDetected = true;
            lastDescriptor = faceDetection.descriptor;
            const eyeMsg = faceDetection.irisVisible ? ' · Iris detected ✓' : faceDetection.eyesOpen ? ' · Eyes open ✓' : '';
            setMessage(`✓ Face detected (${Math.round(faceDetection.confidence * 100)}%)${eyeMsg}`);
            await new Promise((r) => setTimeout(r, 500));
            break;
          } else {
            const progress = Math.round((detectionAttempts / maxDetectionAttempts) * 100);
            setMessage(`🔍 Scanning... (${progress}%) - Make sure face is clearly visible`);
            if (detectionAttempts % 5 === 0) {
            }
          }
        } catch (err) {
          // Continue trying even if an attempt fails
        }
      }

      if (!faceDetected) {
        setStatus("error");
        setMessage("❌ Face not detected. Check lighting, move closer, and ensure face is visible.");
        onError?.("Face not detected");
        setTimeout(() => {
          setStatus("camera");
          setMessage("Align your face inside the frame");
        }, 2500);
        return;
      }

      setMessage("✓ Capturing face profile...");
      await new Promise((r) => setTimeout(r, 300));
    } else {
      // LOGIN/TEMP-ACCESS: Use face detection
      const minConfidenceThreshold = mode === "login" ? 0.60 : 0.60;
      let consecutiveValidDetections = 0;
      const requiredConsecutiveDetections = 2;
      let totalAttempts = 0;
      const maxTotalAttempts = 40;
      let faceIsValid = false;

      setMessage("Detecting face...");

      while (consecutiveValidDetections < requiredConsecutiveDetections && totalAttempts < maxTotalAttempts) {
        totalAttempts++;
        await new Promise((r) => setTimeout(r, 200));

        try {
          const faceDetection = await detectFaceInVideo(video);

          if (faceDetection.hasFace && faceDetection.confidence >= minConfidenceThreshold) {
            consecutiveValidDetections++;
            lastDescriptor = faceDetection.descriptor;

            if (consecutiveValidDetections >= requiredConsecutiveDetections) {
              faceIsValid = true;
              break;
            }
          } else {
            if (consecutiveValidDetections > 0) {
              consecutiveValidDetections = 0;
            }
          }
        } catch (err) {
          consecutiveValidDetections = 0;
        }
      }

      if (!faceIsValid) {
        setStatus("error");
        setMessage("❌ Could not detect face. Please ensure good lighting and face is clearly visible.");
        onError?.("Face validation failed");
        setTimeout(() => {
          setStatus("camera");
          setMessage("Align your face inside the frame");
        }, 2000);
        return;
      }

      setMessage("✓ Face detected. Capturing...");
      await new Promise((r) => setTimeout(r, 300));
    }

    setMessage("✓ Face detected. Capturing face profile...");
    await new Promise((r) => setTimeout(r, 350));

    // Use the 128-dim descriptor captured during detection (face-api.js recognition net)
    const embedding = lastDescriptor ? Array.from(lastDescriptor) : null;

    if (!embedding) {
      setStatus("error");
      setMessage("❌ Unable to capture face profile. Please ensure your face is well-lit and clearly visible.");
      onError?.("Face capture failed");
      setTimeout(() => {
        setStatus("camera");
        setMessage("Align your face inside the frame");
      }, 1500);
      return;
    }

    if (mode === "login") {
      try {
        // Use userId passed as prop first (from Register state), fallback to storage
        let userId = propUserId;
        if (!userId) {
          userId = await appStorage.getItem("biovault_userId");
        }
        if (!userId) throw new Error("User not registered on this device.");

        
        // First, get stored face embedding from backend
        const API_BASE = process.env.REACT_APP_BACKEND_URL || "https://biovault-backend-d13a.onrender.com";
        const biometricResponse = await fetch(`${API_BASE}/api/user/check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ user_id: userId })
        });

        if (!biometricResponse.ok) {
          throw new Error("Failed to check user biometrics");
        }

        const biometricData = await biometricResponse.json();

        if (!biometricData.ok || !biometricData.faceRegistered) {
          throw new Error("No face biometrics found for this user");
        }

        // Get stored face embedding (assuming backend returns it)
        // Note: You may need to modify the backend to return the face_embedding
        const storedEmbedding = biometricData.faceEmbedding || biometricData.face_embedding;
        
        if (!storedEmbedding || !Array.isArray(storedEmbedding)) {
          throw new Error("No valid face embedding found in backend");
        }


        // Euclidean distance on face-api.js 128-dim descriptors
        // Same person: 0.0–0.45 | Different people: 0.6–1.2 | Threshold: 0.5
        const distance = faceEuclideanDistance(embedding, storedEmbedding);
        const DISTANCE_THRESHOLD = 0.5;
        const isMatch = distance <= DISTANCE_THRESHOLD;
        const similarity = Math.max(0, Math.min(1, 1 - distance / DISTANCE_THRESHOLD));


        if (isMatch) {
          const token = `face_verified_${userId}_${Date.now()}`;
          const refreshToken = `refresh_${userId}_${Date.now()}`;

          await appStorage.setItem("biovault_token", token);
          localStorage.setItem("biovault_token", token);
          await appStorage.setItem("biovault_refresh_token", refreshToken);
          localStorage.setItem("biovault_refresh_token", refreshToken);

          setStatus("success");
          setMessage(`✓ Face verified (${Math.round(similarity * 100)}% match)`);
          stopCamera();
          setCameraReady(false);

          setTimeout(() => onSuccess({ embedding } as any), SUCCESS_HOLD_MS);
          return;
        } else {
          // If distance is very large (>1.2), likely an old pixel-based embedding format
          const hint = distance > 1.2
            ? " Your face data uses an old format — please re-register your face in Settings."
            : " Try again with better lighting or re-register your face.";
          throw new Error(`Face does not match stored biometrics.${hint}`);
        }
      } catch (err: any) {
        const msg = (err?.message || "").toString();
        const displayMessage = msg || "Face authentication failed. Please try again.";
        
        console.error('❌ FaceScanner: EXCEPTION in login mode:', {
          message: msg,
          stack: err?.stack,
          displayMessage
        });
        
        setStatus("error");
        setMessage(displayMessage);
        onError?.(displayMessage || "Face authentication failed");
        
        setTimeout(() => {
          setStatus("camera");
          setMessage("Align your face inside the frame");
        }, 1400);
        return;
      }
    }

    if (mode === "temp-access") {
      try {
        const data = await verifyFaceBackend(embedding); // No userId - searches all users
        

        if (!data.verified || !data.userId) {
          throw new Error(data.message || "Face not recognized. Please try again.");
        }

        
        setStatus("success");
        setMessage(`✓ Identified (${(data.similarity * 100).toFixed(1)}%)`);
        stopCamera();
        setCameraReady(false);
        
        // Store temp access credentials
        await appStorage.setItem('biovault_userId', data.userId);
        if (data.token) {
          localStorage.setItem('biovault_token', data.token);
        }
        if (data.refreshToken) {
          localStorage.setItem('biovault_refresh_token', data.refreshToken);
        }
        
        setTimeout(() => onSuccess({ embedding } as any), SUCCESS_HOLD_MS);
        return;
      } catch (err: any) {
        const msg = (err?.message || "").toString();
        const friendly = msg || "Face authentication failed. Please retry.";
        console.error('❌ TempAccess Error:', friendly);
        setStatus("error");
        setMessage('❌ ' + friendly);
        onError?.(friendly || "Face authentication failed");
        setTimeout(() => {
          setStatus("camera");
          setMessage("Align your face inside the frame");
        }, 1400);
        return;
      }
    }

    // Registration mode: Just capture the face and pass it back to parent component
    // The Register.tsx page will handle the backend storage via registerUser()
    
    setStatus("success");
    setMessage("✓ Face captured successfully");
    stopCamera();
    setCameraReady(false);
    
    setTimeout(() => {
      onSuccess({ embedding } as any);
    }, SUCCESS_HOLD_MS);
  }, [SUCCESS_HOLD_MS, cameraReady, mode, onError, onSuccess, propUserId, stopCamera]);

  // Assign startScan to ref for auto-start in register mode
  useEffect(() => {
    scanRef.current = startScan;
  }, [startScan]);

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center gap-4">
      {/* Camera viewport */}
      <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden bg-slate-100 border border-slate-200">
        {status === "idle" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-full bg-violet-100 border-2 border-violet-200 flex items-center justify-center">
              <ScanFace className="w-8 h-8 text-violet-400" />
            </div>
            <p className="text-xs text-slate-400">Tap below to open camera</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              onLoadedData={() => {
                setCameraReady(true);
                if (status === "camera") {
                  setMessage("Align your face inside the frame");
                }
              }}
            />
            <ScanEffect type="face" active={status === "scanning"} />

            {/* Top badges */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              <span className="px-3 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-white/50 text-[10px] font-bold text-slate-600">
                Live Camera
              </span>
              <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur-sm border text-[10px] font-bold ${
                status === "scanning"
                  ? "bg-violet-500/80 border-violet-400/50 text-white"
                  : "bg-white/80 border-white/50 text-slate-600"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status === "scanning" ? "bg-white animate-pulse" : cameraReady && modelReady ? "bg-emerald-500" : "bg-amber-400"}`} />
                {status === "scanning" ? "Processing" : cameraReady && modelReady ? "Ready" : "Loading"}
              </span>
            </div>

            {/* Corner frame guides */}
            <div className="absolute inset-8 pointer-events-none">
              {[["top-0 left-0", "border-t-2 border-l-2 rounded-tl-xl"],
                ["top-0 right-0", "border-t-2 border-r-2 rounded-tr-xl"],
                ["bottom-0 left-0", "border-b-2 border-l-2 rounded-bl-xl"],
                ["bottom-0 right-0", "border-b-2 border-r-2 rounded-br-xl"],
              ].map(([pos, border], i) => (
                <div key={i} className={`absolute ${pos} w-6 h-6 ${border} border-white/70`} />
              ))}
            </div>
          </>
        )}

        <AnimatePresence>
          {status === "success" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-white/85 backdrop-blur-sm flex items-center justify-center"
            >
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
                <CheckCircle className="w-16 h-16 text-emerald-500" />
              </motion.div>
            </motion.div>
          )}
          {status === "error" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-white/85 backdrop-blur-sm flex items-center justify-center"
            >
              <XCircle className="w-16 h-16 text-red-500" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Message + actions */}
      <div className="w-full flex flex-col items-center gap-3">
        <p className="text-center text-sm font-medium text-slate-500 min-h-5">{message || "Position your face in the frame"}</p>

        <div className="flex items-center justify-center gap-2 flex-wrap">
          {status === "idle" && (
            <button
              onClick={startCamera}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-violet-200/40 active:scale-95 transition-transform"
            >
              <CameraIcon className="w-4 h-4" />
              Start Camera
            </button>
          )}

          {status === "camera" && mode !== "register" && (
            <div className="flex items-center gap-2">
              <button
                onClick={startScan}
                disabled={!cameraReady || !modelReady}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-violet-200/40 active:scale-95 transition-transform disabled:opacity-50 disabled:shadow-none"
              >
                <ScanFace className="w-4 h-4" />
                {!cameraReady ? "Camera Loading..." : !modelReady ? "Loading Model..." : "Verify Face"}
              </button>
              {!required && (
                <button onClick={cancelCamera} className="px-4 py-3 rounded-xl bg-slate-100 text-slate-500 font-semibold text-sm border border-slate-200">
                  Cancel
                </button>
              )}
            </div>
          )}

          {status === "camera" && mode === "register" && (
            <button
              onClick={startScan}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-violet-200/40 active:scale-95 transition-transform"
            >
              <ScanFace className="w-4 h-4" />
              Capture Face
            </button>
          )}

          {status === "scanning" && !required && (
            <button onClick={() => { setStatus("camera"); setMessage("Verification cancelled"); }} className="px-6 py-2.5 rounded-xl bg-slate-100 text-slate-500 font-semibold text-sm border border-slate-200">
              Cancel
            </button>
          )}

          {status === "error" && (
            <button onClick={() => setStatus("idle")} className="px-6 py-2.5 rounded-xl bg-violet-100 text-violet-700 font-semibold text-sm border border-violet-200">
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
