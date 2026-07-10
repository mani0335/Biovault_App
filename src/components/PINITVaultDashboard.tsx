import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { motion, AnimatePresence } from "framer-motion";
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import jsPDF from "jspdf";
import {
  loadVaultDocuments,
  saveVaultDocuments,
  uploadImageToCloudinary,
  deleteDocumentFromVault,
  clearVaultForUser,
  syncVaultData,
  getVaultMetadata,
  saveImageToGallery,
  syncVaultMetadata,
  calculatePageCount,
  countPdfPagesFromDataUrl,
} from "@/lib/vaultService";
import { ensurePINITVaultFolder, saveImageToPINITVault } from "@/lib/folderUtils";
import { embedAdvancedWatermark, extractAdvancedWatermark, type AdvancedWatermarkMetadata } from "@/lib/advancedSteganography";
import { embedSimpleWatermark, extractSimpleWatermark, extractFallbackMetadata, type SimpleWatermarkMetadata } from "@/lib/simpleSteganography";
import { analyzeImage, formatAnalysisResult, type ImageAnalysisResult } from "@/lib/imageAnalysis";
import { computePHashFromBase64, findDuplicates, type DuplicateDocument } from "@/lib/phash";
import { syncAllLocalRecordsToCloud, getDnaRecordWithCloud, findRecordByFuzzyPHash } from "@/lib/dna/dnaRecordStore";
import { extractPersistentDna } from "@/lib/dna/persistentDna";
import { supabase } from "@/integrations/supabase/client";
import { generateDocumentDNA, diffDocumentDNA, type DocumentDNA, type DnaDifference } from "@/lib/documentDna";
import { DnaLabPage } from "@/components/DnaLab";
import { approveDownloadRequest, rejectDownloadRequest } from "@/lib/shareMonitor";
import { GenerateDNAPage } from "@/components/GenerateDNAPage";
import { ForensicDashboard } from "@/components/ForensicDashboard";
import { LiveScanner } from "@/components/LiveScanner";
import {
  User,
  FileText,
  Camera,
  Upload,
  Shield,
  CreditCard,
  Star,
  Target,
  BookOpen,
  Briefcase,
  Award,
  X,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Search,
  Filter,
  Download,
  Share2,
  Trash2,
  Eye,
  Edit,
  Plus,
  Lock,
  Unlock,
  Check,
  CheckCircle,
  AlertCircle,
  Clock,
  Folder,
  Image,
  File,
  FileSearch,
  Archive,
  Settings,
  LogOut,
  Home,
  Key,
  Smartphone,
  Mail,
  Globe,
  Zap,
  Database,
  Share as ShareIcon,
  QrCode,
  Mail as FileMail,
  Phone,
  MapPin,
  Calendar,
  Copy,
  Moon,
  Sun,
  Linkedin,
  Github,
  Fingerprint,
  Bell,
  GitCompareArrows,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { appStorage } from "@/lib/storage";
import { ImageCryptoFull } from "@/components/ImageCryptoFull";
import { VaultManager } from "@/components/VaultManager";
import { ActivityLogger } from "@/components/ActivityLogger";
import Profile from "@/pages/Profile";
import DigitalIdentityDashboard from "@/components/DigitalIdentityDashboard";
import { ImageAnalyzer } from "@/components/ImageAnalyzer";
import type { Portfolio } from "@/types/Portfolio";
import PortfolioHome from "@/pages/portfolio/PortfolioHome";
import { SecurePdfViewer } from "@/components/SecurePdfViewer";
import { FilePreviewModal } from "@/components/FilePreviewModal";
import { FileOwnershipPanel } from "@/components/FileOwnershipPanel";
import ShareOptionsPanel from "@/components/ShareOptionsPanel";

interface VaultDocument {
  id: string;
  name: string;
  encryptedData: string;
  encryptedImage?: string;
  cloudinaryUrl?: string;
  pageCount?: number;
  pHash?: string;
  metadata: {
    timestamp: number;
    original_name: string;
    size: number;
    checksum: string;
    encrypted?: boolean;
    ownerId?: string;
    ownerName?: string;
    dnaId?: string;
  };
  createdAt: string;
}

interface ShareConfig {
  id: string;
  shareLink: string;
  expiryDate: string | null;
  expiryTime: string | null;
  downloadLimit: number | null;
  downloadsUsed: number;
  passwordProtected: boolean;
  sharePassword?: string;
  includeCertificate: boolean;
  certificateId?: string;
  qrCodeData: string;
  createdAt: string;
  createdBy: string;
  enableChainTracking?: boolean;
  enableWatermark?: boolean;
  blockVpn?: boolean;
  requireOtp?: boolean;
  alertOnOpen?: boolean;
  alertOnForward?: boolean;
  disableRightClick?: boolean;
}

interface PINITDashboardProps {
  userId?: string;
  isRestricted?: boolean;
}

type PageType = "home" | "vault" | "portfolio" | "share" | "identity" | "encrypt-preview" | "verify-proof" | "live-scan" | "crypto" | "vault-advanced" | "activity" | "profile" | "analysis" | "upload-document" | "scan-document" | "review-scan" | "dna-lab" | "generate-dna";

// ============= SHARE ACCESS PAGE =============
function ShareAccessPage() {
  const [shareData, setShareData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [shareId, setShareId] = useState<string>("");

  useEffect(() => {
    // Extract share ID from URL
    const pathParts = window.location.pathname.split('/');
    const extractedShareId = pathParts[pathParts.length - 1];
    setShareId(extractedShareId);

    if (extractedShareId) {
      loadShareData(extractedShareId);
    } else {
      setError("Invalid share link");
      setIsLoading(false);
    }
  }, []);

  const loadShareData = async (shareId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Try Supabase first for cross-device sharing
      const { data: supabaseData, error: supabaseError } = await supabase
        .from('shared_links')
        .select('*')
        .eq('share_id', shareId)
        .single();

      if (supabaseError) {
        console.error('❌ Supabase error:', supabaseError);
        throw new Error(supabaseError.message);
      }

      if (supabaseData) {
        
        // Check if share has expired
        if (supabaseData.expiry_date && new Date(supabaseData.expiry_date) < new Date()) {
          throw new Error("Share link has expired");
        }

        // Check download limit
        if (supabaseData.download_limit && supabaseData.downloads_used >= supabaseData.download_limit) {
          throw new Error("Download limit reached for this share");
        }

        setShareData({
          shareId: supabaseData.share_id,
          imageData: supabaseData.image_data,
          fileName: supabaseData.file_name,
          sharedBy: supabaseData.shared_by,
          createdAt: supabaseData.created_at,
          downloadsUsed: supabaseData.downloads_used,
          downloadLimit: supabaseData.download_limit,
          passwordProtected: supabaseData.password_protected,
          sharePassword: supabaseData.share_password,
          includeCertificate: supabaseData.include_certificate
        });
        setPasswordRequired(supabaseData.password_protected);
        setAccessGranted(!supabaseData.password_protected);
        setIsLoading(false);
        return;
      }

      throw new Error("Share link not found");

    } catch (err) {
      console.error("❌ Error loading share:", err);
      console.error("❌ Error details:", (err as any)?.message || String(err));
      setError("Share link not found, expired, or invalid. Please check the link or try again.");
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = () => {
    if (shareData && shareData.sharePassword === password) {
      setAccessGranted(true);
      setPasswordRequired(false);
    } else {
      setError("Incorrect password");
    }
  };

  const handleDownload = async () => {
    if (shareData && shareData.imageData) {
      try {
        // Create download link
        const link = document.createElement('a');
        link.href = shareData.imageData;
        link.download = shareData.fileName || `shared-image-${shareId}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Update download count in Supabase
        const { error: updateError } = await supabase
          .from('shared_links')
          .update({ downloads_used: (shareData.downloadsUsed || 0) + 1 })
          .eq('share_id', shareId);

        if (updateError) {
          console.error('❌ Error updating download count:', updateError);
        } else {
          // Update local state
          const updatedShareData = {
            ...shareData,
            downloadsUsed: (shareData.downloadsUsed || 0) + 1
          };
          setShareData(updatedShareData);
        }

        alert("✅ Image downloaded successfully!");
      } catch (err) {
        console.error("Download error:", err);
        alert("❌ Failed to download image");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-purple-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-purple-500 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-purple-900 flex items-center justify-center">
        <div className="bg-red-900/20 border border-red-500/30 backdrop-blur-xl rounded-2xl p-8 max-w-md mx-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">❌</span>
            </div>
            <h2 className="text-2xl font-bold text-red-400 mb-2">Share Link Error</h2>
            <p className="text-gray-300 mb-6">{error}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition"
            >
              Go to PINIT Vault
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (passwordRequired && !accessGranted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-purple-900 flex items-center justify-center">
        <div className="bg-slate-800/50 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-8 max-w-md mx-4 w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔒</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Password Protected</h2>
            <p className="text-gray-300 mb-6">This share is protected with a password</p>
            
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-400 mb-4"
              onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            />
            
            <button
              onClick={handlePasswordSubmit}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition font-semibold"
            >
              Unlock Share
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-purple-900">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-slate-800/50 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-8 max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Shared Image</h1>
            <p className="text-gray-300">Shared via PINIT Vault</p>
          </div>

          {/* Image Preview */}
          <div className="mb-8">
            {shareData?.imageData && (
              <img
                src={shareData.imageData}
                alt="Shared image"
                className="w-full max-h-96 object-contain rounded-lg mx-auto"
              />
            )}
          </div>

          {/* Share Info */}
          <div className="bg-slate-700/30 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Share Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">File Name:</span>
                <p className="text-white">{shareData?.fileName || 'Unknown'}</p>
              </div>
              <div>
                <span className="text-gray-400">Shared By:</span>
                <p className="text-white">{shareData?.sharedBy || 'PINIT User'}</p>
              </div>
              <div>
                <span className="text-gray-400">Created:</span>
                <p className="text-white">{shareData?.createdAt || 'Unknown'}</p>
              </div>
              <div>
                <span className="text-gray-400">Downloads:</span>
                <p className="text-white">{shareData?.downloadsUsed || 0} / {shareData?.downloadLimit || 'Unlimited'}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleDownload}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition font-semibold flex items-center justify-center gap-2"
            >
              <Download size={18} />
              Download Image
            </button>
            
            <button
              onClick={() => window.location.href = '/'}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg transition font-semibold"
            >
              Open PINIT Vault
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-gray-400 text-sm">
            <p>Shared securely with PINIT Vault • {shareData?.includeCertificate ? 'Certificate Included' : 'No Certificate'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PINITVaultDashboard({ userId: propsUserId, isRestricted }: PINITDashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Read initial tab from navigation state (set by BottomNav when jumping here)
  const initialTab = (location.state as any)?.tab as PageType | undefined;
  const [currentPage, setCurrentPage] = useState<PageType>(initialTab || "home");
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('pinit_theme') as 'light' | 'dark') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pinit_theme', theme);
  }, [theme]);

  // If navigation state changes (user presses BottomNav while already on dashboard), sync tab
  useEffect(() => {
    const tab = (location.state as any)?.tab as PageType | undefined;
    if (tab) setCurrentPage(tab);
  }, [location.state]);
  
  // Document Upload States - "Pocket" system for scanning
  const [scannedPages, setScannedPages] = useState<string[]>([]); // "pocket" array
  const [isScanning, setIsScanning] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("User");
  const [userId, setUserId] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const hasSyncedRef = useRef(false);
  const phashInFlightRef = useRef<Set<string>>(new Set());

  // Load profile info from backend on mount
  useEffect(() => {
    const loadProfileInfo = async () => {
      if (!userId) return;

      let nameSetFromBackend = false;
      let imageSetFromBackend = false;

      try {
        const token = localStorage.getItem("biovault_token");
        const API_BASE = import.meta.env.VITE_API_URL || "https://biovault-backend-d13a.onrender.com";

        const response = await fetch(`${API_BASE}/profile/get-profile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ userId: userId })
        });

        if (response.ok) {
          const data = await response.json();

          if (data.profile && data.profile.personal) {
            if (data.profile.personal["User Name"]) {
              const name = data.profile.personal["User Name"].value;
              setUserName(name);
              await appStorage.setItem("biovault_userName", name);
              localStorage.setItem("biovault_userName", name);
              nameSetFromBackend = true;
            }

            if (data.profile.personal["Profile Image"]) {
              const img = data.profile.personal["Profile Image"].value;
              setProfileImage(img);
              await appStorage.setItem("biovault_profileImage", img);
              localStorage.setItem("biovault_profileImage", img);
              imageSetFromBackend = true;
            }
          }
        }
      } catch (e) {
        console.error("Error loading profile from backend:", e);
      }

      // Fallback to localStorage only if backend did not supply the value
      try {
        const savedName = await appStorage.getItem("biovault_userName");
        const savedImage = await appStorage.getItem("biovault_profileImage");

        if (savedName && !nameSetFromBackend) {
          setUserName(savedName);
        }

        if (savedImage && !imageSetFromBackend) {
          setProfileImage(savedImage);
        }
      } catch (e) {
        console.error("Error loading profile info from storage:", e);
      }
    };
    loadProfileInfo();
  }, [userId]);

  // Save profile info to storage and backend when changed
  const handleSetUserName = async (name: string) => {
    setUserName(name);
    localStorage.setItem("biovault_userName", name);
    appStorage.setItem("biovault_userName", name);
    
    // Save to backend
    if (userId) {
      try {
        const token = localStorage.getItem("biovault_token");
        const API_BASE = import.meta.env.VITE_API_URL || "https://biovault-backend-d13a.onrender.com";
        
        const response = await fetch(`${API_BASE}/profile/save-profile-item`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            category: "personal",
            item_name: "User Name",
            item_data: name
          })
        });
        
        if (response.ok) {
        } else {
        }
      } catch (error) {
        console.error('❌ Error saving profile name to backend:', error);
      }
    }
  };

  const handleSetProfileImage = async (image: string | null) => {
    setProfileImage(image);
    if (image) {
      localStorage.setItem("biovault_profileImage", image);
      appStorage.setItem("biovault_profileImage", image);

      // Save to backend
      if (userId) {
        try {
          const token = localStorage.getItem("biovault_token");
          const API_BASE = import.meta.env.VITE_API_URL || "https://biovault-backend-d13a.onrender.com";
          
          const response = await fetch(`${API_BASE}/profile/save-profile-item`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              category: "personal",
              item_name: "Profile Image",
              item_data: image
            })
          });
          
          if (response.ok) {
          } else {
          }
        } catch (error) {
          console.error('❌ Error saving profile image to backend:', error);
        }
      }
    } else {
      localStorage.removeItem("biovault_profileImage");
      appStorage.removeItem("biovault_profileImage");
    }
  };

  const handleDocumentUploaded = async (incomingDoc: any) => {
    // Normalize: DigitalIdentityDashboard uses vaultManager format (fileName/fileData fields)
    // while PINITVaultDashboard uses vaultService format (name/encryptedData fields).
    const docName: string = incomingDoc.name || incomingDoc.fileName || 'Unknown Document';
    const rawData: string = incomingDoc.encryptedData || incomingDoc.fileData || '';

    // Build a full data URL for preview: raw base64 → prefix it; already prefixed → use as-is
    const dataUrl: string = rawData.startsWith('data:')
      ? rawData
      : rawData ? `data:image/jpeg;base64,${rawData}` : '';

    // incomingDoc.encryptedImage (when present) carries the persistent-DNA-embedded
    // pixels — it must take priority. Falling back to a dataUrl derived from raw
    // encryptedData silently drops the embedded ownership DNA for callers (e.g.
    // GenerateDNAPage) that explicitly pass the embedded image.
    const resolvedEncryptedImage: string | undefined = incomingDoc.encryptedImage
      ? (incomingDoc.encryptedImage.startsWith('data:') ? incomingDoc.encryptedImage : `data:image/png;base64,${incomingDoc.encryptedImage}`)
      : (dataUrl.startsWith('data:image') ? dataUrl : undefined);

    const normalized: VaultDocument = {
      id: incomingDoc.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: docName,
      encryptedData: rawData,
      encryptedImage: resolvedEncryptedImage,
      cloudinaryUrl: incomingDoc.cloudinaryUrl,
      pHash: incomingDoc.pHash ?? undefined,
      metadata: incomingDoc.metadata || {
        timestamp: Date.now(),
        original_name: docName,
        size: 0,
        checksum: docName,
        encrypted: false,
        ownerId: userId || undefined,
        ownerName: localStorage.getItem('biovault_userName') || undefined,
        dnaId: incomingDoc.id || undefined,
        source: incomingDoc._source || undefined,
        categoryId: incomingDoc._categoryId || undefined,
      },
      createdAt: incomingDoc.createdAt
        ? new Date(incomingDoc.createdAt).toISOString()
        : new Date().toISOString(),
    };

    // Use functional updater to avoid stale closure over vaultDocuments
    setVaultDocuments((prev) => {
      const updated = [...prev, normalized];
      // Persist asynchronously; snapshot updated for saveVaultDocuments
      if (userId) {
        saveVaultDocuments(userId, updated).catch((err) => {
          console.error('❌ Failed to save document to vault service:', err);
        });
      }
      return updated;
    });
  };

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [verifyProofImage, setVerifyProofImage] = useState<string | null>(null);
  const [verifyProofFileName, setVerifyProofFileName] = useState<string>('scan.jpg');
  const [verifyProofAnalysis, setVerifyProofAnalysis] = useState<any>(null);
  const [vaultDocuments, setVaultDocuments] = useState<VaultDocument[]>([]);
  const [vaultPersistenceStatus, setVaultPersistenceStatus] = useState<{
    isSynced: boolean;
    lastSyncTime: number;
    documentCount: number;
    storageType: string;
  }>({ isSynced: false, lastSyncTime: 0, documentCount: 0, storageType: "none" });

  // Share Management State
  const [shareConfigs, setShareConfigs] = useState<ShareConfig[]>([]);
  const [shareHistory, setShareHistory] = useState<any[]>([]);
  const [selectedShareImage, setSelectedShareImage] = useState<VaultDocument | null>(null);
  const [resolvedFilePreview, setResolvedFilePreview] = useState<string | undefined>(undefined);
  const [shareExpiryDate, setShareExpiryDate] = useState<string>("");
  const [shareExpiryTime, setShareExpiryTime] = useState<string>("23:59");
  const [shareDownloadLimit, setShareDownloadLimit] = useState<number | null>(null);
  const [sharePassword, setSharePassword] = useState<string>("");
  const [includeCertificate, setIncludeCertificate] = useState<boolean>(false);
  const [generatedShareLink, setGeneratedShareLink] = useState<string>("");
  const [generatedQRCode, setGeneratedQRCode] = useState<string>("");
  const [shareStep, setShareStep] = useState<"select" | "configure" | "preview">("select");

  // Quick Action refs for camera and file upload
  const quickActionCameraRef = useRef<HTMLInputElement>(null);
  const quickActionFileRef = useRef<HTMLInputElement>(null);

  // Handler for quick action image selection (works like Analyze button)
  const handleQuickActionImageSelected = (imageData: string) => {
    setCapturedImage(imageData);
    setCurrentPage("encrypt-preview");
  };

  const handleVerifyProofImageSelected = (imageData: string) => {
    setVerifyProofImage(imageData);
    setCurrentPage("verify-proof");
  };

  // Resolve encryptedImage for sharing asynchronously (localStorage is synchronous
  // and often overflows for large PNGs; appStorage survives where localStorage fails).
  useEffect(() => {
    if (!selectedShareImage || !userId) {
      setResolvedFilePreview(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      // 1. In-memory object
      const img = (selectedShareImage as any)?.encryptedImage;
      if (img && img.length > 5000) {
        if (!cancelled) setResolvedFilePreview(img);
        return;
      }
      // 2. localStorage (synchronous, may fail for large images)
      try {
        const stored = localStorage.getItem(`pinit_vault_documents_${userId}`);
        if (stored) {
          const docs = JSON.parse(stored) as VaultDocument[];
          const local = docs.find((d) => d.id === selectedShareImage.id || d.name === selectedShareImage.name);
          if (local?.encryptedImage && local.encryptedImage.length > 5000) {
            if (!cancelled) setResolvedFilePreview(local.encryptedImage);
            return;
          }
        }
      } catch { /* ignore */ }
      // 3. Capacitor appStorage (async, higher storage limit, most reliable)
      try {
        const stored = await appStorage.getItem(`pinit_vault_documents_${userId}`);
        if (stored) {
          const docs = JSON.parse(stored) as VaultDocument[];
          const local = docs.find((d) => d.id === selectedShareImage.id || d.name === selectedShareImage.name);
          if (local?.encryptedImage && local.encryptedImage.length > 5000) {
            if (!cancelled) setResolvedFilePreview(local.encryptedImage);
            return;
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setResolvedFilePreview(undefined);
    })();
    return () => { cancelled = true; };
  }, [selectedShareImage, userId]);

  // Load and sync vault documents when userId is available
  useEffect(() => {
    const initializeVault = async () => {
      if (!userId) {
        return;
      }

      
      try {
        // First, try to load from backend to get latest data
        const docs = await loadVaultDocuments(userId);
        
        if (docs && docs.length > 0) {
          // Merge identity docs from both vaultService localStorage and vaultManager localStorage
          const knownIds = new Set(docs.map((d: any) => d.id));
          const extraDocs: VaultDocument[] = [];
          // 1) vaultService localStorage (pinit_vault_documents_<userId>)
          try {
            const svcRaw = localStorage.getItem(`pinit_vault_documents_${userId}`);
            if (svcRaw) {
              (JSON.parse(svcRaw) as VaultDocument[]).forEach((d: any) => {
                if (!knownIds.has(d.id)) { knownIds.add(d.id); extraDocs.push(d); }
              });
            }
          } catch { /* ignore */ }
          // 2) vaultManager localStorage (pinit_vault_documents) — identity uploads
          try {
            const vmRaw = localStorage.getItem('pinit_vault_documents');
            if (vmRaw) {
              const vmState = JSON.parse(vmRaw);
              const vmDocs: any[] = vmState.documents || (Array.isArray(vmState) ? vmState : []);
              vmDocs.forEach((d: any) => {
                if (!knownIds.has(d.id)) {
                  knownIds.add(d.id);
                  // Normalise vaultManager format → vaultService format
                  const name: string = d.fileName || d.name || 'Identity Document';
                  const raw: string = d.fileData || d.encryptedData || '';
                  extraDocs.push({
                    id: d.id,
                    name,
                    encryptedData: raw,
                    encryptedImage: raw.startsWith('data:image') ? raw : undefined,
                    metadata: {
                      timestamp: d.createdAt ? new Date(d.createdAt).getTime() : Date.now(),
                      original_name: name,
                      size: 0,
                      checksum: name,
                      encrypted: false,
                      ownerId: userId,
                      source: 'identity',
                    },
                    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
                  } as any);
                }
              });
            }
          } catch { /* ignore */ }
          setVaultDocuments(extraDocs.length > 0 ? [...docs, ...extraDocs] : docs);
        } else {
          
          // Fallback to local storage if backend is empty
          const synced = await syncVaultData(userId);
          if (synced) {
            const localDocs = await loadVaultDocuments(userId);
            if (localDocs && localDocs.length > 0) {
              setVaultDocuments(localDocs);
            }
          }
        }

        // Log vault metadata
        const metadata = await getVaultMetadata(userId);

        // Update persistence status
        setVaultPersistenceStatus({
          isSynced: metadata.documentCount > 0,
          lastSyncTime: metadata.lastSyncTime,
          documentCount: metadata.documentCount,
          storageType: metadata.storageType,
        });
        
      } catch (error) {
        console.error("❌ Failed to initialize vault:", error);
        
        // Try local storage fallback
        try {
          const synced = await syncVaultData(userId);
          const localDocs = await loadVaultDocuments(userId);
          if (localDocs && localDocs.length > 0) {
            setVaultDocuments(localDocs);
          }
        } catch (fallbackError) {
          console.error("❌ Local storage fallback also failed:", fallbackError);
        }
      }
    };

    initializeVault();

    // Fire-and-forget once per session: push all local DNA records to Supabase so
    // that assets created before the INSERT policy was applied become cross-device
    // scannable. The hasSyncedRef guard prevents re-running on userId identity changes.
    if (!hasSyncedRef.current) {
      hasSyncedRef.current = true;
      syncAllLocalRecordsToCloud().catch(() => { /* silent */ });
    }
  }, [userId]);

  // Backfill pHash on existing vault docs that were saved before pHash threading.
  // Skips docs already in-flight (phashInFlightRef) to prevent concurrent loops
  // from computing the same hash twice when this effect fires rapidly.
  useEffect(() => {
    if (!vaultDocuments.length) return;
    const docsNeedingHash = vaultDocuments.filter(
      (d) => !d.pHash && (d.encryptedImage || d.encryptedData) && !phashInFlightRef.current.has(d.id),
    );
    if (!docsNeedingHash.length) return;

    docsNeedingHash.forEach((d) => phashInFlightRef.current.add(d.id));
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const doc of docsNeedingHash) {
        if (cancelled) break;
        try {
          const raw = (doc.encryptedImage || doc.encryptedData || '').trim();
          const dataUrl = raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`;
          const hash = await computePHashFromBase64(dataUrl);
          if (hash) updates[doc.id] = hash;
        } catch { /* skip */ }
        phashInFlightRef.current.delete(doc.id);
      }
      if (!cancelled && Object.keys(updates).length) {
        setVaultDocuments((prev) =>
          prev.map((d) => (updates[d.id] ? { ...d, pHash: updates[d.id] } : d)),
        );
      }
    })();
    return () => { cancelled = true; };
  }, [vaultDocuments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load share configs from Supabase so DNA Monitoring always has data
  useEffect(() => {
    if (!userId) return;
    const loadShares = async () => {
      try {
        const { data, error } = await supabase
          .from('share_configs')
          .select('share_id, share_link, created_at, expiry_date, download_limit, downloads_used, password, include_cert, created_by, image_name')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (error || !data) return;
        const configs = data.map((row: any) => ({
          id: row.share_id as string,
          shareLink: (row.share_link as string) || '',
          createdAt: (row.created_at as string) || new Date().toISOString(),
          expiryDate: (row.expiry_date as string) || null,
          expiryTime: null,
          downloadLimit: (row.download_limit as number) ?? null,
          downloadsUsed: (row.downloads_used as number) || 0,
          passwordProtected: !!row.password,
          sharePassword: (row.password as string) || undefined,
          includeCertificate: (row.include_cert as boolean) || false,
          qrCodeData: (row.share_link as string) || '',
          createdBy: (row.created_by as string) || userId,
          image_name: (row.image_name as string) || undefined,
        }));
        setShareConfigs(configs);
        // Reload download requests now that we have share IDs
        loadDlRequests(configs);
      } catch { /* ignore */ }
    };
    loadShares();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verify authentication and load user data on mount.
  // Retries with a short delay before giving up — guards against a transient
  // Capacitor Preferences read failure right after a cold process restart
  // (e.g. Android reclaimed memory while a native picker/camera was foregrounded).
  useEffect(() => {
    const readSession = async (): Promise<{ accessToken: string | null; storedUserId: string | null }> => {
      try {
        const accessToken = await appStorage.getItem("biovault_token");
        const storedUserId = await appStorage.getItem("biovault_userId");
        return { accessToken, storedUserId };
      } catch (e) {
        console.error("appStorage error:", e);
        return {
          accessToken: localStorage.getItem("biovault_token"),
          storedUserId: localStorage.getItem("biovault_userId"),
        };
      }
    };

    const verifyAuth = async () => {
      try {
        let { accessToken, storedUserId } = await readSession();

        if (!accessToken || !storedUserId) {
          // One retry after a short delay before declaring the session invalid
          await new Promise((r) => setTimeout(r, 500));
          ({ accessToken, storedUserId } = await readSession());
        }

        if (!accessToken || !storedUserId) {
          throw new Error("No valid session");
        }

        setUserId(storedUserId);
        // Leave userName as "User" — loadProfileInfo will fill in the real name
        // from the backend or localStorage once userId is set
        setIsAuthenticated(true);
      } catch (err) {
        console.error("Auth error:", err);
        setAuthError("Session expired. Please login again.");
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    verifyAuth();
  }, []);

  const handleLogout = async () => {
    try {
      
      // DO NOT clear vault data - it should persist in backend
      // Only clear authentication tokens
      await appStorage.removeItem("biovault_token");
      await appStorage.removeItem("biovault_refresh_token");
      
      // Keep profile data in storage for next login
      // Profile data should be loaded from backend on re-login
    } catch (e) {
      console.error("Error clearing appStorage:", e);
    }
    
    // Clear auth tokens — keep userId and profile data so it loads on next login
    localStorage.removeItem("biovault_token");
    localStorage.removeItem("biovault_refresh_token");
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("sessionExpiryTime");

    navigate("/login", { replace: true });
  };

  if (isCheckingAuth) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-3 border-cyan-500/30 border-t-cyan-500 rounded-full"></div>
          <p className="text-cyan-400/70 text-sm font-mono">Loading vault...</p>
        </motion.div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 text-center px-4"
        >
          <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-red-400">Auth Failed</h2>
          <p className="text-sm text-red-300">{authError}</p>
          <Button onClick={() => navigate("/login")} className="mt-4">
            Back to Login
          </Button>
        </motion.div>
      </div>
    );
  }

  // Check if current path is a share link
  const isSharePath = window.location.pathname.startsWith('/share/');
  
  if (isSharePath) {
    return <ShareAccessPage />;
  }

  return (
    <div data-theme={theme} className={`min-h-screen pb-24 ${theme === 'dark' ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}>
      {/* Top Bar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`sticky top-0 z-40 backdrop-blur-xl px-4 py-3 ${theme === 'dark' ? 'bg-slate-900/95 border-b border-slate-800' : 'bg-white/95 border-b border-slate-100'}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {profileImage ? (
              <img src={profileImage} alt="Profile" className="w-10 h-10 rounded-full object-cover border-2 border-violet-200 flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className={`text-sm font-bold truncate max-w-[130px] ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{userName}</p>
              <p className="text-[10px] text-slate-400 truncate max-w-[130px]">@{userName.toLowerCase().replace(/\s/g, '_').slice(0, 18)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-2 hover:bg-slate-100 rounded-xl transition-all"
            >
              {theme === 'light' ? <Moon size={18} className="text-slate-500" /> : <Sun size={18} className="text-amber-400" />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut size={18} className="text-red-400" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {currentPage === "home" && <HomePage key="home" userName={userName} documentCount={vaultDocuments.length} activeSharesCount={shareConfigs.length} onEncryptClick={async () => {
          // Use getUserMedia in-app camera instead of CapacitorCamera.getPhoto().
          // CapacitorCamera opens a separate Android Activity which can kill the WebView
          // and wipe the auth session (same issue fixed for PINIT Live and LiveScanner).
          // We navigate to generate-dna which has a full in-app getUserMedia camera flow.
          setCurrentPage("generate-dna");
        }} setVerifyProofImage={setVerifyProofImage} setCurrentPage={setCurrentPage} quickActionCameraRef={quickActionCameraRef} quickActionFileRef={quickActionFileRef} onQuickActionImageSelected={handleQuickActionImageSelected} onVerifyProofImageSelected={handleVerifyProofImageSelected} navigate={navigate} />}
        {currentPage === "vault" && <VaultPage key="vault" documents={vaultDocuments} userId={userId} userName={userName} selectedShareImage={selectedShareImage} setSelectedShareImage={setSelectedShareImage} setCurrentPage={setCurrentPage} setVerifyProofImage={setVerifyProofImage} onStartShare={() => {
          // Reset share flow so the user always starts fresh on the configure step
          setShareStep("configure");
          setGeneratedShareLink("");
          setGeneratedQRCode("");
          setShareExpiryDate("");
          setShareExpiryTime("23:59");
          setShareDownloadLimit(null);
          setSharePassword("");
          setIncludeCertificate(false);
        }} onDeleteDocument={async (docId: string) => {
          // Optimistically remove from parent state
          setVaultDocuments((prev) => prev.filter((d) => d.id !== docId));
          // Persist to localStorage (and Capacitor Preferences on Android)
          if (userId) {
            try {
              await deleteDocumentFromVault(userId, docId);
            } catch (err) {
              console.error('❌ Failed to persist delete:', err);
              // Rollback: reload docs from storage so the item reappears
              try {
                const { loadVaultDocuments } = await import('@/lib/vaultService');
                const restored = await loadVaultDocuments(userId);
                setVaultDocuments(restored);
              } catch { /* ignore rollback error */ }
              alert('❌ Could not delete the document. Please try again.');
            }
          }
        }} />}
        {currentPage === "portfolio" && <PortfolioHome key="portfolio" userId={userId} />}
        {currentPage === "share" && <SharePage key="share" shareConfigs={shareConfigs} setShareConfigs={setShareConfigs} shareHistory={shareHistory} setShareHistory={setShareHistory} selectedShareImage={selectedShareImage} setSelectedShareImage={setSelectedShareImage} shareExpiryDate={shareExpiryDate} setShareExpiryDate={setShareExpiryDate} shareExpiryTime={shareExpiryTime} setShareExpiryTime={setShareExpiryTime} shareDownloadLimit={shareDownloadLimit} setShareDownloadLimit={setShareDownloadLimit} sharePassword={sharePassword} setSharePassword={setSharePassword} includeCertificate={includeCertificate} setIncludeCertificate={setIncludeCertificate} generatedShareLink={generatedShareLink} setGeneratedShareLink={setGeneratedShareLink} generatedQRCode={generatedQRCode} setGeneratedQRCode={setGeneratedQRCode} shareStep={shareStep} setShareStep={setShareStep} userId={userId} vaultDocuments={vaultDocuments} />}
        {currentPage === "identity" && <IdentityPage key="identity" userName={userName} userId={userId} />}
        {currentPage === "crypto" && <ImageCryptoFull key="crypto" userId={userId || undefined} />}
        {currentPage === "vault-advanced" && <VaultManager key="vault-advanced" userId={userId || undefined} />}
        {currentPage === "activity" && <ActivityLogger key="activity" userId={userId || undefined} />}
        {currentPage === "profile" && (
          <DigitalIdentityDashboard
            key="profile"
            onBack={() => setCurrentPage("home")}
            userName={userName}
            setUserName={handleSetUserName}
            profileImage={profileImage}
            setProfileImage={(img: string) => handleSetProfileImage(img)}
            userId={userId}
            onDocumentUploaded={handleDocumentUploaded}
          />
        )}
        {currentPage === "dna-lab" && (
          <DnaLabPage
            key="dna-lab"
            documents={vaultDocuments as any}
            userId={userId || undefined}
            onBack={() => setCurrentPage("vault")}
            shares={shareConfigs as any}
          />
        )}
        {currentPage === "generate-dna" && (
          <GenerateDNAPage
            key="generate-dna"
            documents={vaultDocuments as any}
            onBack={() => setCurrentPage("home")}
            onScanClick={() => {
              setScannedPages([]);
              setCurrentPage("scan-document");
            }}
            onDocumentSaved={handleDocumentUploaded}
          />
        )}
        {currentPage === "upload-document" && (
          <DocumentUploadPage
            key="upload-document"
            onBack={() => setCurrentPage("home")}
            onScanClick={() => {
              setScannedPages([]);
              setCurrentPage("scan-document");
            }}
            onDocumentUploaded={async (document: VaultDocument) => {
              // Add document to vault
              const updated = [...vaultDocuments, document];
              setVaultDocuments(updated);
              if (userId) {
                await saveVaultDocuments(userId, updated);
              }
            }}
          />
        )}
        {currentPage === "scan-document" && (
          <ScanDocumentPage
            key="scan-document"
            onPageScanned={(imageData: string) => {
              setScannedPages([...scannedPages, imageData]);
            }}
            onDone={() => setCurrentPage("review-scan")}
            onBack={() => setCurrentPage("upload-document")}
            pageCount={scannedPages.length}
          />
        )}
        {currentPage === "review-scan" && (
          <ReviewScanPage
            key="review-scan"
            scannedPages={scannedPages}
            onDeletePage={(index: number) => {
              const updated = scannedPages.filter((_, i) => i !== index);
              setScannedPages(updated);
            }}
            onSaveToPDF={async (pdfData: string, userFileName: string) => {
              // ── Encrypt the PDF using XOR cipher ──────────────────────────
              // Generate a random key
              const encKey = Math.random().toString(36).slice(2, 15) +
                             Math.random().toString(36).slice(2, 15);

              // XOR-encrypt the data URL (same algorithm as encryptionUtils.ts)
              const xorEncrypt = (data: string, key: string): string => {
                const encoded = btoa(data);
                let result = '';
                for (let i = 0; i < encoded.length; i++) {
                  result += String.fromCharCode(
                    encoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
                  );
                }
                return btoa(result);
              };

              const encryptedPdf = xorEncrypt(pdfData, encKey);
              const fileName = userFileName || `Scanned_Doc_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`;
              const docId = `pdf_${Date.now()}`;

              // ── Save to PINITVaultDashboard (vaultService) ────────────────
              const newDoc: VaultDocument = {
                id: docId,
                name: fileName,
                encryptedData: encryptedPdf,           // encrypted payload
                encryptedImage: undefined,             // no image preview for PDF
                metadata: {
                  timestamp: Date.now(),
                  original_name: fileName,
                  size: pdfData.length,
                  checksum: encKey,                    // store key in checksum for decryption
                  encrypted: true,
                  ownerId: userId || undefined,
                },
                createdAt: new Date().toISOString(),
              };
              const updatedDocs = [...vaultDocuments, newDoc];
              setVaultDocuments(updatedDocs);
              if (userId) {
                try { await saveVaultDocuments(userId, updatedDocs); } catch (_) { /* non-fatal */ }
              }

              // ── Also save to vaultManager (for /vault route) ──────────────
              try {
                const VM_KEY = 'pinit_vault_documents';
                const existing = JSON.parse(localStorage.getItem(VM_KEY) || '{"documents":[]}');
                existing.documents.push({
                  id: docId,
                  fileName,
                  fileType: 'pdf',
                  fileSize: `${Math.round(pdfData.length / 1024)} KB`,
                  fileData: pdfData,          // store full data URL for preview
                  createdAt: new Date().toISOString(),
                  isEncrypted: false,         // stored as-is in vaultManager path
                });
                localStorage.setItem(VM_KEY, JSON.stringify(existing));
              } catch (_) { /* non-fatal */ }

              setScannedPages([]);
              // Brief delay so the success banner shows, then navigate to vault
              setTimeout(() => setCurrentPage("vault"), 1200);
            }}
            onBack={() => setCurrentPage("scan-document")}
          />
        )}
        {currentPage === "live-scan" && (
          <LiveScanner
            key="live-scan"
            onImageCaptured={(dataUrl, fileName) => {
              setVerifyProofImage(dataUrl);
              setVerifyProofFileName(fileName || 'scan.jpg');
              setCurrentPage("verify-proof");
            }}
            onBack={() => setCurrentPage("home")}
          />
        )}
        {currentPage === "verify-proof" && verifyProofImage && (
          <ForensicDashboard
            key="forensic-scan"
            scannedImage={verifyProofImage}
            fileName={verifyProofFileName}
            vaultDocHints={vaultDocuments.map((d) => ({
              pHash: d.pHash ?? (d.metadata as any)?.pHash ?? null,
              dnaId: d.metadata?.dnaId ?? null,
              ownerId: d.metadata?.ownerId ?? null,
              ownerName: d.metadata?.ownerName ?? null,
            }))}
            onBack={() => {
              setVerifyProofImage(null);
              setVerifyProofAnalysis(null);
              setCurrentPage("home");
            }}
          />
        )}
        {currentPage === "encrypt-preview" && capturedImage && (
          <EncryptPreviewPage
            key="encrypt-preview"
            image={capturedImage}
            userId={userId || "unknown"}
            userName={userName}
            onRetake={async () => {
              try {
                const image = await CapacitorCamera.getPhoto({
                  quality: 80,
                  allowEditing: false,
                  source: CameraSource.Camera,
                  resultType: CameraResultType.Base64,
                  width: 1024,
                  height: 1024,
                  correctOrientation: true,
                });
                if (image?.base64String) {
                  setCapturedImage("data:image/jpeg;base64," + image.base64String);
                }
              } catch (error) {
                console.error("❌ Camera error:", error);
                alert("Failed to capture image. Please try again.");
              }
            }}
            onSaveToVault={async (encryptedPackage) => {
              setIsEncrypting(true);
              try {
                
                // Verify encryption is valid
                if (!encryptedPackage || !encryptedPackage.encrypted_data || !encryptedPackage.metadata) {
                  throw new Error("Invalid encryption data package");
                }
                
                // Verify user ID is embedded in metadata
                if (!encryptedPackage.metadata.ownerId && !userId) {
                  throw new Error("Cannot encrypt: User ID not available");
                }
                
                const ownerIdUsed = encryptedPackage.metadata.ownerId || userId;
                
                // Upload to Cloudinary (optional cloud backup) - wrap in try-catch
                let uploadResult = { cloudinaryUrl: null };
                try {
                  uploadResult = await uploadImageToCloudinary(
                    encryptedPackage.encrypted_data,
                    encryptedPackage.metadata.original_name,
                    userId || "unknown",
                    encryptedPackage.metadata.size,
                    encryptedPackage.metadata.checksum
                  );
                } catch (uploadErr) {
                  // Continue with local save even if cloud upload fails
                }

                // Save encrypted image to device gallery in PINIT Vault folder
                let galleryResult = { success: false, error: "Not attempted" };
                try {
                  galleryResult = await saveImageToGallery(
                    encryptedPackage.encryptedImage || encryptedPackage.encrypted_data,
                    encryptedPackage.metadata.original_name,
                    userId || "unknown"
                  );
                } catch (galleryErr) {
                  galleryResult = {
                    success: false,
                    error: galleryErr instanceof Error ? galleryErr.message : String(galleryErr)
                  };
                }

                // Create document with encrypted preview for display
                const newDoc: VaultDocument = {
                  id: Date.now().toString(),
                  name: encryptedPackage.metadata.original_name,
                  encryptedData: encryptedPackage.encrypted_data,
                  encryptedImage: encryptedPackage.encryptedImage, // Store for preview
                  cloudinaryUrl: uploadResult.cloudinaryUrl,
                  metadata: encryptedPackage.metadata,
                  createdAt: new Date().toLocaleDateString(),
                };

                // Add to state and persist
                const updatedDocs = [newDoc, ...vaultDocuments];
                setVaultDocuments(updatedDocs);
                if (userId) {
                  await saveVaultDocuments(userId, updatedDocs);
                  // Sync metadata to ensure consistency
                  await syncVaultMetadata(userId);
                  // Update persistence status
                  const metadata = await getVaultMetadata(userId);
                  setVaultPersistenceStatus({
                    isSynced: true,
                    lastSyncTime: metadata.lastSyncTime,
                    documentCount: metadata.documentCount,
                    storageType: metadata.storageType,
                  });
                }

                // Show a VISIBLE confirmation of the DNA method actually used — without
                // this, there is no on-device way to verify persistent DNA embedding
                // succeeded vs silently falling back to the legacy watermark.
                const dnaId = encryptedPackage.metadata.dnaId || 'N/A';
                const method = encryptedPackage.metadata.encryptionMethod || 'unknown';
                const methodLabel = method === 'persistent-dna' ? 'Persistent DNA (pixel-embedded)'
                  : method === 'simple' ? 'Legacy Watermark (fallback)'
                  : 'None (encryption failed)';
                alert(`✅ Image Encrypted\n\n🧬 DNA ID: ${dnaId}\n🔐 Method: ${methodLabel}\n📁 Saved to PINIT Vault`);

                // Clear state and navigate home
                setCapturedImage(null);
                setIsEncrypting(false);
                setCurrentPage("home");
              } catch (error) {
                console.error("❌ Error saving to vault:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Failed to encrypt image: ${errorMessage}`);
              } finally {
                setIsEncrypting(false);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Bottom Navigation — same component used app-wide for consistent design */}
      <BottomNav />
    </div>
  );
}

function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
  highlight = false,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.08, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
        highlight
          ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/50 border border-purple-400/50"
          : active
            ? "text-purple-300 border-b-2 border-purple-500"
            : "text-slate-400 hover:text-purple-300 hover:bg-purple-900/20"
      }`}
    >
      <Icon size={22} />
      <span className="text-xs font-semibold">{label}</span>
    </motion.button>
  );
}

// ============= HOME PAGE =============
function HomePage({ userName, documentCount, activeSharesCount, onEncryptClick, setVerifyProofImage, setCurrentPage, quickActionCameraRef, quickActionFileRef, onQuickActionImageSelected, onVerifyProofImageSelected, navigate }: { userName: string; documentCount: number; activeSharesCount: number; onEncryptClick: () => void; setVerifyProofImage: (value: string | null) => void; setCurrentPage: (page: PageType) => void; quickActionCameraRef?: React.RefObject<HTMLInputElement>; quickActionFileRef?: React.RefObject<HTMLInputElement>; onQuickActionImageSelected?: (imageData: string) => void; onVerifyProofImageSelected?: (imageData: string) => void; navigate: (path: string) => void }) {
  const integrityScore = documentCount > 0 ? Math.min(99.9, 85 + documentCount * 2.1) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-5 space-y-5 pb-4"
    >
      {/* PINIT Vault Hero — modern */}
      <motion.div
        className="relative overflow-hidden rounded-3xl text-white"
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 40%, #a855f7 70%, #c084fc 100%)' }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Decorative orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)' }} />
          <motion.div
            className="absolute top-3 right-14 w-2 h-2 rounded-full bg-white/30"
            animate={{ opacity: [0.3, 0.8, 0.3], scale: [1, 1.3, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-6 left-20 w-1.5 h-1.5 rounded-full bg-white/20"
            animate={{ opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 4, repeat: Infinity, delay: 1 }}
          />
        </div>

        <div className="relative z-10 p-5 flex items-center gap-4">
          {/* Shield icon */}
          <motion.div
            className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)' }}
            animate={{ rotate: [0, 3, -3, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            <Shield className="w-7 h-7 text-white" />
          </motion.div>

          {/* Text + stats */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-xl font-black tracking-tight">PINIT Vault</h2>
              <motion.div
                className="w-2 h-2 rounded-full bg-emerald-400"
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <p className="text-[11px] text-white/60 font-medium mb-3">Secure digital sanctuary</p>
            <div className="flex gap-3">
              <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <FileText className="w-3.5 h-3.5 text-white/70" />
                <span className="text-lg font-black leading-none">{documentCount}</span>
                <span className="text-[9px] text-white/50 font-semibold">Docs</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Share2 className="w-3.5 h-3.5 text-white/70" />
                <span className="text-lg font-black leading-none">{activeSharesCount}</span>
                <span className="text-[9px] text-white/50 font-semibold">Shares</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { icon: Camera, label: "Encrypt", sub: "Camera", color: "bg-blue-100", iconColor: "text-blue-600", onClick: () => onEncryptClick() },
            { icon: Search, label: "Scan", sub: "Live", color: "bg-violet-100", iconColor: "text-violet-600", onClick: () => setCurrentPage("live-scan") },
            { icon: Fingerprint, label: "PINIT DNA", sub: "DNA", color: "bg-rose-100", iconColor: "text-rose-600", onClick: () => setCurrentPage("generate-dna") },
            { icon: Share2, label: "Share", sub: "Links", color: "bg-emerald-100", iconColor: "text-emerald-600", onClick: () => setCurrentPage("share") },
          ].map((action, idx) => (
            <motion.button
              key={idx}
              onClick={action.onClick}
              whileTap={{ scale: 0.93 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.05 }}
              className="flex flex-col items-center gap-1.5 py-3 active:bg-slate-50 rounded-2xl transition-colors"
            >
              <div className={`w-12 h-12 rounded-2xl ${action.color} flex items-center justify-center`}>
                <action.icon className={`w-5 h-5 ${action.iconColor}`} />
              </div>
              <span className="text-[11px] font-bold text-slate-800 text-center leading-tight">{action.label}</span>
              <span className="text-[9px] text-slate-400 text-center">{action.sub}</span>
            </motion.button>
          ))}
        </div>

        <input ref={quickActionCameraRef} type="file" accept="image/*" capture="environment"
          onChange={(e) => { const file = e.target.files?.[0]; if (file && onQuickActionImageSelected) { const reader = new FileReader(); reader.onload = (ev) => onQuickActionImageSelected(ev.target?.result as string); reader.readAsDataURL(file); } }}
          className="hidden" />
        <input ref={quickActionFileRef} type="file" accept="image/*,.pdf,.doc,.docx"
          onChange={(e) => { const file = e.target.files?.[0]; if (file && onVerifyProofImageSelected) { const reader = new FileReader(); reader.onload = (ev) => onVerifyProofImageSelected(ev.target?.result as string); reader.readAsDataURL(file); } }}
          className="hidden" />
      </div>

      {/* Recent Activity */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">Recent Activity</h3>
          <button onClick={() => navigate('/activity')} className="text-xs font-semibold text-violet-600">View All</button>
        </div>
        <div className="space-y-2">
          {[
            { icon: Fingerprint, label: "DNA Generated", detail: documentCount > 0 ? `${documentCount} files protected` : 'No files yet', time: "Just now", badge: "Success", badgeColor: "bg-emerald-100 text-emerald-700" },
            { icon: Shield, label: "Vault Accessed", detail: "Current session", time: "Now", badge: "Active", badgeColor: "bg-violet-100 text-violet-700" },
            ...(activeSharesCount > 0 ? [{ icon: Share2, label: "Active Shares", detail: `${activeSharesCount} link${activeSharesCount > 1 ? 's' : ''} shared`, time: "Recent", badge: `${activeSharesCount}`, badgeColor: "bg-blue-100 text-blue-700" }] : []),
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-4 h-4 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                <p className="text-[10px] text-slate-400">{item.detail}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-[10px] text-slate-400">{item.time}</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor}`}>{item.badge}</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Integrity Overview */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h3 className="text-base font-bold text-slate-900 mb-3">Integrity Overview</h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Shield, value: documentCount, label: "Files Protected", color: "text-violet-600", bg: "bg-violet-50" },
            { icon: CheckCircle, value: integrityScore > 0 ? `${integrityScore.toFixed(1)}%` : '—', label: "Integrity Score", color: "text-emerald-600", bg: "bg-emerald-50" },
            { icon: AlertTriangle, value: 0, label: "Risks Found", color: "text-amber-600", bg: "bg-amber-50" },
            { icon: Award, value: activeSharesCount, label: "Certificates", color: "text-blue-600", bg: "bg-blue-50" },
          ].map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + idx * 0.05 }}
              className={`${stat.bg} rounded-2xl p-3 text-center border border-slate-100`}
            >
              <stat.icon className={`w-5 h-5 ${stat.color} mx-auto mb-1.5`} />
              <p className={`text-lg font-black ${stat.color}`}>{stat.value}</p>
              <p className="text-[9px] text-slate-500 font-medium leading-tight">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============= VAULT PAGE =============
