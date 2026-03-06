"use client";

import * as React from "react";
import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff } from "lucide-react";

// Firebase Imports
import { auth, db } from "@/lib/firebase";
import { secondaryAuth } from "@/lib/firebase-secondary";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";

export function RegisterForm({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  const { user } = useAuth();
  const isAdminContext = user?.role?.toLowerCase() === "superadmin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  /* =========================
      EMAIL / PASSWORD REG
     ========================= */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation Toasts
    if (!email || !password || !fullName || !role) {
      return toast.error("Missing Information", {
        description: "Please fill in all fields and select a role.",
      });
    }

    if (password !== confirmPassword) {
      return toast.error("Password Mismatch", {
        description: "Your passwords do not match. Please check again.",
      });
    }

    if (password.length < 8) {
      return toast.error("Weak Password", {
        description: "Security policy requires at least 8 characters.",
      });
    }

    setIsLoading(true);
    const regToast = toast.loading(
      isAdminContext
        ? "Creating new admin account..."
        : "Creating your internal account..."
    );

    try {
      if (isAdminContext) {
        // Use secondary Firebase instance to create user without affecting primary session
        const secondaryCred = await createUserWithEmailAndPassword(
          secondaryAuth,
          email,
          password
        );
        const newSecondaryUser = secondaryCred.user;

        await updateProfile(newSecondaryUser, { displayName: fullName });

        // Save user metadata to Firestore using primary app's database
        const ref = doc(db, "adminaccount", newSecondaryUser.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          // Sign out the secondary user immediately
          await signOut(secondaryAuth);
          toast.error("Account Exists", {
            id: regToast,
            description: "This user is already registered in the CMS.",
          });
          return;
        }

        await setDoc(ref, {
          uid: newSecondaryUser.uid,
          email,
          fullName,
          role,
          accessLevel: role === "admin" || role === "superadmin" ? "full" : "staff",
          status: "active",
          website: "disruptivesolutionsinc",
          provider: "password",
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        });

        // Sign out the secondary auth instance to leave new user in "guest" state
        await signOut(secondaryAuth);

        toast.success("Account Created Successfully!", {
          id: regToast,
          description: `${fullName} has been registered as ${role.toUpperCase()}.`,
        });

        // Reset form fields for next account creation
        // Primary superadmin session remains intact!
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setFullName("");
        setRole("");
      } else {
        // Standard registration flow (non-admin context)
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = cred.user;

        await updateProfile(newUser, { displayName: fullName });

        const ref = doc(db, "adminaccount", newUser.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          await signOut(auth);
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
          accessLevel:
            role === "admin" || role === "superadmin" ? "full" : "staff",
          status: "active",
          website: "disruptivesolutionsinc",
          provider: "password",
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        });

        // Sign out user after registration
        await signOut(auth);

        toast.success("Account Created Successfully!", {
          id: regToast,
          description: `${fullName} has been registered as ${role.toUpperCase()}.`,
        });

        // Reset form fields
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setFullName("");
        setRole("");
      }
    } catch (err: any) {
      toast.error("Registration Failed", {
        id: regToast,
        description: err.message || "An unexpected error occurred.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  /* =========================
      GOOGLE SIGN UP (with specific role check toast)
     ========================= */
  const handleGoogleSignUp = async () => {
    // REQUIRED ROLE CHECK TOAST
    if (!role) {
      return toast.error("Role Required", {
        description:
          "Please select an Account Role before signing up with Google.",
      });
    }

    setIsLoading(true);
    const googleToast = toast.loading("Connecting to Google..");

    try {
      if (isAdminContext) {
        // Admin context: note that Google sign-up for admin account creation
        // should be handled through the API as well for consistency
        toast.error("Google Sign-Up Not Available", {
          id: googleToast,
          description:
            "Please use email and password to create admin accounts.",
        });
        setIsLoading(false);
        return;
      }

      // Standard Google sign-up flow (non-admin context)
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      const ref = doc(db, "adminaccount", googleUser.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        await signOut(auth);
        toast.info("Account Exists", {
          id: googleToast,
          description: "This Google account is already registered.",
        });
        return;
      }

      await setDoc(ref, {
        uid: googleUser.uid,
        email: googleUser.email,
        fullName: googleUser.displayName || "",
        role,
        accessLevel:
          role === "admin" || role === "superadmin" ? "full" : "staff",
        status: "active",
        provider: "google",
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });

      // Sign out user after registration
      await signOut(auth);

      toast.success("Account Created Successfully!", {
        id: googleToast,
        description: `${googleUser.displayName || "User"} has been registered as ${role.toUpperCase()}.`,
      });

      // Reset form fields
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setFullName("");
      setRole("");
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user") {
        toast.error("Google Authentication Failed", {
          id: googleToast,
          description: err.message,
        });
      } else {
        toast.dismiss(googleToast);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={cn("overflow-hidden", className)} {...props}>
      <CardHeader className="flex flex-col items-center gap-1 pb-4">
        <div className="relative">
          <Image
            src="/logo-full.png"
            alt="Logo"
            width={120}
            height={32}
            className="h-auto w-auto object-contain"
            priority
          />
        </div>
        <div className="text-center">
          <CardTitle className="text-lg">Create an account</CardTitle>
          <CardDescription className="text-sm">
            Enter your information below to create your account or sign up with
            Google
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Full Name</FieldLabel>
              <Input
                id="name"
                placeholder="John Doe"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="role">Account Role</FieldLabel>
              <Select onValueChange={(value) => setRole(value)} value={role}>
                <SelectTrigger id="role" className="w-full">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="superadmin">Super Administrator</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="warehouse">Warehouse Staff</SelectItem>
                  <SelectItem value="seo">SEO Specialist</SelectItem>
                  <SelectItem value="hr">Human Resources</SelectItem>
                  <SelectItem value="csr">
                    Customer Support Representative
                  </SelectItem>
                  <SelectItem value="ecomm">E-commerce Specialist</SelectItem>
                  <SelectItem value="pd">Product Development</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="confirm-password">
                Confirm Password
              </FieldLabel>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </Field>

            <FieldGroup className="mt-4">
              <Field>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isLoading ? "Provisioning..." : "Create Account"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  className="w-full"
                  onClick={handleGoogleSignUp}
                  disabled={isLoading}
                >
                  Sign up with Google
                </Button>
                <FieldDescription className="px-6 text-center">
                  Already have an account?{" "}
                  <a
                    href="/auth/login"
                    className="underline underline-offset-4"
                  >
                    Sign in
                  </a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
