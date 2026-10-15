"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
      className="btn-brutal px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest"
    >
      Odjava
    </button>
  );
}
