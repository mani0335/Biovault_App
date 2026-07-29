import { Filesystem, Directory } from "@capacitor/filesystem";

/**
 * Ensure PINIT Vault folder exists in device storage
 * Auto-creates if it doesn't exist
 */
export async function ensurePINITVaultFolder(): Promise<{ success: boolean; folderPath?: string; error?: string }> {
  try {
    
    // Try to access the folder first
    try {
      await Filesystem.readdir({
        path: "PINIT Vault",
        directory: Directory.Documents,
      });
      return { success: true, folderPath: "PINIT Vault" };
    } catch (err: any) {
      // Folder doesn't exist, create it
      if (err.message?.includes("not found") || err.code === "ENOENT") {
        
        try {
          await Filesystem.mkdir({
            path: "PINIT Vault",
            directory: Directory.Documents,
            recursive: true,
          });
          return { success: true, folderPath: "PINIT Vault" };
        } catch (mkdirErr) {
          console.error("❌ Failed to create folder:", mkdirErr);
          throw mkdirErr;
        }
      }
      throw err;
    }
  } catch (error) {
    console.error("❌ Folder utility error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Save image to PINIT Vault folder with auto-naming
 */
export async function saveImageToPINITVault(
  base64Data: string,
  fileName: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    // Ensure folder exists
    const folderResult = await ensurePINITVaultFolder();
    if (!folderResult.success) {
      throw new Error(folderResult.error || "Failed to create PINIT Vault folder");
    }

    // Generate unique filename
    const timestamp = new Date().getTime();
    const ext = fileName.split(".").pop() || "jpg";
    const uniqueFileName = `${fileName.replace("." + ext, "")}_${timestamp}.${ext}`;
    const filePath = `PINIT Vault/${uniqueFileName}`;

    // Remove data:image/jpeg;base64, prefix if present
    const cleanBase64 = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;

    // Write file
    const result = await Filesystem.writeFile({
      path: filePath,
      directory: Directory.Documents,
      data: cleanBase64,
    });

    return { success: true, filePath };
  } catch (error) {
    console.error("❌ Save error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
