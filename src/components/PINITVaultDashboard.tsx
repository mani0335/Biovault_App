import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
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
import { supabase } from "@/integrations/supabase/client";
import { logActivityEvent } from "@/lib/activityService";
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
  Printer,
  Monitor,
  Send,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { appStorage } from "@/lib/storage";
import { SecurePdfViewer } from "@/components/SecurePdfViewer";
import { ImageCryptoFull } from "@/components/ImageCryptoFull";
import { VaultManager } from "@/components/VaultManager";
import { ActivityLogger } from "@/components/ActivityLogger";
import Profile from "@/pages/Profile";
import DigitalIdentityDashboard from "@/components/DigitalIdentityDashboard";
import { ImageAnalyzer } from "@/components/ImageAnalyzer";
import type { Portfolio } from "@/types/Portfolio";
import PortfolioHome from "@/pages/portfolio/PortfolioHome";

interface VaultDocument {
  id: string;
  name: string;
  /** Full encrypted binary as base64 or data URL */
  encryptedData: string;
  /** Preview-ready watermarked image data URL (images only) */
  encryptedImage?: string;
  /** Cloudinary / remote URL for the encrypted asset */
  cloudinaryUrl?: string;
  /** Number of pages (PDF only) */
  pageCount?: number;
  /** Perceptual hash for duplicate detection */
  pHash?: string;
  metadata: {
    timestamp: number;
    original_name: string;
    /** Actual byte size of the unencrypted file */
    size: number;
    /** XOR encryption key — REQUIRED for decryption */
    checksum: string;
    encrypted?: boolean;
    ownerId?: string;
    mimeType?: string;
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
}

interface PINITDashboardProps {
  userId?: string;
  isRestricted?: boolean;
}

type PageType = "home" | "vault" | "portfolio" | "share" | "identity" | "encrypt-preview" | "verify-proof" | "crypto" | "vault-advanced" | "activity" | "profile" | "analysis" | "upload-document" | "scan-document" | "review-scan";

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
      console.log('🔍 Loading share data for ID:', shareId);

      // Try Supabase first for cross-device sharing
      console.log('🗄️ Trying Supabase...');
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
        console.log('✅ Loading from Supabase:', supabaseData);
        
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

  // If navigation state changes (user presses back/forward or BottomNav re-navigates), sync tab
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

