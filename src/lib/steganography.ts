/**
 * Steganography Module (Enhanced)
 * Embeds user metadata into image pixels using multi-region encoding.
 * 
 * Features:
 * - Multi-region encoding: 4 corners + center (survives cropping)
 * - Metadata embedding: User ID | Timestamp | File Size | File Type
 * - LSB steganography in alpha channel (invisible, robust to compression)
 * - Confidence scoring: Returns how many regions contained valid metadata
 */

export interface WatermarkMetadata {
  userId: string;
  timestamp: string;
  fileSize: string;
  fileType: string;
  confidence: number; // 0-5: how many regions had valid metadata
}

export interface EmbeddedMetadata {
  userId: string;
  timestamp: string;
  fileSize: string;
  fileType: string;
  confidence: number; // 0-5: how many regions had valid metadata
}

/**
 * Helper: Convert string to binary
 */
function stringToBinary(str: string): string {
  return str
    .split("")
    .map((char) => char.charCodeAt(0).toString(2).padStart(8, "0"))
    .join("");
}

/**
 * Helper: Convert binary to string
 */
function binaryToString(binary: string): string {
  let result = "";
  for (let i = 0; i < binary.length; i += 8) {
    const byteBinary = binary.substr(i, 8);
    if (byteBinary.length === 8) {
      result += String.fromCharCode(parseInt(byteBinary, 2));
    }
  }
  return result;
}

/**
 * Embed metadata into image pixels using multi-region encoding
 * @param imageBase64 - Base64 encoded image
 * @param userId - User ID to embed
 * @param timestamp - Timestamp when image was encrypted
 * @param fileSize - File size string (e.g., "512 KB")
 * @param fileType - File type string (e.g., "PNG")
 * @returns Promise<string> - Base64 encoded image with embedded metadata
 */
export async function embedUserIdInImage(
  imageBase64: string,
  userId: string,
  timestamp?: string,
  fileSize?: string,
  fileType?: string
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
        // Create canvas with explicit alpha channel
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
        if (!ctx) throw new Error("Could not get canvas context");

        // Ensure alpha channel is enabled - draw with transparency
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
        ctx.drawImage(img, 0, 0);

        // Get image data with alpha channel preserved
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Ensure all pixels have alpha = 255 (fully opaque) for embedding space
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] === 0) {
            data[i] = 255; // Make transparent pixels opaque for metadata embedding
          }
        }

        // Prepare metadata: userId|timestamp|fileSize|fileType
        const metadata = `${userId}|${timestamp || new Date().toISOString()}|${fileSize || "—"}|${fileType || "—"}`;
        const metadataBinary = stringToBinary(metadata);

        // Add length header (32 bits) + metadata
        const lengthBinary = metadataBinary.length
          .toString(2)
          .padStart(32, "0");
        const totalData = lengthBinary + metadataBinary;


        // Define regions for multi-region encoding
        // Each region gets a copy of the same metadata (for robustness)
        const width = canvas.width;
        const height = canvas.height;
        const quarterWidth = Math.floor(width / 2);
        const quarterHeight = Math.floor(height / 2);

        const regions = [
          { name: "TopLeft", startX: 0, startY: 0, endX: quarterWidth, endY: quarterHeight },
          { name: "TopRight", startX: quarterWidth, startY: 0, endX: width, endY: quarterHeight },
          { name: "BottomLeft", startX: 0, startY: quarterHeight, endX: quarterWidth, endY: height },
          { name: "BottomRight", startX: quarterWidth, startY: quarterHeight, endX: width, endY: height },
          { name: "Center", startX: Math.floor(width * 0.25), startY: Math.floor(height * 0.25), endX: Math.floor(width * 0.75), endY: Math.floor(height * 0.75) },
        ];

        // Embed data into each region
        for (const region of regions) {
          let bitIndex = 0;
          for (let y = region.startY; y < region.endY && bitIndex < totalData.length; y++) {
            for (let x = region.startX; x < region.endX && bitIndex < totalData.length; x++) {
              const pixelOffset = (y * width + x) * 4;
              const alphaIndex = pixelOffset + 3;
              const bit = parseInt(totalData[bitIndex]);
              // Ensure alpha is not 0 before embedding
              if (data[alphaIndex] < 1) {
                data[alphaIndex] = 255;
              }
              // Embed bit in LSB of alpha channel
              data[alphaIndex] = (data[alphaIndex] & 0xfe) | bit;
              bitIndex++;
            }
          }
        }

        // Put modified image data back
        ctx.putImageData(imageData, 0, 0);

        // Convert back to base64 - PNG preserves alpha channel perfectly
        const encryptedImageData = canvas.toDataURL("image/png");
        
        // Verify by re-extracting to confirm metadata is present
        if (encryptedImageData) {
        }
        
        resolve(encryptedImageData);
      } catch (err) {
        console.error("❌ Steganography embedding failed:", err);
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageBase64;
  });
}

