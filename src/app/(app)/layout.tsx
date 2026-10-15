import { AppShell } from "@/components/AppShell";
import { requireOwner } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOwner();
  return <AppShell email={user.email}>{children}</AppShell>;
}
