/**
 * Simple Steganography Module - Fallback for advanced steganography
 * Uses basic LSB steganography with error handling
 */

export interface SimpleWatermarkMetadata {
  userId: string;
  timestamp: string;
  method: 'simple';
}

/**
 * Simple watermark embedding using basic LSB (Least Significant Bit)
 * More reliable than advanced steganography for basic use cases
 */
export async function embedSimpleWatermark(
  imageBase64: string,
  userId: string,
  timestamp: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Check if Image constructor is available
    if (typeof Image === 'undefined') {
      reject(new Error('Image constructor not available'));
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      try {
        console.log('🎨 Starting simple watermark embedding...');
        
        // Check if document and canvas are available
        if (typeof document === 'undefined' || typeof document.createElement === 'undefined') {
          throw new Error('Document or createElement not available');
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get canvas context');

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Create simple message with user ID and timestamp
        const message = `PINIT|${userId}|${timestamp}|END`;
        console.log('📝 Embedding message:', message.substring(0, 20) + '...');

        // Convert message to binary
        const messageBits: number[] = [];
        for (let i = 0; i < message.length; i++) {
          const charCode = message.charCodeAt(i);
          for (let bit = 7; bit >= 0; bit--) {
            messageBits.push((charCode >> bit) & 1);
          }
        }

        // Add message length indicator (16 bits)
        const lengthBits: number[] = [];
        const messageLength = message.length;
        for (let bit = 15; bit >= 0; bit--) {
          lengthBits.push((messageLength >> bit) & 1);
        }

        // Combine length and message bits
        const allBits = [...lengthBits, ...messageBits];

        // Embed bits into image using LSB
        let bitIndex = 0;
        for (let i = 0; i < data.length && bitIndex < allBits.length; i += 4) {
          // Use blue channel for embedding
          data[i + 2] = (data[i + 2] & 0xFE) | allBits[bitIndex];
          bitIndex++;
        }

        ctx.putImageData(imageData, 0, 0);
        // MUST use PNG (lossless) — JPEG compression destroys LSB steganography data
        const watermarkedBase64 = canvas.toDataURL('image/png');

        console.log('✅ Simple watermark embedded successfully (PNG, lossless)');
        resolve(watermarkedBase64);
      } catch (err) {
        console.error('❌ Simple watermark embedding failed:', err);
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for simple watermark'));
    };

    img.src = imageBase64;
  });
}

/**
 * Extract simple watermark from image
 */
export async function extractSimpleWatermark(
  imageBase64: string
): Promise<SimpleWatermarkMetadata | null> {
  return new Promise((resolve) => {
    // Check if Image constructor is available
    if (typeof Image === 'undefined') {
      console.warn('Image constructor not available for watermark extraction');
      resolve(null);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      try {
        console.log('🔍 Starting simple watermark extraction...');
        
        // Check if document and canvas are available
        if (typeof document === 'undefined' || typeof document.createElement === 'undefined') {
          console.warn('Document or createElement not available for watermark extraction');
          resolve(null);
          return;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Extract length bits (first 16 bits)
        const lengthBits: number[] = [];
        for (let i = 0; i < data.length && lengthBits.length < 16; i += 4) {
          lengthBits.push(data[i + 2] & 1);
        }

        // Convert length bits to number
        let messageLength = 0;
        for (let i = 0; i < 16; i++) {
          messageLength = (messageLength << 1) | lengthBits[i];
        }

        // Extract message bits
        const messageBits: number[] = [];
        for (let i = 16 * 4; i < data.length && messageBits.length < messageLength * 8; i += 4) {
          messageBits.push(data[i + 2] & 1);
        }

        // Convert bits to characters
        let message = '';
        for (let i = 0; i < messageBits.length; i += 8) {
          let charCode = 0;
          for (let j = 0; j < 8; j++) {
            charCode = (charCode << 1) | messageBits[i + j];
          }
          message += String.fromCharCode(charCode);
        }

        // Parse message
        console.log('🔍 Extracted message:', message);
        console.log('🔍 Message length:', message.length);
        console.log('🔍 Message format check:', message.substring(0, 20) + '...');
        
        const match = message.match(/^PINIT\|(.+?)\|(.+?)\|END$/);
        console.log('🔍 Regex match result:', match);
        
        if (match) {
          const result: SimpleWatermarkMetadata = {
            userId: match[1],
            timestamp: match[2],
            method: 'simple'
          };
          console.log('✅ Simple watermark extracted successfully');
          console.log('✅ Extracted userId:', result.userId);
          console.log('✅ Extracted timestamp:', result.timestamp);
          resolve(result);
        } else {
          console.warn('⚠️ No valid simple watermark found');
          console.warn('⚠️ Expected format: PINIT|userId|timestamp|END');
          console.warn('⚠️ Actual message:', message);
          resolve(null);
        }
      } catch (err) {
        console.error('❌ Simple watermark extraction failed:', err);
        resolve(null);
      }
    };

    img.onerror = () => {
      console.warn('⚠️ Failed to load image for simple watermark extraction');
      resolve(null);
    };

    img.src = imageBase64;
  });
}

/**
 * Extract metadata from fallback URL method
 */
export function extractFallbackMetadata(imageBase64: string): SimpleWatermarkMetadata | null {
  try {
    const hashIndex = imageBase64.indexOf('#metadata:');
    if (hashIndex === -1) return null;

    const metadataStr = imageBase64.substring(hashIndex + 10);
    const metadata = JSON.parse(atob(metadataStr));
    
    if (metadata.userId && metadata.timestamp) {
      return {
        userId: metadata.userId,
        timestamp: metadata.timestamp,
        method: 'simple'
      };
    }
  } catch (err) {
    console.warn('⚠️ Failed to extract fallback metadata:', err);
  }
  return null;
}
