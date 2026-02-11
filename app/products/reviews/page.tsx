"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import {
  Star,
  Trash2,
  Mail,
  Eye,
  EyeOff,
  Calendar,
  User,
  Search,
  FilterX,
  X,
  MessageSquare,
} from "lucide-react";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";

// Shadcn UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarInset,
  SidebarTrigger,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "sonner";

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const q = query(
      collection(db, "product_reviews"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReviews(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const filteredReviews = reviews.filter((review) => {
    const matchesSearch =
      review.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.comment?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!startDate || !endDate) return matchesSearch;
    const reviewDate = review.createdAt?.toDate();
    if (!reviewDate) return matchesSearch;

    const isWithinDate = isWithinInterval(reviewDate, {
      start: startOfDay(new Date(startDate)),
      end: endOfDay(new Date(endDate)),
    });
    return matchesSearch && isWithinDate;
  });

  const updateProductStats = async (productName: string) => {
    const reviewsRef = collection(db, "product_reviews");
    const qReviews = query(
      reviewsRef,
      where("productName", "==", productName),
      where("status", "==", "shown"),
    );
    const reviewSnapshot = await getDocs(qReviews);

    let totalStars = 0;
    const shownCount = reviewSnapshot.size;
    reviewSnapshot.forEach((doc) => {
      totalStars += doc.data().rating;
    });

    const averageRating = shownCount > 0 ? totalStars / shownCount : 0;
    const productsRef = collection(db, "products");
    const qProducts = query(productsRef, where("name", "==", productName));
    const productSnapshot = await getDocs(qProducts);

    const updatePromises = productSnapshot.docs.map((productDoc) =>
      updateDoc(doc(db, "products", productDoc.id), {
        rating: Number(averageRating.toFixed(1)),
        reviewCount: shownCount,
      }),
    );
    await Promise.all(updatePromises);
  };

  const handleBulkAction = async (action: "show" | "hide" | "delete") => {
    if (
      action === "delete" &&
      !confirm(`Delete ${selectedIds.length} reviews?`)
    )
      return;
    setIsProcessing(true);
    const batch = writeBatch(db);
    const affectedProducts = new Set<string>();

    try {
      for (const id of selectedIds) {
        const review = reviews.find((r) => r.id === id);
        if (!review) continue;
        affectedProducts.add(review.productName);
        const ref = doc(db, "product_reviews", id);
        if (action === "delete") batch.delete(ref);
        else
          batch.update(ref, { status: action === "show" ? "shown" : "hidden" });
      }
      await batch.commit();
      for (const name of Array.from(affectedProducts))
        await updateProductStats(name);
      toast.success(`Bulk ${action} successful`);
      setSelectedIds([]);
    } catch (error) {
      toast.error("Error in bulk operation");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admin">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Product Reviews</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex flex-1 flex-col gap-4 p-4 md:p-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Product Reviews
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage and moderate customer feedback.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                  <div className="flex items-center gap-2 border-r pr-2 mr-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-none"
                      onClick={() => handleBulkAction("show")}
                    >
                      Show
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-none"
                      onClick={() => handleBulkAction("hide")}
                    >
                      Hide
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-none"
                      onClick={() => handleBulkAction("delete")}
                    >
                      Delete
                    </Button>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => {
                    if (selectedIds.length === filteredReviews.length)
                      setSelectedIds([]);
                    else setSelectedIds(filteredReviews.map((r) => r.id));
                  }}
                >
                  {selectedIds.length === filteredReviews.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="col-span-2 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search reviews..."
                  className="pl-8 rounded-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Input
                type="date"
                className="rounded-none"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                type="date"
                className="rounded-none"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredReviews.map((review) => (
                <Card
                  key={review.id}
                  className="rounded-none shadow-none hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedReview(review)}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4">
                    <div
                      className="flex items-center gap-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedIds.includes(review.id)}
                        onCheckedChange={() => {
                          setSelectedIds((prev) =>
                            prev.includes(review.id)
                              ? prev.filter((i) => i !== review.id)
                              : [...prev, review.id],
                          );
                        }}
                      />
                      <div className="space-y-1">
                        <CardTitle className="text-sm font-medium">
                          {review.productName}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {review.customerName}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant={
                        review.status === "shown" ? "default" : "secondary"
                      }
                      className="rounded-none text-[10px]"
                    >
                      {review.status === "shown" ? "LIVE" : "HIDDEN"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex mb-2 gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={12}
                          className={
                            i < review.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground/30"
                          }
                        />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 italic">
                      "{review.comment}"
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {review.createdAt
                          ? format(review.createdAt.toDate(), "MMM dd, yyyy")
                          : "N/A"}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                        View Record
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Dialog
              open={!!selectedReview}
              onOpenChange={(open) => !open && setSelectedReview(null)}
            >
              <DialogContent className="rounded-none max-w-lg">
                {selectedReview && (
                  <>
                    <DialogHeader>
                      <div className="flex gap-0.5 mb-2">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={16}
                            className={
                              i < selectedReview.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground/30"
                            }
                          />
                        ))}
                      </div>
                      <DialogTitle className="text-xl">
                        {selectedReview.productName}
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        Customer: {selectedReview.customerName} •{" "}
                        {selectedReview.customerEmail}
                      </DialogDescription>
                    </DialogHeader>

                    <Separator className="my-2" />

                    <div className="py-4">
                      <p className="text-sm leading-relaxed italic text-foreground">
                        "{selectedReview.comment}"
                      </p>
                    </div>

                    <DialogFooter className="flex gap-2 sm:justify-start">
                      <Button
                        variant="outline"
                        className="rounded-none flex-1"
                        onClick={() => {
                          const newStatus =
                            selectedReview.status === "shown"
                              ? "hidden"
                              : "shown";
                          updateDoc(
                            doc(db, "product_reviews", selectedReview.id),
                            { status: newStatus },
                          ).then(() => {
                            updateProductStats(selectedReview.productName);
                            setSelectedReview(null);
                            toast.success(`Status updated to ${newStatus}`);
                          });
                        }}
                      >
                        {selectedReview.status === "shown"
                          ? "Hide Review"
                          : "Approve Review"}
                      </Button>
                      <Button
                        variant="destructive"
                        className="rounded-none px-8"
                        onClick={() => {
                          if (confirm("Permanently delete this review?")) {
                            deleteDoc(
                              doc(db, "product_reviews", selectedReview.id),
                            ).then(() => {
                              updateProductStats(selectedReview.productName);
                              setSelectedReview(null);
                              toast.success("Deleted");
                            });
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