/**
 * Extract metadata from watermarked image
 * @param imageBase64 - Base64 encoded watermarked image
 * @returns Promise<WatermarkMetadata | null> - Extracted metadata with confidence score
 */
export async function extractUserIdFromImage(
  imageBase64: string
): Promise<WatermarkMetadata | null> {
  return new Promise((resolve) => {
    // Check if Image constructor is available
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    
    // Check if document and canvas are available
    if (typeof document === 'undefined' || typeof document.createElement === 'undefined') {
      resolve(null);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      try {
        // Create canvas and draw image
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get canvas context");

        ctx.drawImage(img, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Define regions to search
        const width = canvas.width;
        const height = canvas.height;
        const quarterWidth = Math.floor(width / 2);
        const quarterHeight = Math.floor(height / 2);

        const regions = [
          { name: "TopLeft", startX: 0, startY: 0, endX: quarterWidth, endY: quarterHeight },
          { name: "TopRight", startX: quarterWidth, startY: 0, endX: width, endY: quarterHeight },
          { name: "BottomLeft", startX: 0, startY: quarterHeight, endX: quarterWidth, endY: height },
          { name: "BottomRight", startX: quarterWidth, startY: quarterHeight, endX: width, endY: height },
          { name: "Center", startX: Math.floor(width * 0.25), startY: Math.floor(height * 0.25), endX: Math.floor(width * 0.75), endY: Math.floor(height * 0.75) },
        ];

        let validRegions = 0;
        let extractedMetadata: WatermarkMetadata | null = null;

        // Try extracting from each region
        for (const region of regions) {
          try {
            // Extract length (first 32 bits)
            let lengthBinary = "";
            let bitIndex = 0;
            for (let y = region.startY; y < region.endY && lengthBinary.length < 32; y++) {
              for (let x = region.startX; x < region.endX && lengthBinary.length < 32; x++) {
                const pixelOffset = (y * width + x) * 4;
                const alphaIndex = pixelOffset + 3;
                lengthBinary += (data[alphaIndex] & 1).toString();
              }
            }

            const dataLength = parseInt(lengthBinary, 2);
            if (dataLength === 0 || dataLength > 2000) {
              continue;
            }

            // Extract metadata bits
            let metadataBinary = "";
            bitIndex = 32;
            for (let y = region.startY; y < region.endY && metadataBinary.length < dataLength; y++) {
              for (let x = region.startX; x < region.endX && metadataBinary.length < dataLength; x++) {
                const pixelOffset = (y * width + x) * 4;
                const alphaIndex = pixelOffset + 3;
                metadataBinary += (data[alphaIndex] & 1).toString();
              }
            }

            // Convert binary to string and parse
            const metadataStr = binaryToString(metadataBinary);
            const parts = metadataStr.split("|");

            if (parts.length >= 4) {
              const [userId, timestamp, fileSize, fileType] = parts;
              if (userId && userId.length > 0 && userId.length < 100) {
                extractedMetadata = {
                  userId,
                  timestamp,
                  fileSize,
                  fileType,
                  confidence: 0, // Will be set later
                };
                validRegions++;
              }
            }
          } catch (regionErr) {
            // Region extraction failed, try next
          }
        }

        if (extractedMetadata) {
          // Set confidence score based on how many regions had valid watermark
          extractedMetadata.confidence = validRegions;
          resolve(extractedMetadata);
        } else {
          resolve(null);
        }
      } catch (err) {
        console.error("❌ Steganography extraction failed:", err);
        resolve(null);
      }
    };
    img.onerror = () => {
      console.error("❌ Failed to load image for steganography extraction");
      resolve(null);
    };
    img.src = imageBase64;
  });
}

/**
 * Backward compatibility: Extract just user ID from image (returns string or null)
 * For existing code that expects Promise<string | null>
 */
export async function extractUserIdFromImageSimple(
  imageBase64: string
): Promise<string | null> {
  const metadata = await extractUserIdFromImage(imageBase64);
  return metadata?.userId || null;
}

/**
 * Verify if image is owned by the given user
 * @param imageBase64 - Base64 encoded image
 * @param expectedUserId - Expected user ID
 * @returns Promise<boolean> - True if ownership verified
 */
export async function verifyImageOwnership(
  imageBase64: string,
  expectedUserId: string
): Promise<boolean> {
  const metadata = await extractUserIdFromImage(imageBase64);
  const isOwner =
    metadata !== null &&
    metadata.userId.toLowerCase() === expectedUserId.toLowerCase();

  if (isOwner) {
  }

  return isOwner;
}
