"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/", errorCallbackURL: "/login?error=link" });
    setState(error ? "error" : "sent");
  }

  if (state === "sent") {
    return (
      <p role="status" className="border border-accent/40 bg-surface2 px-4 py-3 font-mono text-xs text-accent">
        &gt; Če je naslov dovoljen, je povezava za prijavo že na poti. Preveri e-pošto.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="email" className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
        E-naslov
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border border-border bg-base px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60"
      >
        {state === "sending" ? "Pošiljam…" : "> Pošlji povezavo"}
      </button>
      {state === "error" ? (
        <p role="alert" className="font-mono text-xs text-danger-text">
          &gt; Pošiljanje ni uspelo. Poskusi čez minuto.
        </p>
      ) : null}
    </form>
  );
}
