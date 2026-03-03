"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { getPrimaryRouteForRole } from "@/lib/roleAccess";

function AccessDeniedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const attemptedPath = searchParams.get("from") || "the page";
  const primaryRoute = user ? getPrimaryRouteForRole(user.role || "admin") : "/dashboard";

  const handleRedirect = () => {
    router.push(primaryRoute);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription className="mt-2">
            You cannot access this page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Your role doesn't have permission to access {attemptedPath}.
            </p>
            {user && (
              <p className="text-xs">
                Current role: <span className="font-semibold text-foreground">{user.role?.toUpperCase()}</span>
              </p>
            )}
          </div>

          <Button
            onClick={handleRedirect}
            className="w-full"
            size="lg"
          >
            <Home className="mr-2 h-4 w-4" />
            Go to Accessible Page
          </Button>

          <button
            onClick={() => router.back()}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            Go Back
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccessDeniedPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <AccessDeniedContent />
    </Suspense>
  );
}
