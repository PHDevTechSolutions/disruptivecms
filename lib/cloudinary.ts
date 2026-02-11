// lib/cloudinary.ts

/**
 * CLIENT-SIDE UPLOAD (Browser)
 * Ginagamit ang fetch para iwasan ang 'fs' error sa Next.js
 */
export const uploadToCloudinary = async (file: File) => {
  const formData = new FormData();
  
  // Gamitin natin yung details na binigay mo
  const uploadPreset = "taskflow_preset"; 
  const cloudName = "dvmpn8mjh";

  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error.message || "Failed to upload to Cloudinary");
    }

    const data = await response.json();
    
    // I-return ang optimized URL
    return data.secure_url.replace("/upload/", "/upload/f_auto,q_auto/");
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw error;
  }
};
