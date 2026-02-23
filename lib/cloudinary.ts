export const uploadToCloudinary = async (file: File | Blob) => {
  const formData = new FormData();

  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET!;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;

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
      throw new Error(errorData.error?.message || "Failed to upload to Cloudinary");
    }

    const data = await response.json();
    return data.secure_url.replace("/upload/", "/upload/f_auto,q_auto/");
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw error;
  }
};