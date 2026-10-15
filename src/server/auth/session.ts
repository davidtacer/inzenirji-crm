import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, ownersFromEnv } from "./auth";
import { isOwner } from "./emails";

export type CurrentUser = { id: string; email: string };

/** Current owner from the session cookie, verified server-side and re-checked against OWNER_EMAILS. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const s = await getAuth().api.getSession({ headers: await headers() });
  if (!s || !isOwner(s.user.email, ownersFromEnv())) return null;
  return { id: s.user.id, email: s.user.email };
}

/** For every CRM page: signed-in owner or redirect to /login. */
export async function requireOwner(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}