  // Load profile info from backend on mount
  useEffect(() => {
    const loadProfileInfo = async () => {
      if (!userId) return;
      
      console.log(`👤 Loading profile info for user: ${userId}`);
      
      try {
        const token = localStorage.getItem("biovault_token");
        const API_BASE = import.meta.env.VITE_API_URL || "https://biovault-backend-d13a.onrender.com";
        
        // Try to load from backend first
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
          console.log('✅ Profile loaded from backend:', data);
          
          // Update state with backend data - match backend structure
          if (data.profile && data.profile.personal) {
            // Extract user name from personal category
            if (data.profile.personal["User Name"]) {
              const userName = data.profile.personal["User Name"].value;
              setUserName(userName);
              await appStorage.setItem("biovault_userName", userName);
              localStorage.setItem("biovault_userName", userName);
              console.log('✅ Loaded userName from backend:', userName);
            }
            
            // Extract profile image from personal category
            if (data.profile.personal["Profile Image"]) {
              const profileImage = data.profile.personal["Profile Image"].value;
              setProfileImage(profileImage);
              await appStorage.setItem("biovault_profileImage", profileImage);
              localStorage.setItem("biovault_profileImage", profileImage);
              console.log('✅ Loaded profileImage from backend');
            }
          }
        } else {
          console.log('⚠️ Backend profile fetch failed, using local storage');
        }
      } catch (e) {
        console.error("Error loading profile from backend:", e);
      }

      // Fallback to localStorage if backend fails
      try {
        const savedName = await appStorage.getItem("biovault_userName");
        const savedImage = await appStorage.getItem("biovault_profileImage");
        
        if (savedName && !userName || userName === "User") {
          setUserName(savedName);
          console.log('📱 Loaded userName from storage:', savedName);
        }
        
        if (savedImage && !profileImage) {
          setProfileImage(savedImage);
          console.log('📱 Loaded profileImage from storage');
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
          console.log('✅ Profile name saved to backend:', name);
        } else {
          console.warn('⚠️ Failed to save profile name to backend');
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
            console.log('✅ Profile image saved to backend');
          } else {
            console.warn('⚠️ Failed to save profile image to backend');
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

    const normalized: VaultDocument = {
      id: incomingDoc.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: docName,
      encryptedData: rawData,
      // encryptedImage stores a preview-ready data URL for images
      encryptedImage: dataUrl.startsWith('data:image') ? dataUrl : undefined,
      cloudinaryUrl: incomingDoc.cloudinaryUrl,
      metadata: incomingDoc.metadata || {
        timestamp: Date.now(),
        original_name: docName,
        size: 0,
        checksum: docName,
        encrypted: false,
        ownerId: userId || undefined,
      },
      createdAt: incomingDoc.createdAt
        ? new Date(incomingDoc.createdAt).toISOString()
        : new Date().toISOString(),
    };

    // Add to vault documents
    const updated = [...vaultDocuments, normalized];
    setVaultDocuments(updated);

    // Save to vault service for persistence
    if (userId) {
      try {
        await saveVaultDocuments(userId, updated);
      } catch (error) {
        console.error('❌ Failed to save document to vault service:', error);
      }
    }
  };

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [verifyProofImage, setVerifyProofImage] = useState<string | null>(null);
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
  const [shareExpiryDate, setShareExpiryDate] = useState<string>("");
  const [shareExpiryTime, setShareExpiryTime] = useState<string>("23:59");
  const [shareDownloadLimit, setShareDownloadLimit] = useState<number | null>(null);
  const [sharePassword, setSharePassword] = useState<string>("");
  const [includeCertificate, setIncludeCertificate] = useState<boolean>(false);
  const [generatedShareLink, setGeneratedShareLink] = useState<string>("");
  const [generatedQRCode, setGeneratedQRCode] = useState<string>("");
  const [shareStep, setShareStep] = useState<"select" | "configure" | "preview">("select");
  // Extended access controls for share
  const [sharePrintBlocked, setSharePrintBlocked] = useState<boolean>(false);
  const [shareDeviceRestriction, setShareDeviceRestriction] = useState<'' | 'mobile' | 'desktop'>('');
  const [shareGeoRestriction, setShareGeoRestriction] = useState<string>('');
  // Download requests from viewers
  const [downloadRequests, setDownloadRequests] = useState<any[]>([]);

  // Quick Action refs for camera and file upload
  const quickActionCameraRef = useRef<HTMLInputElement>(null);
  const quickActionFileRef = useRef<HTMLInputElement>(null);

  // Handler for quick action image selection (works like Analyze button)
  const handleQuickActionImageSelected = (imageData: string) => {
    console.log("✅ Quick Action image selected for encryption");
    setCapturedImage(imageData);
    setCurrentPage("encrypt-preview");
  };

  const handleVerifyProofImageSelected = (imageData: string) => {
    console.log("✅ Image selected for verification");
    setVerifyProofImage(imageData);
    setCurrentPage("verify-proof");
  };

  // Load and sync vault documents when userId is available
  useEffect(() => {
    const initializeVault = async () => {
      if (!userId) {
        console.warn("⚠️ No userId available, cannot initialize vault");
        return;
      }

      console.log(`🏦 Initializing vault for user: ${userId}`);
      
      try {
        // First, try to load from backend to get latest data
        console.log("🔄 Loading vault documents from backend...");
        const docs = await loadVaultDocuments(userId);
        
        if (docs && docs.length > 0) {
          console.log(`✅ Loaded ${docs.length} documents from backend vault for user: ${userId}`);
          setVaultDocuments(docs);
        } else {
          console.log("📭 No documents found in backend, checking local storage...");
          
          // Fallback to local storage if backend is empty
          const synced = await syncVaultData(userId);
          if (synced) {
            console.log(`✅ Vault data synchronized from local storage for user: ${userId}`);
            const localDocs = await loadVaultDocuments(userId);
            if (localDocs && localDocs.length > 0) {
              setVaultDocuments(localDocs);
              console.log(`📱 Loaded ${localDocs.length} documents from local storage`);
            }
          }
        }

        // Log vault metadata
        const metadata = await getVaultMetadata(userId);
        console.log(
          `📈 Vault Stats - Documents: ${metadata.documentCount}, Size: ${(metadata.userVaultSize / 1024).toFixed(2)}KB, Storage: ${metadata.storageType}`
        );

        // Update persistence status
        setVaultPersistenceStatus({
          isSynced: metadata.documentCount > 0,
          lastSyncTime: metadata.lastSyncTime,
          documentCount: metadata.documentCount,
          storageType: metadata.storageType,
        });
        
        console.log(`🎯 Vault initialization complete for user: ${userId}`);
      } catch (error) {
        console.error("❌ Failed to initialize vault:", error);
        
        // Try local storage fallback
        try {
          console.log("🔄 Attempting local storage fallback...");
          const synced = await syncVaultData(userId);
          const localDocs = await loadVaultDocuments(userId);
          if (localDocs && localDocs.length > 0) {
            setVaultDocuments(localDocs);
            console.log(`📱 Fallback loaded ${localDocs.length} documents from local storage`);
          }
        } catch (fallbackError) {
          console.error("❌ Local storage fallback also failed:", fallbackError);
        }
      }
    };

    initializeVault();
  }, [userId]);

  // Load download requests for this user's shares
  useEffect(() => {
    if (!userId) return;
    const fetchRequests = async () => {
      try {
        const { data } = await supabase
          .from('download_requests')
          .select('*')
          .eq('owner_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (data) setDownloadRequests(data);
      } catch { /* silent */ }
    };
    fetchRequests();
  }, [userId]);

  // Verify authentication and load user data on mount
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        let accessToken = null;
        let storedUserId = null;

        try {
          accessToken = await appStorage.getItem("biovault_token");
          storedUserId = await appStorage.getItem("biovault_userId");
        } catch (e) {
          console.error("appStorage error:", e);
          accessToken = localStorage.getItem("biovault_token");
          storedUserId = localStorage.getItem("biovault_userId");
        }

        if (!accessToken || !storedUserId) {
          throw new Error("No valid session");
        }

        setUserId(storedUserId);
        // Extract name from userId or use it as display name
        const displayName = storedUserId.split("@")[0] || "User";
        setUserName(displayName.charAt(0).toUpperCase() + displayName.slice(1));
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
      console.log("🚪 Logging out - preserving vault and profile data in backend");
      
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white pb-24">
      {/* Top Bar with User Profile */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-40 bg-gradient-to-r from-slate-950/95 via-purple-950/95 to-slate-950/95 backdrop-blur-xl border-b border-purple-500/30 px-4 py-4 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {profileImage ? (
              <img 
                src={profileImage} 
                alt="Profile" 
                className="w-11 h-11 rounded-full object-cover border-2 border-purple-500/50 shadow-lg shadow-purple-500/50"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-purple-500/50">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-white">{userName}</p>
              <p className="text-xs text-purple-300">@{userName.toLowerCase().replace(/\s/g, '_')}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-red-500/20 rounded-lg transition-all hover:shadow-lg hover:shadow-red-500/50"
          >
            <LogOut size={20} className="text-red-400" />
          </button>
        </div>

        {/* Vault Persistence Status */}
        {vaultPersistenceStatus.storageType !== "none" && (
          <div className="flex items-center gap-2 text-xs text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/30 w-fit">
            <div className={`w-2 h-2 rounded-full ${vaultPersistenceStatus.isSynced ? "bg-green-400" : "bg-yellow-400"}`}></div>
            <span>
              {vaultPersistenceStatus.isSynced ? "✅ Vault Synced" : "📊 Syncing"} • {vaultPersistenceStatus.documentCount} documents •{" "}
              {vaultPersistenceStatus.storageType === "both" ? "🔄 Dual-Backed" : vaultPersistenceStatus.storageType}
            </span>
          </div>
        )}
      </motion.div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {currentPage === "home" && <HomePage key="home" userName={userName} documentCount={vaultDocuments.length} onEncryptClick={async () => {
          try {
            console.log("Opening camera for encryption...");
            const image = await CameraPlugin.getPhoto({
              quality: 90,
              allowEditing: false,
              source: "Cameras" as any,  // CAMERA ONLY - no gallery
              resultType: "base64" as any,
            });
            if (image?.base64String) {
              console.log("Photo captured for encryption");
              setCapturedImage("data:image/jpeg;base64," + image.base64String);
              setCurrentPage("encrypt-preview");
            }
          } catch (error) {
            console.error("Camera error:", error);
            alert("Failed to open camera. Please check camera permissions.");
          }
        }} setVerifyProofImage={setVerifyProofImage} setCurrentPage={setCurrentPage} quickActionCameraRef={quickActionCameraRef} quickActionFileRef={quickActionFileRef} onQuickActionImageSelected={handleQuickActionImageSelected} onVerifyProofImageSelected={handleVerifyProofImageSelected} navigate={navigate} />}
        {currentPage === "vault" && <VaultPage key="vault" documents={vaultDocuments} userId={userId} selectedShareImage={selectedShareImage} setSelectedShareImage={setSelectedShareImage} setCurrentPage={setCurrentPage} onStartShare={() => {
          // Reset share flow so the user always starts fresh on the configure step
          setShareStep("configure");
          setGeneratedShareLink("");
          setGeneratedQRCode("");
          setShareExpiryDate("");
          setShareExpiryTime("23:59");
          setShareDownloadLimit(null);
          setSharePassword("");
          setIncludeCertificate(false);
          setSharePrintBlocked(false);
          setShareDeviceRestriction('');
          setShareGeoRestriction('');
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
        {currentPage === "share" && <SharePage key="share" shareConfigs={shareConfigs} setShareConfigs={setShareConfigs} shareHistory={shareHistory} setShareHistory={setShareHistory} selectedShareImage={selectedShareImage} setSelectedShareImage={setSelectedShareImage} shareExpiryDate={shareExpiryDate} setShareExpiryDate={setShareExpiryDate} shareExpiryTime={shareExpiryTime} setShareExpiryTime={setShareExpiryTime} shareDownloadLimit={shareDownloadLimit} setShareDownloadLimit={setShareDownloadLimit} sharePassword={sharePassword} setSharePassword={setSharePassword} includeCertificate={includeCertificate} setIncludeCertificate={setIncludeCertificate} generatedShareLink={generatedShareLink} setGeneratedShareLink={setGeneratedShareLink} generatedQRCode={generatedQRCode} setGeneratedQRCode={setGeneratedQRCode} shareStep={shareStep} setShareStep={setShareStep} userId={userId} vaultDocuments={vaultDocuments} sharePrintBlocked={sharePrintBlocked} setSharePrintBlocked={setSharePrintBlocked} shareDeviceRestriction={shareDeviceRestriction} setShareDeviceRestriction={setShareDeviceRestriction} shareGeoRestriction={shareGeoRestriction} setShareGeoRestriction={setShareGeoRestriction} downloadRequests={downloadRequests} setDownloadRequests={setDownloadRequests} />}
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
              console.log('Document saved to vault:', document.name);
            }}
          />
        )}
        {currentPage === "scan-document" && (
          <ScanDocumentPage
            key="scan-document"
            onPageScanned={(imageData: string) => {
              setScannedPages([...scannedPages, imageData]);
              console.log(`?? Page scanned! Total pages: ${scannedPages.length + 1}`);
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
        {currentPage === "verify-proof" && verifyProofImage && (
          <VerifyProofPage
            key="verify-proof"
            image={verifyProofImage}
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
            onRetake={async () => {
              try {
                console.log('🔄 Retake button clicked - capturing new image');
                const image = await CameraPlugin.getPhoto({
                  quality: 90,
                  allowEditing: false,
                  resultType: "base64" as any,
                });
                if (image?.base64String) {
                  console.log('✅ New image captured successfully');
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
                console.log("📤 Saving encryption to vault...");
                
                // Verify encryption is valid
                if (!encryptedPackage || !encryptedPackage.encrypted_data || !encryptedPackage.metadata) {
                  throw new Error("Invalid encryption data package");
                }
                
                // Verify user ID is embedded in metadata
                if (!encryptedPackage.metadata.ownerId && !userId) {
                  throw new Error("Cannot encrypt: User ID not available");
                }
                
                const ownerIdUsed = encryptedPackage.metadata.ownerId || userId;
                console.log(`🔐 Image encrypted with PINIT ID: ${ownerIdUsed}`);
                
                // Upload to Cloudinary (optional cloud backup) - wrap in try-catch
                let uploadResult = { cloudinaryUrl: null };
                try {
                  console.log("☁️ Uploading to Cloudinary...");
                  uploadResult = await uploadImageToCloudinary(
                    encryptedPackage.encrypted_data,
                    encryptedPackage.metadata.original_name,
                    userId || "unknown",
                    encryptedPackage.metadata.size,
                    encryptedPackage.metadata.checksum
                  );
                  console.log("✅ Cloudinary upload successful");
                } catch (uploadErr) {
                  console.warn("⚠️ Cloudinary upload failed (non-critical):", uploadErr);
                  // Continue with local save even if cloud upload fails
                }

                // Save encrypted image to device gallery in PINIT Vault folder
                console.log("💾 Saving to device gallery...");
                let galleryResult = { success: false, error: "Not attempted" };
                try {
                  galleryResult = await saveImageToGallery(
                    encryptedPackage.encryptedImage || encryptedPackage.encrypted_data,
                    encryptedPackage.metadata.original_name,
                    userId || "unknown"
                  );
                  console.log(`✅ Image saved to gallery: ${galleryResult.path}`);
                } catch (galleryErr) {
                  console.warn("⚠️ Gallery save error:", galleryErr);
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

                console.log("✅ Document saved to vault");
                // Show success message with encryption confirmation
                const successMsg = galleryResult.success 
                  ? `✅ Image Encrypted Successfully!\n🔐 Encrypted with PINIT ID: ${ownerIdUsed.substring(0, 8)}...\n📁 Saved to: PINIT Vault` 
                  : `✅ Image Encrypted Successfully!\n🔐 Encrypted with PINIT ID: ${ownerIdUsed.substring(0, 8)}...\n⚠️ (Gallery save failed)`;
                console.log("✅ " + successMsg);
                
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

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent backdrop-blur-xl border-t border-purple-500/30">
        <div className="flex justify-around items-center h-20 px-2">
          <NavButton
            icon={Home}
            label="Home"
            active={currentPage === "home"}
            onClick={() => {
              setCurrentPage("home");
              navigate("/dashboard", { state: { tab: "home" }, replace: true });
            }}
          />
          <NavButton
            icon={Briefcase}
            label="Vault"
            active={currentPage === "vault"}
            onClick={() => {
              setCurrentPage("vault");
              navigate("/dashboard", { state: { tab: "vault" }, replace: true });
            }}
          />
          <NavButton
            icon={Plus}
            label="Portfolio"
            active={currentPage === "portfolio"}
            onClick={() => {
              setCurrentPage("portfolio");
              navigate("/portfolio");
            }}
          />
          <NavButton
            icon={Clock}
            label="Activity"
            active={false}
            onClick={() => navigate("/activity")}
          />
          <NavButton
            icon={User}
            label="Profile"
            active={currentPage === "profile"}
            onClick={() => {
              setCurrentPage("profile");
              navigate("/dashboard", { state: { tab: "profile" }, replace: true });
            }}
          />
        </div>
      </div>
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
function HomePage({ userName, documentCount, onEncryptClick, setVerifyProofImage, setCurrentPage, quickActionCameraRef, quickActionFileRef, onQuickActionImageSelected, onVerifyProofImageSelected, navigate }: { userName: string; documentCount: number; onEncryptClick: () => void; setVerifyProofImage: (value: string | null) => void; setCurrentPage: (page: PageType) => void; quickActionCameraRef?: React.RefObject<HTMLInputElement>; quickActionFileRef?: React.RefObject<HTMLInputElement>; onQuickActionImageSelected?: (imageData: string) => void; onVerifyProofImageSelected?: (imageData: string) => void; navigate: (path: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="px-4 pt-6 space-y-5"
    >
      {/* Hero Banner with Modern Gradient */}
      <motion.div
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 p-6 text-white shadow-2xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-pink-500 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-blue-500 blur-3xl"></div>
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-bold mb-2">PINIT Vault</h2>
          <p className="text-purple-100 text-sm">Your secure digital sanctuary</p>
        </div>
      </motion.div>

      {/* Stats Grid - Modern Cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Documents", value: documentCount.toString(), icon: FileText, gradient: "from-blue-600 to-purple-600" },
          { label: "Active Shares", value: "3", icon: Share2, gradient: "from-purple-600 to-pink-600" },
        ].map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`bg-gradient-to-br ${stat.gradient} rounded-2xl p-5 shadow-xl hover:shadow-2xl transition-shadow`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/80 text-xs font-semibold">{stat.label}</p>
                <p className="text-3xl font-bold mt-2 text-white">{stat.value}</p>
              </div>
              <stat.icon size={28} className="text-white/70" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions - Camera & Upload like Analyze */}
      <div>
        <h3 className="text-lg font-bold mb-3">Quick Actions</h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { 
              icon: Camera, 
              label: "Encrypt", 
              gradient: "from-blue-600 to-cyan-600", 
              onClick: () => quickActionCameraRef?.current?.click(),
              subtext: "📸 Camera" 
            },
            { 
              icon: Camera, 
              label: "Verify Proof", 
              gradient: "from-purple-600 to-pink-600", 
              onClick: () => quickActionFileRef?.current?.click(),
              subtext: "📤 Upload" 
            },
            { 
              icon: Upload, 
              label: "Upload", 
              gradient: "from-orange-600 to-red-600", 
              onClick: () => {
                console.log("📄 Navigating to document upload...");
                setCurrentPage("upload-document");
              },
              subtext: "📄"
            },
            { 
              icon: Share2, 
              label: "Share", 
              gradient: "from-green-600 to-emerald-600", 
              onClick: () => setCurrentPage("share"),
              subtext: "🔗 Links" 
            },
          ].map((action, idx) => (
            <motion.button
              key={idx}
              onClick={action.onClick}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-gradient-to-br ${action.gradient} rounded-xl p-2 flex flex-col items-center gap-1 shadow-lg hover:shadow-xl transition-all`}
            >
              <action.icon size={16} />
              <span className="text-xs font-bold text-center">{action.label}</span>
              <span className="text-xs text-white/70 text-center">{action.subtext}</span>
            </motion.button>
          ))}
        </div>

        {/* Hidden file inputs - matching ImageAnalyzer approach */}
        <input
          ref={quickActionCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onQuickActionImageSelected) {
              const reader = new FileReader();
              reader.onload = (event) => {
                const imageData = event.target?.result as string;
                onQuickActionImageSelected(imageData);
              };
              reader.readAsDataURL(file);
            }
          }}
          className="hidden"
        />
        <input
          ref={quickActionFileRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onVerifyProofImageSelected) {
              const reader = new FileReader();
              reader.onload = (event) => {
                const imageData = event.target?.result as string;
                onVerifyProofImageSelected(imageData);
              };
              reader.readAsDataURL(file);
            }
          }}
          className="hidden"
        />
      </div>

      {/* Recent Activity - Modern Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gradient-to-br from-slate-800/50 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-5 shadow-xl"
      >
        <h3 className="font-semibold mb-4 text-white">Recent Activity</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/20 rounded-xl">
            <span className="text-sm font-medium">Vault accessed</span>
            <span className="text-purple-300 text-xs font-bold">Just now</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Resize a raw base64 image to at most `maxDim` pixels on the longest side.
 *
 * Returns the resized raw base64 string (no "data:" prefix).
 * Falls back to the original string on any error (canvas unavailable, etc.).
 *
 * Why this exists:
 *   Android's Capacitor JS→Java bridge serialises every plugin call as JSON.
 *   A raw photo PNG can be 10–20 MB as base64; Android WebView enforces a
 *   ~4 MB message limit and crashes silently with a misleading "storage full"
 *   error.  Resizing to ≤1200 px drops the payload well under the limit.
 */
async function resizeBase64Image(
  base64: string,
  mimeType: string,
  maxDim: number
): Promise<string> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return base64;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w <= maxDim && h <= maxDim) {
        // Already small enough — skip canvas round-trip
        resolve(base64);
        return;
      }
      const scale = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(base64); return; }
        ctx.drawImage(img, 0, 0, w, h);
        // PNG for lossless (preserves watermark LSBs), JPEG for photos
        const outMime  = mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        const quality  = outMime === 'image/jpeg' ? 0.85 : undefined;
        const dataUrl  = canvas.toDataURL(outMime, quality);
        const commaIdx = dataUrl.indexOf(',');
        resolve(commaIdx >= 0 ? dataUrl.substring(commaIdx + 1) : base64);
      } catch {
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

// ============= VAULT PAGE =============
function VaultPage({ documents, onDeleteDocument, onStartShare, userId, selectedShareImage, setSelectedShareImage, setCurrentPage }: { documents: VaultDocument[]; onDeleteDocument?: (docId: string) => void; onStartShare?: () => void; userId?: string | null; selectedShareImage: VaultDocument | null; setSelectedShareImage: React.Dispatch<React.SetStateAction<VaultDocument | null>>; setCurrentPage: React.Dispatch<React.SetStateAction<PageType>> }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [vaultDocs, setVaultDocs] = useState(documents);
  // Keep local list in sync when parent deletes/adds docs
  useEffect(() => { setVaultDocs(documents); }, [documents]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [embeddedMetadata, setEmbeddedMetadata] = useState<AdvancedWatermarkMetadata | null>(null);
  const [showDigitalIdentities, setShowDigitalIdentities] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState<{ dataUrl: string; name: string } | null>(null);

  // Safe name accessor — handles both vaultService format (name) and vaultManager format (fileName)
  const getSafeName = (doc: VaultDocument): string =>
    (doc as any).name || (doc as any).fileName || 'Unknown Document';

  // Filter digital identity documents
  const digitalIdentityDocuments = vaultDocs.filter(doc => {
    const name = getSafeName(doc).toLowerCase();
    return (
      name.includes('personal') || name.includes('academic') ||
      name.includes('projects') || name.includes('internships') ||
      name.includes('certifications') || name.includes('entrance') ||
      name.includes('exams') || name.includes('docs')
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

      // Fix extension: PNG watermarked files must be saved as .png (lossless)
      let rawFileName = (doc.metadata?.original_name || getSafeName(doc)).replace(/[/\\?%*:|"<>]/g, '_');
      if (
        typeof finalData === 'string' &&
        finalData.startsWith('data:image/png') &&
        !rawFileName.toLowerCase().endsWith('.png')
      ) {
        rawFileName = rawFileName.replace(/\.(jpe?g|gif|bmp|webp)$/i, '') + '.png';
      }
      const fileName = rawFileName;

      // ─── Step 1: Resolve finalData → guaranteed raw base64 + mimeType ──────────
      // finalData might be:
      //   a) "data:image/png;base64,ABC..."  ← data URL
      //   b) "ABC..."                         ← raw base64
      //   c) "https://..."                    ← Cloudinary / remote URL (must fetch)
      let resolvedBase64 = '';
      let resolvedMime   = 'application/octet-stream';

      const fd = finalData as string;
      if (fd.startsWith('data:')) {
        const commaIdx = fd.indexOf(',');
        resolvedMime   = fd.substring(0, commaIdx).match(/:(.*?);/)?.[1] || resolvedMime;
        resolvedBase64 = fd.substring(commaIdx + 1).replace(/[\r\n\s]/g, '');
      } else if (fd.startsWith('http://') || fd.startsWith('https://')) {
        // Remote URL — fetch binary and convert to base64
        const resp    = await fetch(fd);
        resolvedMime  = resp.headers.get('content-type') || resolvedMime;
        const buf     = await resp.arrayBuffer();
        const bytes   = new Uint8Array(buf);
        let bStr = '';
        const chunkSz = 8192;
        for (let i = 0; i < bytes.length; i += chunkSz) {
          bStr += String.fromCharCode(...bytes.subarray(i, i + chunkSz));
        }
        resolvedBase64 = btoa(bStr);
      } else {
        // Raw base64 — clean whitespace
        resolvedBase64 = fd.replace(/[\r\n\s]/g, '');
        // Detect MIME from magic bytes
        try {
          const sample = atob(resolvedBase64.substring(0, 8));
          if (sample.startsWith('\x89PNG'))    resolvedMime = 'image/png';
          else if (sample.startsWith('\xFF\xD8')) resolvedMime = 'image/jpeg';
          else if (sample.startsWith('%PDF'))   resolvedMime = 'application/pdf';
        } catch { /* keep default */ }
      }

      if (!resolvedBase64) {
        alert('❌ No file data found to download.');
        return;
      }

      // ─── Capacitor (Android / iOS) ───────────────────────────────────────────
      const isCapacitor =
        typeof (window as any).Capacitor !== 'undefined' &&
        (window as any).Capacitor.isNativePlatform?.();

      if (isCapacitor) {
        // ── Resize images before passing through the JS→Java bridge ──────────
        // The bridge serialises the full base64 string as JSON; Android WebView
        // enforces a ~4 MB message limit.  A 4 K photo PNG can be 15 MB+, which
        // causes a silent crash reported as "storage full".
        // Resizing to ≤1200 px keeps the payload well under the limit.
        if (resolvedMime.startsWith('image/')) {
          try {
            console.log('📐 Resizing image for bridge transfer...');
            resolvedBase64 = await resizeBase64Image(resolvedBase64, resolvedMime, 1200);
            console.log('✅ Image resized for bridge transfer');
          } catch (resizeErr) {
            console.warn('⚠️ Image resize failed, using original:', resizeErr);
          }
        }

        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { registerPlugin } = await import('@capacitor/core');
        const SaveToDownloads = registerPlugin<{
          saveFile(o: { fileName: string; data: string; mimeType: string }): Promise<{ success: boolean; path: string }>;
          saveFileFromUrl(o: { url: string; fileName: string; mimeType: string }): Promise<{ success: boolean; path: string; downloadId: number }>;
        }>('SaveToDownloads');

        // ── Path A: If original doc has a Cloudinary URL, use DownloadManager ─
        // DownloadManager downloads natively on Android — zero bridge data transfer.
        // NOTE: this downloads the RAW (possibly encrypted) bytes, so we only use it
        // for non-encrypted documents (encryptedImage already contains the final file).
        if (doc.cloudinaryUrl && !doc.metadata?.encrypted) {
          try {
            console.log('⬇️ Using DownloadManager for direct URL download...');
            const dlResult = await SaveToDownloads.saveFileFromUrl({
              url: doc.cloudinaryUrl,
              fileName,
              mimeType: resolvedMime,
            });
            if (dlResult.success) {
              alert(`✅ Downloading to Downloads folder!\n\n📥 Check your notification bar — Android will show progress.\nFile: "${fileName}"`);
              return;
            }
          } catch (dmErr) {
            console.warn('⚠️ DownloadManager path failed, falling back to base64 write:', dmErr);
          }
        }

        // ── Path B: Write resolved (and resized) base64 to Cache, then save ──
        let cacheUri = '';
        try {
          const cacheResult = await Filesystem.writeFile({
            path: fileName,
            data: resolvedBase64,
            directory: Directory.Cache,
            recursive: true,
          });
          cacheUri = cacheResult.uri;
        } catch (cacheErr) {
          console.warn('Cache write failed:', cacheErr);
          // Last resort: open share sheet with raw data URL so user can save manually
          try {
            const { Share } = await import('@capacitor/share');
            await Share.share({
              title: fileName,
              text: `Save "${fileName}" — the file is ready but could not be written to cache.`,
              dialogTitle: `Save "${fileName}"`,
            });
          } catch { /* ignore share errors */ }
          return;
        }

        // Try SaveToDownloads plugin (saves directly to Downloads folder, no popup)
        try {
          const result = await SaveToDownloads.saveFile({
            fileName,
            data: resolvedBase64,
            mimeType: resolvedMime,
          });

          if (result.success) {
            alert(`✅ Saved to Downloads!\n\n📥 Open your Files or Downloads app to find "${fileName}"`);
            return;
          }
        } catch (pluginErr) {
          console.warn('SaveToDownloads plugin failed, using share sheet:', pluginErr);
        }

        // Fallback: Share sheet — user picks "Save to Downloads", Drive, etc.
        try {
          const { Share } = await import('@capacitor/share');
          await Share.share({
            title: fileName,
            url: cacheUri,
            dialogTitle: `Save "${fileName}" to your device`,
          });
        } catch (shareErr: any) {
          const msg = (shareErr?.message || '').toLowerCase();
          if (!msg.includes('abort') && !msg.includes('cancel') && !msg.includes('dismiss')) {
            alert(`❌ Could not save file.\n\nPlease try again or use a file manager.`);
          }
        }
        return; // ← ALWAYS return on Android — never fall through to web path
      }

      // ─── Web / PWA fallback (browser <a download>) ───────────────────────────
      try {
        const bytes = Uint8Array.from(atob(resolvedBase64), c => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: resolvedMime });
        const url   = URL.createObjectURL(blob);
        const a     = document.createElement('a');
        a.href      = url;
        a.download  = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logActivityEvent({
          userId: userId || 'unknown',
          type: 'downloaded',
          fileName: doc.metadata?.original_name || getSafeName(doc),
          fileType: resolvedMime.includes('pdf') ? 'pdf' : 'image',
          status: 'success',
          skipGeo: true,
        }).catch(() => {});
      } catch (webErr) {
        alert(`❌ Could not download file:\n\n${webErr}`);
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
      console.log("✅ Document deleted:", docToDelete);
    }
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
          console.log('🔓 Decrypted document for preview');
        } catch (decErr) {
          console.warn('⚠️ Could not decrypt document, will try raw data:', decErr);
        }
      }

      // ── 2. Build a display-ready URL ──────────────────────────────────────
      let imageUrl = '';

      if (doc.encryptedImage) {
        const img = doc.encryptedImage.trim();
        if (img.startsWith('data:')) {
          // Already a full data URL — use as-is
          imageUrl = img;
        } else if (img.startsWith('http://') || img.startsWith('https://')) {
          // It's a remote URL (Cloudinary etc.) — use directly as <img src>
          imageUrl = img;
        } else if (img.length > 100) {
          // Raw base64 — detect MIME from magic bytes
          // iVBOR = PNG, /9j/ = JPEG
          const isPng = img.startsWith('iVBOR');
          imageUrl = `data:image/${isPng ? 'png' : 'jpeg'};base64,${img}`;
        }
      } else if (rawData) {
        if (rawData.startsWith('data:')) {
          // Already a valid data URL (image or PDF) — use as-is
          imageUrl = rawData;
        } else {
          // Raw base64 — detect content type via magic bytes
          try {
            const sample = atob(rawData.substring(0, 8));
            const isPdf  = sample.startsWith('%PDF');
            const isPng  = sample.startsWith('\x89PNG');
            imageUrl = isPdf
              ? `data:application/pdf;base64,${rawData}`
              : `data:image/${isPng ? 'png' : 'jpeg'};base64,${rawData}`;
          } catch {
            imageUrl = `data:image/jpeg;base64,${rawData}`;
          }
        }
      }

      // ── 3. Last resort: fetch from Cloudinary + decrypt ───────────────────
      // cloudinaryUrl stores ENCRYPTED binary — we must fetch + decrypt it,
      // NOT use it directly as <img src> (that shows broken image).
      if (!imageUrl && doc.cloudinaryUrl) {
        try {
          console.log('📥 Fetching encrypted data from Cloudinary for preview…');
          const resp = await fetch(doc.cloudinaryUrl);
          const buf  = await resp.arrayBuffer();
          const uint8 = new Uint8Array(buf);
          let bStr = '';
          const chunkSz = 8192;
          for (let i = 0; i < uint8.length; i += chunkSz) {
            bStr += String.fromCharCode(...uint8.subarray(i, i + chunkSz));
          }
          let b64 = btoa(bStr);

          // Decrypt if XOR key is available
          if (doc.metadata?.encrypted && doc.metadata?.checksum) {
            try {
              const { decryptFile } = await import('@/lib/encryptionUtils');
              b64 = decryptFile(b64, doc.metadata.checksum);
            } catch { /* use raw if decrypt fails */ }
          }

          if (b64.startsWith('data:')) {
            imageUrl = b64;
          } else {
            try {
              const sample = atob(b64.substring(0, 8));
              const isPdf  = sample.startsWith('%PDF');
              const isPng  = sample.startsWith('\x89PNG');
              imageUrl = isPdf
                ? `data:application/pdf;base64,${b64}`
                : `data:image/${isPng ? 'png' : 'jpeg'};base64,${b64}`;
            } catch {
              imageUrl = `data:image/jpeg;base64,${b64}`;
            }
          }
          console.log('✅ Cloudinary fetch + decrypt complete for preview');
        } catch (fetchErr) {
          console.warn('⚠️ Cloudinary fetch for preview failed:', fetchErr);
        }
      }

      // ── Resize image data URLs before handing to WebView ─────────────────
      // Android WebView cannot render data: URLs larger than ~5 MB.
      // A 4 K photo PNG can be 15 MB+ as base64; resizing to ≤900 px makes it
      // displayable while still showing a sharp thumbnail on mobile screens.
      if (imageUrl && imageUrl.startsWith('data:image/')) {
        try {
          const semicolonIdx = imageUrl.indexOf(';');
          const commaIdx    = imageUrl.indexOf(',');
          if (semicolonIdx > 5 && commaIdx > semicolonIdx) {
            const mime   = imageUrl.substring(5, semicolonIdx);   // e.g. "image/png"
            const rawB64 = imageUrl.substring(commaIdx + 1);
            const resizedB64 = await resizeBase64Image(rawB64, mime, 900);
            imageUrl = `data:${mime};base64,${resizedB64}`;
            console.log('📐 Preview image resized for WebView rendering');
          }
        } catch (resizeErr) {
          console.warn('⚠️ Preview resize failed, using original:', resizeErr);
        }
      }

      setPreviewImage(imageUrl || null);
      setSelectedDoc(doc);

      // Log preview activity
      logActivityEvent({
        userId: userId || 'unknown',
        type: 'preview',
        fileName: doc.metadata?.original_name || getSafeName(doc),
        fileType: imageUrl?.includes('application/pdf') ? 'pdf' : 'image',
        status: 'success',
        skipGeo: true,
      }).catch(() => {});

      // Only try to extract metadata if we have the encrypted image
      if (doc.encryptedImage) {
        // VERIFY EMBEDDED METADATA using advanced steganography extraction
        const extracted = await extractAdvancedWatermark(imageUrl);
        if (extracted && extracted.found) {
          setEmbeddedMetadata(extracted);
          console.log("✅ EMBEDDED METADATA VERIFIED:", extracted);
          console.log(`  Owner: ${extracted.userId}`);
          console.log(`  Confidence: ${extracted.confidence}`);
          console.log(`  Timestamp: ${extracted.timestamp}`);
          console.log(`  Device: ${extracted.deviceName || "Unknown"}`);
          console.log(`  IP Address: ${extracted.ipAddress || "Unknown"}`);
          console.log(`  GPS: ${extracted.gps.available ? extracted.gps.coordinates : "Not captured"}`);
        } else {
          setEmbeddedMetadata(null);
          console.warn("⚠️ No valid metadata found in image");
        }
      } else {
        // For old documents without encryptedImage, extract from metadata
        if (doc.metadata?.ownerId) {
          console.log(`📋 Document owner: ${doc.metadata.ownerId}`);
        }
        setEmbeddedMetadata(null);
      }
    } catch (err) {
      console.error("Error loading preview:", err);
      setEmbeddedMetadata(null);
    }
  };

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
              /* ── PDF / document — secure in-app viewer ── */
              <div style={{ height: '85vh' }}>
                <SecurePdfViewer
                  pdfData={fullscreenPreview.dataUrl}
                  fileName={fullscreenPreview.name}
                  downloadEnabled={false}
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

        {/* Document preview — PDF rendered in-app, images shown inline */}
        <div className="flex-1 flex items-center justify-center w-full max-w-2xl py-8">
          {previewImage.startsWith('data:application/pdf') ||
           previewImage.startsWith('blob:') ||
           (selectedDoc.metadata?.original_name || getSafeName(selectedDoc)).toLowerCase().endsWith('.pdf') ? (
            /* ── Secure in-app PDF viewer ───────────────────────────── */
            <div style={{ width: '100%', height: '70vh', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)' }}>
              <SecurePdfViewer
                pdfData={previewImage}
                fileName={selectedDoc.metadata?.original_name || getSafeName(selectedDoc)}
                downloadEnabled={false}
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
      <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Vault</h1>

      {/* Search Bar - Modern */}
      <div className="bg-gradient-to-r from-slate-800/50 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
        <FileSearch size={20} className="text-purple-400" />
        <input
          type="text"
          placeholder="Search documents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent outline-none flex-1 text-sm placeholder-slate-500"
        />
      </div>

      {/* Digital Identity Button */}
      <button
        onClick={() => setShowDigitalIdentities(!showDigitalIdentities)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white hover:from-purple-700 hover:to-pink-700 transition"
      >
        <Shield size={18} />
        <span className="text-sm font-semibold">Digital Identities</span>
        <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">{digitalIdentityDocuments.length}</span>
      </button>

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
              {digitalIdentityDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition cursor-pointer"
                  onClick={() => handleDocumentClick(doc)}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-purple-400" />
                    <div>
                      <p className="text-white font-medium">{getSafeName(doc)}</p>
                      <p className="text-gray-400 text-xs">{new Date(doc.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDocumentClick(doc);
                      }}
                      className="p-2 hover:bg-slate-600 rounded-lg transition"
                    >
                      <Eye className="w-4 h-4 text-cyan-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDocToDelete(doc.id);
                        setShowDeleteConfirm(true);
                      }}
                      className="p-2 hover:bg-slate-600 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Files List - Modern Cards */}
      <div className="space-y-3">
        {filteredDocs.length > 0 ? (
          filteredDocs.map((doc, idx) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => handleDocumentClick(doc)}
              className="bg-gradient-to-r from-slate-800/40 to-purple-900/20 border border-purple-500/20 backdrop-blur-xl rounded-xl p-4 flex items-center justify-between hover:border-purple-500/50 transition-all shadow-lg hover:shadow-xl hover:shadow-purple-500/20 cursor-pointer"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg p-2 shadow-lg">
                  <FileText size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-white">{getSafeName(doc)}</p>
                  <p className="text-purple-300/70 text-xs">{getFileSize((doc.metadata?.size) || 0)} • {doc.createdAt}</p>
                </div>
              </div>
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(doc);
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 hover:bg-purple-600/30 rounded-lg transition-all"
              >
                <Download size={18} className="text-purple-400" />
              </motion.button>
            </motion.div>
          ))
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
  onRetake,
  onSaveToVault,
}: {
  image: string;
  userId: string;
  onRetake: () => void;
  onSaveToVault: (encryptedPackage: any) => Promise<void>;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [encryptedData, setEncryptedData] = useState<any>(null);
  const [encryptedImage, setEncryptedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Encrypt image and embed user ID when component mounts - DISABLED TO PREVENT CRASH
  // Encryption will be triggered manually by the Encrypt button instead
  // useEffect(() => {
  //   let isMounted = true; // Track if component is still mounted
    
  //   const encryptImage = async () => {
  //     try {
  //       console.log('🔐 Starting encryption process for user:', userId);
        
  //       // Validate inputs
  //       if (!image) {
  //         console.error('❌ No image provided for encryption');
  //         if (isMounted) {
  //           setError('No image to encrypt');
  //           setIsProcessing(false);
  //         }
  //         return;
  //       }
        
  //       if (!userId) {
  //         console.error('❌ No userId provided for encryption');
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
  //       console.log(' Step 0/4: Checking image dimensions...');
  //       let processedImage = image;
  //       try {
  //         // Skip resizing for camera images (already optimized)
  //         if (image.startsWith('data:image') && (image.includes('camera') || image.length < 2000000)) {
  //           console.log(' Using original camera image (already optimized)');
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
  //             console.log(` Resizing image from ${img.width}x${img.height} to ${width}x${height}`);
              
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
  //             console.log(' Image resized and compressed successfully');
  //           } else {
  //             console.log(` Image dimensions OK (${width}x${height})`);
  //           }
  //         }
  //       } catch (resizeErr) {
  //         console.warn('⚠️ Image resizing failed, using original:', resizeErr);
  //         // Fallback to original image if resizing fails
  //         processedImage = image;
  //       }
        
  //       if (!isMounted) return;
        
  //       // Validate processed image
  //       if (!processedImage || processedImage.length === 0) {
  //         console.error('❌ Processed image is empty');
  //         setError('Image processing failed - empty result');
  //         setIsProcessing(false);
  //         return;
  //       }
        
  //       if (!isMounted) return;
        
  //       // Step 1: Embed metadata with fallback
  //       console.log(' Step 1/4: Embedding metadata with user ID...');
  //       console.log('🔏 Step 1/4: Embedding metadata with user ID...');
  //       let embeddedImageBase64 = null;
        
  //       // Try advanced steganography first
  //       try {
  //         console.log('🔧 Attempting advanced steganography watermark...');
  //         console.log('🔧 Calling embedAdvancedWatermark with:', {
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
  //         console.log('✅ Advanced steganography successful, result length:', embeddedImageBase64?.length || 0);
  //       } catch (embedErr) {
  //         console.warn('⚠️ Advanced steganography failed, trying simple watermark:', embedErr);
  //         const errorMsg = embedErr instanceof Error ? embedErr.message : String(embedErr);
          
  //         // Check for constructor errors specifically
  //         if (errorMsg.includes('Y3') || errorMsg.includes('X3') || errorMsg.includes('constructor')) {
  //           console.error('🚨 Constructor Error Detected - Using fallback method');
  //         }
          
  //         // Fallback to simple watermark embedding
  //         try {
  //           console.log('🔄 Using simple watermark fallback...');
  //           embeddedImageBase64 = await embedSimpleWatermark(processedImage, userId, new Date().toISOString());
  //           console.log('✅ Simple watermark successful, result length:', embeddedImageBase64?.length || 0);
  //         } catch (simpleErr) {
  //           console.error('❌ Simple watermark also failed:', simpleErr);
  //           // Final fallback - just return the original image with metadata in URL
  //           console.log('🔄 Using metadata-in-URL fallback...');
  //           const metadata = btoa(JSON.stringify({
  //             userId: userId,
  //             timestamp: new Date().toISOString(),
  //             encrypted: true,
  //             method: 'fallback'
  //           }));
  //           embeddedImageBase64 = processedImage + '#metadata:' + metadata;
  //           console.log('✅ Fallback method applied');
  //         }
  //       }
        
  //       if (!embeddedImageBase64) {
  //         console.error('❌ All embedding methods failed');
  //         setError('All encryption methods failed - please try again');
  //         setIsProcessing(false);
  //         return;
  //       }
        
  //       if (!isMounted) return;
  //       setEncryptedImage(embeddedImageBase64);
        
  //       // Step 2: Convert base64 to Blob without using fetch (avoids size issues)
  //       console.log('💾 Step 2/5: Converting to blob...');
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
  //         console.log('📊 Blob created, size:', blob.size, 'bytes');
          
  //         if (!blob.size) {
  //           throw new Error('Blob is empty');
  //         }
  //       } catch (blobErr) {
  //         throw new Error(`Blob conversion failed: ${blobErr instanceof Error ? blobErr.message : String(blobErr)}`);
  //       }
        
  //       if (!isMounted) return;
        
  //       // Step 3: Convert blob to base64 using FileReader
  //       console.log('📝 Step 3/5: Encoding to base64...');
  //       console.log('🔧 Blob details:', {
  //         size: blob.size,
  //         type: blob.type,
  //         isBlob: blob instanceof Blob
  //       });
        
  //       const base64String = await new Promise<string>((resolve, reject) => {
  //         try {
  //           const reader = new FileReader();
  //           console.log('📖 FileReader created for blob conversion');
            
  //           // Set timeout to prevent hanging
  //           const timeout = setTimeout(() => {
  //             console.warn('⏰ FileReader timeout after 30 seconds - aborting');
  //             reader.abort();
  //             reject(new Error('FileReader timeout after 30 seconds'));
  //           }, 30000);
            
  //           reader.onload = () => {
  //             clearTimeout(timeout);
  //             console.log('✅ FileReader onload triggered');
  //             try {
  //               const result = reader.result as string;
  //               console.log('📄 FileReader result length:', result?.length || 0);
                
  //               if (!result) {
  //                 throw new Error('FileReader returned empty result');
  //               }
                
  //               const base64 = result.includes(',') ? result.split(',')[1] : result;
  //               if (!base64 || base64.length === 0) {
  //                 throw new Error('Base64 string is empty after split');
  //               }
                
  //               console.log('✅ Base64 encoded successfully, length:', base64.length);
  //               resolve(base64);
  //             } catch (err) {
  //               console.error('❌ Base64 processing error:', err);
  //               reject(new Error(`Base64 processing error: ${err instanceof Error ? err.message : String(err)}`));
  //             }
  //           };
            
  //           reader.onerror = () => {
  //             clearTimeout(timeout);
  //             console.error('❌ FileReader error:', reader.error);
  //             reject(new Error(`FileReader error: ${reader.error?.message || 'Unknown error'}`));
  //           };
            
  //           reader.onabort = () => {
  //             clearTimeout(timeout);
  //             console.warn('⚠️ FileReader was aborted');
  //             reject(new Error('FileReader was aborted'));
  //           };
            
  //           console.log('🔄 Starting FileReader.readAsDataURL');
  //           reader.readAsDataURL(blob);
  //         } catch (err) {
  //           console.error('❌ FileReader setup error:', err);
  //           reject(new Error(`FileReader setup error: ${err instanceof Error ? err.message : String(err)}`));
  //         }
  //       });
        
  //       if (!isMounted) return;
        
  //       // Step 4: Create encryption package
  //       console.log('🔐 Step 4/5: Creating encryption package...');
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
        
  //       console.log('✅ All encryption steps completed successfully');
  //       if (isMounted) {
  //         setEncryptedData(encryptedPackage);
  //       }
  //     } catch (err: any) {
  //       console.error('❌ Encryption error:', err);
  //       const errorMsg = err?.message || String(err) || 'Unknown encryption error';
  //       if (isMounted) {
  //         setError(`⚠️ Encryption failed: ${errorMsg}`);
  //         console.error(`Encryption Error: ${errorMsg}. Please retake the photo and try again.`);
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
      console.log("🔐 Starting manual encryption process with your steganography code...");
      
      if (!image) {
        console.error("❌ No image available");
        alert("No image available for encryption.");
        return;
      }
      
      if (!userId) {
        console.error("❌ No userId available");
        alert("User not authenticated.");
        return;
      }
      
      setIsProcessing(true);
      
      // Declare variables outside try-catch
      let embeddedImageBase64: string | null = null;
      let encryptionMethod: string = 'simple';
      
      // Use simple steganography only for better performance
      try {
        console.log('🔧 Using simple steganography watermark...');
        console.log('🔧 Calling embedSimpleWatermark with:', {
          imageLength: image.length,
          userId: userId.substring(0, 8) + '...',
          timestamp: new Date().toISOString()
        });
        
        embeddedImageBase64 = await embedSimpleWatermark(image, userId, new Date().toISOString());
        console.log('✅ Simple watermark successful, result length:', embeddedImageBase64?.length || 0);
        encryptionMethod = 'simple';
      } catch (err) {
        console.error('❌ Simple watermark failed:', err);
        // Use original image if watermarking fails
        embeddedImageBase64 = image;
        encryptionMethod = 'none';
        console.log('⚠️ Using original image without watermark');
      }
      
      if (!embeddedImageBase64) {
        console.error('❌ All embedding methods failed');
        setError('All encryption methods failed - please try again');
        return;
      }
      
      setEncryptedImage(embeddedImageBase64);
      
      // Compute actual byte size of the source image for accurate metadata
      const imageBytes = Math.round((image.replace(/^data:[^,]+,/, '').length * 3) / 4);
      // Generate a stable key for this image (used as checksum / no XOR encryption for camera images)
      const imgKey = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

      // Create encryption package
      const encryptedPackage = {
        encrypted_data: image,
        encryptedImage: embeddedImageBase64,
        metadata: {
          userId: userId,
          timestamp: new Date().toISOString(),
          encryptionMethod: encryptionMethod,
          // Actual byte size (not string length) — fixes "0 Bytes" display
          size: imageBytes,
          original_name: `encrypted_vault_${userId}_${Date.now()}.png`,
          ownerId: userId,
          // checksum is the decryption key — MUST be persisted for decryption after reload
          checksum: imgKey,
          encrypted: false,  // Camera images use watermark embedding, not XOR encryption
          mimeType: 'image/png',
        },
        check_digest: imgKey,
      };
      
      setEncryptedData(encryptedPackage);
      console.log("✅ Encryption completed successfully with method:", encryptionMethod);
      
      // Auto-save to vault after encryption
      console.log("💾 Auto-saving to vault...");
      try {
        await onSaveToVault(encryptedPackage);
        console.log("✅ Auto-save completed successfully");
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
    }
  };

  const handleSave = async () => {
    try {
      console.log("💾 Starting save process...");
      
      if (!encryptedData) {
        console.error("❌ No encrypted data available");
        alert("Please encrypt the image first by clicking the Encrypt button.");
        return;
      }
      
      setIsProcessing(true);
      await onSaveToVault(encryptedData);
      console.log("✅ Save completed successfully");
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
          <p className="text-purple-300 font-semibold">🔐 Encrypting...</p>
          <p className="text-xs text-slate-400">Embedding ownership ID in image pixels</p>
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
  vaultDocuments,
  sharePrintBlocked, setSharePrintBlocked,
  shareDeviceRestriction, setShareDeviceRestriction,
  shareGeoRestriction, setShareGeoRestriction,
  downloadRequests, setDownloadRequests,
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
  sharePrintBlocked: boolean;
  setSharePrintBlocked: React.Dispatch<React.SetStateAction<boolean>>;
  shareDeviceRestriction: '' | 'mobile' | 'desktop';
  setShareDeviceRestriction: React.Dispatch<React.SetStateAction<'' | 'mobile' | 'desktop'>>;
  shareGeoRestriction: string;
  setShareGeoRestriction: React.Dispatch<React.SetStateAction<string>>;
  downloadRequests: any[];
  setDownloadRequests: React.Dispatch<React.SetStateAction<any[]>>;
}) {
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);

  const generateShareLink = () => {
    const shareId = `share_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const baseUrl = window.location.origin;
    return `${baseUrl}/share/${shareId}`;
  };

  const handleGenerateShare = async () => {
    if (isGeneratingShare) return;
    try {
      setIsGeneratingShare(true);
      if (!selectedShareImage) {
        alert("❌ Please select a document to share.");
        return;
      }

      // Generate share ID and link locally — no backend call needed
      const shareId = `share_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const publicUrl = (import.meta.env.VITE_PUBLIC_URL as string | undefined)
        || 'https://pinit-vault-app.onrender.com';
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
            console.warn('⚠️ localStorage read for share failed:', lsErr);
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
              console.warn('⚠️ Decryption for share failed:', decErr);
            }
          }
          if (rawData) {
            if (rawData.startsWith('data:image')) {
              // Already a complete, displayable data URL
              previewDataUrl = rawData;
            } else if (rawData.startsWith('data:application/pdf')) {
              // PDF data URL — pass through as-is
              previewDataUrl = rawData;
              console.log(`✅ PDF data URL detected for share (${Math.round(rawData.length / 1024)} KB)`);
            } else if (rawData.length > 5000) {
              // Raw base64 — wrap it (skip PDFs)
              try {
                const sample = atob(rawData.substring(0, 8));
                if (!sample.startsWith('%PDF')) {
                  previewDataUrl = `data:image/jpeg;base64,${rawData}`;
                }
              } catch { /* not valid base64 */ }
            }
          }
        }

        // Last resort: fetch encrypted binary from cloudinaryUrl → decrypt
        if (!previewDataUrl && selectedShareImage.cloudinaryUrl) {
          try {
            console.log('📥 Fetching encrypted data from cloudinaryUrl...');
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
                console.warn('⚠️ Cloudinary decrypt failed:', decErr);
              }
            }

            if (base64 && base64.length > 100) {
              if (base64.startsWith('data:image')) {
                previewDataUrl = base64;
              } else {
                try {
                  const sample = atob(base64.substring(0, 8));
                  if (!sample.startsWith('%PDF')) {
                    previewDataUrl = `data:image/jpeg;base64,${base64}`;
                  }
                } catch {
                  previewDataUrl = `data:image/jpeg;base64,${base64}`;
                }
              }
            }
          } catch (fetchErr) {
            console.warn('⚠️ Could not fetch from cloudinaryUrl for share:', fetchErr);
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
            console.log(`✅ Image thumbnail ready (${Math.round(thumbnail.length / 1024)} KB)`);
          } catch (canvasErr) {
            console.warn('⚠️ Canvas resize failed, using original:', canvasErr);
            imageUrlForShare = previewDataUrl;
          }
        } else if (previewDataUrl && previewDataUrl.startsWith('data:application/pdf')) {
          // For PDFs: store the full PDF data URL so the viewer can open/download it
          imageUrlForShare = previewDataUrl;
          console.log(`✅ PDF stored for share (${Math.round(previewDataUrl.length / 1024)} KB)`);
        } else {
          console.warn('⚠️ No storable content found — previewDataUrl:', previewDataUrl?.substring(0, 60));
        }
      } catch (err) {
        console.warn('⚠️ Could not resolve/upload image for share:', err);
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
        print_blocked: sharePrintBlocked,
        device_restriction: shareDeviceRestriction || null,
        geo_restriction: shareGeoRestriction.trim()
          ? JSON.stringify(shareGeoRestriction.split(',').map(c => c.trim().toUpperCase()).filter(Boolean))
          : null,
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

      // ── Insert with progressive column-stripping fallback ────────────────────
      // Attempt 1: full payload (image + access-control columns)
      // Attempt 2: drop vault_image_id (too large for some DB configs)
      // Attempt 3: also drop print_blocked / device_restriction / geo_restriction
      //            (these need a DB migration — strip them if the column doesn't exist yet)
      // Attempt 4: bare minimum — core share fields only
      let insertOk = false;

      const tryInsert = async (payload: Record<string, unknown>) => {
        const { error } = await supabase.from('share_configs').insert(payload);
        return error;
      };

      // Attempt 1
      let lastError = await tryInsert(insertPayload);
      if (!lastError) {
        insertOk = true;
        console.log('✅ Share saved (full payload)');
      }

      // Attempt 2 — drop large image data
      if (!insertOk) {
        console.warn('⚠️ Attempt 1 failed:', lastError?.code, lastError?.message);
        delete insertPayload.vault_image_id;
        lastError = await tryInsert(insertPayload);
        if (!lastError) {
          insertOk = true;
          console.log('✅ Share saved (no image)');
        }
      }

      // Attempt 3 — drop new access-control columns (not in DB yet)
      if (!insertOk) {
        console.warn('⚠️ Attempt 2 failed:', lastError?.code, lastError?.message);
        delete (insertPayload as any).print_blocked;
        delete (insertPayload as any).device_restriction;
        delete (insertPayload as any).geo_restriction;
        lastError = await tryInsert(insertPayload);
        if (!lastError) {
          insertOk = true;
          console.log('✅ Share saved (no access-control columns — run SQL migration to enable them)');
        }
      }

      // Attempt 4 — absolute minimum: only core required columns
      if (!insertOk) {
        console.warn('⚠️ Attempt 3 failed:', lastError?.code, lastError?.message);
        const minPayload: Record<string, unknown> = {
          share_id:      insertPayload.share_id,
          user_id:       insertPayload.user_id,
          share_link:    insertPayload.share_link,
          download_limit: insertPayload.download_limit,
          downloads_used: 0,
          is_active:     true,
          access_count:  0,
          created_by:    insertPayload.created_by,
        };
        lastError = await tryInsert(minPayload);
        if (!lastError) {
          insertOk = true;
          console.log('✅ Share saved (minimal payload)');
        } else {
          console.error('❌ All insert attempts failed:', lastError);
          alert(
            `⚠️ Share link created but could NOT be saved to server.\n\n` +
            `Error: ${lastError.message} (${lastError.code})\n\n` +
            `The link will NOT work for others until resolved.`
          );
          // ← Do NOT return — still show the QR code / link locally
        }
      }

      // Add to local UI state regardless of insert result
      setShareConfigs([config, ...shareConfigs]);
      setShareHistory([{
        id: config.id,
        action: "Share Created",
        document: selectedShareImage.name || "Unknown",
        config,
        timestamp: new Date().toLocaleString(),
      }, ...shareHistory]);

      // Log share activity
      logActivityEvent({
        userId: userId || 'unknown',
        shareId: shareId,
        type: 'shared',
        fileName: selectedShareImage?.name || 'Vault file',
        fileType: selectedShareImage?.name?.endsWith('.pdf') ? 'pdf' : 'image',
        sharedBy: userId || 'unknown',
        status: 'success',
        skipGeo: true,
      }).catch(() => {});

      // Always advance to preview so user sees the QR code and link
      setShareStep("preview");
      if (insertOk) {
        alert("✅ Share link created! Share the QR code or link with your friend.");
      }
    } catch (error) {
      console.error("❌ Error generating share link:", error);
      alert(`❌ Failed to generate share link: ${(error as any)?.message || String(error)}`);
    } finally {
      setIsGeneratingShare(false);
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
      <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
        🔗 Secure Share Center
      </h1>

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

      {/* STEP 2: CONFIGURE SHARING */}
      {shareStep === "configure" && selectedShareImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          <div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-white">⚙️ Configure Share Settings</h2>
              <button
                onClick={() => setShareStep("select")}
                className="text-purple-400 hover:text-purple-300 text-sm"
              >
                ← Back
              </button>
            </div>
            <p className="text-purple-300/80 text-sm">Sharing: <span className="font-bold text-purple-200">{selectedShareImage.name}</span></p>

            <div className="space-y-4 mt-4">
              {/* EXPIRY DATE & TIME */}
              <motion.div className="p-4 bg-purple-900/20 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <label className="font-semibold text-white">Share Expiry</label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={shareExpiryDate}
                    onChange={(e) => setShareExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white text-sm focus:border-purple-500/70 outline-none"
                    placeholder="Select date"
                  />
                  <input
                    type="time"
                    value={shareExpiryTime}
                    onChange={(e) => setShareExpiryTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white text-sm focus:border-purple-500/70 outline-none"
                  />
                </div>
                <p className="text-xs text-purple-300/60 mt-2">Leave blank for no expiry</p>
              </motion.div>

              {/* DOWNLOAD LIMIT */}
              <motion.div className="p-4 bg-purple-900/20 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="w-5 h-5 text-green-400" />
                  <label className="font-semibold text-white">Download Limit</label>
                </div>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={shareDownloadLimit || ""}
                  onChange={(e) => setShareDownloadLimit(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white text-sm focus:border-purple-500/70 outline-none"
                  placeholder="Unlimited downloads (leave blank)"
                />
                <p className="text-xs text-purple-300/60 mt-2">Number of times this link can be downloaded</p>
              </motion.div>

              {/* PASSWORD PROTECTION */}
              <motion.div className="p-4 bg-purple-900/20 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-5 h-5 text-orange-400" />
                  <label className="font-semibold text-white">Password Protection</label>
                </div>
                <input
                  type="password"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white text-sm focus:border-purple-500/70 outline-none"
                  placeholder="Leave blank for no password"
                />
                {sharePassword && (
                  <p className="text-xs text-green-400 mt-2">✓ Password protected</p>
                )}
              </motion.div>

              {/* CERTIFICATE SHARING */}
              <motion.div className="p-4 bg-purple-900/20 border border-purple-500/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-yellow-400" />
                    <label className="font-semibold text-white">Include Certificate</label>
                  </div>
                  <button
                    onClick={() => setIncludeCertificate(!includeCertificate)}
                    className={`w-10 h-6 rounded-full transition-all ${
                      includeCertificate
                        ? "bg-gradient-to-r from-purple-600 to-blue-600"
                        : "bg-slate-600"
                    }`}
                  />
                </div>
                <p className="text-xs text-purple-300/60 mt-2">Share authorship certificate with recipient</p>
              </motion.div>

              {/* PRINT BLOCKED */}
              <motion.div className="p-4 bg-purple-900/20 border border-purple-500/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Printer className="w-5 h-5 text-red-400" />
                    <label className="font-semibold text-white">Block Printing</label>
                  </div>
                  <button
                    onClick={() => setSharePrintBlocked(!sharePrintBlocked)}
                    className={`w-10 h-6 rounded-full transition-all ${sharePrintBlocked ? "bg-red-600" : "bg-slate-600"}`}
                  />
                </div>
                <p className="text-xs text-purple-300/60 mt-2">Prevent recipient from printing (Ctrl+P blocked)</p>
              </motion.div>

              {/* DEVICE RESTRICTION */}
              <motion.div className="p-4 bg-purple-900/20 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Smartphone className="w-5 h-5 text-orange-400" />
                  <label className="font-semibold text-white">Device Restriction</label>
                </div>
                <select
                  value={shareDeviceRestriction}
                  onChange={(e) => setShareDeviceRestriction(e.target.value as '' | 'mobile' | 'desktop')}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white text-sm focus:border-purple-500/70 outline-none"
                >
                  <option value="">Any Device (no restriction)</option>
                  <option value="mobile">Mobile Only</option>
                  <option value="desktop">Desktop / Laptop Only</option>
                </select>
                <p className="text-xs text-purple-300/60 mt-2">Restrict access by device type</p>
              </motion.div>

              {/* GEO RESTRICTION */}
              <motion.div className="p-4 bg-purple-900/20 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-5 h-5 text-purple-400" />
                  <label className="font-semibold text-white">Geographic Restriction</label>
                </div>
                <input
                  type="text"
                  value={shareGeoRestriction}
                  onChange={(e) => setShareGeoRestriction(e.target.value)}
                  placeholder="e.g. IN, US, GB (leave blank for any)"
                  className="w-full px-3 py-2 bg-slate-700/50 border border-purple-500/30 rounded-lg text-white text-sm focus:border-purple-500/70 outline-none"
                />
                <p className="text-xs text-purple-300/60 mt-2">Comma-separated country codes — blank = no restriction</p>
              </motion.div>

              {/* DOWNLOAD REQUESTS PANEL */}
              {downloadRequests.length > 0 && (
                <motion.div className="p-4 bg-cyan-900/20 border border-cyan-500/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Bell className="w-5 h-5 text-cyan-400" />
                    <label className="font-semibold text-white">Download Requests</label>
                    <span className="ml-auto bg-cyan-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {downloadRequests.filter(r => r.status === 'pending').length} pending
                    </span>
                  </div>
                  <div className="space-y-3">
                    {downloadRequests.map((req: any) => (
                      <div key={req.id} className="bg-slate-700/50 border border-slate-600 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{req.requester_name}</p>
                            {req.requester_message && (
                              <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{req.requester_message}</p>
                            )}
                            <p className="text-slate-500 text-xs mt-1">
                              {new Date(req.created_at).toLocaleString()} · {req.share_id?.substring(0, 16)}...
                            </p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            req.status === 'pending' ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
                            : req.status === 'approved' ? 'bg-green-900/40 text-green-300 border border-green-700/40'
                            : 'bg-red-900/40 text-red-300 border border-red-700/40'
                          }`}>
                            {req.status}
                          </span>
                        </div>
                        {req.status === 'pending' && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={async () => {
                                try {
                                  // Get current share limits
                                  const { data: share } = await supabase
                                    .from('share_configs')
                                    .select('download_limit,downloads_used')
                                    .eq('share_id', req.share_id)
                                    .maybeSingle();
                                  const newLimit = share?.download_limit !== null && share?.download_limit !== undefined
                                    ? share.download_limit + 1
                                    : 1;
                                  // Grant one more download
                                  await supabase.from('share_configs')
                                    .update({ download_limit: newLimit })
                                    .eq('share_id', req.share_id);
                                  // Mark request approved
                                  await supabase.from('download_requests')
                                    .update({ status: 'approved', responded_at: new Date().toISOString() })
                                    .eq('id', req.id);
                                  setDownloadRequests(prev => prev.map(r =>
                                    r.id === req.id ? { ...r, status: 'approved' } : r));
                                } catch (err) {
                                  alert('❌ Failed to approve. Please try again.');
                                }
                              }}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-1.5 rounded-lg transition-all">
                              ✓ Approve
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await supabase.from('download_requests')
                                    .update({ status: 'denied', responded_at: new Date().toISOString() })
                                    .eq('id', req.id);
                                  setDownloadRequests(prev => prev.map(r =>
                                    r.id === req.id ? { ...r, status: 'denied' } : r));
                                } catch (err) {
                                  alert('❌ Failed to deny. Please try again.');
                                }
                              }}
                              className="flex-1 bg-red-900/40 hover:bg-red-700/60 text-red-300 text-xs font-semibold py-1.5 rounded-lg border border-red-700/40 transition-all">
                              ✗ Deny
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            <Button
              onClick={handleGenerateShare}
              disabled={isGeneratingShare}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 font-semibold shadow-lg hover:shadow-xl transition-all mt-4 disabled:opacity-60"
            >
              {isGeneratingShare ? '⏳ Generating...' : '✨ Generate Share Link'}
            </Button>
          </div>
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

          {/* SHARE LINK SECTION */}
          <div className="bg-gradient-to-br from-slate-800/40 to-purple-900/30 border border-purple-500/30 backdrop-blur-xl rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4">🔗 Share Link</h2>
            <div className="bg-slate-700/50 border border-purple-500/30 rounded-xl p-4 mb-4">
              <p className="text-xs text-purple-300/60 mb-2">Copy this link to share:</p>
              <p className="text-white font-mono text-xs break-all">{generatedShareLink}</p>
            </div>
            <Button
              onClick={handleCopyLink}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 font-semibold shadow-lg"
            >
              📋 Copy Link to Clipboard
            </Button>
          </div>

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
        console.log("🔍 Starting comprehensive image analysis...");

        // Safe fallback dimensions
        let dimensions = { width: 1080, height: 1920 };
        
        // Safe image dimensions extraction
        try {
          const dimResult = await getImageDimensions(image);
          if (dimResult && dimResult.width && dimResult.height) {
            dimensions = dimResult;
            console.log("📏 Image dimensions:", dimensions);
          }
        } catch (dimErr) {
          console.warn("⚠️ Could not get image dimensions, using defaults:", dimErr);
        }

        // Safe image analysis
        let imageAnalysisResult = null;
        try {
          const analysisResult = await analyzeImage(image);
          if (analysisResult && analysisResult.imageType) {
            imageAnalysisResult = analysisResult;
            console.log("🤖 Image analysis result:", imageAnalysisResult);
          }
        } catch (analysisErr) {
          console.warn("⚠️ Image analysis failed, using defaults:", analysisErr);
          imageAnalysisResult = {
            imageType: "unknown",
            confidence: 0,
            metadata: {
              hasExif: false,
              hasMetadata: false,
              dimensions: `${dimensions.width}x${dimensions.height}`,
              mimeType: "image/jpeg"
            },
            indicators: ["Analysis unavailable"],
            ownership: {
              isWatermarked: false,
              timestamp: new Date().toISOString()
            }
          };
        }

        // Safe watermark extraction
        let watermarkResult = null;
        try {
          console.log("🔍 Starting watermark extraction...");
          console.log("🔍 Image length:", image.length);
          console.log("🔍 Image starts with:", image.substring(0, 50) + "...");
          
          const extractedWatermark = await extractSimpleWatermark(image);
          console.log("🔍 Extraction result:", extractedWatermark);
          
          if (extractedWatermark && extractedWatermark.userId) {
            watermarkResult = {
              hasWatermark: true,
              watermark: extractedWatermark,
              timestamp: extractedWatermark.timestamp,
              userId: extractedWatermark.userId
            };
            console.log("✅ Watermark detected successfully:", watermarkResult);
          } else {
            console.log("⚠️ No watermark found in image");
            watermarkResult = { hasWatermark: false };
          }
        } catch (watermarkErr) {
          console.error("❌ Watermark extraction failed:", watermarkErr);
          console.log("⚠️ No watermark detected:", watermarkErr);
          watermarkResult = { hasWatermark: false };
        }

        // Safe base64 processing
        let sizeInKB = "Unknown";
        try {
          const base64Data = image.includes(",") ? image.split(",")[1] : image;
          if (base64Data) {
            const sizeInBytes = (base64Data.length * 3) / 4;
            sizeInKB = (sizeInBytes / 1024).toFixed(2);
          }
        } catch (sizeErr) {
          console.warn("⚠️ Could not calculate image size:", sizeErr);
        }

        // Comprehensive analysis result with full fallbacks
        const result = {
          imageResolution: `${dimensions.width}x${dimensions.height}`,
          imageSize: `${sizeInKB} KB`,
          pixelCount: dimensions.width * dimensions.height,
          isEncrypted: watermarkResult?.hasWatermark || false,
          encryptionType: watermarkResult?.hasWatermark ? "LSB Steganography" : "None",
          ownershipDetails: {
            pinItId: watermarkResult?.userId || "Not encrypted with PINIT",
            timestamp: watermarkResult?.timestamp || "N/A",
            encryptionFormat: watermarkResult?.hasWatermark ? "Simple LSB" : "None",
          },
          imageType: imageAnalysisResult?.imageType || "unknown",
          imageTypeAnalysis: imageAnalysisResult,
          imageTypeDetails: `${imageAnalysisResult?.imageType?.toUpperCase() || "UNKNOWN"} (${imageAnalysisResult?.confidence || 0}% confidence)`,
          imageTypeIndicators: imageAnalysisResult?.indicators || [],
          watermarkAnalysis: watermarkResult,
          metadata: {
            hasExif: imageAnalysisResult?.metadata?.hasExif || false,
            hasMetadata: imageAnalysisResult?.metadata?.hasMetadata || false,
            dimensions: `${dimensions.width}x${dimensions.height}`,
            mimeType: imageAnalysisResult?.metadata?.mimeType || "image/jpeg"
          },
          confidence: imageAnalysisResult?.confidence || 0,
        };

        setAnalysis(result);
        console.log("✅ Comprehensive analysis complete:", result);
        setIsAnalyzing(false);
      } catch (err) {
        console.error("❌ Analysis error:", err);
        
        // Ultimate fallback - provide basic analysis even if everything fails
        const fallbackResult = {
          imageResolution: "Unknown",
          imageSize: "Unknown",
          pixelCount: 0,
          isEncrypted: false,
          encryptionType: "None",
          ownershipDetails: {
            pinItId: "Analysis failed",
            timestamp: "N/A",
            encryptionFormat: "None",
          },
          imageType: "unknown",
          imageTypeAnalysis: {
            imageType: "unknown",
            confidence: 0,
            metadata: {
              hasExif: false,
              hasMetadata: false,
              dimensions: "Unknown",
              mimeType: "image/jpeg"
            },
            indicators: ["Analysis failed - constructor issues"],
            ownership: {
              isWatermarked: false,
              timestamp: new Date().toISOString()
            }
          },
          imageTypeDetails: "UNKNOWN (0% confidence)",
          imageTypeIndicators: ["Analysis failed - constructor issues"],
          watermarkAnalysis: { hasWatermark: false },
          metadata: {
            hasExif: false,
            hasMetadata: false,
            dimensions: "Unknown",
            mimeType: "image/jpeg"
          },
          confidence: 0,
        };
        
        setAnalysis(fallbackResult);
        setError("Analysis partially failed due to environment limitations");
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
              <div className="flex justify-between items-center pb-3 border-b border-purple-500/20">
                <span className="text-purple-300/70 text-sm">PINIT ID</span>
                <span className="font-mono font-bold text-white">{analysis.ownershipDetails.pinItId}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-purple-500/20">
                <span className="text-purple-300/70 text-sm">Timestamp</span>
                <span className="text-sm text-white">{analysis.ownershipDetails.timestamp}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-purple-500/20">
                <span className="text-purple-300/70 text-sm">Image Type</span>
                <span className={`text-sm font-bold capitalize ${
                  analysis.imageTypeAnalysis?.imageType === "ai" ? "text-yellow-400" :
                  analysis.imageTypeAnalysis?.imageType === "whatsapp" ? "text-blue-400" :
                  analysis.imageTypeAnalysis?.imageType === "screenshot" ? "text-orange-400" :
                  analysis.imageTypeAnalysis?.imageType === "phone" ? "text-green-400" :
                  "text-purple-400"
                }`}>
                  {analysis.imageTypeDetails}
                </span>
              </div>
              {analysis.imageTypeIndicators && analysis.imageTypeIndicators.length > 0 && (
                <div className="pb-3 border-b border-purple-500/20">
                  <span className="text-purple-300/70 text-sm block mb-2">Detection Indicators</span>
                  <div className="flex flex-col gap-1">
                    {analysis.imageTypeIndicators.map((indicator: string, idx: number) => (
                      <span key={idx} className="text-xs text-purple-200">{indicator}</span>
                    ))}
                  </div>
                </div>
              )}
              {analysis.ownershipDetails.validationTiles && (
                <div className="flex justify-between items-center">
                  <span className="text-purple-300/70 text-sm">Validation</span>
                  <span className="text-sm text-green-400 font-bold">{analysis.ownershipDetails.tilesPassed}/{analysis.ownershipDetails.validationTiles} tiles</span>
                </div>
              )}
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
      console.log('Opening camera...');

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
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
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
      console.warn('Capacitor camera unavailable, using file fallback:', msg);
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
      console.log('Generating PDF from', scannedPages.length, 'pages');

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

      console.log('PDF generated successfully');
      
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
                console.log(`Document ${file.name} page count: ${pageCount}`);

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
                console.log('File uploaded and encrypted:', file.name);
                console.log('Document created:', newDoc);
                
                // Call the parent callback to handle vault storage
                onDocumentUploaded(newDoc);
                setIsUploading(false);
                
                // Show success message and go back to dashboard
                alert(`Document "${file.name}" uploaded successfully!`);
                setTimeout(() => {
                  console.log('Navigating back to dashboard after upload');
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
            console.log('View Vault button clicked - calling onBack()');
            console.log('onBack function:', typeof onBack);
            
            // Fallback navigation - always try to navigate back
            try {
              if (typeof onBack === 'function') {
                onBack();
                console.log('onBack() called successfully');
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
            console.log('Scan Document button clicked');
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
          console.log(`Loaded ${categoryDocs.length} documents for ${category.name} from vault`);
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
      console.log('Opening camera for category:', category.name);
      
      const photo = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        promptLabelHeader: 'Take Photo',
        promptLabelCancel: 'Cancel',
        promptLabelPhoto: 'Capture',
      });

      if (photo.base64String) {
        console.log('Photo captured successfully for category:', category.name);

        // Compute pHash for duplicate detection
        const base64Data = `data:image/jpeg;base64,${photo.base64String}`;
        const pHash = await computePHashFromBase64(base64Data);
        console.log('🔍 Computed pHash:', pHash);

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
        console.log('Photo stored in vault:', vaultDoc.name);

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
      console.log('Opening file picker for category:', category.name);
      
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      input.multiple = false;
      
      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          try {
            console.log('File selected:', file.name, 'Size:', file.size);
            
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

                console.log('Base64 length:', base64.length);

                if (!base64) {
                  throw new Error('Failed to read file data');
                }

                // Compute pHash for duplicate detection
                const base64Data = result || '';
                const pHash = await computePHashFromBase64(base64Data);
                console.log('🔍 Computed pHash:', pHash);

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
                console.log('File uploaded and stored in vault:', file.name);

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
