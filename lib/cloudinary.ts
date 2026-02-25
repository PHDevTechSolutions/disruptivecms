export const uploadToCloudinary = async (
  file: File | Blob,
): Promise<string> => {
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Cloudinary is not configured. Make sure NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and " +
        "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET are set in your .env.local file.",
    );
  }

  // Use 'raw' resource type for PDFs, 'image' for everything else
  const isPdf =
    (file instanceof File && file.type === "application/pdf") ||
    (file instanceof Blob && file.type === "application/pdf");
  const resourceType = isPdf ? "raw" : "image";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.error?.message || "Failed to upload to Cloudinary",
    );
  }

  const data = await response.json();

  // f_auto/q_auto only makes sense for images — skip for raw PDFs
  return isPdf
    ? data.secure_url
    : data.secure_url.replace("/upload/", "/upload/f_auto,q_auto/");
};
