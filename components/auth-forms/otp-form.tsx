"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import {
  TotpMultiFactorGenerator,
  MultiFactorResolver,
} from "firebase/auth";

export function OTPForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (otp.length !== 6) {
      return toast.error("Please enter the full 6-digit code.");
    }

    const resolver = (window as any).mfaResolver as MultiFactorResolver;

    if (!resolver) {
      return toast.error("Session expired. Please login again.");
    }

    setIsLoading(true);
    const verifyToast = toast.loading("Verifying code...");

    try {
      const assertion =
        TotpMultiFactorGenerator.assertionForSignIn(
          resolver.hints[0].uid,
          otp
        );

      await resolver.resolveSignIn(assertion);

      toast.success("Authentication Successful", {
        id: verifyToast,
      });

      delete (window as any).mfaResolver;

      router.push("/dashboard");

    } catch (error) {
      toast.error("Invalid or expired code.", {
        id: verifyToast,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center pb-4">
            <Image
              src="/logo-full.png"
              alt="Company Logo"
              width={180}
              height={60}
              priority
              className="object-contain"
            />
          </div>
          <CardTitle className="text-xl">
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Enter the 6-digit code from your Authenticator app.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleVerify}>
            <FieldGroup>
              <Field>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em] font-bold h-14"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, ""))
                  }
                  autoFocus
                  required
                />
              </Field>

              <Field>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Code"
                  )}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/auth/login")}
          className="text-muted-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to login
        </Button>
      </div>
    </div>
  );
}