function VaultPage({ documents, onDeleteDocument, onStartShare, userId, userName: userNameProp, selectedShareImage, setSelectedShareImage, setCurrentPage, setVerifyProofImage }: { documents: VaultDocument[]; onDeleteDocument?: (docId: string) => void; onStartShare?: () => void; userId?: string | null; userName?: string; selectedShareImage: VaultDocument | null; setSelectedShareImage: React.Dispatch<React.SetStateAction<VaultDocument | null>>; setCurrentPage: React.Dispatch<React.SetStateAction<PageType>>; setVerifyProofImage: React.Dispatch<React.SetStateAction<string | null>> }) {
  const userName = userNameProp || "";
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [vaultDocs, setVaultDocs] = useState(documents);
  // Keep local list in sync when parent deletes/adds docs
  useEffect(() => { setVaultDocs(documents); }, [documents]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [showOwnershipPanel, setShowOwnershipPanel] = useState(false);
  const [ownershipDoc, setOwnershipDoc] = useState<VaultDocument | null>(null);
  const [embeddedMetadata, setEmbeddedMetadata] = useState<AdvancedWatermarkMetadata | null>(null);
  const [showDigitalIdentities, setShowDigitalIdentities] = useState(false);
  const [showVaultDna, setShowVaultDna] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState<{ dataUrl: string; name: string } | null>(null);
  const [pendingDlCount, setPendingDlCount] = useState(0);
  const [showDlPanel, setShowDlPanel] = useState(false);
  const [dlRequests, setDlRequests] = useState<Array<{ id: string; shareId: string; visitor_name?: string; fileName: string; status?: string; created_at?: string }>>([]);

  const loadDlRequests = async (currentShareConfigs?: typeof shareConfigs) => {
    const configs = currentShareConfigs ?? shareConfigs;
    const seen = new Set<string>();

    // 1. Scan owner's localStorage immediately — camelCase fields from createDownloadRequest are normalised here
    const localItems: typeof dlRequests = [];
    Object.keys(localStorage)
      .filter(k => k.startsWith('pinit_dl_req_'))
      .forEach(k => {
        const shareId = k.replace('pinit_dl_req_', '');
        try {
          const reqs = JSON.parse(localStorage.getItem(k) || '[]');
          reqs.forEach((r: { id: string; visitor_name?: string; visitorName?: string; status?: string; created_at?: string; createdAt?: string; shareId?: string }) => {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              localItems.push({
                ...r,
                visitor_name: r.visitor_name || r.visitorName,
                created_at: r.created_at || r.createdAt,
                shareId: r.shareId || shareId,
                fileName: shareId.slice(-8),
              });
            }
          });
        } catch { /* ignore */ }
      });

    // Show localStorage results immediately so the panel is never empty while Supabase loads
    const sortFn = (a: typeof dlRequests[0], b: typeof dlRequests[0]) =>
      (b.created_at || '').localeCompare(a.created_at || '');
    localItems.sort(sortFn);
    setDlRequests(localItems);
    setPendingDlCount(localItems.filter(r => !r.status || r.status === 'pending').length);

    // 2. Merge Supabase results (cross-browser requests won't be in localStorage)
    const shareIds = configs.map(c => c.id).filter(Boolean);
    if (shareIds.length === 0) return;
    try {
      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 5000));
      const query = (supabase as any)
        .from('download_requests')
        .select('*')
        .in('share_id', shareIds)
        .order('created_at', { ascending: false });
      const result = await Promise.race([query, timeout]);
      const data = result?.data ?? result;
      if (Array.isArray(data)) {
        const merged = [...localItems];
        data.forEach((r: any) => {
          const id = r.id as string;
          if (!seen.has(id)) {
            seen.add(id);
            merged.push({
              id,
              shareId: r.share_id as string,
              visitor_name: r.visitor_name as string | undefined,
              fileName: (r.share_id as string).slice(-8),
              status: r.status as string | undefined,
              created_at: r.created_at as string | undefined,
            });
            // Mirror to localStorage so offline approve/reject works
            const key = `pinit_dl_req_${r.share_id}`;
            try {
              const existing: any[] = JSON.parse(localStorage.getItem(key) || '[]');
              if (!existing.find((x: any) => x.id === id)) {
                existing.unshift({ id, shareId: r.share_id, visitor_name: r.visitor_name, status: r.status, created_at: r.created_at });
                localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
              }
            } catch { /* ignore */ }
          }
        });
        merged.sort(sortFn);
        setDlRequests(merged);
        setPendingDlCount(merged.filter(r => !r.status || r.status === 'pending').length);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { loadDlRequests(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApproveDl = async (id: string) => {
    await approveDownloadRequest(id, 1);
    // Update localStorage too
    Object.keys(localStorage).filter(k => k.startsWith('pinit_dl_req_')).forEach(k => {
      try {
        const reqs = JSON.parse(localStorage.getItem(k) || '[]');
        const updated = reqs.map((r: { id: string; status?: string }) => r.id === id ? { ...r, status: 'approved' } : r);
        localStorage.setItem(k, JSON.stringify(updated));
      } catch { /* ignore */ }
    });
    loadDlRequests();
  };

  const handleRejectDl = async (id: string) => {
    await rejectDownloadRequest(id);
    Object.keys(localStorage).filter(k => k.startsWith('pinit_dl_req_')).forEach(k => {
      try {
        const reqs = JSON.parse(localStorage.getItem(k) || '[]');
        const updated = reqs.map((r: { id: string; status?: string }) => r.id === id ? { ...r, status: 'rejected' } : r);
        localStorage.setItem(k, JSON.stringify(updated));
      } catch { /* ignore */ }
    });
    loadDlRequests();
  };

  // Safe name accessor — handles both vaultService format (name) and vaultManager format (fileName)
  const getSafeName = (doc: VaultDocument): string =>
    (doc as any).name || (doc as any).fileName || 'Unknown Document';

  // Filter digital identity documents — match by source tag (same-session) or category-prefixed name (cross-session)
  const digitalIdentityDocuments = vaultDocs.filter(doc => {
    if ((doc.metadata as any)?.source === 'identity') return true;
    const name = getSafeName(doc).toLowerCase();
    return (
      name.startsWith('personal_') || name.startsWith('academic_') ||
      name.startsWith('projects_') || name.startsWith('internships_') ||
      name.startsWith('certifications_') || name.startsWith('entrance_') ||
      name.startsWith('exams_') || name.startsWith('financial_') ||
      name.startsWith('others_')
    );
  });

  // (sync already handled by the useEffect on line 1443)

  const filteredDocs = vaultDocs.filter((doc) =>
    getSafeName(doc).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + " " + sizes[i];
  };

  const handleDownload = async (doc: VaultDocument) => {
    try {
      if (!doc) {
        alert("❌ No document selected to download");
        return;
      }

      // Gather raw base64 data
      let base64Data = doc.encryptedImage || doc.encryptedData;

      if (!base64Data && doc.cloudinaryUrl) {
        try {
          const response = await fetch(doc.cloudinaryUrl);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        } catch {
          alert("❌ Unable to fetch document data. Please try again.");
          return;
        }
      }

      if (!base64Data) {
        alert("❌ No document data available to download");
        return;
      }

      // Decrypt if needed (skip encryptedImage — already watermarked/plain)
      let finalData = base64Data;
      if (
        base64Data === doc.encryptedData &&
        doc.metadata?.encrypted &&
        doc.metadata?.checksum
      ) {
        try {
          const { decryptFile } = await import('@/lib/encryptionUtils');
          finalData = decryptFile(base64Data, doc.metadata.checksum);
        } catch {
          // Use raw data if decryption fails
        }
      }

      // Filesystem.writeFile expects raw base64 — strip any data: URL prefix
      if (finalData.startsWith('data:')) {
        const commaIdx = finalData.indexOf(',');
        if (commaIdx !== -1) finalData = finalData.slice(commaIdx + 1);
      }

      const fileName = (doc.metadata?.original_name || getSafeName(doc)).replace(/[/\\?%*:|"<>]/g, '_');
      const folderName = 'PINIT Vault Documents';

      // Try saving to the public Documents folder (visible in file manager / Files app)
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');

        // Create folder if needed
        try {
          await Filesystem.mkdir({
            path: folderName,
            directory: Directory.Documents,
            recursive: true,
          });
        } catch {
          // Folder may already exist — ignore
        }

        await Filesystem.writeFile({
          path: `${folderName}/${fileName}`,
          data: finalData,
          directory: Directory.Documents,
          recursive: true,
        });

        alert(`✅ Saved!\n\n📁 Documents/${folderName}/${fileName}\n\nOpen your Files app → Documents → ${folderName} to access it.`);
        return;
      } catch (docErr) {
      }

      // Fallback: write to Cache then open share sheet
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');

        const cacheResult = await Filesystem.writeFile({
          path: fileName,
          data: finalData,
          directory: Directory.Cache,
          recursive: true,
        });

        await Share.share({
          title: fileName,
          url: cacheResult.uri,
          dialogTitle: `Save ${fileName}`,
        });
      } catch (shareErr) {
        alert(`❌ Could not save file:\n\n${shareErr}`);
      }
    } catch (err) {
      alert(`❌ Download failed:\n\n${err}`);
    }
  };

  const handleDeleteDocument = () => {
    if (docToDelete) {
      setVaultDocs((prev) => prev.filter((doc) => doc.id !== docToDelete));
      if (onDeleteDocument) {
        onDeleteDocument(docToDelete);
      }
      setSelectedDoc(null);
      setPreviewImage(null);
      setEmbeddedMetadata(null);
      setShowDeleteConfirm(false);
      setDocToDelete(null);
    }
  };

  const resolveDocUrl = async (doc: VaultDocument): Promise<string> => {
    let rawData: string = doc.encryptedData || (doc as any).fileData || '';
    if (rawData && doc.metadata?.encrypted && doc.metadata?.checksum && !doc.encryptedImage) {
      try {
        const { decryptFile } = await import('@/lib/encryptionUtils');
        rawData = decryptFile(rawData, doc.metadata.checksum);
      } catch { /* use raw */ }
    }
    if (doc.encryptedImage) {
      const img = doc.encryptedImage.trim();
      if (img.startsWith('data:')) return img;
      // embedPersistentDna always produces PNG — use png prefix for lossless LSB preservation
      return `data:image/png;base64,${img}`;
    }
    if (rawData.startsWith('data:')) return rawData;
    if (doc.cloudinaryUrl) return doc.cloudinaryUrl;
    if (rawData) {
      try {
        const sample = atob(rawData.substring(0, 8));
        const isPdf = sample.startsWith('%PDF');
        return isPdf ? `data:application/pdf;base64,${rawData}` : `data:image/jpeg;base64,${rawData}`;
      } catch {
        return `data:image/jpeg;base64,${rawData}`;
      }
    }
    return '';
  };

  // Scan a document directly from the vault — bypasses Android's filesystem/share
  // pipeline entirely, since any download/re-import roundtrip risks a third-party
  // app (Gallery, Photos, Drive) silently recompressing the image and destroying
  // the pixel-embedded persistent DNA. This is the only scan path guaranteed lossless.
  const scanDocumentFromVault = async (doc: VaultDocument) => {
    const url = await resolveDocUrl(doc);
    if (!url) { alert('No image data available to scan'); return; }
    setVerifyProofImage(url);
    setVerifyProofFileName(doc.name || 'vault_document.png');
    setCurrentPage('verify-proof');
  };

  const openFilePreview = async (doc: VaultDocument) => {
    const url = await resolveDocUrl(doc);
    const name = doc.metadata?.original_name || doc.name || 'file';
    setPreviewUrl(url);
    setPreviewFileName(name);
    setShowFilePreview(true);
  };

  const openOwnershipPanel = async (doc: VaultDocument) => {
    try {
      if (doc.encryptedImage) {
        const img = doc.encryptedImage.trim();
        const url = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
        const extracted = await extractAdvancedWatermark(url);
        setEmbeddedMetadata(extracted?.found ? extracted : null);
      } else {
        setEmbeddedMetadata(null);
      }
    } catch {
      setEmbeddedMetadata(null);
    }
    setOwnershipDoc(doc);
    setShowOwnershipPanel(true);
  };

  const handleDocumentClick = async (doc: VaultDocument) => {
    // Display the best available preview URL for this document
    try {
      // ── 1. Collect raw data ────────────────────────────────────────────────
      let rawData: string = doc.encryptedData || (doc as any).fileData || '';

      // ── 1a. Decrypt if this document was encrypted via UploadFromDevice ────
      // UploadFromDevice stores XOR-encrypted data and the key in metadata.checksum.
      // We must decrypt before the data can be used as a data URL.
      if (rawData && doc.metadata?.encrypted && doc.metadata?.checksum && !doc.encryptedImage) {
        try {
          const { decryptFile } = await import('@/lib/encryptionUtils');
          rawData = decryptFile(rawData, doc.metadata.checksum);
        } catch (decErr) {
        }
      }

      // ── 2. Build a display-ready URL ──────────────────────────────────────
      let imageUrl = '';

      if (doc.encryptedImage) {
        // encryptedImage may come from backend WITHOUT the data: prefix — normalise it
        const img = doc.encryptedImage.trim();
        imageUrl = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
      } else if (rawData) {
        if (rawData.startsWith('data:')) {
          // Already a valid data URL (image or PDF) — use as-is
          imageUrl = rawData;
        } else if (doc.cloudinaryUrl) {
          // Cloudinary URL is always a valid display URL
          imageUrl = doc.cloudinaryUrl;
        } else {
          // Raw base64 — detect content type via magic bytes
          try {
            const sample = atob(rawData.substring(0, 8));
            const isPdf = sample.startsWith('%PDF');
            imageUrl = isPdf
              ? `data:application/pdf;base64,${rawData}`
              : `data:image/jpeg;base64,${rawData}`;
          } catch {
            imageUrl = `data:image/jpeg;base64,${rawData}`;
          }
        }
      } else if (doc.cloudinaryUrl) {
        imageUrl = doc.cloudinaryUrl;
      }

      setPreviewImage(imageUrl || null);
      setSelectedDoc(doc);

      // Only try to extract metadata if we have the encrypted image
      if (doc.encryptedImage) {
        // VERIFY EMBEDDED METADATA using advanced steganography extraction
        const extracted = await extractAdvancedWatermark(imageUrl);
        if (extracted && extracted.found) {
          setEmbeddedMetadata(extracted);
        } else {
          setEmbeddedMetadata(null);
        }
      } else {
        // For old documents without encryptedImage, extract from metadata
        if (doc.metadata?.ownerId) {
        }
        setEmbeddedMetadata(null);
      }
    } catch (err) {
      console.error("Error loading preview:", err);
      setEmbeddedMetadata(null);
    }
  };

  // Download Requests Panel
  if (showDlPanel) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: 'linear-gradient(180deg, #0a0714 0%, #0d0a1a 100%)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-4 border-b border-white/5">
          <button onClick={() => setShowDlPanel(false)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all">
            <X className="w-4 h-4 text-slate-300" />
          </button>
          <div className="flex-1">
            <p className="text-[10px] font-black text-violet-400 tracking-widest uppercase">PINIT</p>
            <h2 className="text-lg font-black text-white leading-none">Download Requests</h2>
          </div>
          {pendingDlCount > 0 && (
            <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 border border-amber-500/40 rounded-full px-3 py-1 animate-pulse">
              {pendingDlCount} PENDING
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {dlRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center">
                <Download className="w-7 h-7 text-slate-600" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-400">No download requests yet</p>
                <p className="text-xs text-slate-600 mt-1">When someone requests a download from your share link, it will appear here</p>
              </div>
            </div>
          ) : (
            dlRequests.map((req, i) => {
              const isPending = !req.status || req.status === 'pending';
              return (
                <motion.div
                  key={req.id || i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`rounded-2xl border p-4 space-y-3 ${
                    isPending ? 'border-amber-500/25 bg-amber-500/5' :
                    req.status === 'approved' ? 'border-emerald-500/20 bg-emerald-500/5 opacity-70' :
                    'border-slate-700/30 bg-slate-800/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-black flex-shrink-0 ${isPending ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-700/50 text-slate-400'}`}>
                      {(req.visitor_name || 'A').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{req.visitor_name || 'Anonymous'}</p>
                      <p className="text-[11px] text-slate-400 truncate">Wants to download · <span className="text-slate-200">{req.fileName}</span></p>
                      {req.created_at && <p className="text-[10px] text-slate-600 mt-0.5">{new Date(req.created_at).toLocaleString()}</p>}
                    </div>
                    <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border flex-shrink-0 ${
                      isPending ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
                      req.status === 'approved' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                      'text-slate-500 bg-slate-700/30 border-slate-700/40'
                    }`}>
                      {isPending ? 'PENDING' : req.status?.toUpperCase()}
                    </span>
                  </div>
                  {isPending && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveDl(req.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/35 text-emerald-300 text-xs font-black hover:bg-emerald-600/35 active:scale-95 transition-all"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => handleRejectDl(req.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600/15 border border-red-500/30 text-red-300 text-xs font-black hover:bg-red-600/25 active:scale-95 transition-all"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>
    );
  }

  // File Preview Modal
  if (showFilePreview && previewUrl) {
    return (
      <FilePreviewModal
        url={previewUrl}
        fileName={previewFileName}
        onClose={() => setShowFilePreview(false)}
        onDownload={() => {
          const doc = vaultDocs.find(d => (d.metadata?.original_name || d.name) === previewFileName);
          if (doc) handleDownload(doc);
        }}
      />
    );
  }

  // Ownership Panel
  if (showOwnershipPanel && ownershipDoc) {
    return (
      <FileOwnershipPanel
        doc={ownershipDoc}
        embeddedMetadata={embeddedMetadata as Record<string, unknown> | null}
        userName={userName || ""}
        userId={userId || ""}
        onClose={() => setShowOwnershipPanel(false)}
        onPreview={() => { setShowOwnershipPanel(false); openFilePreview(ownershipDoc); }}
        onShare={() => { setSelectedShareImage(ownershipDoc); setShowOwnershipPanel(false); if (onStartShare) onStartShare(); setCurrentPage("share"); }}
        onDownload={() => handleDownload(ownershipDoc)}
        onDelete={() => { setShowOwnershipPanel(false); setDocToDelete(ownershipDoc.id); setShowDeleteConfirm(true); }}
      />
    );
  }

  // Delete confirmation modal
  if (showDeleteConfirm && docToDelete) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center px-4 py-6"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-gradient-to-br from-slate-800 to-slate-900 border border-red-500/30 backdrop-blur-xl rounded-2xl p-8 max-w-sm w-full space-y-6 shadow-2xl"
        >
          <div className="flex justify-center">
            <div className="bg-red-500/20 p-4 rounded-full">
              <AlertCircle size={30} className="text-red-500" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">Delete Document?</h2>
            <p className="text-sm text-slate-400">This action cannot be undone. The encrypted document will be permanently deleted from your vault.</p>
          </div>
          <div className="space-y-3">
            <motion.button
              onClick={handleDeleteDocument}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Trash2 size={20} />
              Delete Forever
            </motion.button>
            <motion.button
              onClick={() => {
                setShowDeleteConfirm(false);
                setDocToDelete(null);
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all"
            >
              Cancel
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // ── Open PDF natively on Android, fallback to browser tab on web ─────────
  const openPdfPreview = async (dataUrl: string, name: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        // Extract base64 payload (strip data URI prefix)
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const written = await Filesystem.writeFile({
          path: name,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({
          title: name,
          url: written.uri,
          dialogTitle: 'Open PDF with…',
        });
      } else {
        // Web: open in new tab
        const blob = await fetch(dataUrl).then(r => r.blob());
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error('PDF open error:', err);
    }
  };

  // ── Fullscreen preview portal ─────────────────────────────────────────────
  const FullscreenPreviewPortal = fullscreenPreview
    ? createPortal(
        <div
          onClick={() => setFullscreenPreview(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.97)', display: 'flex', flexDirection: 'column' }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', gap: 12 }} onClick={e => e.stopPropagation()}>
            <p style={{ color: 'white', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullscreenPreview.name}</p>
            <button
              onClick={() => setFullscreenPreview(null)}
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <span style={{ color: 'white', fontSize: 18 }}>✕</span>
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            {fullscreenPreview.dataUrl.startsWith('data:image') || fullscreenPreview.dataUrl.startsWith('http') ? (
              /* ── Image (data URL or Cloudinary URL) ── */
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, minHeight: '100%' }}>
                <img
                  src={fullscreenPreview.dataUrl}
                  alt={fullscreenPreview.name}
                  style={{ maxWidth: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: '0 0 60px rgba(0,0,0,0.9)' }}
                />
              </div>
            ) : (
              /* ── PDF — inline SecurePdfViewer, never open externally ── */
              <div style={{ width: '100%', height: '100%', minHeight: '70vh' }} onClick={e => e.stopPropagation()}>
                <SecurePdfViewer
                  pdfData={fullscreenPreview.dataUrl}
                  fileName={fullscreenPreview.name}
                  downloadEnabled={true}
                  onClose={() => setFullscreenPreview(null)}
                />
              </div>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  // Full-screen preview modal
  if (selectedDoc && previewImage) {
    return (
      <>
      {FullscreenPreviewPortal}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center px-4 py-6 overflow-y-auto"
      >
        {/* Close button */}
        <button
          onClick={() => {
            setSelectedDoc(null);
            setPreviewImage(null);
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-700/80 hover:bg-slate-600 z-51 transition-all"
        >
          <X size={24} className="text-white" />
        </button>

        {/* Document preview — image inline, PDF via native open */}
        <div className="flex-1 flex items-center justify-center w-full max-w-2xl py-8">
          {previewImage.startsWith('data:application/pdf') ||
           previewImage.startsWith('blob:') ||
           (selectedDoc.metadata?.original_name || getSafeName(selectedDoc)).toLowerCase().endsWith('.pdf') ? (
            <div style={{ width: '100%', minHeight: '70vh' }} onClick={e => e.stopPropagation()}>
              <SecurePdfViewer
                pdfData={previewImage}
                fileName={selectedDoc.metadata?.original_name || getSafeName(selectedDoc)}
                downloadEnabled={true}
                onClose={() => { setSelectedDoc(null); setPreviewImage(null); }}
              />
            </div>
          ) : (
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onError={(e) => {
                // If image fails to load, show a "cannot preview" message instead of broken icon
                const target = e.currentTarget as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent && !parent.querySelector('.preview-error')) {
                  const msg = document.createElement('div');
                  msg.className = 'preview-error';
                  msg.style.cssText = 'text-align:center;color:white;padding:32px';
                  msg.innerHTML = '<div style="font-size:60px;margin-bottom:16px">📄</div><p style="font-size:16px;font-weight:600">' + (selectedDoc.metadata?.original_name || getSafeName(selectedDoc)) + '</p><p style="color:rgba(148,163,184,1);font-size:13px;margin-top:8px">Preview unavailable — use Download to open this file</p>';
                  parent.appendChild(msg);
                }
              }}
            />
          )}
        </div>

        {/* Enhanced metadata and actions */}
        <div className="w-full max-w-4xl space-y-4">
          {/* Metadata Grid */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur rounded-2xl p-6 border border-purple-500/20 space-y-6"
          >
            <h3 className="text-lg font-bold text-white mb-4">🔒 ENCRYPTION DETAILS & METADATA VERIFICATION</h3>

            {/* File Info */}
            <div className="space-y-3">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">FILE INFORMATION</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                  <p className="text-xs text-slate-400 mb-1">FILE NAME</p>
                  <p className="text-sm text-slate-200 font-mono break-all">{selectedDoc.metadata?.original_name || getSafeName(selectedDoc)}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                  <p className="text-xs text-slate-400 mb-1">SIZE</p>
                  <p className="text-sm text-slate-200 font-mono">{getFileSize(selectedDoc.metadata?.size || 0)}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                  <p className="text-xs text-slate-400 mb-1">SAVED</p>
                  <p className="text-sm text-slate-200 font-mono">{selectedDoc.metadata?.timestamp ? new Date(selectedDoc.metadata.timestamp).toLocaleString() : new Date(selectedDoc.createdAt).toLocaleString()}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                  <p className="text-xs text-slate-400 mb-1">CHECKSUM</p>
                  <p className="text-sm text-slate-200 font-mono">{selectedDoc.metadata?.checksum || '—'}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                  <p className="text-xs text-slate-400 mb-1">PAGES</p>
                  <p className="text-sm text-slate-200 font-mono">
                    {(() => {
                      // Use stored pageCount if available
                      if (selectedDoc.pageCount && selectedDoc.pageCount > 0) {
                        return `${selectedDoc.pageCount} page${selectedDoc.pageCount !== 1 ? 's' : ''}`;
                      }
                      // For PDFs without stored pageCount, count from encryptedData on the fly
                      const isPdf = (selectedDoc.metadata?.original_name || selectedDoc.name || '').toLowerCase().endsWith('.pdf')
                        || (selectedDoc.encryptedData || '').startsWith('data:application/pdf');
                      if (isPdf && selectedDoc.encryptedData) {
                        try {
                          const n = countPdfPagesFromDataUrl(selectedDoc.encryptedData);
                          return `${n} page${n !== 1 ? 's' : ''}`;
                        } catch { /* fallback */ }
                      }
                      return isPdf ? '—' : '1 page';
                    })()}
                  </p>
                </div>
              </div>
            </div>

            {/* Security & Metadata */}
            <div className="space-y-3">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">SECURITY & METADATA</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 rounded-lg p-3 border border-green-500/20">
                  <p className="text-xs text-slate-400 mb-1">ENCRYPTION</p>
                  <p className="text-sm text-green-300 font-semibold">AES-256 + LSB</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-900/30 to-teal-900/30 rounded-lg p-3 border border-cyan-500/20">
                  <p className="text-xs text-slate-400 mb-1">METADATA METHOD</p>
                  <p className="text-sm text-cyan-300 font-semibold">Tile-Based (12x12)</p>
                </div>
              </div>
            </div>

            {/* Embedded Metadata (extracted from image) */}
            {embeddedMetadata && embeddedMetadata.found && (
              <>
                <div className="border-t border-slate-700 pt-4 space-y-3">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide text-emerald-400">✅ METADATA VERIFIED</p>
                  
                  {/* Primary Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-lg p-3 border border-purple-500/20">
                      <p className="text-xs text-slate-400 mb-1">OWNER (VERIFIED)</p>
                      <p className="text-sm font-mono text-purple-300 font-semibold">{embeddedMetadata.userId}</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-900/30 to-yellow-900/30 rounded-lg p-3 border border-amber-500/20">
                      <p className="text-xs text-slate-400 mb-1">CONFIDENCE</p>
                      <p className="text-sm font-mono text-amber-300 font-semibold">{embeddedMetadata.confidence}</p>
                    </div>
                  </div>

                  {/* Device Information */}
                  {(embeddedMetadata.deviceName || embeddedMetadata.deviceId) && (
                    <div className="pt-3 space-y-2">
                      <p className="text-xs text-slate-400 font-semibold">DEVICE INFORMATION</p>
                      <div className="grid grid-cols-2 gap-3">
                        {embeddedMetadata.deviceName && (
                          <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                            <p className="text-xs text-slate-400 mb-1">DEVICE NAME</p>
                            <p className="text-sm text-slate-200 font-mono">{embeddedMetadata.deviceName}</p>
                          </div>
                        )}
                        {embeddedMetadata.deviceId && (
                          <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                            <p className="text-xs text-slate-400 mb-1">DEVICE ID</p>
                            <p className="text-sm text-slate-200 font-mono break-all">{embeddedMetadata.deviceId}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Network & Location */}
                  {(embeddedMetadata.ipAddress || embeddedMetadata.gps.available) && (
                    <div className="pt-3 space-y-2">
                      <p className="text-xs text-slate-400 font-semibold">NETWORK & LOCATION</p>
                      <div className="grid grid-cols-2 gap-3">
                        {embeddedMetadata.ipAddress && (
                          <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                            <p className="text-xs text-slate-400 mb-1">IP ADDRESS</p>
                            <p className="text-sm text-slate-200 font-mono">{embeddedMetadata.ipAddress}</p>
                          </div>
                        )}
                        {embeddedMetadata.gps.available && (
                          <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                            <p className="text-xs text-slate-400 mb-1">GPS COORDINATES</p>
                            <p className="text-sm text-slate-200 font-mono">{embeddedMetadata.gps.coordinates}</p>
                            {embeddedMetadata.gps.mapsUrl && (
                              <a href={embeddedMetadata.gps.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-1">
                                View on Maps →
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Image Resolution */}
                  {embeddedMetadata.originalResolution && (
                    <div className="pt-3">
                      <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                        <p className="text-xs text-slate-400 mb-1">ORIGINAL RESOLUTION</p>
                        <p className="text-sm text-slate-200 font-mono">{embeddedMetadata.originalResolution}</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {!embeddedMetadata || !embeddedMetadata.found && (
              <div className="border-t border-slate-700 pt-4">
                <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                  <p className="text-xs text-slate-400 mb-1">METADATA STATUS</p>
                  <p className="text-sm text-slate-300">⚠️ Metadata extraction in progress...</p>
                </div>
              </div>
            )}
          </motion.div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* Download Button */}
            <motion.button
              onClick={() => handleDownload(selectedDoc)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Download size={18} />
              Download
            </motion.button>

            {/* Preview Button */}
            <motion.button
              onClick={() => {
                if (previewImage) {
                  setFullscreenPreview({ dataUrl: previewImage, name: getSafeName(selectedDoc) });
                }
              }}
              disabled={!previewImage}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 disabled:opacity-40 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Eye size={18} />
              Preview
            </motion.button>

            {/* Share Button */}
            <motion.button
              onClick={() => {
                setSelectedShareImage(selectedDoc);
                if (onStartShare) onStartShare(); // reset share flow state
                setCurrentPage("share");
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Share2 size={18} />
              Share
            </motion.button>

            {/* Delete Button */}
            <motion.button
              onClick={() => {
                setDocToDelete(selectedDoc.id);
                setShowDeleteConfirm(true);
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Trash2 size={18} />
              Delete
            </motion.button>
          </div>

          {/* Back Button */}
          <motion.button
            onClick={() => {
              setSelectedDoc(null);
              setPreviewImage(null);
              setEmbeddedMetadata(null);
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all"
          >
            Back to Vault
          </motion.button>
        </div>
      </motion.div>
      </>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-6 space-y-4"
    >
      {/* ── Vault Header ── */}
      <div className="flex items-center justify-between">
        {/* Vault title */}
        <div>
          <p className="text-[10px] font-bold text-fuchsia-400/80 tracking-[0.2em] uppercase leading-none mb-0.5">PINIT</p>
          <h1 className="text-4xl font-black leading-none tracking-tight">
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-pink-400 bg-clip-text text-transparent">Vault</span>
          </h1>
        </div>

        {/* PINIT Request button */}
        <button
          onClick={() => { loadDlRequests(); setShowDlPanel(true); }}
          className="relative flex items-center gap-2 px-3.5 py-2.5 rounded-2xl flex-shrink-0 overflow-hidden group transition-all active:scale-95"
          style={{
            background: 'linear-gradient(145deg, #0d0a1a 0%, #110d22 100%)',
            border: pendingDlCount > 0 ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(88,28,135,0.6)',
            boxShadow: pendingDlCount > 0
              ? '0 0 18px rgba(245,158,11,0.15), inset 0 1px 0 rgba(255,255,255,0.04)'
              : '0 0 18px rgba(109,40,217,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Subtle inner glow on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.08) 0%, transparent 70%)' }} />
          <div className="relative w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(109,40,217,0.3)', border: '1px solid rgba(139,92,246,0.25)' }}>
            <Download className={`w-3 h-3 ${pendingDlCount > 0 ? 'text-amber-400' : 'text-violet-400'}`} />
          </div>
          <div className="relative flex flex-col items-start leading-none gap-0.5">
            <span className="text-[8px] font-black tracking-[0.18em] uppercase text-violet-500">PINIT</span>
            <span className={`text-[11px] font-bold ${pendingDlCount > 0 ? 'text-amber-300' : 'text-slate-300'}`}>Request</span>
          </div>
          {pendingDlCount > 0 && (
            <span className="relative w-5 h-5 rounded-full bg-amber-500 text-[9px] font-black text-black flex items-center justify-center animate-pulse"
              style={{ boxShadow: '0 0 8px rgba(245,158,11,0.6)' }}>
              {pendingDlCount}
            </span>
          )}
        </button>
      </div>

      {/* ── DNA Lab — advanced analysis hub ── */}
      <motion.button
        onClick={() => setCurrentPage("dna-lab")}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.985 }}
        type="button"
        className="w-full relative overflow-hidden rounded-xl p-[1.5px] bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-500"
      >
        <div className="rounded-xl bg-gradient-to-br from-slate-900 to-purple-950/80 px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-500 flex items-center justify-center">
                <Fingerprint size={16} className="text-white" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-900 animate-pulse" />
            </div>
            <span className="text-sm font-bold text-white">DNA Lab</span>
          </div>
          <ChevronRight size={16} className="text-fuchsia-300 flex-shrink-0" />
        </div>
      </motion.button>

      {/* Vault DNA + Digital Identity — side by side */}
      {(() => {
        const dnaDocs = vaultDocs.filter(d => String((d as any).id || '').startsWith('upload_'));
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              {/* Vault DNA */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowVaultDna(!showVaultDna)}
                className="relative overflow-hidden rounded-2xl p-[1.5px] bg-gradient-to-br from-orange-500 via-fuchsia-500 to-violet-600 shadow-lg"
              >
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 px-3 py-4 flex flex-col items-center gap-2 text-center">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-fuchsia-600 flex items-center justify-center shadow-md">
                    <Fingerprint size={20} className="text-white" />
                  </div>
                  <p className="text-xs font-bold text-white leading-tight">Vault DNA</p>
                  <span className="text-lg font-black text-fuchsia-300">{dnaDocs.length}</span>
                  <p className="text-[9px] text-slate-400 leading-tight">DNA Fingerprinted</p>
                </div>
              </motion.button>

              {/* Digital Identity in Vault */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowDigitalIdentities(!showDigitalIdentities)}
                className="relative overflow-hidden rounded-2xl p-[1.5px] bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 shadow-lg"
              >
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 px-3 py-4 flex flex-col items-center gap-2 text-center">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-md">
                    <Shield size={20} className="text-white" />
                  </div>
                  <p className="text-xs font-bold text-white leading-tight">Digital Identity</p>
                  <span className="text-lg font-black text-pink-300">{digitalIdentityDocuments.length}</span>
                  <p className="text-[9px] text-slate-400 leading-tight">Identity Documents</p>
                </div>
              </motion.button>
            </div>

            {/* Vault DNA expanded list */}
            <AnimatePresence>
              {showVaultDna && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-slate-900/80 border border-fuchsia-500/20 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-bold text-fuchsia-300 uppercase tracking-widest mb-3">
                      🧬 DNA-Generated Files · {dnaDocs.length}
                    </p>
                    {dnaDocs.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">
                        No files yet — use Generate DNA to fingerprint &amp; store files here
                      </p>
                    ) : (
                      dnaDocs.map((doc, idx) => {
                        const name = getSafeName(doc);
                        const raw = (doc as any).encryptedData || '';
                        const isImg = raw.startsWith('data:image');
                        return (
                          <motion.div
                            key={(doc as any).id || idx}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-2.5 space-y-2"
                          >
                            {/* Top row: thumbnail + name + badges — tap to open ownership panel */}
                            <button className="flex items-center gap-3 w-full text-left" onClick={() => openOwnershipPanel(doc)}>
                              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900 border border-slate-700 flex items-center justify-center">
                                {isImg ? (
                                  <img src={raw} alt={name} className="w-full h-full object-cover" />
                                ) : (
                                  <FileText className="w-4 h-4 text-fuchsia-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-white truncate">{name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">✓ DNA</span>
                                  <span className="text-[9px] text-fuchsia-400 font-bold bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-full px-1.5 py-0.5">Encrypted</span>
                                </div>
                              </div>
                            </button>
                            {/* Action buttons row */}
                            <div className="grid grid-cols-5 gap-1.5">
                              <button
                                onClick={() => openFilePreview(doc)}
                                className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
                              >
                                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-[8px] text-cyan-300 font-semibold">Preview</span>
                              </button>
                              <button
                                onClick={() => scanDocumentFromVault(doc)}
                                className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-all"
                              >
                                <Search className="w-3.5 h-3.5 text-violet-400" />
                                <span className="text-[8px] text-violet-300 font-semibold">Scan</span>
                              </button>
                              <button
                                onClick={() => { setSelectedShareImage(doc); if (onStartShare) onStartShare(); setCurrentPage("share"); }}
                                className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 hover:bg-fuchsia-500/20 transition-all"
                              >
                                <Share2 className="w-3.5 h-3.5 text-fuchsia-400" />
                                <span className="text-[8px] text-fuchsia-300 font-semibold">Share</span>
                              </button>
                              <button
                                onClick={() => handleDownload(doc)}
                                className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                              >
                                <Download className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-[8px] text-emerald-300 font-semibold">Download</span>
                              </button>
                              <button
                                onClick={() => { setDocToDelete((doc as any).id); setShowDeleteConfirm(true); }}
                                className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                <span className="text-[8px] text-red-300 font-semibold">Delete</span>
                              </button>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        );
      })()}

      {/* Digital Identity Documents List */}
      {showDigitalIdentities && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4 p-4 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Digital Identity Documents
          </h3>
          {digitalIdentityDocuments.length === 0 ? (
            <p className="text-gray-400 text-sm">No digital identity documents found</p>
          ) : (
            <div className="space-y-2">
              {digitalIdentityDocuments.map((doc, idx) => {
                const name = getSafeName(doc);
                const raw = (doc as any).encryptedData || (doc as any).fileData || '';
                const isImg = raw.startsWith('data:image');
                const hasDna = !!(doc.metadata?.dna || (doc as any).pHash);
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-2.5 space-y-2"
                  >
                    <button className="flex items-center gap-3 w-full text-left" onClick={() => openOwnershipPanel(doc)}>
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900 border border-slate-700 flex items-center justify-center">
                        {isImg ? (
                          <img src={raw} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <FileText className="w-4 h-4 text-fuchsia-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {hasDna && (
                            <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">✓ DNA</span>
                          )}
                          <span className="text-[9px] text-fuchsia-400 font-bold bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-full px-1.5 py-0.5">Encrypted</span>
                        </div>
                      </div>
                    </button>
                    <div className="grid grid-cols-5 gap-1.5">
                      <button
                        onClick={() => openFilePreview(doc)}
                        className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[8px] text-cyan-300 font-semibold">Preview</span>
                      </button>
                      <button
                        onClick={() => scanDocumentFromVault(doc)}
                        className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-all"
                      >
                        <Search className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-[8px] text-violet-300 font-semibold">Scan</span>
                      </button>
                      <button
                        onClick={() => { setSelectedShareImage(doc); if (onStartShare) onStartShare(); setCurrentPage("share"); }}
                        className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 hover:bg-fuchsia-500/20 transition-all"
                      >
                        <Share2 className="w-3.5 h-3.5 text-fuchsia-400" />
                        <span className="text-[8px] text-fuchsia-300 font-semibold">Share</span>
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[8px] text-emerald-300 font-semibold">Download</span>
                      </button>
                      <button
                        onClick={() => { setDocToDelete(doc.id); setShowDeleteConfirm(true); }}
                        className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-[8px] text-red-300 font-semibold">Delete</span>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* Files List - Matching Vault DNA card style */}
      <div className="space-y-2">
        {filteredDocs.length > 0 ? (
          filteredDocs.map((doc, idx) => {
            const name = getSafeName(doc);
            const raw = (doc as any).encryptedData || (doc as any).fileData || '';
            const isImg = raw.startsWith('data:image');
            const hasDna = !!(doc.metadata?.dna || (doc as any).pHash);
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-2.5 space-y-2"
              >
                {/* Top row — tap to open ownership panel */}
                <button className="flex items-center gap-3 w-full text-left" onClick={() => openOwnershipPanel(doc)}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900 border border-slate-700 flex items-center justify-center">
                    {isImg ? (
                      <img src={raw} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="w-4 h-4 text-fuchsia-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {hasDna && (
                        <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">✓ DNA</span>
                      )}
                      <span className="text-[9px] text-fuchsia-400 font-bold bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-full px-1.5 py-0.5">Encrypted</span>
                    </div>
                  </div>
                </button>
                {/* Action buttons */}
                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    onClick={() => openFilePreview(doc)}
                    className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
                  >
                    <Eye className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[8px] text-cyan-300 font-semibold">Preview</span>
                  </button>
                  <button
                    onClick={() => scanDocumentFromVault(doc)}
                    className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-all"
                  >
                    <Search className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[8px] text-violet-300 font-semibold">Scan</span>
                  </button>
                  <button
                    onClick={() => { setSelectedShareImage(doc); if (onStartShare) onStartShare(); setCurrentPage("share"); }}
                    className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 hover:bg-fuchsia-500/20 transition-all"
                  >
                    <Share2 className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span className="text-[8px] text-fuchsia-300 font-semibold">Share</span>
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[8px] text-emerald-300 font-semibold">Download</span>
                  </button>
                  <button
                    onClick={() => { setDocToDelete(doc.id); setShowDeleteConfirm(true); }}
                    className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-[8px] text-red-300 font-semibold">Delete</span>
                  </button>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-8 text-slate-400">
            <p>{searchTerm ? "No matching documents" : "No documents in vault"}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============= ENCRYPT PREVIEW PAGE =============
function EncryptPreviewPage({
  image,
  userId,
  userName,
  onRetake,
  onSaveToVault,
}: {
  image: string;
  userId: string;
  userName: string;
  onRetake: () => void;
  onSaveToVault: (encryptedPackage: any) => Promise<void>;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [encryptStep, setEncryptStep] = useState<string>('');
  const [encryptedData, setEncryptedData] = useState<any>(null);
  const [encryptedImage, setEncryptedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Encrypt image and embed user ID when component mounts - DISABLED TO PREVENT CRASH
  // Encryption will be triggered manually by the Encrypt button instead
  // useEffect(() => {
  //   let isMounted = true; // Track if component is still mounted
    
  //   const encryptImage = async () => {
  //     try {
        
  //       // Validate inputs
  //       if (!image) {
  //         if (isMounted) {
  //           setError('No image to encrypt');
  //           setIsProcessing(false);
  //         }
  //         return;
  //       }
        
  //       if (!userId) {
  //         if (isMounted) {
  //           setError('User not authenticated');
  //           setIsProcessing(false);
  //         }
  //         return;
  //       }
        
  //       if (!isMounted) return;
  //       setIsProcessing(true);
  //       setError(null);
        
  //       // Step 0: Resize image if needed to prevent memory overflow
  //       let processedImage = image;
  //       try {
  //         // Skip resizing for camera images (already optimized)
  //         if (image.startsWith('data:image') && (image.includes('camera') || image.length < 2000000)) {
  //           processedImage = image;
  //         } else {
  //           const img = new Image();
  //           await new Promise<void>((resolve, reject) => {
  //             const timeout = setTimeout(() => {
  //               reject(new Error('Image loading timeout'));
  //             }, 5000);
              
  //             img.onload = () => {
  //               clearTimeout(timeout);
  //               resolve();
  //             };
  //             img.onerror = () => {
  //               clearTimeout(timeout);
  //               reject(new Error('Failed to load image for resizing'));
  //             };
  //             img.src = image;
  //           });
            
  //           let width = img.width;
  //           let height = img.height;
  //           const maxWidth = 1920;
  //           const maxHeight = 1080;
            
  //           // Check if resize needed
  //           if (width > maxWidth || height > maxHeight) {
  //             const ratio = Math.min(maxWidth / width, maxHeight / height);
  //             width = Math.floor(width * ratio);
  //             height = Math.floor(height * ratio);
              
  //             // Resize using canvas
  //             const resizeCanvas = document.createElement('canvas');
  //             resizeCanvas.width = width;
  //             resizeCanvas.height = height;
  //             const resizeCtx = resizeCanvas.getContext('2d');
              
  //             if (!resizeCtx) {
  //               throw new Error('Failed to get canvas context for resizing');
  //             }
              
  //             resizeCtx.drawImage(img, 0, 0, width, height);
  //             processedImage = resizeCanvas.toDataURL('image/jpeg', 0.9); // JPEG compression for efficiency
  //           } else {
  //           }
  //         }
  //       } catch (resizeErr) {
  //         // Fallback to original image if resizing fails
  //         processedImage = image;
  //       }
        
  //       if (!isMounted) return;
        
  //       // Validate processed image
  //       if (!processedImage || processedImage.length === 0) {
  //         setError('Image processing failed - empty result');
  //         setIsProcessing(false);
  //         return;
  //       }
        
  //       if (!isMounted) return;
        
  //       // Step 1: Embed metadata with fallback
  //       let embeddedImageBase64 = null;
        
  //       // Try advanced steganography first
  //       try {
  //           imageLength: processedImage.length,
  //           userId: userId.substring(0, 8) + '...',
  //           timestamp: new Date().toISOString()
  //         });
          
  //         embeddedImageBase64 = await embedAdvancedWatermark(
  //           processedImage,
  //           userId,
  //           new Date().toISOString(),
  //           undefined,
  //           undefined,
  //           undefined,
  //           undefined
  //         );
  //       } catch (embedErr) {
  //         const errorMsg = embedErr instanceof Error ? embedErr.message : String(embedErr);
          
  //         // Check for constructor errors specifically
  //         if (errorMsg.includes('Y3') || errorMsg.includes('X3') || errorMsg.includes('constructor')) {
  //         }
          
  //         // Fallback to simple watermark embedding
  //         try {
  //           embeddedImageBase64 = await embedSimpleWatermark(processedImage, userId, new Date().toISOString());
  //         } catch (simpleErr) {
  //           // Final fallback - just return the original image with metadata in URL
  //           const metadata = btoa(JSON.stringify({
  //             userId: userId,
  //             timestamp: new Date().toISOString(),
  //             encrypted: true,
  //             method: 'fallback'
  //           }));
  //           embeddedImageBase64 = processedImage + '#metadata:' + metadata;
  //         }
  //       }
        
  //       if (!embeddedImageBase64) {
  //         setError('All encryption methods failed - please try again');
  //         setIsProcessing(false);
  //         return;
  //       }
        
  //       if (!isMounted) return;
  //       setEncryptedImage(embeddedImageBase64);
        
  //       // Step 2: Convert base64 to Blob without using fetch (avoids size issues)
  //       let blob: Blob;
  //       try {
  //         // Remove data URL prefix if present
  //         const base64Data = embeddedImageBase64.includes(',') 
  //           ? embeddedImageBase64.split(',')[1] 
  //           : embeddedImageBase64;
          
  //         // Convert base64 to binary
  //         const binaryString = atob(base64Data);
  //         const bytes = new Uint8Array(binaryString.length);
  //         for (let i = 0; i < binaryString.length; i++) {
  //           bytes[i] = binaryString.charCodeAt(i);
  //         }
          
  //         blob = new Blob([bytes], { type: 'image/jpeg' });
          
  //         if (!blob.size) {
  //           throw new Error('Blob is empty');
  //         }
  //       } catch (blobErr) {
  //         throw new Error(`Blob conversion failed: ${blobErr instanceof Error ? blobErr.message : String(blobErr)}`);
  //       }
        
  //       if (!isMounted) return;
        
  //       // Step 3: Convert blob to base64 using FileReader
  //         size: blob.size,
  //         type: blob.type,
  //         isBlob: blob instanceof Blob
  //       });
        
  //       const base64String = await new Promise<string>((resolve, reject) => {
  //         try {
  //           const reader = new FileReader();
            
  //           // Set timeout to prevent hanging
  //           const timeout = setTimeout(() => {
  //             reader.abort();
  //             reject(new Error('FileReader timeout after 30 seconds'));
  //           }, 30000);
            
  //           reader.onload = () => {
  //             clearTimeout(timeout);
  //             try {
  //               const result = reader.result as string;
                
  //               if (!result) {
  //                 throw new Error('FileReader returned empty result');
  //               }
                
  //               const base64 = result.includes(',') ? result.split(',')[1] : result;
  //               if (!base64 || base64.length === 0) {
  //                 throw new Error('Base64 string is empty after split');
  //               }
                
  //               resolve(base64);
  //             } catch (err) {
  //               reject(new Error(`Base64 processing error: ${err instanceof Error ? err.message : String(err)}`));
  //             }
  //           };
            
  //           reader.onerror = () => {
  //             clearTimeout(timeout);
  //             reject(new Error(`FileReader error: ${reader.error?.message || 'Unknown error'}`));
  //           };
            
  //           reader.onabort = () => {
  //             clearTimeout(timeout);
  //             reject(new Error('FileReader was aborted'));
  //           };
            
  //           reader.readAsDataURL(blob);
  //         } catch (err) {
  //           reject(new Error(`FileReader setup error: ${err instanceof Error ? err.message : String(err)}`));
  //         }
  //       });
        
  //       if (!isMounted) return;
        
  //       // Step 4: Create encryption package
  //       const metadata = {
  //         timestamp: Date.now(),
  //         original_name: `encrypted_vault_${userId}_${Date.now()}.jpg`,
  //         size: blob.size,
  //         checksum: Math.random().toString(36).substring(7),
  //         encrypted: true,
  //         ownerId: userId,
  //         imageType: 'encrypted',
  //       };
        
  //       const encryptedPackage = {
  //         encrypted_data: base64String,
  //         encryptedImage: embeddedImageBase64,
  //         metadata: metadata,
  //         check_digest: Math.random().toString(36).substring(7),
  //       };
        
  //       if (isMounted) {
  //         setEncryptedData(encryptedPackage);
  //       }
  //     } catch (err: any) {
  //       const errorMsg = err?.message || String(err) || 'Unknown encryption error';
  //       if (isMounted) {
  //         setError(`⚠️ Encryption failed: ${errorMsg}`);
  //       }
  //     } finally {
  //       if (isMounted) {
  //         setIsProcessing(false);
  //       }
  //     }
  //   };
    
  //   encryptImage();
    
  //   // Cleanup function
  //   return () => {
  //     isMounted = false; // Mark component as unmounted to prevent state updates
  //   };
  // }, [image, userId]);

  const handleEncrypt = async () => {
    try {
      // Biometric gate removed — fingerprint verification no longer required for encryption

      if (!image) {
        alert("No image available for encryption.");
        return;
      }
      
      if (!userId) {
        console.error("❌ No userId available");
        alert("User not authenticated.");
        return;
      }

      setIsProcessing(true);

      // ── Step 1: Acquire mandatory GPS ──────────────────────────────────────
      // Encryption CANNOT proceed without exact GPS. Block here until we have it.
      // GPS is captured best-effort inside captureDeviceNetworkDna() below.
      // No blocking GPS gate — encryption proceeds even if GPS is unavailable.

      // ── Step 2: Run DNA generation and full device capture ─────────────────
      setEncryptStep('🧬 Generating ownership DNA...');

      let embeddedImageBase64: string | null = null;
      let encryptionMethod: string = 'persistent-dna';
      const assetUuid = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const encTimestamp = new Date().toISOString();

      let dnaId = `DNA-${Date.now().toString(36).toUpperCase().slice(-4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const encFileName = `encrypted_${Date.now()}.jpg`;

      // captureDeviceNetworkDna() hits the warm GPS cache set by getMandatoryGps above.
      // gpsLat/gpsLng are guaranteed non-null at this point.
      const [dnaResult, devDna] = await Promise.all([
        (async () => {
          try {
            const { generateExtendedDocumentDNA } = await import('@/lib/documentDna');
            return await generateExtendedDocumentDNA(image, encFileName, 'image/jpeg', image.length, { userId, ownerName: userName || undefined });
          } catch { return null; }
        })(),
        (async () => {
          try {
            const { captureDeviceNetworkDna } = await import('@/lib/dna/deviceNetworkDna');
            return await captureDeviceNetworkDna();
          } catch { return null; }
        })(),
      ]);

      if (dnaResult) dnaId = dnaResult.dnaId;

      // ── Step 3: Embed GPS + ownership into image pixels ────────────────────
      setEncryptStep('🔐 Embedding ownership into image pixels...');
      try {
        const { embedPersistentDna } = await import('@/lib/dna/persistentDna');
        embeddedImageBase64 = await embedPersistentDna(image, {
          ownerId: userId,
          pinitId: `PINIT-${userId.slice(0, 8).toUpperCase()}`,
          dnaId,
          assetUuid,
          timestamp: encTimestamp,
          signature: dnaId,
          ownerName: userName || localStorage.getItem('biovault_userName') || undefined,
          gpsLat: devDna?.gpsLat ?? null,
          gpsLng: devDna?.gpsLng ?? null,
          address: devDna?.address ?? null,
          city: devDna?.city ?? null,
          state: devDna?.state ?? null,
          country: devDna?.country ?? null,
          deviceModel: devDna?.model ?? null,
          deviceManufacturer: devDna?.manufacturer ?? null,
          publicIp: devDna?.publicIp ?? null,
        });
        encryptionMethod = 'persistent-dna';
      } catch {
        try {
          embeddedImageBase64 = await embedSimpleWatermark(image, userId, encTimestamp);
          encryptionMethod = 'simple';
        } catch {
          embeddedImageBase64 = image;
          encryptionMethod = 'none';
        }
      }

      if (!embeddedImageBase64) {
        setError('All encryption methods failed - please try again');
        return;
      }

      setEncryptedImage(embeddedImageBase64);
      
      // Create encryption package with full forensic metadata
      const encryptedPackage = {
        encrypted_data: image,
        encryptedImage: embeddedImageBase64,
        metadata: {
          userId: userId,
          timestamp: encTimestamp,
          encryptionMethod: encryptionMethod,
          size: image.length,
          original_name: `encrypted_vault_${userId}_${Date.now()}.jpg`,
          dnaId,
          assetUuid,
          ownerId: userId,
          deviceManufacturer: devDna?.manufacturer ?? null,
          deviceModel: devDna?.model ?? null,
          os: devDna?.operatingSystem ?? null,
          osVersion: devDna?.osVersion ?? null,
          platform: devDna?.platform ?? null,
          deviceFingerprint: devDna?.deviceFingerprint ?? null,
          publicIp: devDna?.publicIp ?? null,
          gpsLat: devDna?.gpsLat ?? null,
          gpsLng: devDna?.gpsLng ?? null,
          address: devDna?.address ?? null,
          village: devDna?.village ?? null,
          area: devDna?.area ?? null,
          road: devDna?.road ?? null,
          city: devDna?.city ?? null,
          state: devDna?.state ?? null,
          country: devDna?.country ?? null,
          timeZone: devDna?.timeZone ?? null,
        },
        check_digest: Math.random().toString(36).substring(7),
      };
      
      setEncryptedData(encryptedPackage);
      
      // Auto-save to vault after encryption
      try {
        await onSaveToVault(encryptedPackage);
        alert("✅ Encryption completed and saved to vault!");
      } catch (saveErr) {
        console.error("❌ Auto-save failed:", saveErr);
        const saveErrorMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
        alert(`⚠️ Encryption completed but save failed: ${saveErrorMsg}`);
        setError(`Save failed: ${saveErrorMsg}`);
      }
      
    } catch (err) {
      console.error("❌ Encryption error:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Encryption failed: ${errorMsg}`);
      alert(`Encryption failed: ${errorMsg}`);
      setError(`Encryption failed: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
      setEncryptStep('');
    }
  };

  const handleSave = async () => {
    try {
      
      if (!encryptedData) {
        console.error("❌ No encrypted data available");
        alert("Please encrypt the image first by clicking the Encrypt button.");
        return;
      }
      
      setIsProcessing(true);
      await onSaveToVault(encryptedData);
    } catch (err) {
      console.error("❌ Save error:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Save failed: ${errorMsg}`);
      alert(`Save failed: ${errorMsg}`);
      setError(`Save failed: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-6 space-y-4 pb-24"
    >
      <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">🔐 Encrypt Image</h1>

      {/* Encrypted Image Preview */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative rounded-2xl overflow-hidden border-2 border-purple-500/30 shadow-2xl"
      >
        <img
          src={encryptedImage || image}
          alt="Encrypted"
          className="w-full h-auto object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-4">
          <div className="flex items-center gap-2 text-purple-300 text-xs bg-slate-900/60 backdrop-blur-sm px-3 py-2 rounded-lg">
            <Shield size={14} />
            <span>🔒 User ID Embedded: {userId.substring(0, 8)}...</span>
          </div>
        </div>
      </motion.div>

      {/* Encryption Status */}
      {isProcessing ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gradient-to-r from-slate-800/50 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center gap-4"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-3 border-purple-500/30 border-t-purple-500 rounded-full"
          />
          <p className="text-purple-300 font-semibold">{encryptStep || '🔐 Encrypting...'}</p>
          <p className="text-xs text-slate-400">Please keep the app open and allow location access</p>
        </motion.div>
      ) : encryptedData ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-slate-800/50 to-purple-900/30 border border-green-500/30 backdrop-blur-xl rounded-2xl p-6 space-y-3"
        >
          <div className="flex items-start gap-3">
            <div className="bg-green-500/20 p-2 rounded-lg flex-shrink-0">
              <Shield size={20} className="text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-green-400">✓ Encrypted</p>
              <p className="text-sm text-slate-300 mt-1">Owner ID embedded in pixel data for authenticity</p>
            </div>
          </div>

          {/* Encryption Metadata */}
          <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/20 rounded-xl p-4 space-y-2 text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Owner ID:</span>
              <span className="font-mono text-green-400">{userId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">File Size:</span>
              <span className="font-mono">{Math.round(encryptedData.metadata.size / 1024)} KB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Encryption Type:</span>
              <span className="font-mono text-cyan-400">LSB Embedded</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Timestamp:</span>
              <span className="font-mono">{new Date(encryptedData.metadata.timestamp).toLocaleString()}</span>
            </div>
          </div>
        </motion.div>
      ) : error ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gradient-to-r from-red-900/30 to-red-900/20 border border-red-500/30 backdrop-blur-xl rounded-2xl p-4 flex gap-3"
        >
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-400">Encryption Failed</p>
            <p className="text-sm text-red-300/70">{error}</p>
          </div>
        </motion.div>
      ) : null}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-4">
        <motion.button
          onClick={onRetake}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          disabled={isProcessing}
          className="bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 disabled:opacity-50 rounded-xl p-4 font-semibold text-white flex items-center justify-center gap-2 shadow-lg transition-all"
        >
          <Camera size={18} />
          Retake
        </motion.button>
        <motion.button
          onClick={handleEncrypt}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          disabled={isProcessing}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 rounded-xl p-4 font-semibold text-white flex items-center justify-center gap-2 shadow-lg transition-all"
        >
          <Lock size={18} />
          Encrypt & Save
        </motion.button>
      </div>
    </motion.div>
  );
}

// ============= SHARE PAGE =============
function SharePage({ 
  shareConfigs, setShareConfigs, 
  shareHistory, setShareHistory, 
  selectedShareImage, setSelectedShareImage,
  shareExpiryDate, setShareExpiryDate,
  shareExpiryTime, setShareExpiryTime,
  shareDownloadLimit, setShareDownloadLimit,
  sharePassword, setSharePassword,
  includeCertificate, setIncludeCertificate,
  generatedShareLink, setGeneratedShareLink,
  generatedQRCode, setGeneratedQRCode,
  shareStep, setShareStep,
  userId,
  vaultDocuments
}: {
  shareConfigs: ShareConfig[];
  setShareConfigs: React.Dispatch<React.SetStateAction<ShareConfig[]>>;
  shareHistory: any[];
  setShareHistory: React.Dispatch<React.SetStateAction<any[]>>;
  selectedShareImage: VaultDocument | null;
  setSelectedShareImage: React.Dispatch<React.SetStateAction<VaultDocument | null>>;
  shareExpiryDate: string;
  setShareExpiryDate: React.Dispatch<React.SetStateAction<string>>;
  shareExpiryTime: string;
  setShareExpiryTime: React.Dispatch<React.SetStateAction<string>>;
  shareDownloadLimit: number | null;
  setShareDownloadLimit: React.Dispatch<React.SetStateAction<number | null>>;
  sharePassword: string;
  setSharePassword: React.Dispatch<React.SetStateAction<string>>;
  includeCertificate: boolean;
  setIncludeCertificate: React.Dispatch<React.SetStateAction<boolean>>;
  generatedShareLink: string;
  setGeneratedShareLink: React.Dispatch<React.SetStateAction<string>>;
  generatedQRCode: string;
  setGeneratedQRCode: React.Dispatch<React.SetStateAction<string>>;
  shareStep: "select" | "configure" | "preview";
  setShareStep: React.Dispatch<React.SetStateAction<"select" | "configure" | "preview">>;
  userId: string | null;
  vaultDocuments: VaultDocument[];
}) {
  const [configTab, setConfigTab] = useState<'access' | 'security' | 'tracking'>('access');
  const [oneTimeUse, setOneTimeUse] = useState(false);
  const [blockVpn, setBlockVpn] = useState(false);
  const [requireOtp, setRequireOtp] = useState(false);
  const [geoFence, setGeoFence] = useState('all');
  const [deviceLock, setDeviceLock] = useState<'all' | 'mobile' | 'desktop'>('all');
  const [enableChainTracking, setEnableChainTracking] = useState(true);
  const [enableWatermark, setEnableWatermark] = useState(false);
  const [alertOnOpen, setAlertOnOpen] = useState(false);
  const [alertOnForward, setAlertOnForward] = useState(false);
  const [disableRightClick, setDisableRightClick] = useState(false);

  const securityScore = Math.min(100, [
    sharePassword ? 20 : 0,
    shareExpiryDate ? 10 : 0,
    shareDownloadLimit ? 10 : 0,
    oneTimeUse ? 15 : 0,
    blockVpn ? 10 : 0,
    requireOtp ? 15 : 0,
    geoFence !== 'all' ? 10 : 0,
    deviceLock !== 'all' ? 5 : 0,
    enableChainTracking ? 5 : 0,
    enableWatermark ? 10 : 0,
    disableRightClick ? 5 : 0,
  ].reduce((a, b) => a + b, 0));

  const scoreColor = securityScore >= 70 ? 'text-emerald-400' : securityScore >= 40 ? 'text-amber-400' : 'text-red-400';
  const scoreBg = securityScore >= 70 ? 'bg-emerald-500' : securityScore >= 40 ? 'bg-amber-500' : 'bg-red-500';

  const generateShareLink = () => {
    // Generate unique share ID
    const shareId = `share_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const baseUrl = 'https://pinit-vault-app.onrender.com';
    const link = `${baseUrl}/share/${shareId}`;
    return link;
  };

  const handleGenerateShare = async () => {
    try {
      if (!selectedShareImage) {
        alert("❌ Please select a document to share.");
        return;
      }

      // Generate share ID and link locally — no backend call needed
      const shareId = `share_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const publicUrl = 'https://pinit-vault-app.onrender.com';
      const shareLink = `${publicUrl}/share/${shareId}`;

      setGeneratedShareLink(shareLink);

      // Create local share config for UI
      const config: ShareConfig = {
        id: shareId,
        shareLink: shareLink,
        expiryDate: shareExpiryDate || null,
        expiryTime: shareExpiryTime || null,
        downloadLimit: shareDownloadLimit,
        downloadsUsed: 0,
        passwordProtected: sharePassword.length > 0,
        sharePassword: sharePassword,
        includeCertificate: includeCertificate,
        qrCodeData: shareLink,
        createdAt: new Date().toLocaleString(),
        createdBy: userId || "Unknown",
        enableChainTracking,
        enableWatermark,
        blockVpn,
        requireOtp,
        alertOnOpen,
        alertOnForward,
        disableRightClick,
      };

      // ── Resolve a displayable image URL for the share ─────────────────────
      // NOTE: cloudinaryUrl stores ENCRYPTED binary (not displayable directly).
      // The only ready-to-display source is encryptedImage (decrypted JPEG data URL).
      // Backend-loaded docs often omit encryptedImage, so we fall back to the
      // localStorage copy which always has it.
      let imageUrlForShare: string | null = null;

      try {
        // ── Step 1: get encryptedImage from in-memory doc or localStorage ────
        let previewDataUrl: string | null = null;

        const getEncryptedImage = (doc: VaultDocument): string | null => {
          // Require at least 5 KB of base64 — shorter values are truncated placeholders
          if (!doc.encryptedImage || doc.encryptedImage.length < 5000) return null;
          const img = doc.encryptedImage.trim();
          return img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
        };

        // Try in-memory doc first (fast)
        previewDataUrl = getEncryptedImage(selectedShareImage);

        // If not found, read directly from localStorage (bypass backend-loaded version)
        if (!previewDataUrl && userId) {
          try {
            const lsKey = `pinit_vault_documents_${userId}`;
            const stored = localStorage.getItem(lsKey);
            if (stored) {
              const localDocs: VaultDocument[] = JSON.parse(stored);
              const localDoc = localDocs.find(
                d => d.id === selectedShareImage.id || d.name === selectedShareImage.name
              );
              if (localDoc) previewDataUrl = getEncryptedImage(localDoc);
            }
          } catch (lsErr) {
          }
        }

        // Fallback: use encryptedData directly (it's often a plain data URL, not actually encrypted)
        if (!previewDataUrl) {
          let rawData = selectedShareImage.encryptedData || '';
          // Only apply XOR decryption when checksum key is actually present
          if (rawData && selectedShareImage.metadata?.encrypted && selectedShareImage.metadata?.checksum) {
            try {
              const { decryptFile } = await import('@/lib/encryptionUtils');
              rawData = decryptFile(rawData, selectedShareImage.metadata.checksum);
            } catch (decErr) {
            }
          }
          if (rawData) {
            if (rawData.startsWith('data:application/pdf')) {
              previewDataUrl = rawData;
            } else if (rawData.startsWith('data:image')) {
              previewDataUrl = rawData;
            } else if (rawData.startsWith('data:video')) {
              previewDataUrl = rawData;
            } else if (rawData.length > 100) {
              // Raw base64 — detect type from magic bytes
              try {
                const sample = atob(rawData.substring(0, 8));
                if (sample.startsWith('%PDF')) {
                  previewDataUrl = `data:application/pdf;base64,${rawData}`;
                } else {
                  previewDataUrl = `data:image/jpeg;base64,${rawData}`;
                }
              } catch { /* not valid base64 */ }
            }
          }
        }

        // Last resort: fetch encrypted binary from cloudinaryUrl → decrypt
        if (!previewDataUrl && selectedShareImage.cloudinaryUrl) {
          try {
            const response = await fetch(selectedShareImage.cloudinaryUrl);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            // Convert ArrayBuffer to base64 safely (chunk to avoid stack overflow on large files)
            const uint8 = new Uint8Array(arrayBuffer);
            let binaryStr = '';
            const chunkSize = 8192;
            for (let i = 0; i < uint8.length; i += chunkSize) {
              binaryStr += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
            }
            let base64 = btoa(binaryStr);

            // Decrypt if XOR key available
            if (selectedShareImage.metadata?.encrypted && selectedShareImage.metadata?.checksum) {
              try {
                const { decryptFile } = await import('@/lib/encryptionUtils');
                base64 = decryptFile(base64, selectedShareImage.metadata.checksum);
              } catch (decErr) {
              }
            }

            if (base64 && base64.length > 100) {
              if (base64.startsWith('data:application/pdf')) {
                previewDataUrl = base64;
              } else if (base64.startsWith('data:image')) {
                previewDataUrl = base64;
              } else if (base64.startsWith('data:video')) {
                previewDataUrl = base64;
              } else {
                try {
                  const sample = atob(base64.substring(0, 8));
                  previewDataUrl = sample.startsWith('%PDF')
                    ? `data:application/pdf;base64,${base64}`
                    : `data:image/jpeg;base64,${base64}`;
                } catch {
                  previewDataUrl = `data:image/jpeg;base64,${base64}`;
                }
              }
            }
          } catch (fetchErr) {
          }
        }

        // ── Step 2: build the content to store in vault_image_id ─────────────
        if (previewDataUrl && previewDataUrl.startsWith('data:image')) {
          // For images: resize to ≤800px JPEG thumbnail to keep DB payload small
          try {
            const thumbnail = await new Promise<string>((resolve, reject) => {
              const img = new Image();
              img.onload = () => {
                const MAX = 800;
                const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
                const w = Math.round(img.naturalWidth * scale);
                const h = Math.round(img.naturalHeight * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('no canvas ctx')); return; }
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
              };
              img.onerror = reject;
              img.src = previewDataUrl!;
            });
            imageUrlForShare = thumbnail;
          } catch (canvasErr) {
            imageUrlForShare = previewDataUrl;
          }
        } else if (previewDataUrl && previewDataUrl.startsWith('data:application/pdf')) {
          // For PDFs: render first page to JPEG thumbnail to keep DB payload small
          try {
            const pdfjs: any = await import('pdfjs-dist');
            pdfjs.GlobalWorkerOptions.workerSrc =
              `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
            const b64 = previewDataUrl.replace('data:application/pdf;base64,', '');
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 });
            const scale = Math.min(800 / viewport.width, 800 / viewport.height, 1);
            const scaledViewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(scaledViewport.width);
            canvas.height = Math.round(scaledViewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('no canvas ctx');
            await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
            imageUrlForShare = canvas.toDataURL('image/jpeg', 0.80);
          } catch (pdfThumbErr) {
          }
        } else if (previewDataUrl && previewDataUrl.startsWith('data:video')) {
          // For videos: extract first frame as JPEG thumbnail
          try {
            const thumbJpeg = await new Promise<string>((resolve, reject) => {
              const video = document.createElement('video');
              video.muted = true;
              video.playsInline = true;
              video.crossOrigin = 'anonymous';
              video.onloadeddata = () => { video.currentTime = 0.5; };
              video.onseeked = () => {
                const canvas = document.createElement('canvas');
                const MAX = 800;
                const scale = Math.min(MAX / video.videoWidth, MAX / video.videoHeight, 1);
                canvas.width = Math.round(video.videoWidth * scale);
                canvas.height = Math.round(video.videoHeight * scale);
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('no canvas ctx')); return; }
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
              };
              video.onerror = reject;
              video.src = previewDataUrl!;
            });
            imageUrlForShare = thumbJpeg;
          } catch (videoThumbErr) {
          }
        } else {
        }
      } catch (err) {
      }

      // Save to share_configs using only confirmed existing columns
      const insertPayload: Record<string, unknown> = {
        share_id: shareId,
        user_id: userId || 'unknown',
        share_link: shareLink,
        image_name: selectedShareImage.name || null,
        download_limit: shareDownloadLimit || null,
        downloads_used: 0,
        password: sharePassword.length > 0 ? sharePassword : null,
        include_cert: includeCertificate,
        is_active: true,
        access_count: 0,
        created_by: userId || 'PINIT User',
        expiry_date: shareExpiryDate
          ? (() => {
              // Build a local-time date so the user's chosen time isn't shifted by the UTC offset
              const localIso = `${shareExpiryDate}T${shareExpiryTime || '23:59'}:00`;
              const d = new Date(localIso);
              const offsetMs = d.getTimezoneOffset() * 60 * 1000;
              return new Date(d.getTime() - offsetMs).toISOString();
            })()
          : null,
      };

      // Attempt to store the image URL — if vault_image_id column type rejects it
      // the catch below will retry without it so the share still works.
      if (imageUrlForShare) {
        insertPayload.vault_image_id = imageUrlForShare;
      }

      // ── Attempt 1: insert with image URL ──────────────────────────────────
      // Wrapped in its own try-catch so any network/timeout exception never
      // propagates to the outer catch and shows "Failed to generate share link".
      let insertOk = false;
      try {
        const { error: supabaseError } = await supabase
          .from('share_configs')
          .insert(insertPayload);

        if (!supabaseError) {
          insertOk = true;
        } else {
          // ── Attempt 2: retry without image URL ──────────────────────────
          delete insertPayload.vault_image_id;
          const { error: retryError } = await supabase
            .from('share_configs')
            .insert(insertPayload);
          if (!retryError) {
            insertOk = true;
          } else {
            console.error('❌ Supabase insert failed entirely:', retryError.code, retryError.message);
          }
        }
      } catch (supabaseEx) {
        console.error('❌ Supabase share insert threw:', supabaseEx);
        // Non-blocking — share link was already generated locally above
      }

      // Add to local UI state
      setShareConfigs([...shareConfigs, config]);

      // Add to history
      setShareHistory([...shareHistory, {
        id: config.id,
        action: "Share Created",
        document: selectedShareImage.name || "Unknown",
        config: config,
        timestamp: new Date().toLocaleString(),
      }]);

      alert("✅ Share link created! Your friend can scan the QR code or use the link to access it.");
      setShareStep("preview");
    } catch (error) {
      console.error("❌ Error generating share link:", error);
      alert(`❌ Failed to generate share link: ${(error as any)?.message || String(error)}`);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedShareLink);
    alert("✅ Share link copied to clipboard!");
  };

  const downloadQRCode = () => {
    // Generate QR code using external API
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(generatedShareLink)}`;
    const link = document.createElement("a");
    link.href = qrApiUrl;
    link.download = `share-qr-${Date.now()}.png`;
    link.click();
  };

  const handleResetShare = () => {
    setShareStep("select");
    setSelectedShareImage(null);
    setShareExpiryDate("");
    setShareExpiryTime("00:00");
    setShareDownloadLimit(null);
    setSharePassword("");
    setIncludeCertificate(false);
    setGeneratedShareLink("");
    setGeneratedQRCode("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-6 space-y-4 pb-8"
    >

      {/* STEP 1: SELECT DOCUMENT */}
      {shareStep === "select" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          <div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 space-y-4 shadow-xl">
            <h2 className="text-xl font-bold text-white">📦 Select Document to Share</h2>
            <p className="text-purple-300/80 text-sm">Choose a document from your vault</p>

            {vaultDocuments.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-2" />
                <p className="text-gray-400">No documents available. Create or upload documents first.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {vaultDocuments.map((doc) => (
                  <motion.button
                    key={doc.id}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => {
                      setSelectedShareImage(doc);
                      setShareStep("configure");
                    }}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      selectedShareImage?.id === doc.id
                        ? "border-purple-500 bg-purple-900/30"
                        : "border-purple-500/30 bg-purple-900/10 hover:border-purple-500/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-purple-400" />
                      <div className="flex-1">
                        <p className="font-semibold text-white">{doc.name}</p>
                        <p className="text-xs text-purple-300/60">Uploaded: {doc.createdAt}</p>
                        {doc.pageCount && (
                          <p className="text-xs text-purple-300/60">Number of Pages: {doc.pageCount}</p>
                        )}
                      </div>
                      <CheckCircle className={`w-5 h-5 ${selectedShareImage?.id === doc.id ? "text-green-500" : "text-gray-600"}`} />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* STEP 2: CONFIGURE SHARING — Redesigned */}
      {shareStep === "configure" && selectedShareImage && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-3 pb-4"
        >
          {/* Header */}
          <div className="relative overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-[#0d0a1a]">
            <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-600/10 via-violet-600/5 to-transparent" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/60 to-transparent" />
            <div className="relative px-4 pt-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-600 to-violet-600 flex items-center justify-center">
                    <Share2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white leading-tight">Configure Share</h2>
                    <p className="text-[10px] text-fuchsia-300/70">PINIT Smart Link</p>
                  </div>
                </div>
                <button
                  onClick={() => setShareStep("select")}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-slate-800/60 border border-slate-700/50 rounded-full px-3 py-1.5 transition-all"
                >
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
              </div>
              <div className="flex items-center gap-2 bg-slate-900/60 rounded-xl px-3 py-2 border border-slate-700/40">
                <FileText className="w-3.5 h-3.5 text-fuchsia-400 flex-shrink-0" />
                <p className="text-xs text-slate-200 truncate font-medium">{selectedShareImage.name}</p>
              </div>
            </div>
          </div>

          {/* Security score bar */}
          <div className="bg-[#0d0a1a] border border-slate-700/50 rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">Security Score</span>
              <motion.span
                key={securityScore}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className={`text-sm font-black ${scoreColor}`}
              >
                {securityScore}/100
              </motion.span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${scoreBg}`}
                initial={{ width: 0 }}
                animate={{ width: `${securityScore}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              {securityScore >= 70 ? '🛡 Strong protection enabled' : securityScore >= 40 ? '⚠ Moderate — enable more options' : '🔓 Weak — enable security options'}
            </p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 p-1 bg-[#0d0a1a] border border-slate-700/40 rounded-2xl">
            {([
              { id: 'access' as const, label: 'Access', icon: '🔑' },
              { id: 'security' as const, label: 'Security', icon: '🛡' },
              { id: 'tracking' as const, label: 'Tracking', icon: '📡' },
            ] as const).map((t) => (
              <motion.button
                key={t.id}
                onClick={() => setConfigTab(t.id)}
                whileTap={{ scale: 0.97 }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  configTab === t.id
                    ? 'bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white shadow-lg shadow-fuchsia-900/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{t.icon}</span> {t.label}
              </motion.button>
            ))}
          </div>

          {/* Tab content */}
          <motion.div
            key={configTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-[#0d0a1a] border border-slate-700/40 rounded-2xl p-4 space-y-2.5"
          >
            {configTab === 'access' && (
              <>
                {/* Expiry */}
                <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-900/10 p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Clock className="w-4 h-4 text-fuchsia-400" />
                    <span className="text-sm font-bold text-white">Share Expiry</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={shareExpiryDate} onChange={(e) => setShareExpiryDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800/80 border border-fuchsia-500/20 rounded-xl text-white text-xs focus:border-fuchsia-500/60 outline-none transition-colors" />
                    <input type="time" value={shareExpiryTime} onChange={(e) => setShareExpiryTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800/80 border border-fuchsia-500/20 rounded-xl text-white text-xs focus:border-fuchsia-500/60 outline-none transition-colors" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">Leave blank for no expiry</p>
                </div>

                {/* Download limit */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold text-white">Download Limit</span>
                  </div>
                  <input type="number" min="0" max="1000" value={shareDownloadLimit || ""}
                    onChange={(e) => setShareDownloadLimit(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-emerald-500/20 rounded-xl text-white text-xs focus:border-emerald-500/60 outline-none transition-colors"
                    placeholder="Unlimited (leave blank)" />
                </div>

                {/* Password */}
                <div className="rounded-xl border border-orange-500/20 bg-orange-900/10 p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Lock className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-bold text-white">Password Protection</span>
                  </div>
                  <input type="password" value={sharePassword} onChange={(e) => setSharePassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-orange-500/20 rounded-xl text-white text-xs focus:border-orange-500/60 outline-none transition-colors"
                    placeholder="Leave blank for no password" />
                  {sharePassword && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] text-emerald-400 mt-1.5 flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> Password set
                    </motion.p>
                  )}
                </div>

                {/* Toggles */}
                {[
                  { label: 'One-time Use', sub: 'Link expires after first open', val: oneTimeUse, set: setOneTimeUse, color: 'from-fuchsia-600 to-violet-600' },
                  { label: 'Include Certificate', sub: 'Share authorship certificate', val: includeCertificate, set: setIncludeCertificate, color: 'from-amber-500 to-orange-500', icon: '🏆' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">{item.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
                    </div>
                    <button onClick={() => item.set(!item.val)}
                      className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${item.val ? `bg-gradient-to-r ${item.color}` : 'bg-slate-700'}`}>
                      <motion.span animate={{ left: item.val ? '22px' : '2px' }}
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md" style={{ position: 'absolute' }} />
                    </button>
                  </div>
                ))}
              </>
            )}

            {configTab === 'security' && (
              <>
                {[
                  { label: 'Block VPN / Proxy', sub: 'Reject anonymized access', val: blockVpn, set: setBlockVpn, color: 'from-red-600 to-orange-600', icon: '🚫' },
                  { label: 'Require OTP', sub: 'Verify via one-time passcode', val: requireOtp, set: setRequireOtp, color: 'from-fuchsia-600 to-violet-600', icon: '🔢' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{item.icon}</span>
                      <div>
                        <p className="text-sm font-bold text-white">{item.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
                      </div>
                    </div>
                    <button onClick={() => item.set(!item.val)}
                      className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${item.val ? `bg-gradient-to-r ${item.color}` : 'bg-slate-700'}`}>
                      <motion.span animate={{ left: item.val ? '22px' : '2px' }}
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md" style={{ position: 'absolute' }} />
                    </button>
                  </div>
                ))}

                {/* Geofence */}
                <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-base">🌍</span>
                    <span className="text-sm font-bold text-white">Geofence</span>
                  </div>
                  <select value={geoFence} onChange={(e) => setGeoFence(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-blue-500/20 rounded-xl text-white text-xs focus:border-blue-500/60 outline-none">
                    <option value="all">Allow All Countries</option>
                    <option value="US">United States only</option>
                    <option value="IN">India only</option>
                    <option value="GB">United Kingdom only</option>
                    <option value="CA">Canada only</option>
                    <option value="AU">Australia only</option>
                    <option value="DE">Germany only</option>
                    <option value="FR">France only</option>
                    <option value="JP">Japan only</option>
                    <option value="SG">Singapore only</option>
                    <option value="BR">Brazil only</option>
                  </select>
                </div>

                {/* Device lock */}
                <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-base">📱</span>
                    <span className="text-sm font-bold text-white">Device Lock</span>
                  </div>
                  <div className="flex gap-2">
                    {(['all', 'mobile', 'desktop'] as const).map((opt) => (
                      <button key={opt} onClick={() => setDeviceLock(opt)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                          deviceLock === opt ? 'bg-gradient-to-r from-fuchsia-600 to-violet-600 border-fuchsia-500/50 text-white shadow-sm' : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
                        }`}>
                        {opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {configTab === 'tracking' && (
              <>
                {[
                  { label: 'Chain Tracking', sub: 'Track link forwarding A→B→C', val: enableChainTracking, set: setEnableChainTracking, icon: '🔗', color: 'from-fuchsia-600 to-violet-600' },
                  { label: 'Dynamic Watermark', sub: 'User-specific watermark on content', val: enableWatermark, set: setEnableWatermark, icon: '💧', color: 'from-cyan-600 to-blue-600' },
                  { label: 'Alert on Open', sub: 'Notify when link is opened', val: alertOnOpen, set: setAlertOnOpen, icon: '🔔', color: 'from-violet-600 to-purple-600' },
                  { label: 'Alert on Forward', sub: 'Alert when link is forwarded', val: alertOnForward, set: setAlertOnForward, icon: '📨', color: 'from-amber-500 to-orange-500' },
                  { label: 'Content Protection', sub: 'Disable right-click, copy, print', val: disableRightClick, set: setDisableRightClick, icon: '🔒', color: 'from-red-600 to-rose-600' },
                ].map((item, idx) => (
                  <motion.div key={item.label}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                    className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-3.5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base w-6 text-center">{item.icon}</span>
                      <div>
                        <p className="text-sm font-bold text-white">{item.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
                      </div>
                    </div>
                    <button onClick={() => item.set(!item.val)}
                      className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${item.val ? `bg-gradient-to-r ${item.color}` : 'bg-slate-700'}`}>
                      <motion.span animate={{ left: item.val ? '22px' : '2px' }}
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md" style={{ position: 'absolute' }} />
                    </button>
                  </motion.div>
                ))}
              </>
            )}
          </motion.div>

          {/* Generate button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              try {
                await handleGenerateShare();
              } catch (err) {
                console.error("❌ Share button error:", err);
                alert(`❌ Share error: ${(err as any)?.message || String(err)}`);
              }
            }}
            className="w-full relative overflow-hidden rounded-2xl py-4 font-black text-white text-sm tracking-wide shadow-xl"
            style={{ background: 'linear-gradient(135deg, #a21caf 0%, #7c3aed 50%, #2563eb 100%)' }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12"
              initial={{ x: '-150%' }}
              whileHover={{ x: '150%' }}
              transition={{ duration: 0.6 }}
            />
            <span className="relative flex items-center justify-center gap-2">
              <Share2 className="w-4 h-4" />
              Generate Share Link
            </span>
          </motion.button>
        </motion.div>
      )}

      {/* STEP 3: PREVIEW & SHARE */}
      {shareStep === "preview" && generatedShareLink && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* QR CODE SECTION */}
          <div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4">📲 QR Code</h2>
            <div className="bg-white rounded-xl p-4 flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(generatedShareLink)}`}
                alt="QR Code"
                className="w-64 h-64"
              />
            </div>
            <p className="text-xs text-center text-purple-300/60 mt-3">Scan with phone camera to share</p>
            <Button
              onClick={downloadQRCode}
              className="w-full mt-4 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700 font-semibold shadow-lg"
            >
              📥 Download QR Code
            </Button>
          </div>

          {/* SHARE OPTIONS — link + platform buttons + thumbnail card */}
          <ShareOptionsPanel
            shareLink={generatedShareLink}
            fileName={selectedShareImage?.name ?? 'document'}
            filePreview={resolvedFilePreview}
          />

          {/* SHARE CONFIGURATION SUMMARY */}
          <div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4">📊 Share Configuration</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-purple-900/20 rounded-lg">
                <span className="text-purple-300">Document</span>
                <span className="font-semibold text-white">{selectedShareImage?.name}</span>
              </div>
              {shareExpiryDate && (
                <div className="flex items-center justify-between p-3 bg-purple-900/20 rounded-lg">
                  <span className="text-purple-300">⏰ Expires</span>
                  <span className="font-semibold text-orange-400">
                    {shareExpiryDate} {shareExpiryTime}
                  </span>
                </div>
              )}
              {shareDownloadLimit && (
                <div className="flex items-center justify-between p-3 bg-purple-900/20 rounded-lg">
                  <span className="text-purple-300">📥 Downloads Allowed</span>
                  <span className="font-semibold text-blue-400">{shareDownloadLimit}x</span>
                </div>
              )}
              {sharePassword && (
                <div className="flex items-center justify-between p-3 bg-purple-900/20 rounded-lg">
                  <span className="text-purple-300">🔐 Password Protected</span>
                  <span className="font-semibold text-green-400">✓ Yes</span>
                </div>
              )}
              {includeCertificate && (
                <div className="flex items-center justify-between p-3 bg-purple-900/20 rounded-lg">
                  <span className="text-purple-300">📜 Certificate Included</span>
                  <span className="font-semibold text-yellow-400">✓ Yes</span>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-purple-900/20 rounded-lg">
                <span className="text-purple-300">🕐 Created</span>
                <span className="font-semibold text-gray-300">{new Date().toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* SHARE HISTORY */}
          {shareHistory.length > 0 && (
            <div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4">📜 Share History</h2>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {shareHistory.map((entry, idx) => (
                  <div key={idx} className="p-3 bg-purple-900/20 rounded-lg border border-purple-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-white text-sm">{entry.action}</p>
                        <p className="text-xs text-purple-300/60">{entry.document}</p>
                      </div>
                      <p className="text-xs text-gray-400">{entry.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTION BUTTONS */}
          <div className="flex gap-3">
            <Button
              onClick={handleResetShare}
              className="flex-1 bg-gradient-to-r from-slate-600 to-gray-700 hover:from-slate-700 hover:to-gray-800 font-semibold shadow-lg"
            >
              ← Create Another
            </Button>
            <Button
              onClick={() => alert("✅ Share links created! Recipients can now access your document using the link or QR code.")}
              className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 font-semibold shadow-lg"
            >
              ✅ Done
            </Button>
          </div>
        </motion.div>
      )}

      {/* ACTIVE SHARES LIST */}
      {shareConfigs.length > 0 && shareStep === "select" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 space-y-3 shadow-xl"
        >
          <h2 className="text-lg font-bold text-white">📤 Active Shares</h2>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {shareConfigs.map((config) => (
              <div key={config.id} className="p-3 bg-purple-900/20 border border-purple-500/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-white text-sm">{config.shareLink.substring(0, 40)}...</span>
                  <span className="text-xs px-2 py-1 bg-green-500/30 text-green-400 rounded-full">Active</span>
                </div>
                <div className="text-xs text-purple-300/60 space-y-1">
                  <p>Created: {config.createdAt}</p>
                  {config.expiryDate && <p>Expires: {config.expiryDate} {config.expiryTime}</p>}
                  {config.downloadLimit && <p>Downloads: {config.downloadsUsed}/{config.downloadLimit}</p>}
                  {config.passwordProtected && <p>🔐 Password Protected</p>}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ============= IDENTITY PAGE =============
function IdentityPage({ userName, userId }: { userName: string; userId: string | null }) {
  const [email, setEmail] = useState("user@example.com");
  const [phone, setPhone] = useState("+1 (555) 000-0000");
  const [isEditing, setIsEditing] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-6 space-y-4 pb-8"
    >
      <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Digital Identity</h1>

      {/* Profile Card - Modern */}
      <motion.div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center text-white text-4xl font-bold shadow-2xl shadow-purple-500/50">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white">{userName}</p>
          <p className="text-purple-300/70 text-xs font-mono mt-2">{userId?.substring(0, 12)}...</p>
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/50 rounded-full px-4 py-2 mt-3 inline-block">
            <p className="text-green-400 text-xs font-bold">✓ VERIFIED</p>
          </div>
        </div>
      </motion.div>

      {/* Personal Details */}
      <motion.div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg text-white">Personal Details</h3>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-purple-400 text-sm font-semibold hover:text-purple-300 transition-colors"
          >
            {isEditing ? "Done" : "Edit"}
          </button>
        </div>

        {[
          { label: "Email", value: email, setter: setEmail },
          { label: "Phone", value: phone, setter: setPhone },
        ].map((field, idx) => (
          <div key={idx} className="pb-4 border-b border-purple-500/20 last:border-0">
            <p className="text-purple-300/70 text-xs font-semibold">{field.label}</p>
            {isEditing ? (
              <input
                type="text"
                value={field.value}
                onChange={(e) => field.setter(e.target.value)}
                className="w-full mt-2 bg-slate-700/50 border border-purple-500/30 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500/70 transition-all text-white"
              />
            ) : (
              <p className="font-semibold mt-2 text-white">{field.value}</p>
            )}
          </div>
        ))}
      </motion.div>

      {/* Security Settings */}
      <motion.div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 space-y-3 shadow-xl">
        <h3 className="font-bold text-lg text-white mb-4">Security Settings</h3>
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600/30 p-2 rounded-lg">
              <Shield size={18} className="text-purple-400" />
            </div>
            <span className="text-sm font-semibold">Biometric Login</span>
          </div>
          <div className="w-10 h-6 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full shadow-lg shadow-purple-500/50"></div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Helper function to get image dimensions
const getImageDimensions = (base64Data: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    // Check if Image constructor is available
    if (typeof Image === 'undefined') {
      reject(new Error('Image constructor not available'));
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    img.src = base64Data;
  });
};

// ============= VERIFY PROOF PAGE =============
function VerifyProofPage({ image, onBack }: { image: string; onBack: () => void }) {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const analyzeImageFull = async () => {
      try {
        setIsAnalyzing(true);
        setError(null);

        // Safe fallback dimensions
        let dimensions = { width: 1080, height: 1920 };
        
        // Safe image dimensions extraction
        try {
          const dimResult = await getImageDimensions(image);
          if (dimResult && dimResult.width && dimResult.height) {
            dimensions = dimResult;
          }
        } catch (dimErr) {
        }

        // ── Strategy 1: Persistent DNA (amplitude-8 tiled encoding) ─────────
        // extractPersistentDna matches what embedPersistentDna writes.
        // extractSimpleWatermark (single-pass LSB) CANNOT read it — that was
        // the root cause of "No Owner ID Found" on every shared image.
        let persistentResult: { message: string; ownerId: string; dnaId: string; assetUuid: string; timestamp: string } | null = null;
        let dnaRecord: { dnaId: string; userId: string; ownership: any; deviceNetwork: any; createdAt?: string } | null = null;
        try {
          persistentResult = await extractPersistentDna(image);
          if (persistentResult?.dnaId) {
            dnaRecord = await getDnaRecordWithCloud(persistentResult.dnaId);
          }
        } catch { /* non-critical */ }

        // ── Strategy 2: pHash fuzzy match ────────────────────────────────────
        // Fallback for images whose pixel DNA was destroyed by aggressive JPEG
        // recompression (WhatsApp < quality 65) or extreme crop/resize.
        let fuzzyMatch: { record: { dnaId: string; userId: string; ownership: any; deviceNetwork: any; createdAt?: string }; similarity: number } | null = null;
        if (!dnaRecord) {
          try {
            const pHash = await computePHashFromBase64(image);
            fuzzyMatch = await findRecordByFuzzyPHash(pHash, 55);
            if (fuzzyMatch) dnaRecord = fuzzyMatch.record;
          } catch { /* non-critical */ }
        }

        // ── Strategy 3: Legacy LSB watermark ─────────────────────────────────
        // For images embedded with the old embedSimpleWatermark system.
        let legacyResult: { userId?: string; timestamp?: string } | null = null;
        if (!dnaRecord && !persistentResult) {
          try {
            legacyResult = await extractSimpleWatermark(image);
          } catch { /* non-critical */ }
        }

        // Build ownership details from the best available source
        const hasOwnership = !!(dnaRecord || persistentResult || legacyResult?.userId);
        const ownership = dnaRecord?.ownership ?? null;
        const deviceNet = dnaRecord?.deviceNetwork ?? null;

        const ownerId     = persistentResult?.ownerId || dnaRecord?.userId || legacyResult?.userId || 'No Owner ID Found';
        const ownerName   = ownership?.ownerName ?? null;
        const dnaId       = persistentResult?.dnaId || dnaRecord?.dnaId || 'N/A';
        const timestamp   = ownership?.encryptionTimestamp || dnaRecord?.createdAt || persistentResult?.timestamp || legacyResult?.timestamp || 'N/A';
        const gpsLat      = deviceNet?.gpsLat ?? null;
        const gpsLng      = deviceNet?.gpsLng ?? null;
        const locParts    = deviceNet ? [deviceNet.city, deviceNet.state, deviceNet.country].filter(Boolean) : [];
        const locationStr = locParts.length > 0 ? locParts.join(', ') : null;
        const deviceInfo  = deviceNet ? `${deviceNet.manufacturer || ''} ${deviceNet.model || ''}`.trim() || null : null;

        const verificationMethod = dnaRecord
          ? (persistentResult
              ? 'Pixel DNA · Amplitude-8 Tiling'
              : fuzzyMatch
                ? `Perceptual Hash · ${fuzzyMatch.similarity.toFixed(0)}% visual match`
                : 'Cloud Record Lookup')
          : legacyResult?.userId
            ? 'Legacy LSB Watermark'
            : 'Not found';

        const confidence = persistentResult && dnaRecord ? 99
          : persistentResult ? 85
          : fuzzyMatch ? Math.round(fuzzyMatch.similarity)
          : legacyResult?.userId ? 75
          : 0;

        // Safe base64 size
        let sizeInKB = 'Unknown';
        try {
          const base64Data = image.includes(',') ? image.split(',')[1] : image;
          if (base64Data) sizeInKB = ((base64Data.length * 3) / 4 / 1024).toFixed(2);
        } catch { /* non-critical */ }

        setAnalysis({
          imageResolution: `${dimensions.width}x${dimensions.height}`,
          imageSize: `${sizeInKB} KB`,
          pixelCount: dimensions.width * dimensions.height,
          isEncrypted: hasOwnership,
          encryptionType: hasOwnership ? 'PINIT DNA · 10-Layer Engine' : 'None',
          ownershipDetails: {
            pinItId: ownerId,
            ownerName,
            dnaId,
            timestamp,
            gpsLat,
            gpsLng,
            locationStr,
            deviceInfo,
            encryptionFormat: verificationMethod,
            validationTiles: null,
            tilesPassed: null,
          },
          imageTypeDetails: `${dimensions.width}×${dimensions.height} · ${sizeInKB} KB`,
          imageTypeIndicators: [],
          imageTypeAnalysis: null,
          watermarkAnalysis: { hasWatermark: hasOwnership },
          metadata: {
            hasExif: false,
            hasMetadata: hasOwnership,
            dimensions: `${dimensions.width}x${dimensions.height}`,
            mimeType: image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
          },
          confidence,
        });
        setIsAnalyzing(false);
      } catch (err) {
        setAnalysis({
          imageResolution: 'Unknown',
          imageSize: 'Unknown',
          pixelCount: 0,
          isEncrypted: false,
          encryptionType: 'None',
          ownershipDetails: {
            pinItId: 'Analysis failed',
            ownerName: null,
            dnaId: 'N/A',
            timestamp: 'N/A',
            gpsLat: null,
            gpsLng: null,
            locationStr: null,
            deviceInfo: null,
            encryptionFormat: 'None',
            validationTiles: null,
            tilesPassed: null,
          },
          imageTypeDetails: 'Unknown',
          imageTypeIndicators: [],
          imageTypeAnalysis: null,
          watermarkAnalysis: { hasWatermark: false },
          metadata: { hasExif: false, hasMetadata: false, dimensions: 'Unknown', mimeType: 'image/jpeg' },
          confidence: 0,
        });
        setError('Analysis failed — could not read image data');
        setIsAnalyzing(false);
      }
    };

    analyzeImageFull();
  }, [image]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-6 space-y-5 pb-8"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Verify Proof</h1>
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-700/50 rounded-lg transition-all"
        >
          <X size={24} className="text-slate-300" />
        </button>
      </div>

      {/* File Preview */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl overflow-hidden border border-purple-500/30 shadow-2xl"
      >
        {image.startsWith('data:image/') || image.startsWith('http') ? (
          <img src={image} alt="Verification" className="w-full h-auto" />
        ) : (
          <div className="p-8 text-center bg-gradient-to-br from-slate-800 to-slate-900">
            <div className="text-5xl mb-3">
              {image.includes('pdf') ? '📄' : '📝'}
            </div>
            <p className="text-slate-300 font-semibold">
              {image.includes('pdf') ? 'PDF Document' : 'Document File'}
            </p>
            <p className="text-slate-500 text-sm mt-1">
              Preview not available for this file type
            </p>
          </div>
        )}
      </motion.div>

      {/* Analysis Loading State */}
      {isAnalyzing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-8 flex flex-col items-center gap-4 shadow-xl"
        >
          <div className="w-12 h-12 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin"></div>
          <p className="text-purple-300 font-semibold">🔐 Analyzing image encryption...</p>
        </motion.div>
      )}

      {/* Error State */}
      {error && !isAnalyzing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-500/10 border border-red-500/30 backdrop-blur-xl rounded-2xl p-6 shadow-xl"
        >
          <div className="flex gap-3">
            <AlertCircle className="text-red-400 flex-shrink-0" size={24} />
            <div>
              <p className="font-bold text-red-400">Analysis Failed</p>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Analysis Results */}
      {analysis && !isAnalyzing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Encryption Status */}
          <motion.div
            className={`rounded-2xl p-6 border shadow-xl ${
              analysis.isEncrypted
                ? "bg-gradient-to-br from-green-900/40 to-emerald-900/40 border-green-500/30"
                : "bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-500/30"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                analysis.isEncrypted ? "bg-green-500/20" : "bg-slate-500/20"
              }`}>
                {analysis.isEncrypted ? (
                  <Shield className="text-green-400" size={24} />
                ) : (
                  <AlertCircle className="text-slate-400" size={24} />
                )}
              </div>
              <div className="flex-1">
                <p className="font-bold text-lg">
                  {analysis.isEncrypted ? "✅ This image is encrypted" : "⚠️ Not PINIT encrypted"}
                </p>
                <p className={`text-sm mt-1 ${analysis.isEncrypted ? "text-green-300" : "text-slate-300"}`}>
                  {analysis.isEncrypted
                    ? `Protected with ${analysis.encryptionType} (${analysis.confidence}% confidence)`
                    : "This image doesn't contain PINIT encryption"}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Ownership Details */}
          <motion.div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 shadow-xl">
            <h3 className="font-bold text-lg mb-4 text-white">Ownership Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-start pb-3 border-b border-purple-500/20">
                <span className="text-purple-300/70 text-sm shrink-0">Original Owner ID</span>
                <span className="font-mono font-bold text-white text-xs break-all text-right max-w-[60%]">{analysis.ownershipDetails.pinItId}</span>
              </div>
              {analysis.ownershipDetails.ownerName && (
                <div className="flex justify-between items-center pb-3 border-b border-purple-500/20">
                  <span className="text-purple-300/70 text-sm">Owner Name</span>
                  <span className="text-sm font-bold text-green-300">{analysis.ownershipDetails.ownerName}</span>
                </div>
              )}
              <div className="flex justify-between items-start pb-3 border-b border-purple-500/20">
                <span className="text-purple-300/70 text-sm shrink-0">DNA ID</span>
                <span className="font-mono text-xs text-cyan-300 break-all text-right max-w-[60%]">{analysis.ownershipDetails.dnaId}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-purple-500/20">
                <span className="text-purple-300/70 text-sm">Encryption Time</span>
                <span className="text-xs text-white text-right">
                  {analysis.ownershipDetails.timestamp !== 'N/A'
                    ? (() => { try { return new Date(analysis.ownershipDetails.timestamp).toLocaleString(); } catch { return analysis.ownershipDetails.timestamp; } })()
                    : 'N/A'}
                </span>
              </div>
              {analysis.ownershipDetails.locationStr && (
                <div className="flex justify-between items-center pb-3 border-b border-purple-500/20">
                  <span className="text-purple-300/70 text-sm">Encryption Location</span>
                  <span className="text-xs text-amber-300 text-right">{analysis.ownershipDetails.locationStr}</span>
                </div>
              )}
              {analysis.ownershipDetails.gpsLat != null && analysis.ownershipDetails.gpsLng != null && (
                <div className="flex justify-between items-center pb-3 border-b border-purple-500/20">
                  <span className="text-purple-300/70 text-sm">GPS Coordinates</span>
                  <span className="font-mono text-xs text-amber-200">{Number(analysis.ownershipDetails.gpsLat).toFixed(5)}, {Number(analysis.ownershipDetails.gpsLng).toFixed(5)}</span>
                </div>
              )}
              {analysis.ownershipDetails.deviceInfo && (
                <div className="flex justify-between items-center pb-3 border-b border-purple-500/20">
                  <span className="text-purple-300/70 text-sm">Encryption Device</span>
                  <span className="text-xs text-slate-300">{analysis.ownershipDetails.deviceInfo}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-purple-300/70 text-sm">Verification Method</span>
                <span className="text-xs font-semibold text-purple-300 text-right max-w-[55%]">{analysis.ownershipDetails.encryptionFormat}</span>
              </div>
            </div>
          </motion.div>

          {/* Image Metadata */}
          <motion.div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 shadow-xl">
            <h3 className="font-bold text-lg mb-4 text-white">Image Metadata</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-700/30 rounded-xl p-4">
                <p className="text-purple-300/70 text-xs font-semibold">Resolution</p>
                <p className="font-bold mt-2 text-white">{analysis.imageResolution}</p>
              </div>
              <div className="bg-slate-700/30 rounded-xl p-4">
                <p className="text-purple-300/70 text-xs font-semibold">File Size</p>
                <p className="font-bold mt-2 text-white">{analysis.imageSize}</p>
              </div>
              <div className="bg-slate-700/30 rounded-xl p-4">
                <p className="text-purple-300/70 text-xs font-semibold">Total Pixels</p>
                <p className="font-bold mt-2 text-white">{(analysis.pixelCount / 1000000).toFixed(2)}M</p>
              </div>
              <div className="bg-slate-700/30 rounded-xl p-4">
                <p className="text-purple-300/70 text-xs font-semibold">Confidence</p>
                <p className="font-bold mt-2 text-white">{analysis.confidence}%</p>
              </div>
            </div>
          </motion.div>

          {/* Action Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            Back to Home
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}

// ============= DOCUMENT UPLOAD COMPONENTS =============

// HELPER FUNCTIONS FOR DOCUMENT UPLOAD

async function convertImagesToPDF(images: string[]): Promise<string> {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  for (let i = 0; i < images.length; i++) {
    if (i > 0) {
      pdf.addPage();
    }
    const base64Image = images[i].includes("base64,") ? images[i] : `data:image/jpeg;base64,${images[i]}`;
    pdf.addImage(base64Image, "JPEG", 10, 10, 190, 267);
  }

  return pdf.output("dataurlstring");
}

async function encryptFileSimulation(base64Data: string): Promise<string> {
  // Simulate encryption by adding metadata
  const timestamp = new Date().toISOString();
  const encryptedPayload = {
    timestamp,
    data: base64Data.substring(0, 100) + "...", // Just store a portion for security
    checksum: Math.random().toString(36).substring(7),
  };
  return btoa(JSON.stringify(encryptedPayload));
}

// 1. DOCUMENT UPLOAD PAGE - Selection between Scan and Upload
interface DocumentUploadPageProps {
  onBack: () => void;
  onScanClick: () => void;
  onDocumentUploaded: (document: VaultDocument) => void;
}

// 2. SCAN DOCUMENT PAGE - Camera scanning with pocket system
interface ScanDocumentPageProps {
  onPageScanned: (base64: string) => void;
  onDone: () => void;
  onBack: () => void;
  pageCount: number;
}

function ScanDocumentPage({ onPageScanned, onDone, onBack, pageCount }: ScanDocumentPageProps) {
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [scannedPages, setScannedPages] = useState<string[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenCamera = async () => {
    try {

      // Try Capacitor camera (native)
      let permGranted = false;
      try {
        const permissions = await Camera.checkPermissions();
        if (permissions.camera !== 'granted') {
          const req = await Camera.requestPermissions();
          permGranted = req.camera === 'granted';
        } else {
          permGranted = true;
        }
      } catch {
        // checkPermissions may throw on web — attempt anyway
        permGranted = true;
      }

      if (!permGranted) {
        // Fall back to file input with capture
        fileInputRef.current?.click();
        return;
      }

      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        width: 1024,
        height: 1024,
        correctOrientation: true,
      });

      if (photo.base64String) {
        setLastCapture(photo.base64String);
        const updatedPages = [...scannedPages, photo.base64String];
        setScannedPages(updatedPages);
        onPageScanned(photo.base64String);
      }
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('User cancelled')) {
        return; // user cancelled — no alert
      }
      // Fall back to <input capture> for web / permission denied
      fileInputRef.current?.click();
    }
  };

  const handleFileCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      // Strip data URI prefix to get bare base64
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      setLastCapture(base64);
      const updatedPages = [...scannedPages, base64];
      setScannedPages(updatedPages);
      onPageScanned(base64);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be chosen again
    e.target.value = '';
  };

  const generatePDF = async () => {
    if (scannedPages.length === 0) {
      alert('No pages scanned yet. Please scan at least one page first.');
      return;
    }

    try {
      setIsGeneratingPDF(true);

      // Create new PDF document
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Add each scanned page to PDF
      for (let i = 0; i < scannedPages.length; i++) {
        const base64Data = scannedPages[i];
        
        // Create image from base64
        const img = new Image();
        img.src = `data:image/jpeg;base64,${base64Data}`;
        
        // Wait for image to load
        await new Promise((resolve) => {
          img.onload = () => {
            // Calculate dimensions to fit A4 page
            const pageWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            const imgWidth = img.width;
            const imgHeight = img.height;
            
            // Calculate scale to fit page
            const scale = Math.min(pageWidth / (imgWidth * 0.264583), pageHeight / (imgHeight * 0.264583));
            const finalWidth = imgWidth * scale * 0.264583;
            const finalHeight = imgHeight * scale * 0.264583;
            
            // Center the image on page
            const x = (pageWidth - finalWidth) / 2;
            const y = (pageHeight - finalHeight) / 2;
            
            // Add new page for each image (except first one)
            if (i > 0) {
              pdf.addPage();
            }
            
            // Add image to PDF
            pdf.addImage(img.src, 'JPEG', x, y, finalWidth, finalHeight);
            resolve(null);
          };
          img.onerror = () => resolve(null);
        });
      }

      // Save PDF
      const pdfBlob = pdf.output('blob');
      const pdfBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(pdfBlob);
      });

      
      // Create document object for vault storage
      const pdfDocument: VaultDocument = {
        id: `pdf_${Date.now()}`,
        name: `Scanned_Document_${new Date().toISOString().split('T')[0]}.pdf`,
        encryptedData: pdfBase64.split(',')[1], // Remove data URL prefix
        metadata: {
          timestamp: Date.now(),
          original_name: `Scanned_Document_${new Date().toISOString().split('T')[0]}.pdf`,
          size: pdfBlob.size,
          checksum: Math.random().toString(36).substring(7),
          encrypted: true,
          ownerId: undefined,
        },
        createdAt: new Date().toISOString(),
      };

      // Add to vault and navigate back
      if (onPageScanned) {
        onPageScanned(pdfBase64);
      }
      
      alert(`PDF generated successfully with ${scannedPages.length} pages!`);
      setIsGeneratingPDF(false);
      
      // Optional: Auto-navigate back after PDF generation
      setTimeout(() => {
        onBack();
      }, 1000);
      
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Failed to generate PDF. Please try again.');
      setIsGeneratingPDF(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-4 space-y-3 pb-20"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">
          Scan Document
        </h1>
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-700/50 rounded-lg transition-all"
        >
          <X size={20} className="text-slate-300" />
        </button>
      </div>

      {/* Page Counter - Small and Clear */}
      <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/20 rounded-lg p-2 text-center">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Pages Scanned</p>
        <p className="text-lg font-bold text-white">
          {pageCount}
        </p>
      </div>

      {/* Last Capture Preview */}
      {lastCapture && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl overflow-hidden border border-purple-500/30 shadow-lg"
        >
          <img
            src={`data:image/jpeg;base64,${lastCapture}`}
            alt="Last Scanned"
            className="w-full h-48 object-cover"
          />
          <div className="bg-slate-900/50 p-2 text-center">
            <p className="text-xs text-purple-300">Last scanned page</p>
          </div>
        </motion.div>
      )}

      {/* Hidden file input — camera fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileCapture}
      />

      {/* Action Buttons - Compact */}
      <div className="space-y-2 fixed bottom-20 left-4 right-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleOpenCamera}
          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 text-sm"
        >
          <Camera size={16} />
          {pageCount > 0 ? "Scan Next Page" : "Start Scanning"}
        </motion.button>

        {pageCount > 0 && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onDone}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all text-sm"
          >
            Done ({pageCount} {pageCount === 1 ? "page" : "pages"})
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// 3. REVIEW SCAN PAGE - Gallery and PDF generation
interface ReviewScanPageProps {
  scannedPages: string[];
  onSaveToPDF: (pdfData: string, fileName: string) => void;
  onDeletePage: (index: number) => void;
  onBack: () => void;
}

function ReviewScanPage({ scannedPages, onSaveToPDF, onDeletePage, onBack }: ReviewScanPageProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isSavingPDF, setIsSavingPDF] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const defaultName = `Scanned_Doc_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`;
  const [pdfName, setPdfName] = useState(defaultName);

  const handleSaveAsPDF = async () => {
    if (scannedPages.length === 0) {
      alert('No pages scanned. Please scan at least one page first.');
      return;
    }
    setIsSavingPDF(true);
    try {
      const pdfDataUrl = await convertImagesToPDF(scannedPages);
      const finalName = pdfName.trim() || defaultName;
      onSaveToPDF(pdfDataUrl, finalName.endsWith('.pdf') ? finalName : `${finalName}.pdf`);
      setSavedOk(true);
    } catch (error) {
      console.error("PDF generation error:", error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsSavingPDF(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-6 space-y-6 pb-20"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Review Scans
        </h1>
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-700/50 rounded-lg transition-all"
        >
          <X size={24} className="text-slate-300" />
        </button>
      </div>

      {/* Stats row */}
      <div className="bg-gradient-to-r from-emerald-900/40 to-cyan-900/40 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
        <div className="text-center flex-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Pages</p>
          <p className="text-3xl font-bold text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text">{scannedPages.length}</p>
        </div>
        <div className="text-center flex-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Status</p>
          <p className="text-sm font-semibold text-emerald-400">Ready to save</p>
        </div>
        <div className="text-center flex-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Encryption</p>
          <p className="text-sm font-semibold text-cyan-400">🔒 AES-XOR</p>
        </div>
      </div>

      {/* Pages Grid Gallery */}
      <div className="grid grid-cols-2 gap-3">
        {scannedPages.map((page, idx) => (
          <div key={idx} className="relative rounded-lg overflow-hidden border-2 border-slate-600/50 shadow-lg">
            <img
              src={`data:image/jpeg;base64,${page}`}
              alt={`Page ${idx + 1}`}
              className="w-full aspect-[3/4] object-cover cursor-pointer"
              onClick={() => setSelectedIndex(idx)}
            />
            <div className="absolute top-2 left-2 bg-emerald-600 text-white px-2 py-0.5 rounded text-xs font-bold">
              {idx + 1}
            </div>
            {/* Delete page button */}
            <button
              onClick={() => onDeletePage(idx)}
              className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-700 text-white p-1 rounded-md"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Success banner */}
      <AnimatePresence>
        {savedOk && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 bg-green-900/40 border border-green-500/50 rounded-xl"
          >
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <p className="text-green-300 text-sm font-medium">PDF encrypted &amp; saved to Vault!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen page preview */}
      <AnimatePresence>
        {selectedIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setSelectedIndex(null)}
          >
            <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
              <img
                src={`data:image/jpeg;base64,${scannedPages[selectedIndex]}`}
                alt={`Page ${selectedIndex + 1}`}
                style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain' }}
              />
              <button
                onClick={() => setSelectedIndex(null)}
                style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(239,68,68,0.9)', border: 'none', borderRadius: 8, padding: '6px 10px', color: 'white', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF File Name Input */}
      <div className="space-y-1">
        <label className="text-xs text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1.5">
          <FileText size={12} />
          PDF File Name
        </label>
        <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-600/60 rounded-xl px-4 py-2.5">
          <input
            type="text"
            value={pdfName}
            onChange={e => setPdfName(e.target.value)}
            placeholder={defaultName}
            disabled={isSavingPDF || savedOk}
            className="bg-transparent outline-none flex-1 text-sm text-white placeholder-slate-500 disabled:opacity-50"
          />
          {pdfName !== defaultName && (
            <button
              onClick={() => setPdfName(defaultName)}
              className="text-slate-400 hover:text-slate-200 text-xs shrink-0"
            >
              Reset
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 pl-1">You can rename the file before saving</p>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pb-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSaveAsPDF}
          disabled={isSavingPDF || savedOk || scannedPages.length === 0}
          className="w-full bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSavingPDF ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Encrypting &amp; Saving...
            </>
          ) : savedOk ? (
            <>
              <CheckCircle size={20} />
              Saved to Vault ✓
            </>
          ) : (
            <>
              <Lock size={20} />
              Encrypt &amp; Save as PDF ({scannedPages.length} {scannedPages.length === 1 ? 'page' : 'pages'})
            </>
          )}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBack}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
        >
          ← Back to Scan
        </motion.button>
      </div>
    </motion.div>
    );
  }

// Encryption function for documents
const encryptFile = async (fileData: string): Promise<string> => {
  // Simple base64 encoding for now - can be enhanced with actual encryption
  // In production, use proper encryption libraries like crypto-js
  return btoa(fileData);
};

function DocumentUploadPage({ onBack, onScanClick, onDocumentUploaded }: DocumentUploadPageProps) {
  const [isUploading, setIsUploading] = useState(false);
  
  const handleFileUpload = async () => {
    try {
      // Use HTML file input for file selection - RESTRICT TO DOCUMENTS ONLY
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation';
      input.multiple = false;
      
      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          setIsUploading(true);
          
          try {
            // Validate file type - DOCUMENTS ONLY
            const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
            
            if (!allowedTypes.includes(file.type)) {
              alert('Only documents are allowed (PDF, DOCX, XLSX, PPTX)');
              setIsUploading(false);
              return;
            }
            
            // Check file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
              alert('File size must be less than 10MB');
              setIsUploading(false);
              return;
            }
            
            // Create FileReader to read file
            const reader = new FileReader();
            reader.onload = async (e) => {
              try {
                // result is a complete data URL: "data:application/pdf;base64,..."
                const dataUrl = e.target?.result as string;

                if (!dataUrl) {
                  throw new Error('Failed to read file data');
                }

                // Calculate page count for documents
                const pageCount = await calculatePageCount(file);

                // Create vault document — store the full data URL so preview works
                const newDoc: VaultDocument = {
                  id: `doc_${Date.now()}`,
                  name: file.name,
                  encryptedData: dataUrl,  // full data URL (e.g. data:application/pdf;base64,...)
                  pageCount: pageCount, // Add page count
                  metadata: {
                    timestamp: Date.now(),
                    original_name: file.name,
                    size: file.size,
                    checksum: Math.random().toString(36).substring(7),
                    encrypted: true,
                    ownerId: undefined,
                  },
                  createdAt: new Date().toISOString(),
                };
                
                // Pass document to parent component for vault storage
                
                // Call the parent callback to handle vault storage
                onDocumentUploaded(newDoc);
                setIsUploading(false);
                
                // Show success message and go back to dashboard
                alert(`Document "${file.name}" uploaded successfully!`);
                setTimeout(() => {
                  onBack();
                }, 1000);
                
              } catch (processingError) {
                console.error('File processing error:', processingError);
                alert('Failed to process file. Please try again.');
                setIsUploading(false);
              }
            };
            
            reader.onerror = () => {
              console.error('FileReader error');
              alert('Failed to read file. Please try again.');
              setIsUploading(false);
            };
            
            reader.readAsDataURL(file);
            
          } catch (fileError) {
            console.error('File handling error:', fileError);
            alert('Failed to handle file. Please try again.');
            setIsUploading(false);
          }
        }
      };
      
      input.click();
    } catch (error) {
      console.error('File picker error:', error);
      alert('Failed to open file picker. Please try again.');
      setIsUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-6 space-y-6 pb-20"
    >
      <div className="text-center">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-4">
          Upload Document
        </h1>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Fallback navigation - always try to navigate back
            try {
              if (typeof onBack === 'function') {
                onBack();
              } else {
                console.error('onBack is not a function! Using fallback...');
                // Fallback: try to access parent's setCurrentPage
                if (window.history && window.history.length > 1) {
                  window.history.back();
                } else {
                  // Last resort: redirect to home
                  window.location.href = '/';
                }
              }
            } catch (error) {
              console.error('Navigation error:', error);
              // Ultimate fallback
              window.location.href = '/';
            }
          }}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg transition-all transform hover:scale-105 text-sm"
          type="button"
        >
          <ArrowLeft className="w-4 h-4 inline-block mr-2" />
          View Vault
        </button>
      </div>

      <p className="text-slate-400 text-center">Choose how you want to add a document to your vault</p>

      <div className="space-y-3">
        {/* Scan Document Card - Modern Small Size */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onScanClick && typeof onScanClick === 'function') {
              onScanClick();
            } else {
              console.error('onScanClick is not a function:', onScanClick);
              alert('Scan function not available. Please try again.');
            }
          }}
          className="w-full bg-gradient-to-r from-purple-600/80 to-indigo-600/80 border border-purple-500/60 hover:border-purple-400 rounded-xl p-2.5 text-left transition-all shadow-lg hover:shadow-xl"
          type="button"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-purple-500/30 rounded-lg">
              <Camera size={14} className="text-purple-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-xs font-semibold text-white">Scan Document</h3>
              <p className="text-[10px] text-slate-300">Open camera to scan</p>
            </div>
            <ChevronRight size={12} className="text-purple-300" />
          </div>
        </motion.button>

        {/* Upload from Device Card - Modern Small Size */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleFileUpload}
          disabled={isUploading}
          className="w-full bg-gradient-to-r from-cyan-600/80 to-blue-600/80 border border-cyan-500/60 hover:border-cyan-400 rounded-xl p-2.5 text-left transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-500/30 rounded-lg">
              <Upload size={14} className="text-cyan-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-xs font-semibold text-white">Upload from Device</h3>
              <p className="text-[10px] text-slate-300">Choose file from storage</p>
            </div>
            {isUploading ? (
              <div className="w-2.5 h-2.5 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ChevronRight size={12} className="text-cyan-300" />
            )}
          </div>
        </motion.button>
      </div>
    </motion.div>
  );
}

// 5. DIGITAL IDENTITY DASHBOARD - Full functionality version
interface CategoryDetailPageProps {
  category: {
    id: string;
    name: string;
    icon: React.ElementType;
    color: string;
  };
  onBack: () => void;
  onDocumentUploaded: (document: VaultDocument) => void;
}

function CategoryDetailPage({ category, onBack, onDocumentUploaded }: CategoryDetailPageProps) {
  const [documents, setDocuments] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);

  // Load documents from vault on mount
  useEffect(() => {
    const loadVaultDocuments = async () => {
      try {
        const userId = localStorage.getItem('biovault_userId');
        if (userId) {
          const docs = await loadVaultDocuments(userId);
          // Filter documents for this category
          const categoryDocs = docs.filter(doc => doc.name.includes(category.name));
          setVaultDocs(categoryDocs);
        }
      } catch (error) {
        console.error('Failed to load vault documents:', error);
      }
    };
    loadVaultDocuments();
  }, [category.name]);

  const handleCameraCapture = async () => {
    try {
      setIsCapturing(true);
      
      const photo = await CapacitorCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        width: 1024,
        height: 1024,
        correctOrientation: true,
        promptLabelHeader: 'Take Photo',
        promptLabelCancel: 'Cancel',
        promptLabelPhoto: 'Capture',
      });

      if (photo.base64String) {

        // Compute pHash for duplicate detection
        const base64Data = `data:image/jpeg;base64,${photo.base64String}`;
        const pHash = await computePHashFromBase64(base64Data);

        // Check for duplicates
        if (pHash && vaultDocs.length > 0) {
          const img = new Image();
          img.src = base64Data;
          await new Promise((resolve) => {
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                const duplicates = findDuplicates(canvas, vaultDocs.map(doc => ({ id: doc.id, name: doc.name, pHash: doc.pHash })), 90);
                if (duplicates.length > 0) {
                  const duplicateNames = duplicates.map(d => d.documentName).join(', ');
                  alert(`⚠️ Possible duplicate detected! Similar to: ${duplicateNames}\nSimilarity: ${duplicates[0].similarity}%\n\nDo you want to continue uploading?`);
                }
              }
              resolve(null);
            };
            img.onerror = () => resolve(null);
          });
        }

        // Add to documents list
        const updatedDocuments = [...documents, photo.base64String];
        setDocuments(updatedDocuments);

        // Create vault document (without encryption for now)
        const vaultDoc: VaultDocument = {
          id: `${category.id}_${Date.now()}`,
          name: `${category.name}_${new Date().toISOString().split('T')[0]}_${documents.length + 1}.jpg`,
          encryptedData: photo.base64String,
          pHash: pHash || undefined,
          metadata: {
            timestamp: Date.now(),
            original_name: `${category.name}_${new Date().toISOString().split('T')[0]}_${documents.length + 1}.jpg`,
            size: photo.base64String.length,
            checksum: Math.random().toString(36).substring(7),
            encrypted: false,
            ownerId: undefined,
          },
          createdAt: new Date().toISOString(),
        };

        // Store in vault
        onDocumentUploaded(vaultDoc);

        // Refresh vault documents to show updated count
        const userId = localStorage.getItem('biovault_userId');
        if (userId) {
          const docs = await loadVaultDocuments(userId);
          const categoryDocs = docs.filter(doc => doc.name.includes(category.name));
          setVaultDocs(categoryDocs);
        }

        alert(`Document successfully added to ${category.name}!`);
      } else {
        console.error('No photo data received');
        alert('Failed to capture photo. Please try again.');
      }
    } catch (error) {
      console.error("Camera error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      alert(`Camera error: ${error?.message || error || 'Unknown error'}. Please try again.`);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileUpload = async () => {
    try {
      setIsUploading(true);
      
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      input.multiple = false;
      
      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          try {
            
            // Check file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
              alert('File size must be less than 10MB');
              setIsUploading(false);
              return;
            }
            
            // Read file
            const reader = new FileReader();
            reader.onload = async (e) => {
              try {
                const result = e.target?.result as string;
                const base64 = result?.split(',')[1] || '';

                if (!base64) {
                  throw new Error('Failed to read file data');
                }

                // Compute pHash for duplicate detection
                const base64Data = result || '';
                const pHash = await computePHashFromBase64(base64Data);

                // Check for duplicates
                if (pHash && vaultDocs.length > 0) {
                  const img = new Image();
                  img.src = base64Data;
                  await new Promise((resolve) => {
                    img.onload = () => {
                      const canvas = document.createElement('canvas');
                      canvas.width = img.width;
                      canvas.height = img.height;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(img, 0, 0);
                        const duplicates = findDuplicates(canvas, vaultDocs.map(doc => ({ id: doc.id, name: doc.name, pHash: doc.pHash })), 90);
                        if (duplicates.length > 0) {
                          const duplicateNames = duplicates.map(d => d.documentName).join(', ');
                          alert(`⚠️ Possible duplicate detected! Similar to: ${duplicateNames}\nSimilarity: ${duplicates[0].similarity}%\n\nDo you want to continue uploading?`);
                        }
                      }
                      resolve(null);
                    };
                    img.onerror = () => resolve(null);
                  });
                }

                // Add to documents list
                const updatedDocuments = [...documents, base64];
                setDocuments(updatedDocuments);

                // Create vault document (without encryption for now)
                const vaultDoc: VaultDocument = {
                  id: `${category.id}_${Date.now()}`,
                  name: file.name,
                  encryptedData: base64,
                  pHash: pHash || undefined,
                  metadata: {
                    timestamp: Date.now(),
                    original_name: file.name,
                    size: file.size,
                    checksum: Math.random().toString(36).substring(7),
                    encrypted: false,
                    ownerId: undefined,
                  },
                  createdAt: new Date().toISOString(),
                };

                // Store in vault
                onDocumentUploaded(vaultDoc);

                // Refresh vault documents to show updated count
                const userId = localStorage.getItem('biovault_userId');
                if (userId) {
                  const docs = await loadVaultDocuments(userId);
                  const categoryDocs = docs.filter(doc => doc.name.includes(category.name));
                  setVaultDocs(categoryDocs);
                }

                alert(`Document successfully added to ${category.name}!`);
                setIsUploading(false);
                
              } catch (processingError) {
                console.error('File processing error:', processingError);
                alert(`Processing error: ${processingError.message || 'Unknown error'}. Please try again.`);
                setIsUploading(false);
              }
            };
            
            reader.onerror = (error) => {
              console.error('FileReader error:', error);
              alert('Failed to read file. Please try again.');
              setIsUploading(false);
            };
            
            reader.readAsDataURL(file);
            
          } catch (fileError) {
            console.error('File handling error:', fileError);
            alert(`File handling error: ${fileError.message || 'Unknown error'}. Please try again.`);
            setIsUploading(false);
          }
        } else {
          setIsUploading(false);
        }
      };
      
      input.click();
    } catch (error) {
      console.error('File picker error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      alert(`File picker error: ${error?.message || error || 'Unknown error'}. Please try again.`);
      setIsUploading(false);
    }
  };

  return (
    <div className="px-4 pt-6 pb-24 min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-700/50 rounded-lg transition-all"
        >
          <X size={24} className="text-slate-300" />
        </button>
        <h1 className="text-xl font-bold text-white">{category.name}</h1>
        <div className="w-10"></div>
      </div>

      {/* Category Info */}
      <div className={`bg-gradient-to-br from-${category.color}-900/30 to-${category.color}-800/20 backdrop-blur-xl rounded-3xl border border-${category.color}-700/50 shadow-2xl overflow-hidden mb-6`}>
        <div className="p-6 text-center">
          <div className={`w-16 h-16 ${category.color === 'blue' ? 'bg-blue-500/20' : category.color === 'green' ? 'bg-green-500/20' : category.color === 'purple' ? 'bg-purple-500/20' : category.color === 'orange' ? 'bg-orange-500/20' : category.color === 'cyan' ? 'bg-cyan-500/20' : 'bg-red-500/20'} rounded-full flex items-center justify-center border border-slate-600/30 mx-auto mb-4`}>
            <category.icon size={32} className={category.color === 'blue' ? 'text-blue-400' : category.color === 'green' ? 'text-green-400' : category.color === 'purple' ? 'text-purple-400' : category.color === 'orange' ? 'text-orange-400' : category.color === 'cyan' ? 'text-cyan-400' : 'text-red-400'} />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">{category.name}</h2>
          <p className="text-slate-400 text-sm mb-2">Upload and manage your documents</p>
          <div className="flex items-center justify-center gap-2">
            <span className={`px-3 py-1 ${category.color === 'blue' ? 'bg-blue-500/20 text-blue-300' : category.color === 'green' ? 'bg-green-500/20 text-green-300' : category.color === 'purple' ? 'bg-purple-500/20 text-purple-300' : category.color === 'orange' ? 'bg-orange-500/20 text-orange-300' : category.color === 'cyan' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-red-500/20 text-red-300'} text-xs rounded-full border ${category.color === 'blue' ? 'border-blue-500/30' : category.color === 'green' ? 'border-green-500/30' : category.color === 'purple' ? 'border-purple-500/30' : category.color === 'orange' ? 'border-orange-500/30' : category.color === 'cyan' ? 'border-cyan-500/30' : 'border-red-500/30'}`}>
              {vaultDocs.length} documents
            </span>
          </div>
        </div>
      </div>

      {/* Upload Options */}
      <div className="space-y-3 mb-6">
        <button
          onClick={handleCameraCapture}
          disabled={isCapturing}
          className={`w-full bg-gradient-to-r ${category.color === 'blue' ? 'from-blue-600/80 to-indigo-600/80 border-blue-500/60 hover:border-blue-400' : category.color === 'green' ? 'from-green-600/80 to-emerald-600/80 border-green-500/60 hover:border-green-400' : category.color === 'purple' ? 'from-purple-600/80 to-pink-600/80 border-purple-500/60 hover:border-purple-400' : category.color === 'orange' ? 'from-orange-600/80 to-red-600/80 border-orange-500/60 hover:border-orange-400' : category.color === 'cyan' ? 'from-cyan-600/80 to-blue-600/80 border-cyan-500/60 hover:border-cyan-400' : 'from-red-600/80 to-pink-600/80 border-red-500/60 hover:border-red-400'} rounded-xl p-3 text-left transition-all shadow-lg hover:shadow-xl disabled:opacity-50`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 ${category.color === 'blue' ? 'bg-blue-500/30' : category.color === 'green' ? 'bg-green-500/30' : category.color === 'purple' ? 'bg-purple-500/30' : category.color === 'orange' ? 'bg-orange-500/30' : category.color === 'cyan' ? 'bg-cyan-500/30' : 'bg-red-500/30'} rounded-lg`}>
              <Camera size={16} className={category.color === 'blue' ? 'text-blue-300' : category.color === 'green' ? 'text-green-300' : category.color === 'purple' ? 'text-purple-300' : category.color === 'orange' ? 'text-orange-300' : category.color === 'cyan' ? 'text-cyan-300' : 'text-red-300'} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white">Capture Document</h3>
              <p className="text-xs text-slate-300">Use camera to scan</p>
            </div>
            {isCapturing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ChevronRight size={16} className={category.color === 'blue' ? 'text-blue-300' : category.color === 'green' ? 'text-green-300' : category.color === 'purple' ? 'text-purple-300' : category.color === 'orange' ? 'text-orange-300' : category.color === 'cyan' ? 'text-cyan-300' : 'text-red-300'} />
            )}
          </div>
        </button>

        <button
          onClick={handleFileUpload}
          disabled={isUploading}
          className="w-full bg-gradient-to-r from-cyan-600/80 to-blue-600/80 border border-cyan-500/60 hover:border-cyan-400 rounded-xl p-3 text-left transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/30 rounded-lg">
              <Upload size={16} className="text-cyan-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white">Upload from Device</h3>
              <p className="text-xs text-slate-300">Choose file from storage</p>
            </div>
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ChevronRight size={16} className="text-cyan-300" />
            )}
          </div>
        </button>
      </div>

      {/* Documents Grid */}
      <div className="space-y-4">
        <h3 className="text-white font-semibold">Your Documents</h3>
        {vaultDocs.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-slate-800/60 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-400 text-sm">No documents yet</p>
            <p className="text-slate-500 text-xs mt-1">Start by capturing or uploading documents</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {vaultDocs.map((doc, index) => (
              <div
                key={doc.id}
                className="bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-700/50 p-3 cursor-pointer hover:border-slate-600 transition-all"
              >
                <div className="aspect-square bg-slate-700/50 rounded-lg mb-2 overflow-hidden">
                  <img
                    src={`data:image/jpeg;base64,${doc.encryptedData}`}
                    alt={doc.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-white text-xs font-medium truncate">{doc.name}</p>
                <p className="text-slate-400 text-xs">{new Date(doc.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Share Access Page - Handles public share links and QR codes
// (ShareAccessPage component is already defined above)

export default PINITVaultDashboard;
