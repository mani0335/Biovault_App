// PDF Generation with jsPDF
// Install with: npm install jspdf

import jsPDF from "jspdf";

export interface PDFGenerationOptions {
  fileName: string;
  compression?: boolean;
  quality?: number;
}

/**
 * Convert array of images to PDF
 * @param imageBase64Array - Array of base64 encoded images
 * @param options - PDF generation options
 * @returns Promise<Blob> - Generated PDF blob
 */
export async function imagesToPDF(
  imageBase64Array: string[],
  options: PDFGenerationOptions
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      if (imageBase64Array.length === 0) {
        throw new Error("No images provided for PDF generation");
      }


      // Create PDF
      // @ts-ignore - jsPDF types
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: options.compression ?? true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let isFirstPage = true;

      imageBase64Array.forEach((imageBase64, index) => {
        try {
          // Remove data URL prefix if present
          const cleanImage = imageBase64.includes(",")
            ? imageBase64.split(",")[1]
            : imageBase64;

          // Calculate dimensions while maintaining aspect ratio
          const img = new Image();
          img.onload = () => {
            const imgWidth = pageWidth;
            const imgHeight = (img.height / img.width) * imgWidth;

            // Fit to page height, adjust width if needed
            let finalWidth = imgWidth;
            let finalHeight = imgHeight;

            if (finalHeight > pageHeight) {
              finalWidth = (pageWidth / imgHeight) * pageHeight;
              finalHeight = pageHeight;
            }

            // Center horizontally
            const xOffset = (pageWidth - finalWidth) / 2;
            const yOffset = (pageHeight - finalHeight) / 2;

            // Add image to PDF
            pdf.addImage(
              imageBase64,
              "JPEG",
              xOffset,
              yOffset,
              finalWidth,
              finalHeight
            );

            // Add new page for next image
            if (index < imageBase64Array.length - 1) {
              pdf.addPage();
            }

            // On last image, save PDF
            if (index === imageBase64Array.length - 1) {
              // Get PDF as blob
              const blob = pdf.output("blob");
              resolve(blob);
            }
          };

          img.onerror = () => {
            reject(new Error(`Failed to load image ${index + 1}`));
          };

          // Set src to trigger onload
          img.src = imageBase64;
        } catch (err) {
          reject(
            new Error(`Failed to process image ${index + 1}: ${err}`)
          );
        }
      });
    } catch (err) {
      reject(new Error(`PDF generation failed: ${err}`));
    }
  });
}

/**
 * Save blob as file download
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert blob to base64
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
