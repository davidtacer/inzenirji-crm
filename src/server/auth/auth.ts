import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import type { Db } from "../db/client";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { magicLinkMail } from "../email/magic-link";
import { createMailerFromEnv, type Mailer } from "../email/mailer";
import { isOwner, parseEmailList } from "./emails";

export const MAGIC_LINK_TTL_SECONDS = 600;

export type AuthDeps = {
  db: Db;
  mailer: Mailer;
  secret: string;
  baseURL: string;
  /** OWNER_EMAILS (ADR-011): the only people who can ever get an account or a login e-mail. */
  owners: Set<string>;
  magicLinkTtlSeconds?: number;
};

/** Owner-only auth: magic link, no passwords, no sign-up for anyone outside OWNER_EMAILS. */
export function createAuth(deps: AuthDeps) {
  return betterAuth({
    secret: deps.secret,
    baseURL: deps.baseURL,
    database: drizzleAdapter(deps.db, { provider: "pg", schema }),
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 100 },
    databaseHooks: {
      user: {
        create: {
          before: async (u) => {
            if (!isOwner(u.email, deps.owners)) return false;
            return { data: { ...u, email: u.email.trim().toLowerCase() } };
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: deps.magicLinkTtlSeconds ?? MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        rateLimit: { window: 60, max: 5 },
        sendMagicLink: async ({ email, url }) => {
          // Unknown e-mails get no mail, but the API answers the same way (no account enumeration).
          if (!isOwner(email, deps.owners)) return;
          await deps.mailer.send(magicLinkMail(email.trim().toLowerCase(), url));
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cached: Auth | undefined;

/** App-wide auth instance, created on first use so builds do not need runtime secrets. */
export function getAuth(): Auth {
  if (cached) return cached;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL ?? process.env.APP_URL;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  if (!baseURL) throw new Error("BETTER_AUTH_URL is not set");
  cached = createAuth({
    db: getDb(),
    mailer: createMailerFromEnv(),
    secret,
    baseURL,
    owners: parseEmailList(process.env.OWNER_EMAILS),
  });
  return cached;
}

/** Owners from the environment, read on every check so removing an e-mail locks it out at the next deploy. */
export function ownersFromEnv(): Set<string> {
  return parseEmailList(process.env.OWNER_EMAILS);
}
