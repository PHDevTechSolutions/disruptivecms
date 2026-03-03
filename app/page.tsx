import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPrimaryRouteForRole } from "@/lib/roleAccess";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (session?.role) {
    redirect(getPrimaryRouteForRole(session.role));
  }
  redirect("/auth/login");
}