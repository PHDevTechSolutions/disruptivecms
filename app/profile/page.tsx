"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Eye,
  EyeOff,
  IdCard,
  ImageIcon,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { ProtectedLayout } from "@/components/layouts/protected-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "@/lib/firestore/client";
import { useAuth } from "@/lib/useAuth";

type AdminProfile = {
  uid?: string;
  email?: string;
  fullName?: string;
  username?: string;
  role?: string;
  accessLevel?: string;
  scopeAccess?: string[];
  status?: string;
  website?: string;
  provider?: string;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  photoURL?: string;
  avatar?: string;
};

type PasswordFields = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

function formatDate(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRole(role?: string | null) {
  if (!role) return "Staff";
  const roleMap: Record<string, string> = {
    superadmin: "Super Administrator",
    admin: "Administrator",
    director: "Director",
    warehouse: "Warehouse Staff",
    hr: "Human Resources",
    seo: "SEO Specialist",
    csr: "Customer Support",
    ecomm: "E-commerce Specialist",
    marketing: "Marketing",
    pd: "Product Development",
    pd_manager: "PD Manager",
    pd_engineer: "PD Engineer",
    project_sales: "Project Sales",
  };
  return roleMap[role.toLowerCase()] ?? role;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function profileErrorMessage(code: string) {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Current password is incorrect.";
    case "auth/weak-password":
      return "New password is too weak.";
    case "auth/requires-recent-login":
      return "Please sign out and sign in again before changing your password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection.";
    default:
      return "Password change failed. Please try again.";
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : "";
  }
  return "";
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 border bg-background px-3 py-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="break-words text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  label,
  value,
  autoComplete,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 rounded-none pr-10 text-sm"
          autoComplete={autoComplete}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          tabIndex={-1}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="rounded-none">
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Skeleton className="h-20 w-20" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-96" />
    </div>
  );
}

