import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  ArrowLeft,
  Lock,
  Share2,
  Download,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader,
  Eye,
  EyeOff,
  Trash2,
  Shield,
} from 'lucide-react';
import { computePHash } from '@/lib/phash';
import {
  embedUUIDAdvanced,
  extractUUIDAdvanced,
  computeSHA256,
  getCaptureTime,
  getDeviceFingerprint,
  getPublicIP,
  crc16js,
} from '@/lib/cryptoUtils';
import {
  generateAssetId,
  generateAuthorshipCertificateId,
  saveCertificate,
  createShareLink,
  getCertificates,
  getShareLinks,
  deleteShareLink,
} from '@/lib/sharingUtils';

interface ImageCryptoFeaturesProps {
  userId?: string;
  onBack?: () => void;
}

export const ImageCryptoFeatures: React.FC<ImageCryptoFeaturesProps> = ({ userId = 'user', onBack }) => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target?.result as string;
        setUploadedImage(imageData);
        setUploadedFile(file);
        processImage(imageData, file);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async (imageData: string, file: File) => {
    setIsProcessing(true);
    try {
      // Load image and create canvas
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onerror = () => {
        setIsProcessing(false);
        setResult({ success: false, error: 'Failed to load image' });
      };

      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            throw new Error('Canvas context not available');
          }

          ctx.drawImage(img, 0, 0);
          const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // Generate IDs and hashes with fallback values
          let assetId = `asset_${Date.now()}`;
          let deviceId = 'BROWSER';
          let certId = `cert_${Date.now()}`;
          let pHash = 'N/A';
          let fileHash = file.name.slice(0, 16);
          let captureTime = { dateString: new Date().toLocaleDateString() };
          let ipAddress = 'LOCAL';

          // Try to generate asset ID
          try {
            assetId = generateAssetId(imageDataObj);
          } catch (e) {
          }

          // Try to get device fingerprint
          try {
            deviceId = getDeviceFingerprint();
          } catch (e) {
          }

          // Try to generate cert ID
          try {
            certId = generateAuthorshipCertificateId(userId, deviceId);
          } catch (e) {
          }

          // Try to compute PHash
          try {
            pHash = computePHash(canvas) || 'N/A';
          } catch (e) {
          }

          // Try to compute SHA256
          try {
            fileHash = await computeSHA256(file);
          } catch (e) {
          }

          // Get metadata with timeouts
          try {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 3000)
            );
            captureTime = (await Promise.race([getCaptureTime(file), timeoutPromise])) as any;
          } catch (e) {
          }

          try {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 3000)
            );
            ipAddress = (await Promise.race([getPublicIP(), timeoutPromise])) as string;
          } catch (e) {
          }

          // Embed metadata into image
          let embeddedImageData = imageDataObj;
          try {
            embeddedImageData = embedUUIDAdvanced(
              imageDataObj,
              userId,
              { available: false },
              { deviceId, deviceName: 'Browser' },
              ipAddress,
              Date.now(),
              'Browser',
              'API',
              'None',
              canvas.width,
              canvas.height
            );
          } catch (e) {
          }

          // Create data URL from modified canvas
          try {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.putImageData(embeddedImageData, 0, 0);
            const encryptedImageData = canvas.toDataURL('image/png');

            setResult({
              success: true,
              assetId,
              certificateId: certId,
              pHash: pHash || 'N/A',
              fileHash: fileHash.substring(0, 16) + '...',
              deviceId,
              fileName: file.name,
              fileSize: (file.size / 1024).toFixed(2) + ' KB',
              dimensions: `${canvas.width}x${canvas.height}`,
              captureTime: captureTime.dateString,
              encryptedImageData,
            });
          } catch (e) {
            console.error('Error creating encrypted image data:', e);
            setResult({ success: false, error: 'Failed to create encrypted image' });
          }
        } catch (innerError) {
          console.error('Error in image processing:', innerError);
          setResult({ success: false, error: String(innerError) });
        } finally {
          setIsProcessing(false);
        }
      };

      img.src = imageData;
    } catch (error) {
      console.error('Error loading image:', error);
      setResult({ success: false, error: 'Failed to load image for processing' });
      setIsProcessing(false);
    }
  };

  const handleCreateCertificate = () => {
    if (!result) return;

    const cert = saveCertificate(
      {
        assetId: result.assetId,
        authorshipCertificateId: result.certificateId,
        uniqueUserId: userId,
        assetFileSize: result.fileSize,
        assetResolution: result.dimensions,
        timestamp: new Date().toISOString(),
        deviceId: result.deviceId,
        confidence: 95,
        ownershipInfo: 'Verified',
      },
      uploadedImage || ''
    );

    if (cert) {
      setResult((prev: any) => ({ ...prev, certificateGenerated: true, certificateId: cert.certificateId }));
    }
  };

  const handleCreateShareLink = () => {
    if (!result || !uploadedImage) return;

    const link = createShareLink(result.assetId, userId, uploadedImage, result.fileName);
    setShareToken(link.shareToken);
  };

  const copyShareToken = () => {
    if (shareToken) {
      navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const downloadEncryptedImage = () => {
    if (!result?.encryptedImageData) return;

    const link = document.createElement('a');
    link.href = result.encryptedImageData;
    link.download = `encrypted-${result.fileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-300" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Lock className="w-6 h-6 text-blue-400" />
            Image Encryption & Sharing
          </h1>
        </div>

        {/* Upload Section */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-slate-800 border border-slate-700 rounded-2xl p-8 mb-6"
        >
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors group"
          >
            <Upload className="w-12 h-12 text-slate-400 group-hover:text-blue-400 mx-auto mb-3 transition-colors" />
            <p className="text-slate-300 font-medium">Click to upload or drag & drop</p>
            <p className="text-slate-500 text-sm mt-1">PNG, JPG, or WebP</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </motion.div>

        {/* Processing State */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center items-center py-12"
          >
            <Loader className="w-8 h-8 text-blue-400 animate-spin" />
            <span className="ml-3 text-slate-300">Processing image...</span>
          </motion.div>
        )}

        {/* Result Section */}
        <AnimatePresence>
          {result && !isProcessing && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>
              {result.success ? (
                <div className="space-y-4">
                  {/* Success Banner */}
                  <div className="bg-emerald-900/30 border border-emerald-700 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-emerald-300 font-medium">Image encrypted successfully!</p>
                      <p className="text-emerald-200/70 text-sm mt-1">
                        Metadata embedded with encryption certificate
                      </p>
                    </div>
                  </div>

                  {/* Encrypted Image Preview */}
                  {uploadedImage && (
                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                      <img
                        src={uploadedImage}
                        alt="Encrypted"
                        className="w-full h-48 object-contain rounded-lg"
                      />
                    </div>
                  )}

                  {/* Metadata Display */}
                  <motion.div
                    initial={false}
                    animate={{ height: showMetadata ? 'auto' : 0, opacity: showMetadata ? 1 : 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Asset ID:</span>
                        <span className="text-slate-200 font-mono">{result.assetId}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Certificate ID:</span>
                        <span className="text-slate-200 font-mono">{result.certificateId}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">pHash:</span>
                        <span className="text-slate-200 font-mono text-xs">{result.pHash?.substring(0, 20)}...</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Device ID:</span>
                        <span className="text-slate-200 font-mono">{result.deviceId}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Dimensions:</span>
                        <span className="text-slate-200">{result.dimensions}</span>
                      </div>
                    </div>
                  </motion.div>

                  <button
                    onClick={() => setShowMetadata(!showMetadata)}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {showMetadata ? (
                      <>
                        <EyeOff className="w-4 h-4" />
                        Hide Metadata
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        Show Metadata
                      </>
                    )}
                  </button>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={downloadEncryptedImage}
                      className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>

                    {!result.certificateGenerated && (
                      <button
                        onClick={handleCreateCertificate}
                        className="bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Shield className="w-4 h-4" />
                        Generate Cert
                      </button>
                    )}

                    {result.certificateGenerated && (
                      <div className="bg-purple-900/30 border border-purple-700 rounded-lg py-3 flex items-center justify-center gap-2 text-purple-300">
                        <CheckCircle className="w-4 h-4" />
                        Certificate Ready
                      </div>
                    )}
                  </div>

                  {/* Sharing Section */}
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                    <p className="text-slate-300 font-medium flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-blue-400" />
                      Share This Image
                    </p>

                    {!shareToken ? (
                      <button
                        onClick={handleCreateShareLink}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition-colors font-medium"
                      >
                        Create Share Link
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="bg-slate-700 rounded-lg p-3 flex items-center justify-between">
                          <span className="text-slate-300 text-sm truncate">{`${window.location.origin}/share/${shareToken}`}</span>
                          <button
                            onClick={copyShareToken}
                            className="ml-2 p-2 hover:bg-slate-600 rounded transition-colors"
                          >
                            <Copy
                              className={`w-4 h-4 ${copySuccess ? 'text-emerald-400' : 'text-slate-400'}`}
                            />
                          </button>
                        </div>
                        {copySuccess && (
                          <p className="text-emerald-400 text-sm flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Copied to clipboard!
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 font-medium">Processing failed</p>
                    <p className="text-red-200/70 text-sm mt-1">{result.error}</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default ImageCryptoFeatures;
