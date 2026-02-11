"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  onSnapshot,
  updateDoc,
  query,
  where,
  getDocs,
  getDoc,
} from "firebase/firestore";
import {
  ImagePlus,
  X,
  Loader2,
  AlignLeft,
  Tag,
  Factory,
  LayoutGrid,
  Zap,
  Plus,
  Images,
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

// --- TYPES ---
interface MasterItem {
  id: string;
  name: string;
  websites: string[];
  isTemp?: boolean;
}

interface PendingItem {
  type: "brand" | "category" | "application" | "spec";
  name: string;
  collection: string;
  field: string;
}

interface SpecValue {
  name: string;
  value: string;
}

const DEFAULT_WEBSITE = "Taskflow";

export default function TaskflowAddNewProduct({
  editData,
  onFinished,
}: {
  editData?: any;
  onFinished?: () => void;
}) {
  const CLOUDINARY_UPLOAD_PRESET = "taskflow_preset";
  const CLOUDINARY_CLOUD_NAME = "dvmpn8mjh";

  const [isPublishing, setIsPublishing] = useState(false);

  // FORM STATE
  const [productName, setProductName] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [regPrice, setRegPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");

  // MASTER DATA STATE
  const [availableSpecs, setAvailableSpecs] = useState<MasterItem[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [availableCats, setAvailableCats] = useState<MasterItem[]>([]);
  const [availableBrands, setAvailableBrands] = useState<MasterItem[]>([]);
  const [availableApps, setAvailableApps] = useState<MasterItem[]>([]);

  // NEW ITEM TRACKING
  const pendingItemsRef = useRef<PendingItem[]>([]);

  // SELECTIONS - NOW USING IDs
  const selectedWebs = [DEFAULT_WEBSITE]; // Always use default website
  const [selectedCats, setSelectedCats] = useState<string[]>([]); // Store category IDs
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);

  const [specValues, setSpecValues] = useState<Record<string, string>>({});

  // IMAGES
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [qrImage, setQrImage] = useState<File | null>(null);
  const [existingMainImage, setExistingMainImage] = useState("");
  const [existingGalleryImages, setExistingGalleryImages] = useState<string[]>([]);
  const [existingQrImage, setExistingQrImage] = useState("");

  // --- 1. FETCH MASTER DATA ---
  useEffect(() => {
    const qFilter = where("websites", "array-contains-any", selectedWebs);

    const unsubCats = onSnapshot(
      query(collection(db, "categoriesmaintenance"), qFilter),
      (snap) => {
        setAvailableCats((prev) => mergeWithPending(prev, snap, "category", "title"));
      },
    );

    const unsubBrands = onSnapshot(
      query(collection(db, "brand_name"), qFilter),
      (snap) => {
        setAvailableBrands((prev) => mergeWithPending(prev, snap, "brand", "title"));
      },
    );

    const unsubApps = onSnapshot(
      query(collection(db, "applications"), qFilter),
      (snap) => {
        setAvailableApps((prev) => mergeWithPending(prev, snap, "applications", "title"));
      },
    );

    return () => {
      unsubCats();
      unsubBrands();
      unsubApps();
    };
  }, []);

  // --- FETCH SPECS BASED ON SELECTED CATEGORIES ---
  useEffect(() => {
    if (selectedCats.length === 0) {
      setAvailableSpecs([]);
      setSpecsLoading(false);
      return;
    }

    setSpecsLoading(true);
    const unsubscribers: Array<() => void> = [];
    const specIdsFromCategories = new Set<string>();

    const fetchCategorySpecs = async () => {
      try {
        for (const catId of selectedCats) {
          const catDoc = await getDoc(doc(db, "categoriesmaintenance", catId));
          if (catDoc.exists()) {
            const catData = catDoc.data();
            if (catData.specifications && Array.isArray(catData.specifications)) {
              catData.specifications.forEach((specId: string) => {
                specIdsFromCategories.add(specId);
              });
            }
          }
        }

        if (specIdsFromCategories.size === 0) {
          setAvailableSpecs([]);
          setSpecsLoading(false);
          return;
        }

        const unsubSpecs = onSnapshot(collection(db, "specs"), (specsSnap) => {
          const filteredSpecs = specsSnap.docs
            .filter((doc) => specIdsFromCategories.has(doc.id))
            .map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                name: data.name || "Unnamed",
                websites: [],
              };
            });

          const currentPending = pendingItemsRef.current
            .filter((p) => p.type === "spec")
            .map((p) => ({
              id: `temp-${p.name}`,
              name: p.name,
              websites: selectedWebs,
              isTemp: true,
            }));

          setAvailableSpecs([...filteredSpecs, ...currentPending]);
          setSpecsLoading(false);
        });

        unsubscribers.push(unsubSpecs);
      } catch (error) {
        console.error("Error fetching specs:", error);
        setAvailableSpecs([]);
        setSpecsLoading(false);
      }
    };

    fetchCategorySpecs();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      setSpecsLoading(false);
    };
  }, [selectedCats]);

  // Helper to maintain local pending items in view
  const mergeWithPending = (prev: MasterItem[], snap: any, type: string, fieldKey = "name") => {
    const dbItems = snap.docs.map((d: any) => {
      const raw = d.data();
      return {
        id: d.id,
        name: raw[fieldKey] || raw.name || "Unnamed",
        websites: raw.websites || [],
      } as MasterItem;
    });

    const currentPending = pendingItemsRef.current
      .filter((p) => p.type === type)
      .map((p) => ({
        id: `temp-${p.name}`,
        name: p.name,
        websites: selectedWebs,
        isTemp: true,
      }));

    return [...dbItems, ...currentPending];
  };

  // --- 2. LOAD EDIT DATA ---
  useEffect(() => {
    if (editData) {
      setProductName(editData.name || "");
      setShortDesc(editData.shortDescription || "");
      setItemCode(editData.itemCode || "");
      setRegPrice(editData.regularPrice?.toString() || "");
      setSalePrice(editData.salePrice?.toString() || "");
      setSelectedCats(editData.category ? [editData.category] : []);
      setSelectedBrands(editData.brand ? [editData.brand] : []);
      setSelectedApps(editData.applications || []);
      setExistingMainImage(editData.mainImage || "");
      setExistingGalleryImages(editData.galleryImages || []);
      setExistingQrImage(editData.qrCodeImage || "");
      if (editData.technicalSpecs) {
        const values: Record<string, string> = {};
        editData.technicalSpecs.forEach((s: SpecValue) => {
          values[s.name] = s.value;
        });
        setSpecValues(values);
      }
    }
  }, [editData]);

  // --- 3. HANDLERS ---
  const uploadToCloudinary = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData },
    );
    const data = await res.json();
    return data.secure_url;
  };

  const handleAddItem = (
    type: PendingItem["type"],
    name: string,
    collectionName: string,
    dbField: string,
  ) => {
    if (!name.trim()) return;
    const cleanName = name.trim();

    let listToCheck: MasterItem[] = [];
    if (type === "brand") listToCheck = availableBrands;
    if (type === "category") listToCheck = availableCats;
    if (type === "application") listToCheck = availableApps;
    if (type === "spec") listToCheck = availableSpecs;

    const exists = listToCheck.some(
      (item) => item.name.toLowerCase() === cleanName.toLowerCase(),
    );

    if (exists) {
      toast.error(`"${cleanName}" already exists in ${type}s.`);
      return;
    }

    pendingItemsRef.current.push({
      type,
      name: cleanName,
      collection: collectionName,
      field: dbField,
    });

    const newItem: MasterItem = {
      id: `temp-${cleanName}`,
      name: cleanName,
      websites: selectedWebs,
      isTemp: true,
    };

    if (type === "brand") {
      setAvailableBrands((prev) => [...prev, newItem]);
      setSelectedBrands((prev) => [...prev, `temp-${cleanName}`]);
    } else if (type === "category") {
      setAvailableCats((prev) => [...prev, newItem]);
      setSelectedCats((prev) => [...prev, `temp-${cleanName}`]);
    } else if (type === "application") {
      setAvailableApps((prev) => [...prev, newItem]);
      setSelectedApps((prev) => [...prev, `temp-${cleanName}`]);
    } else if (type === "spec") {
      setAvailableSpecs((prev) => [...prev, newItem]);
      setSpecValues((prev) => ({ ...prev, [cleanName]: "" }));
    }
  };

  const handlePublish = async () => {
    if (!productName) return toast.error("Please enter a product name!");

    setIsPublishing(true);
    const publishToast = toast.loading("Validating...");

    try {
      // A. CHECK FOR DUPLICATE PRODUCT NAME
      const dupQuery = query(collection(db, "products"), where("name", "==", productName));
      const dupSnap = await getDocs(dupQuery);

      const isDuplicate = dupSnap.docs.some((docSnap) => {
        if (editData && docSnap.id === editData.id) return false;
        const data = docSnap.data();
        const productWebsites = data.website || [];
        return productWebsites.some((w: string) => selectedWebs.includes(w));
      });

      if (isDuplicate) {
        toast.dismiss(publishToast);
        toast.error("This product name already exists on Taskflow.");
        setIsPublishing(false);
        return;
      }

      // B. SAVE PENDING TAGS AND TRACK NEW IDs
      const pendingIdMap: Record<string, string> = {};

      if (pendingItemsRef.current.length > 0) {
        toast.loading("Saving new tags...", { id: publishToast });

        for (const item of pendingItemsRef.current) {
          const payload: any = {
            websites: selectedWebs,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          payload[item.field] = item.name;

          if (item.type === "application") {
            payload.isActive = true;
            payload.imageUrl = "";
            payload.description = "";
          }

          const docRef = await addDoc(collection(db, item.collection), payload);
          pendingIdMap[`temp-${item.name}`] = docRef.id;
        }

        pendingItemsRef.current = [];
      }

      // C. UPLOAD IMAGES
      toast.loading("Uploading images...", { id: publishToast });
      const mainUrl = mainImage ? await uploadToCloudinary(mainImage) : existingMainImage;
      const qrUrl = qrImage ? await uploadToCloudinary(qrImage) : existingQrImage;
      const uploadedGallery = await Promise.all(galleryImages.map(uploadToCloudinary));

      // D. PREPARE SPECS
      const technicalSpecs = Object.entries(specValues)
        .filter(([_, val]) => val.trim() !== "")
        .map(([name, value]) => ({ name, value }));

      // E. RESOLVE IDs (replace temp IDs with real ones)
      const resolveCategoryId = (catId: string) => pendingIdMap[catId] || catId;
      const resolveBrandId = (brandId: string) => pendingIdMap[brandId] || brandId;
      const resolveAppIds = (appIds: string[]) => appIds.map((id) => pendingIdMap[id] || id);

      // F. SAVE PRODUCT
      const payload = {
        name: productName,
        shortDescription: shortDesc,
        itemCode: itemCode,
        regularPrice: Number(regPrice) || 0,
        salePrice: Number(salePrice) || 0,
        technicalSpecs,
        mainImage: mainUrl,
        qrCodeImage: qrUrl,
        galleryImages: [...existingGalleryImages, ...uploadedGallery],
        website: selectedWebs,
        category: selectedCats[0] ? resolveCategoryId(selectedCats[0]) : "",
        brand: selectedBrands[0] ? resolveBrandId(selectedBrands[0]) : "",
        applications: resolveAppIds(selectedApps),
        updatedAt: serverTimestamp(),
      };

      if (editData?.id) {
        await updateDoc(doc(db, "products", editData.id), payload);
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      toast.success("Product Saved Successfully!", { id: publishToast });

      if (onFinished) {
        onFinished();
      }
    } catch (err) {
      console.error(err);
      toast.error("Error saving product", { id: publishToast });
    } finally {
      setIsPublishing(false);
    }
  };

  // Drag & Drop Hooks
  const onDropMain = useCallback((files: File[]) => {
    if (files[0]) setMainImage(files[0]);
  }, []);
  const { getRootProps: getMainRootProps, getInputProps: getMainInputProps } = useDropzone({
    onDrop: onDropMain,
    maxFiles: 1,
  });

  const onDropGallery = useCallback((files: File[]) => {
    setGalleryImages((prev) => [...prev, ...files]);
  }, []);
  const { getRootProps: getGalleryRootProps, getInputProps: getGalleryInputProps } = useDropzone({
    onDrop: onDropGallery,
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 min-h-screen">
      <div className="md:col-span-2 space-y-6">
        {/* UNIFIED MEDIA ASSETS CARD */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Images className="h-4 w-4" />
              Media Assets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. Main Image */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Main Product Image
                </Label>
                <div
                  {...getMainRootProps()}
                  className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[160px] flex flex-col items-center justify-center"
                >
                  <input {...getMainInputProps()} />
                  {mainImage || existingMainImage ? (
                    <div className="relative w-full h-full group">
                      <img
                        src={mainImage ? URL.createObjectURL(mainImage) : existingMainImage}
                        className="w-full h-full object-contain rounded"
                        alt="Main product"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMainImage(null);
                          setExistingMainImage("");
                        }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg hover:bg-destructive/90 z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <ImagePlus className="h-8 w-8 mb-2 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">Main Image</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. QR Code */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">QR Code</Label>
                <QrDropzone
                  file={qrImage}
                  existingUrl={existingQrImage}
                  onRemove={() => {
                    setQrImage(null);
                    setExistingQrImage("");
                  }}
                  onDrop={(files) => {
                    if (files[0]) setQrImage(files[0]);
                  }}
                />
              </div>

              {/* 3. Gallery Dropzone */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Add Gallery Images
                </Label>
                <div
                  {...getGalleryRootProps()}
                  className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[160px] flex flex-col items-center justify-center"
                >
                  <input {...getGalleryInputProps()} />
                  <div className="flex flex-col items-center">
                    <Images className="h-8 w-8 mb-2 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">Drop Gallery Here</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Multi-select supported
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Gallery Grid */}
            {(existingGalleryImages.length > 0 || galleryImages.length > 0) && (
              <div className="pt-4 border-t">
                <Label className="text-xs font-medium text-muted-foreground mb-3 block">
                  Gallery Preview
                </Label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {existingGalleryImages.map((img, i) => (
                    <div
                      key={`exist-${i}`}
                      className="aspect-square relative border rounded-md overflow-hidden shadow-sm group"
                    >
                      <img src={img || "/placeholder.svg"} className="object-cover w-full h-full" alt={`Gallery ${i + 1}`} />
                      <button
                        onClick={() =>
                          setExistingGalleryImages((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {galleryImages.map((img, i) => (
                    <div
                      key={`new-${i}`}
                      className="aspect-square relative border rounded-md overflow-hidden shadow-sm group"
                    >
                      <img src={URL.createObjectURL(img) || "/placeholder.svg"} className="object-cover w-full h-full" alt={`New gallery ${i + 1}`} />
                      <button
                        onClick={() =>
                          setGalleryImages((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GENERAL INFO & SPECS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <AlignLeft className="h-4 w-4" />
              General Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Product Name</Label>
              <Input
                className="h-12 text-base font-semibold"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Enter product name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Short Description</Label>
              <Input
                className="h-12"
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                placeholder="Brief product description"
              />
            </div>

            {/* SPECS SECTION */}
            {selectedCats.length > 0 && (
              <div className="pt-6 border-t">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">Technical Specifications</Label>
                  </div>
                  <AddCustomItem
                    placeholder="New Spec Name..."
                    onAdd={(name) => handleAddItem("spec", name, "specs", "name")}
                    disabled={false}
                  />
                </div>

                {specsLoading ? (
                  <div className="p-8 text-center bg-muted/30 rounded-lg border-2 border-dashed flex items-center justify-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-xs font-medium text-muted-foreground">
                      Loading specifications...
                    </p>
                  </div>
                ) : availableSpecs.length === 0 ? (
                  <div className="p-8 text-center bg-muted/30 rounded-lg border-2 border-dashed">
                    <p className="text-xs font-medium text-muted-foreground">
                      No specs available for selected category
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {availableSpecs.map((spec) => (
                      <div
                        key={spec.id}
                        className={`space-y-1.5 p-3 rounded-lg border ${
                          spec.isTemp ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                        }`}
                      >
                        <Label className="text-xs font-medium flex justify-between">
                          {spec.name}
                          {spec.isTemp && (
                            <span className="text-primary text-[10px]">(New)</span>
                          )}
                        </Label>
                        <Input
                          placeholder={`Enter ${spec.name}...`}
                          className="h-9 text-sm"
                          value={specValues[spec.name] || ""}
                          onChange={(e) =>
                            setSpecValues((prev) => ({
                              ...prev,
                              [spec.name]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SIDEBAR */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-center">Classification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <SidebarList
              label="Product Family"
              icon={<Tag className="h-3 w-3" />}
              items={availableCats}
              selected={selectedCats}
              disabled={false}
              onToggle={(id: string) =>
                setSelectedCats((prev) =>
                  prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
                )
              }
              onAdd={(name: string) =>
                handleAddItem("category", name, "categoriesmaintenance", "title")
              }
            />
            <SidebarList
              label="Brand"
              icon={<Factory className="h-3 w-3" />}
              items={availableBrands}
              selected={selectedBrands}
              disabled={false}
              onToggle={(id: string) =>
                setSelectedBrands((prev) =>
                  prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
                )
              }
              onAdd={(name: string) => handleAddItem("brand", name, "brand_name", "title")}
            />
            <SidebarList
              label="Applications"
              icon={<LayoutGrid className="h-3 w-3" />}
              items={availableApps}
              selected={selectedApps}
              disabled={false}
              onToggle={(id: string) =>
                setSelectedApps((prev) =>
                  prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
                )
              }
              onAdd={(name: string) => handleAddItem("application", name, "applications", "title")}
            />
          </CardContent>
        </Card>

        {/* PRICING & SKU */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Regular Price</Label>
                <Input
                  className="h-9 font-semibold"
                  value={regPrice}
                  onChange={(e) => setRegPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Sale Price</Label>
                <Input
                  className="h-9 font-semibold text-destructive"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Item Code</Label>
              <Input
                className="h-9 font-mono"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                placeholder="SKU-000"
              />
            </div>
          </CardContent>
        </Card>

        <Button
          disabled={isPublishing}
          onClick={handlePublish}
          className="w-full h-14 text-base font-semibold"
        >
          {isPublishing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Publishing...
            </>
          ) : editData ? (
            "Update Product"
          ) : (
            "Publish Product"
          )}
        </Button>
      </div>
    </div>
  );
}

// --- SUBCOMPONENTS ---
function SidebarList({ label, icon, items, selected, onToggle, onAdd, disabled }: any) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          {icon}
          <Label className="text-xs font-medium">{label}</Label>
        </div>
      </div>

      <div className="space-y-1 max-h-48 overflow-y-auto pr-2 min-h-[50px]">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">No items found.</p>
        ) : (
          items.map((item: MasterItem) => {
            const isSelected = selected.includes(item.id);
            return (
              <div
                key={item.id}
                onClick={() => onToggle(item.id)}
                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-muted/50"
                } ${item.isTemp ? "bg-primary/5 border border-primary/30" : ""}`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(item.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className={`text-sm font-medium ${
                    isSelected ? "text-primary" : "text-foreground"
                  } ${item.isTemp ? "italic" : ""}`}
                >
                  {item.name} {item.isTemp && "*"}
                </span>
              </div>
            );
          })
        )}
      </div>

      {!disabled && (
        <div className="pt-2 border-t">
          <AddCustomItem placeholder={`Add ${label}...`} onAdd={onAdd} disabled={disabled} />
        </div>
      )}
    </div>
  );
}

function AddCustomItem({
  placeholder,
  onAdd,
  disabled,
}: {
  placeholder: string;
  onAdd: (val: string) => void;
  disabled: boolean;
}) {
  const [val, setVal] = useState("");
  const handleAdd = () => {
    if (val.trim()) {
      onAdd(val.trim());
      setVal("");
    }
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        disabled={disabled}
        placeholder={placeholder}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        className="h-8 text-xs"
      />
      <Button
        disabled={disabled || !val.trim()}
        size="icon"
        variant="ghost"
        onClick={handleAdd}
        className="h-8 w-8 hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function QrDropzone({
  file,
  existingUrl,
  onDrop,
  onRemove,
}: {
  file: File | null;
  existingUrl: string;
  onDrop: (files: File[]) => void;
  onRemove: () => void;
}) {
  const { getRootProps, getInputProps } = useDropzone({ onDrop, maxFiles: 1 });
  return (
    <div
      {...getRootProps()}
      className="relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-accent/50 transition-all h-[160px] flex flex-col items-center justify-center"
    >
      <input {...getInputProps()} />
      {file || existingUrl ? (
        <div className="relative w-full h-full group">
          <img
            src={file ? URL.createObjectURL(file) : existingUrl}
            className="w-full h-full object-contain rounded"
            alt="QR Code"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg hover:bg-destructive/90 z-10"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <Zap className="h-8 w-8 mb-2 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">QR Code</p>
        </div>
      )}
    </div>
  );
}