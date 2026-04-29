"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  User,
  Calendar,
  Tag,
  Database,
  Loader2,
  Package,
  Hash,
  Layers,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  approveRequest,
  rejectRequest,
  PendingRequest,
  resolveProductName,
  resolveProductMeta,
} from "@/lib/requestService";
import { useAuth } from "@/lib/useAuth";
import { hasAccess } from "@/lib/rbac";
import { Timestamp, doc, updateDoc } from "@/lib/firestore/client";
import { db } from "@/lib/firebase";

// ─── Types ─────────────────────────────────────────────────────────────────────

type DiffKind = "changed" | "added" | "removed" | "unchanged";

interface FieldRow {
  kind: DiffKind;
  label: string;
  before: string;
  after: string;
}

interface SpecItemRow {
  kind: DiffKind;
  name: string;
  before: string;
  after: string;
}

interface SpecGroupSection {
  kind: DiffKind; // overall group status
  groupName: string;
  rows: SpecItemRow[];
}

interface DiffResult {
  fieldRows: FieldRow[];
  specSections: SpecGroupSection[];
  hasChanges: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  itemDescription: "Item Description",
  shortDescription: "Short Description",
  litItemCode: "LIT Item Code",
  ecoItemCode: "ECO Item Code",
  productFamily: "Product Family",
  productClass: "Product Class",
  productUsage: "Product Usage",
  regularPrice: "Regular Price",
  salePrice: "Sale Price",
  status: "Status",
  slug: "URL Slug",
  brand: "Brand",
  brands: "Brands",
  website: "Websites",
  websites: "Websites",
  applications: "Applications",
  mainImage: "Main Image",
  rawImage: "Raw Image",
  qrCodeImage: "QR Code Image",
  tdsFileUrl: "TDS File",
  dimensionDrawingImage: "Dimension Drawing",
  mountingHeightImage: "Mounting Height",
  driverCompatibilityImage: "Driver Compatibility",
  baseImage: "Base Image",
  illuminanceLevelImage: "Illuminance Level",
  wiringDiagramImage: "Wiring Diagram",
  installationImage: "Installation Image",
  wiringLayoutImage: "Wiring Layout",
  terminalLayoutImage: "Terminal Layout",
  accessoriesImage: "Accessories Image",
};

const SKIP_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "id",
  "importSource",
  "shopifyProductId",
  "technicalSpecs",
  "seo",
  "galleryImages",
]);

// ─── Utilities ──────────────────────────────────────────────────────────────────

function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  try {
    return format(ts.toDate(), "MMM d, yyyy · h:mm a");
  } catch {
    return "—";
  }
}

function serializeValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.length === 0 ? "" : v.map(String).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]));
}

// ─── Diff logic ─────────────────────────────────────────────────────────────────

