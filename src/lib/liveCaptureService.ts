import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export type LiveCaptureMode = 'photo' | 'video' | 'audio' | 'screen';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function requestLiveCapturePermissions(mode: LiveCaptureMode): Promise<void> {
  if (!isNativePlatform()) return;

  if (mode === 'photo' || mode === 'video') {
    const perms = await Camera.checkPermissions();
    if (perms.camera !== 'granted') {
      const req = await Camera.requestPermissions({ permissions: ['camera'] });
      if (req.camera !== 'granted') {
        throw new Error('Camera permission denied');
      }
    }
  }

  if (mode === 'video' || mode === 'audio') {
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        throw new Error('Microphone permission denied');
      }
    }
  }
}

export async function captureNativePhoto(): Promise<{ dataUrl: string; name: string }> {
  await requestLiveCapturePermissions('photo');
  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    saveToGallery: false,
    width: 1024,
    height: 1024,
    correctOrientation: true,
  });
  if (!photo.dataUrl) throw new Error('Photo capture failed');
  return { dataUrl: photo.dataUrl, name: `live_photo_${Date.now()}.jpg` };
}

export function captureViaNativeIntent(
  accept: string,
  capture?: string,
): Promise<{ dataUrl: string; name: string }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => input.remove();

    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        reject(new Error('cancelled'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (!dataUrl) {
          reject(new Error('Failed to read captured file'));
          return;
        }
        resolve({ dataUrl, name: file.name || `live_${Date.now()}` });
      };
      reader.onerror = () => reject(new Error('Failed to read captured file'));
      reader.readAsDataURL(file);
    };

    input.click();
  });
}

export async function captureNativeVideo(): Promise<{ dataUrl: string; name: string }> {
  await requestLiveCapturePermissions('video');
  return captureViaNativeIntent('video/*', 'environment');
}

export async function captureNativeAudio(): Promise<{ dataUrl: string; name: string }> {
  await requestLiveCapturePermissions('audio');
  return captureViaNativeIntent('audio/*', 'microphone');
}

export async function captureNativeScreen(): Promise<{ dataUrl: string; name: string }> {
  return captureViaNativeIntent('video/*');
}

export function getSupportedMimeType(mode: LiveCaptureMode): string {
  const videoTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
    'video/mp4;codecs=avc1',
  ];
  const audioTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];
  const types = mode === 'audio' ? audioTypes : videoTypes;
  if (typeof MediaRecorder === 'undefined') return '';
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export async function getUserMediaStream(mode: LiveCaptureMode): Promise<MediaStream> {
  await requestLiveCapturePermissions(mode);

  const attempts: MediaStreamConstraints[] =
    mode === 'photo'
      ? [{ video: { facingMode: 'environment' } }, { video: true }]
      : mode === 'video'
        ? [
            { video: { facingMode: 'environment' }, audio: true },
            { video: true, audio: true },
          ]
        : [{ audio: true }];

  let lastError: Error | null = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Media access failed');
    }
  }
  throw lastError ?? new Error('Camera/microphone unavailable');
}

export function extensionForMime(mime: string, mode: LiveCaptureMode): string {
  if (mime.includes('mp4')) return mode === 'audio' ? 'm4a' : 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return mode === 'audio' ? 'webm' : 'webm';
}

export function usesNativeCapture(mode: LiveCaptureMode): boolean {
  // Always use in-app camera (getUserMedia + canvas snapshot) even on native
  // platforms. The Capacitor Camera plugin opens a separate Android Activity
  // which can kill the WebView and cause session loss / login redirect.
  // getUserMedia works fine inside Capacitor WebView and keeps everything in-app.
  return false;
}
