"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { ProtectedLayout } from "@/components/layouts/protected-layout";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Search,
  ChevronDown,
  SlidersHorizontal,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  Shield,
  UserPlus,
  Users,
  Eye,
  EyeOff,
  RotateCcw,
  Crown,
  ShieldCheck,
  Warehouse,
  Headset,
  Megaphone,
  FileSearch,
  ShoppingCart,
  FlaskConical,
  UserCog,
  Briefcase,
  TrendingUp,
  Building2,
  ArrowUpAZ,
  ArrowDownAZ,
  Clock,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { auth, db } from "@/lib/firebase";
import { secondaryAuth } from "@/lib/firebase-secondary";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "@/lib/firestore/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import { logAuditEvent } from "@/lib/logger";
import { getScopeAccessForRole, getAccessLevelForRole } from "@/lib/rbac";
import { ScopeAccessSelector } from "@/components/notifications/scope-access-selector";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  role: string;
  accessLevel: string;
  scopeAccess?: string[];
  status: "active" | "inactive" | string;
  provider: "password" | "google" | string;
  website?: string;
  createdAt: string;
  lastLogin?: string;
};

// ─── Role config ──────────────────────────────────────────────────────────────

type RoleConfig = {
  value: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  badgeColor: string;
};

const ROLE_CONFIG: RoleConfig[] = [
  {
    value: "superadmin",
    label: "Super Administrator",
    icon: <Crown className="w-3.5 h-3.5" />,
    color: "text-rose-600",
    badgeColor: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-50",
  },
  {
    value: "admin",
    label: "Administrator",
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
    color: "text-violet-600",
    badgeColor:
      "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50",
  },
  {
    value: "director",
    label: "Director",
    icon: <Building2 className="w-3.5 h-3.5" />,
    color: "text-indigo-600",
    badgeColor:
      "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50",
  },
  {
    value: "pd_manager",
    label: "PD Manager",
    icon: <UserCog className="w-3.5 h-3.5" />,
    color: "text-sky-600",
    badgeColor: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50",
  },
  {
    value: "pd_engineer",
    label: "PD Engineer",
    icon: <FlaskConical className="w-3.5 h-3.5" />,
    color: "text-cyan-600",
    badgeColor: "bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-50",
  },
  {
    value: "project_sales",
    label: "Project Sales",
    icon: <Briefcase className="w-3.5 h-3.5" />,
    color: "text-emerald-600",
    badgeColor:
      "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  },
  {
    value: "office_sales",
    label: "Office Sales",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    color: "text-teal-600",
    badgeColor: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-50",
  },
  {
    value: "hr",
    label: "Human Resources",
    icon: <Users className="w-3.5 h-3.5" />,
    color: "text-pink-600",
    badgeColor: "bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-50",
  },
  {
    value: "seo",
    label: "SEO Specialist",
    icon: <FileSearch className="w-3.5 h-3.5" />,
    color: "text-amber-600",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  },
  {
    value: "marketing",
    label: "Marketing",
    icon: <Megaphone className="w-3.5 h-3.5" />,
    color: "text-orange-600",
    badgeColor:
      "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50",
  },
  {
    value: "csr",
    label: "Customer Support",
    icon: <Headset className="w-3.5 h-3.5" />,
    color: "text-blue-600",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
  },
  {
    value: "ecomm",
    label: "E-commerce Specialist",
    icon: <ShoppingCart className="w-3.5 h-3.5" />,
    color: "text-lime-600",
    badgeColor: "bg-lime-50 text-lime-700 border-lime-200 hover:bg-lime-50",
  },
  {
    value: "warehouse",
    label: "Warehouse Staff",
    icon: <Warehouse className="w-3.5 h-3.5" />,
    color: "text-slate-600",
    badgeColor: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-50",
  },
];

function getRoleConfig(role: string): RoleConfig | undefined {
  return ROLE_CONFIG.find((r) => r.value === role.toLowerCase());
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const config = getRoleConfig(role);
  if (!config)
    return (
      <Badge variant="outline" className="text-[10px]">
        {role}
      </Badge>
    );
  return (
    <Badge
      className={`gap-1 text-[10px] font-semibold border ${config.badgeColor}`}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-[10px] font-semibold gap-1.5 border">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        Active
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      className="text-[10px] font-semibold gap-1.5 text-muted-foreground"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
      Inactive
    </Badge>
  );
}

// ─── CountPill ────────────────────────────────────────────────────────────────

function CountPill({
  count,
  variant = "default",
}: {
  count: number;
  variant?: "default" | "violet" | "amber" | "green" | "sky" | "rose";
}) {
  const styles = {
    default: "text-muted-foreground bg-muted",
    violet: "text-violet-700 bg-violet-50 border border-violet-200",
    amber: "text-amber-700 bg-amber-50 border border-amber-200",
    green: "text-green-700 bg-green-50 border border-green-200",
    sky: "text-sky-700 bg-sky-50 border border-sky-200",
    rose: "text-rose-700 bg-rose-50 border border-rose-200",
  };
  return (
    <span
      className={`ml-auto shrink-0 text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${styles[variant]}`}
    >
      {count.toLocaleString()}
    </span>
  );
}

// ─── Edit User Dialog ─────────────────────────────────────────────────────────

function EditUserDialog({
  open,
  onOpenChange,
  user,
  isSuperAdmin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AdminUser | null;
  isSuperAdmin: boolean;
}) {
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [scopeAccess, setScopeAccess] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Populate fields when dialog opens
  useEffect(() => {
    if (user && open) {
      setFullName(user.fullName || "");
      setRole(user.role || "");
      setStatus((user.status as "active" | "inactive") || "active");
      // Prefer stored scopeAccess; derive from role as fallback for older accounts
      setScopeAccess(
        Array.isArray(user.scopeAccess) && user.scopeAccess.length > 0
          ? user.scopeAccess
          : getScopeAccessForRole(user.role || ""),
      );
    }
  }, [user, open]);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "adminaccount", user.id), {
        fullName,
        // Superadmin can change role + recompute scopes/accessLevel
        ...(isSuperAdmin && {
          role,
          scopeAccess,
          accessLevel: getAccessLevelForRole(role),
        }),
        status,
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent({
        action: "update",
        entityType: "user",
        entityId: user.id,
        entityName: fullName,
        context: {
          page: "/admin/users",
          source: "all-users:edit",
          collection: "adminaccount",
        },
      });
      toast.success(`${fullName} updated successfully.`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update user.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Pencil className="w-4 h-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">Edit User</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Update account information for {user?.email}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Full Name
            </label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              className="h-9 text-sm"
            />
          </div>

          {/* Role — superadmin only */}
          {isSuperAdmin && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Role
              </label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_CONFIG.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="flex items-center gap-2">
                        <span className={r.color}>{r.icon}</span>
                        {r.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Scope Access — editable by superadmin, read-only for others */}
          {role && (
            <ScopeAccessSelector
              role={role}
              value={scopeAccess}
              onChange={setScopeAccess}
              isSuperAdmin={isSuperAdmin}
            />
          )}

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "active" | "inactive")}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteUserDialog({
  open,
  onOpenChange,
  user,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AdminUser | null;
  onConfirm: () => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (open) setConfirmText("");
  }, [open]);

  const expected = user?.email ?? "";
  const canDelete = confirmText.trim() === expected;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base">Remove User</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                This will permanently remove the account record from the CMS.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3 text-xs text-destructive space-y-1">
            <p className="font-semibold">This action cannot be undone.</p>
            <p className="opacity-80">
              The Firebase Auth account will not be deleted — only the Firestore
              record.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Type{" "}
              <span className="font-mono font-semibold text-foreground">
                {expected}
              </span>{" "}
              to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expected}
              className="h-9 text-sm font-mono"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canDelete || isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isDeleting ? "Removing…" : "Remove User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sort option type ─────────────────────────────────────────────────────────

type SortOption =
  | "alpha-asc"
  | "alpha-desc"
  | "newest"
  | "oldest"
  | "recent-12h"
  | null;

// ─── Page component ───────────────────────────────────────────────────────────

export default function AllUsersPage() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role?.toLowerCase() === "superadmin";

  // ── Data ──────────────────────────────────────────────────────────────────
  const [data, setData] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Table state ───────────────────────────────────────────────────────────
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowsPerPageInput, setRowsPerPageInput] = useState("10");
  const [sortOption, setSortOption] = useState<SortOption>(null);

  // ── Dialogs ───────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // ── Register form state ───────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("");
  const [scopeAccess, setScopeAccess] = useState<string[]>([]);
  const [scopeError, setScopeError] = useState("");
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── Firestore listener ────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "adminaccount"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as AdminUser[],
        );
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load users");
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  // ── Register form reset ───────────────────────────────────────────────────
  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFullName("");
    setRole("");
    setScopeAccess([]);
    setScopeError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  // ── Register (email/password) ─────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password || !fullName || !role) {
      return toast.error("Missing Information", {
        description: "Please fill in all fields and select a role.",
      });
    }
    if (password !== confirmPassword) {
      return toast.error("Password Mismatch", {
        description: "Your passwords do not match.",
      });
    }
    if (password.length < 8) {
      return toast.error("Weak Password", {
        description: "Security policy requires at least 8 characters.",
      });
    }
    if (scopeAccess.length === 0) {
      setScopeError("At least one scope is required.");
      return toast.error("Missing Scope Access", {
        description: "Please select at least one scope for this account.",
      });
    }

    setIsFormLoading(true);
    const regToast = toast.loading("Creating new admin account...");

    try {
      const secondaryCred = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password,
      );
      const newUser = secondaryCred.user;
      await updateProfile(newUser, { displayName: fullName });

      const ref = doc(db, "adminaccount", newUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await signOut(secondaryAuth);
        toast.error("Account Exists", {
          id: regToast,
          description: "This user is already registered in the CMS.",
        });
        return;
      }

      await setDoc(ref, {
        uid: newUser.uid,
        email,
        fullName,
        role,
        scopeAccess,
        accessLevel: getAccessLevelForRole(role),
        status: "active",
        website: "disruptivesolutionsinc",
        provider: "password",
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });

      await signOut(secondaryAuth);

      await logAuditEvent({
        action: "create",
        entityType: "user",
        entityId: newUser.uid,
        entityName: fullName,
        context: {
          page: "/admin/users",
          source: "all-users:register",
          collection: "adminaccount",
        },
        metadata: { role, email, scopeAccess },
      });

      toast.success("Account Created!", {
        id: regToast,
        description: `${fullName} registered as ${getRoleConfig(role)?.label ?? role}.`,
      });
      resetForm();
    } catch (err: any) {
      toast.error("Registration Failed", {
        id: regToast,
        description: err.message || "An unexpected error occurred.",
      });
    } finally {
      setIsFormLoading(false);
    }
  };

  // ── Delete user ───────────────────────────────────────────────────────────
  const handleDelete = async (user: AdminUser) => {
    await deleteDoc(doc(db, "adminaccount", user.id));
    await logAuditEvent({
      action: "delete",
      entityType: "user",
      entityId: user.id,
      entityName: user.fullName || user.email,
      context: {
        page: "/admin/users",
        source: "all-users:delete",
        collection: "adminaccount",
      },
    });
    toast.success(`${user.fullName || user.email} removed.`);
  };

  // ── Bulk delete ───────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    setIsBulkDeleting(true);
    const t = toast.loading(`Removing ${selectedRows.length} users...`);
    try {
      const batch = writeBatch(db);
      selectedRows.forEach(({ original }) =>
        batch.delete(doc(db, "adminaccount", original.id)),
      );
      await batch.commit();
      toast.success(`${selectedRows.length} users removed.`, { id: t });
      setRowSelection({});
      setBulkDeleteOpen(false);
    } catch {
      toast.error("Bulk delete failed.", { id: t });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // ── Derived counts ────────────────────────────────────────────────────────
  const roleCounts = useMemo(() => {
    const m = new Map<string, number>();
    data.forEach((u) => m.set(u.role, (m.get(u.role) ?? 0) + 1));
    return m;
  }, [data]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>([
      ["active", 0],
      ["inactive", 0],
    ]);
    data.forEach((u) => m.set(u.status, (m.get(u.status) ?? 0) + 1));
    return m;
  }, [data]);

  // ── Sorted data ───────────────────────────────────────────────────────────
  const sortedData = useMemo(() => {
    const d = [...data];
    const ts = (u: AdminUser) =>
      u.createdAt ? new Date(u.createdAt).getTime() : 0;
    const label = (u: AdminUser) => (u.fullName || u.email || "").toLowerCase();

    switch (sortOption) {
      case "alpha-asc":
        return d.sort((a, b) => label(a).localeCompare(label(b)));
      case "alpha-desc":
        return d.sort((a, b) => label(b).localeCompare(label(a)));
      case "recent-12h": {
        const cutoff = Date.now() - 12 * 60 * 60 * 1000;
        return d.filter((u) => ts(u) >= cutoff).sort((a, b) => ts(b) - ts(a));
      }
      case "oldest":
        return d.sort((a, b) => ts(a) - ts(b));
      default:
        return d.sort((a, b) => ts(b) - ts(a));
    }
  }, [data, sortOption]);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: ColumnDef<AdminUser>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "avatar",
      header: () => null,
      cell: ({ row }) => {
        const u = row.original;
        const initials = (u.fullName || u.email || "?")
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        return (
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2 ${
              u.status === "active"
                ? "bg-primary/10 border-primary/20 text-primary"
                : "bg-muted border-muted-foreground/20 text-muted-foreground"
            }`}
          >
            {initials}
          </div>
        );
      },
      enableHiding: false,
    },
    {
      accessorKey: "fullName",
      header: () => <div className="text-xs font-medium">Name</div>,
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm truncate">
              {u.fullName || "—"}
            </span>
            <span className="text-[11px] text-muted-foreground truncate">
              {u.email}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "role",
      header: () => <div className="text-xs font-medium">Role</div>,
      cell: ({ row }) => <RoleBadge role={row.getValue("role") as string} />,
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return (row.getValue("role") as string) === filterValue;
      },
    },
    {
      accessorKey: "status",
      header: () => <div className="text-xs font-medium">Status</div>,
      cell: ({ row }) => (
        <StatusBadge status={row.getValue("status") as string} />
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return (row.getValue("status") as string) === filterValue;
      },
    },
    {
      accessorKey: "provider",
      header: () => <div className="text-xs font-medium">Provider</div>,
      cell: ({ row }) => {
        const p = row.getValue("provider") as string;
        return (
          <Badge variant="outline" className="text-[10px] gap-1 font-medium">
            {p === "google" ? (
              <>
                <span className="text-[9px]">G</span> Google
              </>
            ) : (
              <>
                <Shield className="w-2.5 h-2.5" /> Password
              </>
            )}
          </Badge>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: () => <div className="text-xs font-medium">Created</div>,
      cell: ({ row }) => {
        const v = row.getValue("createdAt") as string;
        if (!v)
          return <span className="text-xs text-muted-foreground/50">—</span>;
        const d = new Date(v);
        return (
          <span className="text-xs text-muted-foreground">
            {d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => (
        <div className="text-xs font-medium text-right">Actions</div>
      ),
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div
            className="flex justify-end items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditTarget(u)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Edit user
              </TooltipContent>
            </Tooltip>
            {isSuperAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(u)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Remove user
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: sortedData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
  });

  const selectedCount = Object.keys(rowSelection).length;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const isFiltered = filteredCount !== totalCount;

  const activeRoleFilter =
    (table.getColumn("role")?.getFilterValue() as string) ?? "";
  const activeStatusFilter =
    (table.getColumn("status")?.getFilterValue() as string) ?? "";

  const sortLabel: Record<NonNullable<SortOption>, string> = {
    "alpha-asc": "A → Z",
    "alpha-desc": "Z → A",
    "recent-12h": "Last 12 h",
    newest: "Newest",
    oldest: "Oldest",
  };

  return (
    <ProtectedLayout>
      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            {/* ── Header ── */}
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4 flex-1">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="#">Admin</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>All Users</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              {/* Global notifications bell — visible to verifiers + superadmin */}
              <div className="px-4">
                <NotificationsDropdown />
              </div>
            </header>

            <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
              {/* ── Page title ── */}
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  User Management
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage CMS accounts and create new users —{" "}
                  {loading ? (
                    <span className="text-muted-foreground">Loading...</span>
                  ) : (
                    <>
                      <span className="font-semibold text-foreground">
                        {isFiltered ? filteredCount : totalCount}
                      </span>
                      {isFiltered && (
                        <span className="text-muted-foreground">
                          {" "}
                          of {totalCount}
                        </span>
                      )}{" "}
                      user{totalCount !== 1 ? "s" : ""}
                    </>
                  )}
                </p>
              </div>

              {/* ── Two-column layout ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* ═══ FORM COLUMN ═══ */}
                <div className="lg:col-span-4 sticky top-6 z-10">
                  <Card className="rounded-none shadow-none border-foreground/10 max-h-[calc(100vh-10rem)] overflow-y-auto">
                    <CardHeader className="border-b">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                          <UserPlus className="w-4 h-4" />
                          Create New Account
                        </CardTitle>
                        {(email || fullName || role) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetForm}
                            className="h-7 rounded-none text-[9px] uppercase font-bold text-muted-foreground"
                            disabled={isFormLoading}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" /> Reset
                          </Button>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="pt-5">
                      <form onSubmit={handleRegister} className="space-y-4">
                        {/* Full Name */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Full Name{" "}
                            <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="John Doe"
                            className="rounded-none h-10 text-xs"
                            disabled={isFormLoading}
                            required
                          />
                        </div>

                        {/* Account Role */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Account Role{" "}
                            <span className="text-destructive">*</span>
                          </label>
                          <Select
                            value={role}
                            onValueChange={setRole}
                            disabled={isFormLoading}
                          >
                            <SelectTrigger className="rounded-none h-10 text-xs">
                              <SelectValue placeholder="Select role…" />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_CONFIG.map((r) => (
                                <SelectItem
                                  key={r.value}
                                  value={r.value}
                                  className="text-xs"
                                >
                                  <span className="flex items-center gap-2">
                                    <span className={r.color}>{r.icon}</span>
                                    {r.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Scope Access — shown once a role is selected */}
                        {role && (
                          <ScopeAccessSelector
                            role={role}
                            value={scopeAccess}
                            onChange={(scopes) => {
                              setScopeAccess(scopes);
                              if (scopes.length > 0) setScopeError("");
                            }}
                            isSuperAdmin={isSuperAdmin}
                            error={scopeError}
                          />
                        )}

                        {/* Email */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Email <span className="text-destructive">*</span>
                          </label>
                          <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@company.com"
                            className="rounded-none h-10 text-xs"
                            disabled={isFormLoading}
                            required
                          />
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Password <span className="text-destructive">*</span>
                          </label>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Min. 8 characters"
                              className="rounded-none h-10 text-xs pr-10"
                              disabled={isFormLoading}
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              disabled={isFormLoading}
                            >
                              {showPassword ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase opacity-60">
                            Confirm Password{" "}
                            <span className="text-destructive">*</span>
                          </label>
                          <div className="relative">
                            <Input
                              type={showConfirmPassword ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(e) =>
                                setConfirmPassword(e.target.value)
                              }
                              placeholder="Re-enter password"
                              className={`rounded-none h-10 text-xs pr-10 ${
                                confirmPassword && confirmPassword !== password
                                  ? "border-destructive/50 focus-visible:ring-destructive/30"
                                  : ""
                              }`}
                              disabled={isFormLoading}
                              required
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowConfirmPassword(!showConfirmPassword)
                              }
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              disabled={isFormLoading}
                            >
                              {showConfirmPassword ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                          </div>
                          {confirmPassword && confirmPassword !== password && (
                            <p className="text-[10px] text-destructive font-bold uppercase">
                              Passwords do not match
                            </p>
                          )}
                        </div>

                        {/* Role preview card */}
                        {role && (
                          <div className="border border-foreground/10 rounded-none px-3 py-2.5 bg-muted/20 flex items-center gap-2.5">
                            <span
                              className={`${getRoleConfig(role)?.color ?? ""}`}
                            >
                              {getRoleConfig(role)?.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-black uppercase">
                                {getRoleConfig(role)?.label ?? role}
                              </p>
                              <p className="text-[9px] text-muted-foreground uppercase">
                                Access Level: {getAccessLevelForRole(role)}
                              </p>
                            </div>
                            <RoleBadge role={role} />
                          </div>
                        )}

                        <Button
                          type="submit"
                          disabled={isFormLoading}
                          className="w-full rounded-none uppercase font-bold text-[10px] h-11 tracking-widest gap-2"
                        >
                          {isFormLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Provisioning…
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4" />
                              Create Account
                            </>
                          )}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>

                {/* ═══ TABLE COLUMN ═══ */}
                <div className="lg:col-span-8 space-y-4">
                  {/* Bulk actions bar */}
                  {selectedCount > 0 && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-destructive/20 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold text-destructive">
                            {selectedCount}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            {selectedCount} user{selectedCount > 1 ? "s" : ""}{" "}
                            selected
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Ready for bulk actions
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => table.resetRowSelection()}
                          className="gap-2"
                        >
                          <X className="h-4 w-4" /> Clear
                        </Button>
                        {isSuperAdmin && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isBulkDeleting}
                            className="gap-2"
                            onClick={() => setBulkDeleteOpen(true)}
                          >
                            {isBulkDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Remove {selectedCount}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Filters row */}
                  <div className="flex flex-wrap gap-3 items-center">
                    {/* Search */}
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 z-10" />
                      <Input
                        placeholder="Search users..."
                        value={globalFilter ?? ""}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="pl-9"
                      />
                    </div>

                    {/* Role filter */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className={`gap-2 ${activeRoleFilter ? "border-primary text-primary bg-primary/5" : ""}`}
                        >
                          <Shield className="h-4 w-4" />
                          {activeRoleFilter
                            ? (getRoleConfig(activeRoleFilter)?.label ??
                              activeRoleFilter)
                            : "Role"}
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-56 max-h-72 overflow-y-auto"
                      >
                        <DropdownMenuItem
                          onClick={() =>
                            table.getColumn("role")?.setFilterValue("")
                          }
                          className="flex items-center justify-between"
                        >
                          <span>All Roles</span>
                          <div className="flex items-center gap-1.5">
                            <CountPill count={data.length} />
                            {!activeRoleFilter && (
                              <Check className="h-3.5 w-3.5 text-primary" />
                            )}
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {ROLE_CONFIG.filter(
                          (r) => (roleCounts.get(r.value) ?? 0) > 0,
                        ).map((r) => (
                          <DropdownMenuItem
                            key={r.value}
                            onClick={() =>
                              table
                                .getColumn("role")
                                ?.setFilterValue(
                                  activeRoleFilter === r.value ? "" : r.value,
                                )
                            }
                            className="flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2 flex-1 truncate">
                              <span className={r.color}>{r.icon}</span>
                              {r.label}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <CountPill count={roleCounts.get(r.value) ?? 0} />
                              {activeRoleFilter === r.value && (
                                <Check className="h-3.5 w-3.5 text-primary" />
                              )}
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Status filter */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className={`gap-2 ${activeStatusFilter ? "border-primary text-primary bg-primary/5" : ""}`}
                        >
                          {activeStatusFilter ? (
                            <span
                              className={`w-2 h-2 rounded-full ${activeStatusFilter === "active" ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                            />
                          ) : (
                            <Users className="h-4 w-4" />
                          )}
                          {activeStatusFilter
                            ? activeStatusFilter.charAt(0).toUpperCase() +
                              activeStatusFilter.slice(1)
                            : "Status"}
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() =>
                            table.getColumn("status")?.setFilterValue("")
                          }
                          className="flex items-center justify-between"
                        >
                          <span>All Status</span>
                          <div className="flex items-center gap-1.5">
                            <CountPill count={data.length} />
                            {!activeStatusFilter && (
                              <Check className="h-3.5 w-3.5 text-primary" />
                            )}
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {(["active", "inactive"] as const).map((s) => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() =>
                              table
                                .getColumn("status")
                                ?.setFilterValue(
                                  activeStatusFilter === s ? "" : s,
                                )
                            }
                            className="flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${s === "active" ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                              />
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <CountPill
                                count={statusCounts.get(s) ?? 0}
                                variant={s === "active" ? "green" : "amber"}
                              />
                              {activeStatusFilter === s && (
                                <Check className="h-3.5 w-3.5 text-primary" />
                              )}
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Sort / Column toggle */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className={`ml-auto transition-colors ${sortOption ? "border-primary text-primary bg-primary/5" : ""}`}
                        >
                          <SlidersHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Sort
                          </span>
                          {sortOption && (
                            <button
                              type="button"
                              onClick={() => setSortOption(null)}
                              className="text-[10px] text-primary hover:underline font-medium"
                            >
                              Reset
                            </button>
                          )}
                        </DropdownMenuLabel>

                        {(
                          [
                            {
                              key: "alpha-asc",
                              icon: (
                                <ArrowUpAZ className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                              ),
                              label: "Alphabetically A → Z",
                            },
                            {
                              key: "alpha-desc",
                              icon: (
                                <ArrowDownAZ className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                              ),
                              label: "Alphabetically Z → A",
                            },
                            {
                              key: "recent-12h",
                              icon: (
                                <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                              ),
                              label: "Recently Added (12h)",
                            },
                            {
                              key: "newest",
                              icon: (
                                <ArrowDown className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                              ),
                              label: "Newest to Oldest",
                            },
                            {
                              key: "oldest",
                              icon: (
                                <ArrowUp className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                              ),
                              label: "Oldest to Newest",
                            },
                          ] as const
                        ).map(({ key, icon, label }) => (
                          <DropdownMenuCheckboxItem
                            key={key}
                            checked={
                              sortOption === key ||
                              (key === "newest" && sortOption === null)
                            }
                            onCheckedChange={() =>
                              setSortOption((s) => (s === key ? null : key))
                            }
                          >
                            {icon}
                            {label}
                          </DropdownMenuCheckboxItem>
                        ))}

                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Toggle Columns
                        </DropdownMenuLabel>
                        {table
                          .getAllColumns()
                          .filter((c) => c.getCanHide())
                          .map((column) => (
                            <DropdownMenuCheckboxItem
                              key={column.id}
                              className="capitalize"
                              checked={column.getIsVisible()}
                              onCheckedChange={(v) =>
                                column.toggleVisibility(!!v)
                              }
                            >
                              {column.id}
                            </DropdownMenuCheckboxItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Active filters display */}
                  {(activeRoleFilter ||
                    activeStatusFilter ||
                    (sortOption && sortOption !== "newest")) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        Active:
                      </span>
                      {activeRoleFilter && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                          <Shield className="h-3 w-3" />
                          {getRoleConfig(activeRoleFilter)?.label ??
                            activeRoleFilter}
                          <button
                            type="button"
                            onClick={() =>
                              table.getColumn("role")?.setFilterValue("")
                            }
                            className="ml-0.5 hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                      {activeStatusFilter && (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
                            activeStatusFilter === "active"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-amber-50 border-amber-200 text-amber-700"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${activeStatusFilter === "active" ? "bg-emerald-500" : "bg-amber-500"}`}
                          />
                          {activeStatusFilter.charAt(0).toUpperCase() +
                            activeStatusFilter.slice(1)}
                          <button
                            type="button"
                            onClick={() =>
                              table.getColumn("status")?.setFilterValue("")
                            }
                            className="ml-0.5 hover:opacity-60 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                      {sortOption && sortOption !== "newest" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                          <SlidersHorizontal className="h-3 w-3" />
                          {sortLabel[sortOption]}
                          <button
                            type="button"
                            onClick={() => setSortOption(null)}
                            className="ml-0.5 hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Table */}
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        {table.getHeaderGroups().map((hg) => (
                          <TableRow key={hg.id}>
                            {hg.headers.map((header) => (
                              <TableHead key={header.id}>
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(
                                      header.column.columnDef.header,
                                      header.getContext(),
                                    )}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell
                              colSpan={columns.length}
                              className="h-60 text-center"
                            >
                              <Loader2 className="animate-spin mx-auto h-8 w-8 text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                          table.getRowModel().rows.map((row) => (
                            <TableRow
                              key={row.id}
                              data-state={row.getIsSelected() && "selected"}
                              className="cursor-pointer"
                              onClick={() => setEditTarget(row.original)}
                            >
                              {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={columns.length}
                              className="h-60 text-center"
                            >
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Users className="h-8 w-8" />
                                <p className="text-sm">
                                  {sortOption === "recent-12h"
                                    ? "No users added in the last 12 hours"
                                    : "No users found"}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {table.getFilteredSelectedRowModel().rows.length} of{" "}
                      {table.getFilteredRowModel().rows.length} row(s) selected
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Rows per page
                        </span>
                        <Input
                          type="number"
                          min={1}
                          max={200}
                          className="h-9 w-20 text-sm text-center"
                          value={rowsPerPageInput}
                          onChange={(e) => setRowsPerPageInput(e.target.value)}
                          onBlur={(e) => {
                            const parsed = parseInt(e.target.value, 10);
                            if (!isNaN(parsed) && parsed >= 1) {
                              table.setPageSize(Math.min(parsed, 200));
                              setRowsPerPageInput(
                                String(Math.min(parsed, 200)),
                              );
                            } else {
                              setRowsPerPageInput(
                                String(table.getState().pagination.pageSize),
                              );
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => table.previousPage()}
                          disabled={!table.getCanPreviousPage()}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => table.nextPage()}
                          disabled={!table.getCanNextPage()}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>

        {/* ── Dialogs ── */}
        <EditUserDialog
          open={!!editTarget}
          onOpenChange={(v) => !v && setEditTarget(null)}
          user={editTarget}
          isSuperAdmin={isSuperAdmin}
        />

        <DeleteUserDialog
          open={!!deleteTarget}
          onOpenChange={(v) => !v && setDeleteTarget(null)}
          user={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget!)}
        />

        {/* Bulk delete confirm */}
        <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <DialogTitle className="text-base">Remove Users</DialogTitle>
                  <DialogDescription className="text-xs mt-0.5">
                    This will permanently remove {selectedCount} user record
                    {selectedCount !== 1 ? "s" : ""} from Firestore.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3 text-xs text-destructive">
              <p className="font-semibold">This cannot be undone.</p>
              <p className="opacity-80 mt-0.5">
                Firebase Auth accounts will not be affected — only the Firestore
                records.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => setBulkDeleteOpen(false)}
                disabled={isBulkDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="gap-2"
              >
                {isBulkDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {isBulkDeleting ? "Removing…" : `Remove ${selectedCount}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </ProtectedLayout>
  );
}
