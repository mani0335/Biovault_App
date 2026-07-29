import React, { useState, useRef, useEffect } from 'react';
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
  Award,
  BarChart3,
  AlertTriangle,
  Shield,
  Zap,
} from 'lucide-react';
import { computePHash } from '@/lib/phash';
import {
  embedUUIDAdvanced,
  extractUUIDAdvanced,
  computeSHA256,
  getCaptureTime,
  getDeviceFingerprint,
  getPublicIP,
} from '@/lib/cryptoUtils';
import {
  generateAssetId,
  generateAuthorshipCertificateId,
  saveCertificate,
  createShareLink,
} from '@/lib/sharingUtils';
import { analyzeImageMetrics, classifyImage, ForensicsMetrics, ClassificationResult } from '@/lib/forensicsUtils';
import { logActivity } from '@/lib/activityUtils';

interface ImageCryptoFullProps {
  userId?: string;
  onBack?: () => void;
}

export const ImageCryptoFull: React.FC<ImageCryptoFullProps> = ({ userId = 'user', onBack }) => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showForensics, setShowForensics] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const img = new Image();
      img.onload = async () => {
        // ✅ FIX: Resize large images to prevent memory overflow
        let width = img.width;
        let height = img.height;
        const maxWidth = 1920;
        const maxHeight = 1080;
        
        // Calculate resize ratio if image is too large
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const imageDataObj = ctx.getImageData(0, 0, width, height);

          // Forensics analysis
          const metrics = analyzeImageMetrics(canvas);
          const classification = classifyImage(canvas, file.name, metrics);

          // Generate IDs
          const assetId = generateAssetId(imageDataObj);
          const deviceId = getDeviceFingerprint();
          const certId = generateAuthorshipCertificateId(userId, deviceId);
          const pHash = computePHash(canvas);
          const fileHash = await computeSHA256(file);

          // Get metadata
          const captureTime = await getCaptureTime(file);
          const ipAddress = await getPublicIP();

          // Embed metadata
          const embeddedImageData = embedUUIDAdvanced(
            imageDataObj,
            userId,
            { available: false },
            { deviceId, deviceName: 'Browser' },
            ipAddress,
            Date.now(),
            'Browser',
            'API',
            'None',
            width,
            height
          );

          canvas.width = width;
          canvas.height = height;
          ctx.putImageData(embeddedImageData, 0, 0);
          // PNG is mandatory — JPEG lossy compression destroys the embedded LSBs
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
            dimensions: `${width}x${height}`,
            captureTime: captureTime.dateString,
            encryptedImageData,
            classification,
            metrics,
          });

          // Log activity
          logActivity(userId, 'encrypt', file.name, assetId, 'Image encrypted successfully', 'success', {
            classification: classification.detectedCase,
            confidence: classification.confidence,
          });
        }
      };
      img.src = imageData;
    } catch (error) {
      console.error('Error processing image:', error);
      setResult({ success: false, error: `Failed to process image: ${String(error)}` });
      logActivity(userId, 'encrypt', file?.name || 'unknown', 'unknown', String(error), 'failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateCertificate = () => {
    if (!result) return;

    saveCertificate(
      {
        assetId: result.assetId,
        authorshipCertificateId: result.certificateId,
        uniqueUserId: userId,
        assetFileSize: result.fileSize,
        assetResolution: result.dimensions,
        timestamp: new Date().toISOString(),
        deviceId: result.deviceId,
        confidence: result.classification.confidence,
        ownershipInfo: 'Verified',
      },
      uploadedImage || ''
    );

    setResult((prev: any) => ({ ...prev, certificateGenerated: true }));
    logActivity(userId, 'certificate', result.fileName, result.assetId, 'Certificate generated', 'success');
  };

  const handleCreateShareLink = () => {
    if (!result || !uploadedImage) return;

    const link = createShareLink(result.assetId, userId, uploadedImage, result.fileName);
    setShareToken(link.shareToken);

    logActivity(userId, 'share', result.fileName, result.assetId, `Share link created: ${link.shareToken}`, 'success');
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

    logActivity(userId, 'download', result.fileName, result.assetId, 'Encrypted image downloaded', 'success');
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'emerald';
      case 'medium':
        return 'amber';
      case 'high':
        return 'orange';
      case 'critical':
        return 'red';
      default:
        return 'slate';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-300" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-400" />
            Cryptographic Image Analysis
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
            <p className="text-slate-300 font-medium">Click to upload image</p>
            <p className="text-slate-500 text-sm mt-1">Supported: PNG, JPG, WebP, GIF</p>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
        </motion.div>

        {/* Processing State */}
        {isProcessing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center items-center py-12">
            <Loader className="w-8 h-8 text-blue-400 animate-spin" />
            <span className="ml-3 text-slate-300">Analyzing image forensics...</span>
          </motion.div>
        )}

        {/* Result Section */}
        <AnimatePresence>
          {result && !isProcessing && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>
              {result.success ? (
                <div className="space-y-4">
                  {/* Classification Banner */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`bg-${getRiskColor(result.classification.riskLevel)}-900/30 border border-${getRiskColor(result.classification.riskLevel)}-700 rounded-xl p-4`}
                  >
                    <div className="flex items-start gap-3">
                      {result.classification.riskLevel === 'low' ? (
                        <CheckCircle className={`w-5 h-5 text-${getRiskColor(result.classification.riskLevel)}-400 flex-shrink-0 mt-0.5`} />
                      ) : (
                        <AlertTriangle className={`w-5 h-5 text-${getRiskColor(result.classification.riskLevel)}-400 flex-shrink-0 mt-0.5`} />
                      )}
                      <div>
                        <p className={`text-${getRiskColor(result.classification.riskLevel)}-300 font-bold text-lg`}>
                          {result.classification.detectedCase}
                        </p>
                        <p className={`text-${getRiskColor(result.classification.riskLevel)}-200/70 text-sm mt-1`}>
                          Confidence: {result.classification.confidence.toFixed(0)}%
                        </p>
                        <p className={`text-${getRiskColor(result.classification.riskLevel)}-200/70 text-sm mt-2`}>
                          Risk Level: <span className="font-semibold uppercase">{result.classification.riskLevel}</span>
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Image Preview */}
                  {uploadedImage && (
                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                      <img src={uploadedImage} alt="Analysis" className="w-full h-64 object-contain rounded-lg" />
                    </div>
                  )}

                  {/* Forensics Summary */}
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-slate-200 font-semibold flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-400" />
                        Forensic Analysis
                      </h3>
                      <button
                        onClick={() => setShowForensics(!showForensics)}
                        className="text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {showForensics ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {showForensics && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <MetricCard label="Variance" value={result.metrics.variance.toFixed(2)} max={1000} />
                        <MetricCard label="Noise" value={result.metrics.noiseLevel.toFixed(2)} max={2} />
                        <MetricCard label="Entropy" value={result.metrics.entropy.toFixed(2)} max={8} />
                        <MetricCard label="Smooth Blocks" value={(result.metrics.smoothBlockRatio * 100).toFixed(1) + '%'} />
                        <MetricCard label="Edge Coherence" value={(result.metrics.edgeCoherence * 100).toFixed(1) + '%'} />
                        <MetricCard label="Uniformity" value={(result.metrics.uniformityRatio * 100).toFixed(1) + '%'} />
                      </div>
                    )}

                    {/* Reasoning */}
                    {result.classification.reasoning.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-700">
                        <p className="text-xs uppercase text-slate-500 font-semibold mb-2">Analysis Reasoning</p>
                        <ul className="space-y-1">
                          {result.classification.reasoning.map((reason: string, i: number) => (
                            <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                              <span className="text-blue-400 mt-1">•</span>
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <motion.div initial={false} animate={{ height: showMetadata ? 'auto' : 0, opacity: showMetadata ? 1 : 0 }} className="overflow-hidden">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
                      <MetadataRow label="Asset ID" value={result.assetId} />
                      <MetadataRow label="Certificate" value={result.certificateId} />
                      <MetadataRow label="pHash" value={result.pHash?.substring(0, 30) + '...'} />
                      <MetadataRow label="Device" value={result.deviceId} />
                      <MetadataRow label="Dimensions" value={result.dimensions} />
                      <MetadataRow label="File Size" value={result.fileSize} />
                    </div>
                  </motion.div>

                  <button
                    onClick={() => setShowMetadata(!showMetadata)}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {showMetadata ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showMetadata ? 'Hide' : 'Show'} Metadata
                  </button>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={downloadEncryptedImage}
                      className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 text-sm"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </button>

                    <button
                      onClick={handleCreateCertificate}
                      disabled={result.certificateGenerated}
                      className={`${result.certificateGenerated ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-600 hover:bg-purple-700 text-white'} py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 text-sm`}
                    >
                      <Award className="w-3 h-3" />
                      {result.certificateGenerated ? 'Certified' : 'Certify'}
                    </button>

                    <button
                      onClick={handleCreateShareLink}
                      disabled={!!shareToken}
                      className={`${shareToken ? 'bg-green-900/30 text-green-300' : 'bg-green-600 hover:bg-green-700 text-white'} py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 text-sm`}
                    >
                      <Share2 className="w-3 h-3" />
                      {shareToken ? 'Shared' : 'Share'}
                    </button>
                  </div>

                  {/* Share Link Display */}
                  {shareToken && (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                      <p className="text-slate-300 font-medium mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        Share Link Ready
                      </p>
                      <div className="bg-slate-700 rounded-lg p-3 flex items-center justify-between">
                        <span className="text-slate-300 text-sm truncate">{`${window.location.origin}/share/${shareToken}`}</span>
                        <button
                          onClick={copyShareToken}
                          className="ml-2 p-2 hover:bg-slate-600 rounded transition-colors"
                        >
                          <Copy className={`w-4 h-4 ${copySuccess ? 'text-emerald-400' : 'text-slate-400'}`} />
                        </button>
                      </div>
                      {copySuccess && <p className="text-emerald-400 text-sm mt-2 flex items-center gap-1">✓ Copied!</p>}
                    </div>
                  )}
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

// ─── Helper Components ──
const MetricCard: React.FC<{ label: string; value: string; max?: number }> = ({ label, value, max }) => (
  <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
    <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</p>
    <p className="text-slate-200 font-semibold">{value}</p>
  </div>
);

const MetadataRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between text-sm border-b border-slate-700 pb-2 last:border-0">
    <span className="text-slate-400">{label}</span>
    <span className="text-slate-200 font-mono text-xs break-all text-right">{value}</span>
  </div>
);

export default ImageCryptoFull;
