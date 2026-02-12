import { RegisterForm } from "@/components/auth-forms/register-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="w-full max-w-md">
        <RegisterForm />
      </div>
    </div>
  );
}