function computeDiff(
  before: Record<string, any>,
  after: Record<string, any>,
): DiffResult {
  const fieldRows: FieldRow[] = [];
  const specSections: SpecGroupSection[] = [];

  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;
    // deduplicate website/websites and brand/brands — keep only the array form
    if (key === "website" && allKeys.has("websites")) continue;
    if (key === "brand" && allKeys.has("brands")) continue;

    const bRaw = before?.[key];
    const aRaw = after?.[key];
    const label = FIELD_LABELS[key] ?? key;

    // Arrays
    if (Array.isArray(bRaw) || Array.isArray(aRaw)) {
      const bArr = Array.isArray(bRaw) ? bRaw : bRaw ? [bRaw] : [];
      const aArr = Array.isArray(aRaw) ? aRaw : aRaw ? [aRaw] : [];
      const bStr = serializeValue(bArr);
      const aStr = serializeValue(aArr);
      const kind: DiffKind = arraysEqual(bArr, aArr)
        ? "unchanged"
        : !bStr && aStr
          ? "added"
          : bStr && !aStr
            ? "removed"
            : "changed";
      fieldRows.push({ kind, label, before: bStr, after: aStr });
      continue;
    }

    const bStr = serializeValue(bRaw);
    const aStr = serializeValue(aRaw);
    const kind: DiffKind =
      bStr === aStr
        ? "unchanged"
        : !bStr && aStr
          ? "added"
          : bStr && !aStr
            ? "removed"
            : "changed";
    fieldRows.push({ kind, label, before: bStr, after: aStr });
  }

  // technicalSpecs
  if (
    before?.technicalSpecs !== undefined ||
    after?.technicalSpecs !== undefined
  ) {
    const bSpecs: any[] = before?.technicalSpecs ?? [];
    const aSpecs: any[] = after?.technicalSpecs ?? [];

    const bMap = new Map<string, any[]>(
      bSpecs.map((g) => [g.specGroup ?? g.name ?? "", g.specs ?? []]),
    );
    const aMap = new Map<string, any[]>(
      aSpecs.map((g) => [g.specGroup ?? g.name ?? "", g.specs ?? []]),
    );

    const allGroups = new Set([...bMap.keys(), ...aMap.keys()]);

    for (const groupName of allGroups) {
      const bItems: any[] = bMap.get(groupName) ?? [];
      const aItems: any[] = aMap.get(groupName) ?? [];

      const bItemMap = new Map<string, string>(
        bItems.map((s) => [s.name ?? s.label ?? "", serializeValue(s.value)]),
      );
      const aItemMap = new Map<string, string>(
        aItems.map((s) => [s.name ?? s.label ?? "", serializeValue(s.value)]),
      );

      const allItemNames = new Set([...bItemMap.keys(), ...aItemMap.keys()]);
      const rows: SpecItemRow[] = [];

      for (const name of allItemNames) {
        const bVal = bItemMap.get(name) ?? "";
        const aVal = aItemMap.get(name) ?? "";
        const kind: DiffKind =
          bVal === aVal
            ? "unchanged"
            : !bVal && aVal
              ? "added"
              : bVal && !aVal
                ? "removed"
                : "changed";
        rows.push({ kind, name, before: bVal, after: aVal });
      }

      const groupKind: DiffKind = !bMap.has(groupName)
        ? "added"
        : !aMap.has(groupName)
          ? "removed"
          : rows.some((r) => r.kind !== "unchanged")
            ? "changed"
            : "unchanged";

      specSections.push({ kind: groupKind, groupName, rows });
    }
  }

  const hasChanges =
    fieldRows.some((r) => r.kind !== "unchanged") ||
    specSections.some((s) => s.kind !== "unchanged");

  return { fieldRows, specSections, hasChanges };
}

// ─── Kind styling helpers ───────────────────────────────────────────────────────

function kindBg(kind: DiffKind, side: "before" | "after") {
  if (kind === "unchanged") return "bg-transparent text-foreground";
  if (kind === "added")
    return side === "after"
      ? "bg-emerald-50 text-emerald-800 border-l-2 border-emerald-400"
      : "bg-muted/30 text-muted-foreground";
  if (kind === "removed")
    return side === "before"
      ? "bg-rose-50 text-rose-800 border-l-2 border-rose-400"
      : "bg-muted/30 text-muted-foreground";
  // changed
  return side === "before"
    ? "bg-rose-50 text-rose-800 border-l-2 border-rose-400"
    : "bg-emerald-50 text-emerald-800 border-l-2 border-emerald-400";
}

