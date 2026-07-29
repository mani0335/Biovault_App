import * as faceapi from '@vladmandic/face-api';

// Models served from jsDelivr CDN (same version as installed package)
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model';

let modelsLoaded = false;
let modelLoadingPromise: Promise<void> | null = null;

export async function loadFaceDetectionModel(): Promise<void> {
  if (modelsLoaded) return;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
    } catch (err) {
      modelsLoaded = false;
      modelLoadingPromise = null;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Face model loading failed: ${msg}. Check your internet connection.`);
    }
  })();

  return modelLoadingPromise;
}

export interface FaceDetectionResult {
  hasFace: boolean;
  faceCount: number;
  confidence: number;
  // 128-dim descriptor from trained recognition net — robust to glasses/hair/lighting
  descriptor: Float32Array | null;
  // Eye Aspect Ratio based open/closed detection
  eyesOpen: boolean;
  irisVisible: boolean;
  error?: string;
}

const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  scoreThreshold: 0.45,
  inputSize: 320,
});

// Eye Aspect Ratio: if > 0.18 eyes are open
function calcEAR(eye: faceapi.Point[]): number {
  const d = (a: faceapi.Point, b: faceapi.Point) => Math.hypot(a.x - b.x, a.y - b.y);
  return (d(eye[1], eye[5]) + d(eye[2], eye[4])) / (2 * d(eye[0], eye[3]));
}

// Check if iris is roughly centered (not looking too far sideways)
function checkIrisCentered(eye: faceapi.Point[]): boolean {
  const eyeCenterX = (eye[0].x + eye[3].x) / 2;
  const eyeWidth = Math.abs(eye[3].x - eye[0].x);
  const irisCenterX = eye.reduce((s, p) => s + p.x, 0) / eye.length;
  return Math.abs(irisCenterX - eyeCenterX) / (eyeWidth || 1) < 0.3;
}

function empty(error: string): FaceDetectionResult {
  return { hasFace: false, faceCount: 0, confidence: 0, descriptor: null, eyesOpen: false, irisVisible: false, error };
}

export async function detectFaceInVideo(video: HTMLVideoElement): Promise<FaceDetectionResult> {
  if (!modelsLoaded) return empty('Models not loaded yet');
  if (video.readyState < 2) return empty('Video not ready');

  try {
    // Quick count check before full pipeline
    const all = await faceapi.detectAllFaces(video, DETECTOR_OPTIONS);
    if (!all || all.length === 0) {
      return empty('No face detected. Move closer and ensure good lighting.');
    }
    if (all.length > 1) {
      return empty(`${all.length} faces detected — only one person should be in the frame.`);
    }

    // Full pipeline: detection + 68 landmarks + 128-dim recognition descriptor
    const result = await faceapi
      .detectSingleFace(video, DETECTOR_OPTIONS)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!result) return empty('Face detection failed. Please try again.');

    const leftEye = result.landmarks.getLeftEye();
    const rightEye = result.landmarks.getRightEye();
    const leftEAR = calcEAR(leftEye);
    const rightEAR = calcEAR(rightEye);
    const eyesOpen = leftEAR > 0.18 && rightEAR > 0.18;
    const irisVisible = eyesOpen && checkIrisCentered(leftEye) && checkIrisCentered(rightEye);

    return {
      hasFace: true,
      faceCount: 1,
      confidence: result.detection.score,
      descriptor: result.descriptor,
      eyesOpen,
      irisVisible,
    };
  } catch {
    return empty('Face detection error. Please try again.');
  }
}

export function isFaceSuitableForRegistration(result: FaceDetectionResult): boolean {
  return result.hasFace && result.confidence >= 0.6 && result.descriptor !== null;
}

export function getFaceQualityScore(result: FaceDetectionResult): { score: number; quality: string } {
  if (!result.hasFace) return { score: 0, quality: 'No face detected' };
  const pct = Math.round(result.confidence * 100);
  const quality =
    pct >= 90 ? 'Perfect' :
    pct >= 80 ? 'Great' :
    pct >= 70 ? 'Good' :
    pct >= 60 ? 'Fair' : 'Poor';
  return { score: pct, quality };
}

/**
 * Euclidean distance between two 128-dim face descriptors.
 * Same person: typically 0.0–0.45
 * Different people: typically 0.6–1.2
 * Recommended threshold: 0.5
 */
export function faceEuclideanDistance(a: number[] | Float32Array, b: number[] | Float32Array): number {
  const fa = a instanceof Float32Array ? a : new Float32Array(a);
  const fb = b instanceof Float32Array ? b : new Float32Array(b);
  let sq = 0;
  for (let i = 0; i < fa.length; i++) sq += (fa[i] - fb[i]) ** 2;
  return Math.sqrt(sq);
}

export function isSameFace(
  a: number[] | Float32Array,
  b: number[] | Float32Array,
  threshold = 0.5
): boolean {
  return faceEuclideanDistance(a, b) <= threshold;
}

export async function disposeModels(): Promise<void> {
  modelsLoaded = false;
  modelLoadingPromise = null;
}