export default function ProfilePage() {
  const { user: sessionUser } = useAuth();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwords, setPasswords] = useState<PasswordFields>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      setLoadError("");
      setLoading(true);

      const uid = currentUser?.uid ?? sessionUser?.uid;

      if (!uid) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "adminaccount", uid));
        if (!snapshot.exists()) {
          setProfile(null);
          setLoadError(
            "No Firestore profile record was found for this account.",
          );
          return;
        }
        setProfile(snapshot.data() as AdminProfile);
      } catch (error: unknown) {
        setLoadError(getErrorMessage(error, "Failed to load profile data."));
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [sessionUser?.uid]);

  const displayName =
    profile?.fullName ||
    firebaseUser?.displayName ||
    sessionUser?.name ||
    "User";
  const email =
    profile?.email || firebaseUser?.email || sessionUser?.email || "";
  const avatar =
    profile?.photoURL || profile?.avatar || firebaseUser?.photoURL || "";
  const provider =
    profile?.provider ||
    firebaseUser?.providerData
      .map((providerData) => providerData.providerId)
      .join(", ") ||
    "Unknown";
  const canChangePassword = useMemo(() => {
    const hasPasswordProvider = firebaseUser?.providerData.some(
      (providerData) => providerData.providerId === "password",
    );
    return provider.toLowerCase() === "password" || !!hasPasswordProvider;
  }, [firebaseUser?.providerData, provider]);

  function updatePasswordField(key: keyof PasswordFields, value: string) {
    setPasswords((current) => ({ ...current, [key]: value }));
    setPasswordError("");
    setPasswordSuccess("");
  }

  function validatePasswords() {
    if (
      !passwords.currentPassword ||
      !passwords.newPassword ||
      !passwords.confirmPassword
    ) {
      return "Please fill in all password fields.";
    }
    if (passwords.newPassword.length < 8) {
      return "New password must be at least 8 characters.";
    }
    if (passwords.newPassword === passwords.currentPassword) {
      return "New password must be different from your current password.";
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      return "New password and confirmation do not match.";
    }
    return "";
  }

  async function handlePasswordChange(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    const validationError = validatePasswords();
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    if (!firebaseUser || !firebaseUser.email) {
      setPasswordError("Please sign in again before changing your password.");
      return;
    }

    if (!canChangePassword) {
      setPasswordError("This account does not use email and password sign-in.");
      return;
    }

    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        passwords.currentPassword,
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, passwords.newPassword);
      setPasswords({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordSuccess("Password updated successfully.");
      toast.success("Password updated successfully.");
    } catch (error: unknown) {
      setPasswordError(profileErrorMessage(getErrorCode(error)));
    } finally {
      setChangingPassword(false);
    }
  }

  const scopeAccess = Array.isArray(profile?.scopeAccess)
    ? profile.scopeAccess
    : (sessionUser?.scopeAccess ?? []);

  return (
    <ProtectedLayout>
      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbPage>My Profile</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>

            <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                  My Profile
                </h1>
                <p className="text-sm text-muted-foreground">
                  View your CMS account details and manage your password.
                </p>
              </div>

              {loading ? (
                <ProfileSkeleton />
              ) : loadError ? (
                <Alert variant="destructive" className="max-w-3xl">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Profile unavailable</AlertTitle>
                  <AlertDescription>{loadError}</AlertDescription>
                </Alert>
              ) : !profile ? (
                <Card className="rounded-none">
                  <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                    <IdCard className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <h2 className="text-base font-semibold">
                        No profile data found
                      </h2>
                      <p className="mt-1 max-w-md text-sm text-muted-foreground">
                        You are signed in, but the CMS user record is empty or
                        unavailable.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                  <Card className="rounded-none">
                    <CardHeader className="border-b">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <UserIcon className="h-4 w-4" />
                        Account Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 p-4 md:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <Avatar className="h-20 w-20 rounded-none">
                          <AvatarImage
                            src={avatar || undefined}
                            alt={displayName}
                          />
                          <AvatarFallback className="rounded-none bg-primary text-lg font-semibold text-primary-foreground">
                            {getInitials(displayName) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 space-y-2">
                          <div>
                            <h2 className="break-words text-xl font-semibold">
                              {displayName}
                            </h2>
                            <p className="break-words text-sm text-muted-foreground">
                              {email || "No email available"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {formatRole(profile.role || sessionUser?.role)}
                            </Badge>
                            <Badge
                              className={
                                String(profile.status).toLowerCase() ===
                                "active"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                              }
                              variant="outline"
                            >
                              {profile.status || "Unknown"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <DetailItem
                          icon={<UserIcon className="h-4 w-4" />}
                          label="Name"
                          value={displayName}
                        />
                        <DetailItem
                          icon={<Mail className="h-4 w-4" />}
                          label="Email"
                          value={email || "Not available"}
                        />
                        <DetailItem
                          icon={<IdCard className="h-4 w-4" />}
                          label="Username"
                          value={profile.username || "Not available"}
                        />
                        <DetailItem
                          icon={<ShieldCheck className="h-4 w-4" />}
                          label="Role"
                          value={formatRole(profile.role || sessionUser?.role)}
                        />
                        <DetailItem
                          icon={<ShieldCheck className="h-4 w-4" />}
                          label="Access Level"
                          value={
                            profile.accessLevel ||
                            sessionUser?.accessLevel ||
                            "Not available"
                          }
                        />
                        <DetailItem
                          icon={<KeyRound className="h-4 w-4" />}
                          label="Provider"
                          value={provider}
                        />
                        <DetailItem
                          icon={<CalendarClock className="h-4 w-4" />}
                          label="Created"
                          value={formatDate(profile.createdAt)}
                        />
                        <DetailItem
                          icon={<CalendarClock className="h-4 w-4" />}
                          label="Last Login"
                          value={formatDate(profile.lastLogin)}
                        />
                        <DetailItem
                          icon={<ImageIcon className="h-4 w-4" />}
                          label="Profile Image"
                          value={avatar ? "Available" : "Not available"}
                        />
                        <DetailItem
                          icon={<IdCard className="h-4 w-4" />}
                          label="User ID"
                          value={
                            <span className="font-mono text-xs">
                              {profile.uid || sessionUser?.uid}
                            </span>
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Scope Access
                        </p>
                        {scopeAccess.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {scopeAccess.map((scope) => (
                              <Badge key={scope} variant="secondary">
                                {scope}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No explicit scopes are available for this account.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-none">
                    <CardHeader className="border-b">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <KeyRound className="h-4 w-4" />
                        Change Password
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6">
                      {!canChangePassword ? (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Password change unavailable</AlertTitle>
                          <AlertDescription>
                            This account signs in with {provider}. Manage the
                            password with that provider.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <form
                          onSubmit={handlePasswordChange}
                          className="space-y-4"
                        >
                          <PasswordInput
                            id="current-password"
                            label="Current Password"
                            value={passwords.currentPassword}
                            onChange={(value) =>
                              updatePasswordField("currentPassword", value)
                            }
                            autoComplete="current-password"
                            disabled={changingPassword}
                          />
                          <PasswordInput
                            id="new-password"
                            label="New Password"
                            value={passwords.newPassword}
                            onChange={(value) =>
                              updatePasswordField("newPassword", value)
                            }
                            autoComplete="new-password"
                            disabled={changingPassword}
                          />
                          <PasswordInput
                            id="confirm-new-password"
                            label="Confirm New Password"
                            value={passwords.confirmPassword}
                            onChange={(value) =>
                              updatePasswordField("confirmPassword", value)
                            }
                            autoComplete="new-password"
                            disabled={changingPassword}
                          />

                          {passwordError && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertTitle>Password not updated</AlertTitle>
                              <AlertDescription>
                                {passwordError}
                              </AlertDescription>
                            </Alert>
                          )}

                          {passwordSuccess && (
                            <Alert>
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              <AlertTitle>Password updated</AlertTitle>
                              <AlertDescription>
                                {passwordSuccess}
                              </AlertDescription>
                            </Alert>
                          )}

                          <Button
                            type="submit"
                            className="h-10 w-full rounded-none"
                            disabled={changingPassword}
                          >
                            {changingPassword ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              "Update Password"
                            )}
                          </Button>
                        </form>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </ProtectedLayout>
  );
}