function KindPill({ kind }: { kind: DiffKind }) {
  if (kind === "unchanged") return null;
  const map: Record<DiffKind, { label: string; cls: string }> = {
    added: {
      label: "Added",
      cls: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    removed: {
      label: "Removed",
      cls: "bg-rose-100 text-rose-700 border-rose-200",
    },
    changed: {
      label: "Changed",
      cls: "bg-amber-100 text-amber-700 border-amber-200",
    },
    unchanged: { label: "", cls: "" },
  };
  const { label, cls } = map[kind];
  return (
    <span
      className={cn(
        "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border",
        cls,
      )}
    >
      {label}
    </span>
  );
}

// ─── Before / After panel ───────────────────────────────────────────────────────

function BeforeAfterPanel({ payload }: { payload: Record<string, any> }) {
  const before: Record<string, any> = payload.before ?? {};
  const after: Record<string, any> = payload.after ?? {};

  const { fieldRows, specSections, hasChanges } = useMemo(
    () => computeDiff(before, after),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(before), JSON.stringify(after)],
  );

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () =>
      new Set(
        specSections
          .filter((s) => s.kind !== "unchanged")
          .map((s) => s.groupName),
      ),
  );

  const toggleGroup = (name: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const changedFields = fieldRows.filter((r) => r.kind !== "unchanged");
  const changedGroups = specSections.filter((s) => s.kind !== "unchanged");

  if (!hasChanges) {
    return (
      <p className="text-sm text-muted-foreground italic px-1">
        No field changes detected in this request.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Field-level before/after table ── */}
      {changedFields.length > 0 && (
        <div className="rounded-none border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[180px_1fr_1fr] bg-muted/50 border-b">
            <div className="px-3 py-2 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
              Field
            </div>
            <div className="px-3 py-2 text-[10px] font-bold uppercase text-rose-600 tracking-wider border-l">
              Before
            </div>
            <div className="px-3 py-2 text-[10px] font-bold uppercase text-emerald-700 tracking-wider border-l">
              After
            </div>
          </div>

          {changedFields.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[180px_1fr_1fr] border-b last:border-b-0"
            >
              {/* Field name + kind pill */}
              <div className="px-3 py-2.5 flex flex-col gap-1 justify-center bg-muted/20 border-r">
                <span className="text-xs font-semibold text-foreground leading-tight">
                  {row.label}
                </span>
                <KindPill kind={row.kind} />
              </div>

              {/* Before */}
              <div
                className={cn(
                  "px-3 py-2.5 border-l",
                  kindBg(row.kind, "before"),
                )}
              >
                {row.before ? (
                  <span className="text-xs font-mono break-all leading-relaxed">
                    {row.before}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    —
                  </span>
                )}
              </div>

              {/* After */}
              <div
                className={cn(
                  "px-3 py-2.5 border-l",
                  kindBg(row.kind, "after"),
                )}
              >
                {row.after ? (
                  <span className="text-xs font-mono break-all leading-relaxed">
                    {row.after}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    —
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Technical specs before/after ── */}
      {changedGroups.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Technical Specs
          </p>

          {changedGroups.map((section) => {
            const isOpen = expandedGroups.has(section.groupName);
            const changedRows = section.rows.filter(
              (r) => r.kind !== "unchanged",
            );

            return (
              <div
                key={section.groupName}
                className="rounded-none border overflow-hidden"
              >
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(section.groupName)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left border-b"
                >
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-xs font-semibold flex-1 truncate uppercase tracking-wide">
                    {section.groupName}
                  </span>
                  <KindPill kind={section.kind} />
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {changedRows.length} change
                    {changedRows.length !== 1 ? "s" : ""}
                  </span>
                </button>

                {isOpen && (
                  <>
                    {/* Sub-header */}
                    <div className="grid grid-cols-[160px_1fr_1fr] bg-muted/20 border-b">
                      <div className="px-3 py-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wider">
                        Spec Item
                      </div>
                      <div className="px-3 py-1.5 text-[9px] font-bold uppercase text-rose-600 tracking-wider border-l">
                        Before
                      </div>
                      <div className="px-3 py-1.5 text-[9px] font-bold uppercase text-emerald-700 tracking-wider border-l">
                        After
                      </div>
                    </div>

                    {changedRows.map((row) => (
                      <div
                        key={row.name}
                        className="grid grid-cols-[160px_1fr_1fr] border-b last:border-b-0"
                      >
                        <div className="px-3 py-2 flex flex-col gap-0.5 justify-center bg-muted/10 border-r">
                          <span className="text-[11px] font-medium text-foreground leading-tight">
                            {row.name}
                          </span>
                          <KindPill kind={row.kind} />
                        </div>
                        <div
                          className={cn(
                            "px-3 py-2 border-l",
                            kindBg(row.kind, "before"),
                          )}
                        >
                          {row.before ? (
                            <span className="text-xs font-mono break-all">
                              {row.before}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              —
                            </span>
                          )}
                        </div>
                        <div
                          className={cn(
                            "px-3 py-2 border-l",
                            kindBg(row.kind, "after"),
                          )}
                        >
                          {row.after ? (
                            <span className="text-xs font-mono break-all">
                              {row.after}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              —
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Status / type badges ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <Badge className="bg-amber-50 text-amber-700 border-amber-200 border gap-1.5 text-xs font-semibold">
        <Clock className="w-3 h-3" /> Pending
      </Badge>
    );
  if (status === "approved")
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border gap-1.5 text-xs font-semibold">
        <CheckCircle2 className="w-3 h-3" /> Approved
      </Badge>
    );
  return (
    <Badge className="bg-rose-50 text-rose-700 border-rose-200 border gap-1.5 text-xs font-semibold">
      <XCircle className="w-3 h-3" /> Rejected
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    create: "bg-sky-50 text-sky-700 border-sky-200",
    update: "bg-violet-50 text-violet-700 border-violet-200",
    delete: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <Badge
      className={`border text-xs font-semibold ${styles[type] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {type}
    </Badge>
  );
}

// ─── Product identity panel ─────────────────────────────────────────────────────

function ProductIdentityPanel({ request }: { request: PendingRequest }) {
  if (request.resource !== "products") return null;

  const meta = request.meta ?? {};
  const payload = request.payload ?? {};
  const sourceDoc =
    payload.after ??
    payload.productSnapshot ??
    (request.type === "create" ? payload : null);
  const fallbackMeta = resolveProductMeta(sourceDoc);

  const productName =
    meta.productName ||
    fallbackMeta.productName ||
    resolveProductName(sourceDoc) ||
    "—";
  const litItemCode = meta.litItemCode || fallbackMeta.litItemCode || "—";
  const ecoItemCode = meta.ecoItemCode || fallbackMeta.ecoItemCode || "—";
  const productFamily = meta.productFamily || fallbackMeta.productFamily || "";
  const brand = meta.brand || fallbackMeta.brand || "";

  return (
    <div className="rounded-md border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <Package className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
            Item Description
          </p>
          <p className="text-base font-semibold leading-snug break-words">
            {productName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-start gap-2">
          <Hash className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
              LIT Item Code
            </p>
            <p className="text-sm font-mono font-semibold">{litItemCode}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Hash className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
              ECO Item Code
            </p>
            <p className="text-sm font-mono font-semibold">{ecoItemCode}</p>
          </div>
        </div>
      </div>

      {(productFamily || brand) && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
          {productFamily && (
            <div className="flex items-start gap-2">
              <Layers className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
                  Product Family
                </p>
                <p className="text-sm truncate">{productFamily}</p>
              </div>
            </div>
          )}
          {brand && (
            <div className="flex items-start gap-2">
              <Tag className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
                  Brand
                </p>
                <p className="text-sm">{brand}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main modal ─────────────────────────────────────────────────────────────────

interface RequestPreviewModalProps {
  request: PendingRequest | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onActionComplete?: () => void;
}

export function RequestPreviewModal({
  request,
  open,
  onOpenChange,
  onActionComplete,
}: RequestPreviewModalProps) {
  const { user } = useAuth();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [remarksError, setRemarksError] = useState(false);

  const canApprove =
    !!user &&
    (hasAccess(user, "verify", request?.resource ?? "") ||
      hasAccess(user, "verify", "*"));

  const reviewer = { uid: user?.uid ?? "", name: user?.name };

  // ── Guards ──────────────────────────────────────────────────────────────────
  function validateRemarks(): boolean {
    if (!remarks.trim()) {
      setRemarksError(true);
      toast.error("Remarks are required before approving or rejecting.");
      // Scroll the textarea into view
      document
        .getElementById("review-remarks")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    setRemarksError(false);
    return true;
  }

  const handleApprove = async () => {
    if (!request || !validateRemarks()) return;
    setApproving(true);
    const t = toast.loading("Approving request…");
    try {
      await approveRequest(request.id, reviewer);
      await updateDoc(doc(db, "requests", request.id), {
        reviewRemarks: remarks.trim(),
      }).catch(() => {});
      toast.success("Request approved and executed.", { id: t });
      setRemarks("");
      setRemarksError(false);
      onActionComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Approval failed.", { id: t });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!request || !validateRemarks()) return;
    setRejecting(true);
    const t = toast.loading("Rejecting request…");
    try {
      await rejectRequest(request.id, reviewer);
      await updateDoc(doc(db, "requests", request.id), {
        reviewRemarks: remarks.trim(),
      }).catch(() => {});
      toast.success("Request rejected.", { id: t });
      setRemarks("");
      setRemarksError(false);
      onActionComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Rejection failed.", { id: t });
    } finally {
      setRejecting(false);
    }
  };

  const busy = approving || rejecting;
  const isPending = request?.status === "pending";
  const isUpdateRequest = request?.type === "update";
  const remarksOk = remarks.trim().length > 0;

  if (!request) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setRemarks("");
          setRemarksError(false);
        }
        onOpenChange(v);
      }}
    >
      {/* ↓ Only these two lines changed from the original ↓ */}
      <DialogContent className="sm:max-w-[760px] h-[84vh] flex flex-col rounded-none p-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-none bg-muted flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-sm font-bold uppercase tracking-tight flex items-center gap-2 flex-wrap">
                Request Details
                <StatusBadge status={request.status} />
                <TypeBadge type={request.type} />
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5 font-mono text-muted-foreground truncate">
                ID: {request.id}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── Scrollable body — flex-1 so it fills remaining height ── */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5 space-y-5">
            {/* Product identity */}
            <ProductIdentityPanel request={request} />

            {/* Request metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <Database className="w-3 h-3" /> Resource
                </p>
                <p className="text-sm capitalize">{request.resource}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Action
                </p>
                <TypeBadge type={request.type} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <User className="w-3 h-3" /> Requested By
                </p>
                <p className="text-sm">
                  {request.requestedByName || request.requestedBy}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Submitted
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTs(request.createdAt)}
                </p>
              </div>
            </div>

            {request.resourceId && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                  Target Document ID
                </p>
                <p className="text-xs font-mono text-muted-foreground break-all bg-muted/50 border rounded px-2.5 py-1.5">
                  {request.resourceId}
                </p>
              </div>
            )}

            {/* ── Before / After panel ── */}
            {isUpdateRequest && request.payload && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                    Changes — Before vs After
                  </p>
                  <BeforeAfterPanel payload={request.payload} />
                </div>
              </>
            )}

            {/* ── Review outcome (resolved requests) ── */}
            {request.status !== "pending" && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                      Reviewed By
                    </p>
                    <p className="text-sm">
                      {request.reviewedByName || request.reviewedBy || "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                      Reviewed At
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTs(request.reviewedAt ?? null)}
                    </p>
                  </div>
                </div>
                {(request as any).reviewRemarks && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> Remarks
                    </p>
                    <p className="text-sm bg-muted/40 border rounded-none px-3 py-2.5 italic text-foreground">
                      "{(request as any).reviewRemarks}"
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ── Remarks input (required for verifiers, pending only) ── */}
            {isPending && canApprove && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <label
                    htmlFor="review-remarks"
                    className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3 h-3" />
                    Remarks
                    <span className="text-destructive">*</span>
                    <span className="font-normal normal-case opacity-60 text-[10px]">
                      required before approve or reject
                    </span>
                  </label>
                  <Textarea
                    id="review-remarks"
                    value={remarks}
                    onChange={(e) => {
                      setRemarks(e.target.value);
                      if (e.target.value.trim()) setRemarksError(false);
                    }}
                    placeholder="Explain your decision before approving or rejecting…"
                    className={cn(
                      "rounded-none resize-none min-h-[80px] text-sm",
                      remarksError &&
                        "border-destructive focus-visible:ring-destructive/30",
                    )}
                    disabled={busy}
                  />
                  {remarksError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Remarks are required. Please explain your decision.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer ── */}
        {isPending && canApprove && (
          <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2 flex-col sm:flex-row sm:items-center sm:justify-between shrink-0">
            {/* Hint when remarks are empty */}
            {!remarksOk && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mr-auto">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                Add remarks above to enable approval or rejection.
              </p>
            )}
            <div className="flex gap-2 sm:ml-auto">
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "rounded-none gap-1.5",
                  remarksOk
                    ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                    : "opacity-50 cursor-not-allowed",
                )}
                onClick={handleReject}
                disabled={busy || !remarksOk}
              >
                {rejecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                Reject
              </Button>
              <Button
                size="sm"
                className={cn(
                  "rounded-none gap-1.5",
                  remarksOk
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-emerald-200 text-emerald-400 cursor-not-allowed",
                )}
                onClick={handleApprove}
                disabled={busy || !remarksOk}
              >
                {approving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Approve &amp; Execute
              </Button>
            </div>
          </DialogFooter>
        )}

        {isPending && !canApprove && (
          <div className="px-6 py-4 border-t shrink-0">
            <p className="text-xs text-muted-foreground text-center">
              Awaiting review by a PD Manager or Admin.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
