import postgres from "postgres";
import { getSchema } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import * as schema from "../db/schema";
import { createCaptureMailer } from "../email/mailer";
import { createAuth, type Auth } from "./auth";
import { parseEmailList } from "./emails";

const url = process.env.TEST_DATABASE_URL!;
const baseURL = "http://localhost:3000";
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 2 });
const mailer = createCaptureMailer();
let auth: Auth;
const headers = () => new Headers({ origin: baseURL, "content-type": "application/json" });

beforeAll(async () => {
  await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
  auth = createAuth({ db, mailer, baseURL, secret: "test-secret-test-secret-test-secret-123", owners: parseEmailList("David@Inzenirji.si") });
});
beforeEach(async () => {
  mailer.sent.length = 0;
  await sql`truncate "user", session, account, verification cascade`;
});
afterAll(async () => {
  await sql.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

function tokenFromLastMail() {
  const link = mailer.sent.at(-1)!.text.match(/https?:\/\/\S+/)![0];
  return new URL(link).searchParams.get("token")!;
}
const verify = (token: string) => auth.api.magicLinkVerify({ query: { token, callbackURL: "/" }, headers: headers(), asResponse: true });

describe("schema drift", () => {
  it("every field Better Auth expects exists in our Drizzle tables", () => {
    const expected = getSchema(auth.options);
    const tables = schema as unknown as Record<string, Parameters<typeof getTableColumns>[0]>;
    for (const [model, def] of Object.entries(expected)) {
      const table = tables[model];
      expect(table, `table ${model}`).toBeDefined();
      const cols = Object.keys(getTableColumns(table));
      for (const [field, attr] of Object.entries(def.fields)) {
        const name = (attr as { fieldName?: string }).fieldName ?? field;
        expect(cols, `${model}.${name}`).toContain(name);
      }
    }
  });
});

describe("owner-only magic link", () => {
  it("owner gets a mail; the link creates the user and a session", async () => {
    await auth.api.signInMagicLink({ body: { email: "DAVID@inzenirji.si", callbackURL: "/" }, headers: headers() });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("david@inzenirji.si");
    const res = await verify(tokenFromLastMail());
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("better-auth.session_token");
    expect(await sql`select email from "user"`).toEqual([{ email: "david@inzenirji.si" }]);
    expect((await sql`select count(*)::int as n from session`)[0].n).toBe(1);
  });

  it("anyone else: same answer, no mail, no user", async () => {
    const r = await auth.api.signInMagicLink({ body: { email: "stranger@example.com", callbackURL: "/" }, headers: headers() });
    expect(r).toEqual({ status: true });
    expect(mailer.sent).toHaveLength(0);
    expect((await sql`select count(*)::int as n from "user"`)[0].n).toBe(0);
  });

  it("a link is single-use", async () => {
    await auth.api.signInMagicLink({ body: { email: "david@inzenirji.si", callbackURL: "/" }, headers: headers() });
    const token = tokenFromLastMail();
    expect((await verify(token)).headers.get("set-cookie")).toContain("better-auth.session_token");
    const again = await verify(token);
    expect(again.headers.get("set-cookie") ?? "").not.toContain("better-auth.session_token=");
    expect((await sql`select count(*)::int as n from session`)[0].n).toBe(1);
  });

  it("the database hook refuses a non-owner user even if created directly", async () => {
    const ctx = await auth.$context;
    // Second argument (endpoint context) is optional at runtime; the hook still runs.
    const createUser = ctx.internalAdapter.createUser as unknown as (u: Record<string, unknown>) => Promise<unknown>;
    const r = await createUser({ email: "intruder@example.com", name: "x", emailVerified: true }).catch(() => null);
    expect(r ?? null).toBeNull();
    expect((await sql`select count(*)::int as n from "user"`)[0].n).toBe(0);
  });
});
