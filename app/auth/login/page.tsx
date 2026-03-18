import { LoginForm } from "@/components/auth-forms/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return (
    <div className="items-center justify-center">
        <LoginForm />
    </div>
  )
}